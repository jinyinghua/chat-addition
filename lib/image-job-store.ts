import { Redis } from '@upstash/redis';
import crypto from 'node:crypto';

export type ImageJobStatus = 'queued' | 'running' | 'succeeded' | 'failed';

export type ImageJobAsset = {
  originUrl?: string;
  b64Json?: string;
  mimeType?: string;
  revisedPrompt?: string;
};

export type ImageJobRecord = {
  id: string;
  fingerprint: string;
  status: ImageJobStatus;
  createdAt: number;
  updatedAt: number;
  request: {
    model: string;
    prompt: string;
    size?: string;
    quality?: string;
    background?: string;
    responseFormat?: string;
    n?: number;
    inputImages?: Array<{ url: string }>;
  };
  result?: {
    assets: ImageJobAsset[];
    text?: string;
  };
  error?: string;
  ownerTokenHash?: string;
};

const JOB_PREFIX = 'uapi:imagejob:';
const FP_PREFIX = 'uapi:imagefp:';
const LOCK_PREFIX = 'uapi:imagejoblock:';
const DEFAULT_TTL_SECONDS = 60 * 60 * 24;
const DEFAULT_LOCK_TTL_SECONDS = 60 * 10;

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

const memoryJobs = new Map<string, ImageJobRecord>();
const memoryFingerprintMap = new Map<string, string>();
const memoryLocks = new Map<string, { token: string; expiresAt: number }>();

export function sha256String(input: string) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function hashApiToken(token: string) {
  return sha256String(token || '');
}

export function buildImageRequestFingerprint(payload: {
  model: string;
  prompt: string;
  size?: string;
  quality?: string;
  background?: string;
  responseFormat?: string;
  n?: number;
  inputImages?: Array<{ url: string }>;
}) {
  const normalized = {
    model: payload.model,
    prompt: payload.prompt,
    size: payload.size || 'auto',
    quality: payload.quality || 'auto',
    background: payload.background || 'auto',
    responseFormat: payload.responseFormat || 'url',
    n: payload.n || 1,
    inputImages: (payload.inputImages || []).map((img) => ({ url: img.url })),
  };
  return sha256String(JSON.stringify(normalized));
}

function jobKey(id: string) {
  return `${JOB_PREFIX}${id}`;
}

function fpKey(fp: string) {
  return `${FP_PREFIX}${fp}`;
}

function lockKey(id: string) {
  return `${LOCK_PREFIX}${id}`;
}

export async function getJobById(id: string): Promise<ImageJobRecord | null> {
  const redis = getRedis();
  if (redis) {
    const value = await redis.get<ImageJobRecord>(jobKey(id));
    return value || null;
  }
  return memoryJobs.get(id) || null;
}

export async function getJobIdByFingerprint(fp: string): Promise<string | null> {
  const redis = getRedis();
  if (redis) {
    const value = await redis.get<string>(fpKey(fp));
    return value || null;
  }
  return memoryFingerprintMap.get(fp) || null;
}

export async function saveJob(job: ImageJobRecord, ttlSeconds = DEFAULT_TTL_SECONDS) {
  const redis = getRedis();
  if (redis) {
    await redis.set(jobKey(job.id), job, { ex: ttlSeconds });
    await redis.set(fpKey(job.fingerprint), job.id, { ex: ttlSeconds });
    return;
  }
  memoryJobs.set(job.id, job);
  memoryFingerprintMap.set(job.fingerprint, job.id);
}

export async function createOrReuseJob(input: {
  fingerprint: string;
  ownerTokenHash?: string;
  request: ImageJobRecord['request'];
}) {
  const existingJobId = await getJobIdByFingerprint(input.fingerprint);
  if (existingJobId) {
    const existing = await getJobById(existingJobId);
    if (existing) return { job: existing, created: false };
  }

  const now = Date.now();
  const job: ImageJobRecord = {
    id: `imgjob_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`,
    fingerprint: input.fingerprint,
    status: 'queued',
    createdAt: now,
    updatedAt: now,
    request: input.request,
    ownerTokenHash: input.ownerTokenHash,
  };
  await saveJob(job);
  return { job, created: true };
}

export async function patchJob(id: string, patch: Partial<ImageJobRecord>) {
  const current = await getJobById(id);
  if (!current) return null;
  const next: ImageJobRecord = {
    ...current,
    ...patch,
    request: patch.request || current.request,
    result: patch.result || current.result,
    updatedAt: Date.now(),
  };
  await saveJob(next);
  return next;
}

export async function acquireJobLock(jobId: string, ttlSeconds = DEFAULT_LOCK_TTL_SECONDS) {
  const token = crypto.randomUUID();
  const redis = getRedis();
  if (redis) {
    const result = await redis.set(lockKey(jobId), token, { nx: true, ex: ttlSeconds });
    return result ? token : null;
  }

  const now = Date.now();
  const existing = memoryLocks.get(jobId);
  if (existing && existing.expiresAt > now) return null;
  memoryLocks.set(jobId, { token, expiresAt: now + ttlSeconds * 1000 });
  return token;
}

export async function releaseJobLock(jobId: string, token: string) {
  const redis = getRedis();
  if (redis) {
    const current = await redis.get<string>(lockKey(jobId));
    if (current === token) {
      await redis.del(lockKey(jobId));
    }
    return;
  }

  const current = memoryLocks.get(jobId);
  if (current?.token === token) {
    memoryLocks.delete(jobId);
  }
}
