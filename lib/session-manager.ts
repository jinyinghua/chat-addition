import { Redis } from '@upstash/redis';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = process.env.DATA_DIR || '/tmp/chat-addition';
const SESSION_FILE = process.env.SESSION_FILE || path.join(DATA_DIR, 'sessions.json');
const MAX_ERROR_COUNT = 5;
const DEVICE_ID = process.env.OAI_DEVICE_ID || '46600ebf-c112-4824-9fa7-bd0636febef8';
const INSTALLATION_NAMESPACE = '6d0ab975-7f88-4ef4-9466-3f9047d5064d';
const SESSION_STORE_KEY = 'uapi:sessions';

const AUTH_WHITELIST = new Set([
  '/',
  '/ping',
  '/favicon.ico',
  '/docs',
  '/openapi.json',
  '/.well-known/oauth-protected-resource',
  '/auth/login-check',
]);

export interface SessionSlot {
  sid: string;
  access_token: string;
  session_token: string;
  account_id: string;
  email: string;
  expires_at: number;
  raw_session: Record<string, unknown>;
  error_count: number;
  last_error: string;
  disabled: boolean;
}

let redisClient: Redis | null = null;

function cleanEnv(name: string) {
  return (process.env[name] || '').trim();
}

function getRedis() {
  if (redisClient) return redisClient;
  const url = cleanEnv('KV_REST_API_URL') || cleanEnv('UPSTASH_REDIS_REST_URL');
  const token = cleanEnv('KV_REST_API_TOKEN') || cleanEnv('UPSTASH_REDIS_REST_TOKEN');
  if (!url || !token) return null;
  redisClient = new Redis({ url, token });
  return redisClient;
}

function ensureDataDir() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch {
    // ignore
  }
}

function base64UrlDecode(input: string): string {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, 'base64').toString('utf8');
}

function jwtPayload(token: string): Record<string, unknown> {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return {};
    return JSON.parse(base64UrlDecode(parts[1]));
  } catch {
    return {};
  }
}

function uuidFromBytes(bytes: Uint8Array): string {
  const hex = Buffer.from(bytes).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function uuidV5(namespace: string, name: string): string {
  const ns = namespace.replace(/-/g, '');
  const nsBytes = Buffer.from(ns, 'hex');
  const hash = crypto.createHash('sha1').update(Buffer.concat([nsBytes, Buffer.from(name)])).digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return uuidFromBytes(bytes);
}

function applySessionData(data: Record<string, unknown>) {
  const accessToken = typeof data.accessToken === 'string' ? data.accessToken : '';
  const sessionToken = typeof data.sessionToken === 'string' ? data.sessionToken : '';
  const account = (data.account && typeof data.account === 'object' ? data.account : {}) as Record<string, unknown>;
  const user = (data.user && typeof data.user === 'object' ? data.user : {}) as Record<string, unknown>;

  const accountId = typeof account.id === 'string' ? account.id : '';
  const email = typeof user.email === 'string' ? user.email : '';

  let expiresAt = 0;
  if (typeof data.expires === 'string' && data.expires) {
    const ts = Date.parse(data.expires);
    expiresAt = Number.isFinite(ts) ? ts / 1000 : 0;
  }
  if (!expiresAt && accessToken) {
    const payload = jwtPayload(accessToken);
    const exp = typeof payload.exp === 'number' ? payload.exp : 0;
    expiresAt = exp || 0;
  }

  return {
    accessToken,
    sessionToken,
    accountId,
    email,
    expiresAt,
  };
}

function readSessionsFile(): Record<string, unknown>[] {
  try {
    if (!fs.existsSync(SESSION_FILE)) return [];
    const raw = fs.readFileSync(SESSION_FILE, 'utf8').trim();
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v) => v && typeof v === 'object') : [parsed];
  } catch (error) {
    console.warn('[TokenMgr] failed to load sessions from file:', error);
    return [];
  }
}

function writeSessionsFile(items: Record<string, unknown>[]) {
  try {
    ensureDataDir();
    fs.writeFileSync(SESSION_FILE, JSON.stringify(items, null, 2), 'utf8');
  } catch (error) {
    console.warn('[TokenMgr] failed to save sessions to file:', error);
  }
}

async function readSessionsStore(): Promise<Record<string, unknown>[]> {
  const redis = getRedis();
  if (redis) {
    try {
      const raw = await redis.get<Record<string, unknown>[]>(SESSION_STORE_KEY);
      if (Array.isArray(raw)) {
        return raw.filter((v) => v && typeof v === 'object');
      }
    } catch (error) {
      console.warn('[TokenMgr] failed to load sessions from redis:', error);
    }
  }
  return readSessionsFile();
}

async function writeSessionsStore(items: Record<string, unknown>[]) {
  const redis = getRedis();
  if (redis) {
    try {
      await redis.set(SESSION_STORE_KEY, items);
      return;
    } catch (error) {
      console.warn('[TokenMgr] failed to save sessions to redis:', error);
    }
  }
  writeSessionsFile(items);
}

function getEnvSessionTokens(): string[] {
  const tokens: string[] = [];
  for (let i = 0; i < 10; i += 1) {
    const token = cleanEnv(`SESSION_TOKEN_${i}`);
    if (token) tokens.push(token);
  }
  return tokens;
}

export class TokenManager {
  sessions: SessionSlot[] = [];
  deviceId = DEVICE_ID;
  private currentIdx = 0;
  private current: SessionSlot | null = null;
  private ready: Promise<void>;

  constructor() {
    ensureDataDir();
    this.ready = this.initialize();
  }

  private async initialize() {
    await this.loadFromStore();
    this.loadFromEnv();
    await this.persist();
  }

  private createSlot(data: Record<string, unknown>): SessionSlot {
    const fields = applySessionData(data);
    const sid = fields.accountId ? fields.accountId.slice(0, 8) : crypto.randomUUID().slice(0, 8);

    return {
      sid,
      access_token: fields.accessToken,
      session_token: fields.sessionToken,
      account_id: fields.accountId,
      email: fields.email,
      expires_at: fields.expiresAt,
      raw_session: data,
      error_count: 0,
      last_error: '',
      disabled: false,
    };
  }

  private async ensureReady() {
    await this.ready;
  }

  private async loadFromStore() {
    const items = await readSessionsStore();
    this.sessions = [];
    for (const item of items) {
      this.sessions.push(this.createSlot(item));
    }
    if (items.length) {
      console.log(`[TokenMgr] loaded ${items.length} session(s) from persistent store`);
    }
  }

  private loadFromEnv() {
    for (const token of getEnvSessionTokens()) {
      if (this.sessions.some((slot) => slot.session_token === token)) continue;
      const raw = { sessionToken: token, accessToken: '', account: { id: '' } };
      this.sessions.push(this.createSlot(raw));
      console.log('[TokenMgr] loaded SESSION_TOKEN from env');
    }
  }

  private async persist() {
    await writeSessionsStore(this.sessions.filter((s) => s.raw_session).map((s) => s.raw_session));
  }

  private updateExisting(slot: SessionSlot, data: Record<string, unknown>) {
    const fields = applySessionData(data);
    slot.access_token = fields.accessToken;
    slot.session_token = fields.sessionToken || slot.session_token;
    slot.account_id = fields.accountId || slot.account_id;
    slot.email = fields.email || slot.email;
    slot.expires_at = fields.expiresAt;
    slot.raw_session = data;
    slot.error_count = 0;
    slot.last_error = '';
    slot.disabled = false;
  }

  async loadSessionFromJson(rawJson: string | Record<string, unknown>) {
    await this.ensureReady();
    const data = typeof rawJson === 'string' ? JSON.parse(rawJson) : rawJson;
    const fields = applySessionData(data);

    let existing: SessionSlot | undefined;
    if (fields.accountId) {
      existing = this.sessions.find((slot) => slot.account_id === fields.accountId);
    }

    let action: 'added' | 'updated';
    let slot: SessionSlot;
    if (existing) {
      this.updateExisting(existing, data);
      slot = existing;
      action = 'updated';
    } else {
      slot = this.createSlot(data);
      this.sessions.push(slot);
      action = 'added';
    }

    await this.persist();
    return {
      status: 'ok',
      action,
      sid: slot.sid,
      account_id: slot.account_id,
      total_sessions: this.sessions.length,
      message: `Session ${action}: ${slot.sid} (account=${slot.account_id.slice(0, 8)}..., total=${this.sessions.length})`,
    };
  }

  async removeSession(sid: string) {
    await this.ensureReady();
    const index = this.sessions.findIndex((slot) => slot.sid === sid);
    if (index < 0) return false;
    const removed = this.sessions.splice(index, 1)[0];
    if (this.current?.sid === removed.sid) this.current = null;
    if (this.currentIdx >= this.sessions.length) this.currentIdx = 0;
    await this.persist();
    return true;
  }

  async toggleSession(sid: string, disabled: boolean) {
    await this.ensureReady();
    const slot = this.sessions.find((s) => s.sid === sid);
    if (!slot) return false;
    slot.disabled = disabled;
    if (disabled) slot.error_count = 0;
    await this.persist();
    return true;
  }

  async getAllStatus() {
    await this.ensureReady();
    return this.sessions.map((slot) => ({
      sid: slot.sid,
      account_id: slot.account_id,
      email: slot.email,
      expires_at: slot.expires_at,
      error_count: slot.error_count,
      last_error: slot.last_error,
      disabled: slot.disabled,
      is_expired: slot.expires_at > 0 ? Date.now() / 1000 >= slot.expires_at - 120 : true,
      is_healthy: !slot.disabled && slot.error_count < MAX_ERROR_COUNT,
    }));
  }

  async invalidateAccessToken(accessToken: string, reason = 'token rejected by upstream') {
    await this.ensureReady();
    if (!accessToken) return;
    const slot = this.sessions.find((item) => item.access_token === accessToken) || this.current;
    if (!slot) return;
    slot.access_token = '';
    slot.expires_at = 0;
    slot.last_error = reason;
    if (this.current?.sid === slot.sid) {
      this.current = null;
    }
    await this.persist();
  }

  async getValidToken() {
    await this.ensureReady();
    console.log(`[TokenMgr] getValidToken start; sessions=${this.sessions.length}`);
    if (!this.sessions.length) {
      throw new Error('No sessions available. Add one via /auth/session');
    }

    const count = this.sessions.length;
    for (let i = 0; i < count; i += 1) {
      const slot = this.sessions[this.currentIdx % count];
      this.currentIdx += 1;
      console.log(`[TokenMgr] checking session sid=${slot.sid} disabled=${slot.disabled} errors=${slot.error_count}`);

      if (slot.disabled || slot.error_count >= MAX_ERROR_COUNT) continue;

      if ((!slot.access_token) || (slot.expires_at > 0 && Date.now() / 1000 >= slot.expires_at - 120)) {
        console.log(`[TokenMgr] refreshing session sid=${slot.sid}`);
        const ok = await this.refreshSlot(slot);
        console.log(`[TokenMgr] refresh result sid=${slot.sid} ok=${ok} last_error=${slot.last_error}`);
        if (!ok) continue;
      }

      this.current = slot;
      console.log(`[TokenMgr] selected session sid=${slot.sid}`);
      return slot.access_token;
    }

    for (const slot of this.sessions) {
      if (slot.disabled) continue;
      slot.error_count = 0;
      console.log(`[TokenMgr] fallback refresh sid=${slot.sid}`);
      const ok = await this.refreshSlot(slot);
      if (ok) {
        this.current = slot;
        console.log(`[TokenMgr] fallback selected sid=${slot.sid}`);
        return slot.access_token;
      }
    }

    throw new Error('All sessions failed. Check logs and re-add sessions via /auth/session');
  }

  private async refreshSlot(slot: SessionSlot) {
    if (!slot.session_token) {
      slot.error_count += 1;
      slot.last_error = 'no sessionToken';
      return false;
    }

    try {
      console.log(`[TokenMgr] refreshSlot request sid=${slot.sid}`);
      const resp = await fetch('https://chatgpt.com/api/auth/session', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
          Accept: '*/*',
          'oai-device-id': this.deviceId,
          Cookie: `__Secure-next-auth.session-token=${slot.session_token}`,
        },
      });

      console.log(`[TokenMgr] refreshSlot response sid=${slot.sid} status=${resp.status}`);
      if (!resp.ok) {
        slot.error_count += 1;
        slot.last_error = `refresh HTTP ${resp.status}`;
        return false;
      }

      const data = (await resp.json()) as Record<string, unknown>;
      if (typeof data.accessToken !== 'string' || !data.accessToken) {
        slot.error_count += 1;
        slot.last_error = 'no accessToken in response';
        return false;
      }

      const fields = applySessionData(data);
      slot.access_token = fields.accessToken;
      slot.session_token = fields.sessionToken || slot.session_token;
      slot.email = fields.email || slot.email;
      if (fields.accountId) {
        slot.account_id = fields.accountId;
        slot.sid = fields.accountId.slice(0, 8);
      }
      slot.expires_at = fields.expiresAt;
      slot.raw_session = data;
      slot.error_count = 0;
      slot.last_error = '';
      await this.persist();
      return true;
    } catch (error) {
      slot.error_count += 1;
      slot.last_error = error instanceof Error ? error.message.slice(0, 200) : String(error).slice(0, 200);
      console.warn(`[TokenMgr] refreshSlot exception sid=${slot.sid}:`, error);
      return false;
    }
  }

  get accountId() {
    return this.current?.account_id || '';
  }

  get installationId() {
    return this.accountId ? uuidV5(INSTALLATION_NAMESPACE, this.accountId) : '';
  }

  get accessToken() {
    return this.current?.access_token || '';
  }

  get sessionToken() {
    return this.current?.session_token || '';
  }

  get expiresAt() {
    return this.current?.expires_at || 0;
  }
}

export const tokenManager = new TokenManager();

export function getAuthTokenFromRequest(request: Request) {
  const authHeader = request.headers.get('authorization') || '';
  if (authHeader.toLowerCase().startsWith('bearer ')) return authHeader.slice(7).trim();
  const xApiKey = request.headers.get('x-api-key') || '';
  if (xApiKey.trim()) return xApiKey.trim();
  try {
    const url = new URL(request.url);
    return (url.searchParams.get('key') || '').trim();
  } catch {
    return '';
  }
}

export function isApiKeyValid(token: string) {
  const validKeys = (process.env.MCP_API_KEYS || '')
    .split(',')
    .map((key) => key.trim())
    .filter(Boolean);

  if (!validKeys.length) return !!token;
  return !!token && validKeys.includes(token);
}

export function requireApiKey(request: Request) {
  const path = new URL(request.url).pathname;
  if (AUTH_WHITELIST.has(path) || path.startsWith('/docs') || path.startsWith('/openapi')) {
    return null;
  }

  const token = getAuthTokenFromRequest(request);
  if (!isApiKeyValid(token)) {
    return Response.json(
      {
        error: {
          message: "Invalid API key. Provide it via 'Authorization: Bearer <key>' or 'X-API-Key: <key>'.",
          type: 'authentication_error',
          code: 'invalid_api_key',
        },
      },
      { status: 401 },
    );
  }

  return null;
}

export function validateLoginKey(key: string) {
  return isApiKeyValid(key);
}

export { DATA_DIR, SESSION_FILE, DEVICE_ID, AUTH_WHITELIST, SESSION_STORE_KEY };
