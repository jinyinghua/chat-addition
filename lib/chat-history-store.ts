/**
 * 聊天历史存储 —— Redis / 文件系统双后端
 * 遵循 session-manager.ts 的存储模式，使用同样的 DATA_DIR。
 */
import { Redis } from '@upstash/redis';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DATA_DIR = process.env.DATA_DIR || '/tmp/chat-addition';

// 每个 API Key 一个历史档案，key 为 sha256 前缀
function historyFile(keyHash: string) {
  return path.join(DATA_DIR, `chat-history-${keyHash}.json`);
}

function redisKey(keyHash: string) {
  return `uapi:chathistory:${keyHash}`;
}

let redisClient: Redis | null = null;

function getRedis() {
  if (redisClient) return redisClient;
  const url = (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '').trim();
  const token = (process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '').trim();
  if (!url || !token) return null;
  redisClient = new Redis({ url, token });
  return redisClient;
}

function ensureDataDir() {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch { /* ignore */ }
}

export interface ChatHistoryItem {
  id: string;
  title: string;
  time: number; // unix ms
}

type StoreData = ChatHistoryItem[];

/** 从持久化存储读取历史列表 */
async function readStore(keyHash: string): Promise<StoreData> {
  const redis = getRedis();
  if (redis) {
    try {
      const raw = await redis.get<StoreData>(redisKey(keyHash));
      if (Array.isArray(raw)) return raw;
    } catch (e) {
      console.warn('[ChatHistory] redis read failed:', e);
    }
  }
  // fallback: file
  try {
    ensureDataDir();
    const content = fs.readFileSync(historyFile(keyHash), 'utf-8');
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // 文件不存在或解析失败
  }
  return [];
}

/** 写入持久化存储 */
async function writeStore(keyHash: string, data: StoreData) {
  const redis = getRedis();
  if (redis) {
    try {
      await redis.set(redisKey(keyHash), data);
      return;
    } catch (e) {
      console.warn('[ChatHistory] redis write failed:', e);
    }
  }
  // fallback: file
  ensureDataDir();
  fs.writeFileSync(historyFile(keyHash), JSON.stringify(data, null, 2), 'utf-8');
}

/** 通过 API Key 计算 namespace */
export function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 16);
}

/** 获取历史列表 */
export async function getHistory(keyHash: string): Promise<ChatHistoryItem[]> {
  return readStore(keyHash);
}

/** 创建或更新一条历史记录（去重 id） */
export async function upsertHistory(keyHash: string, item: ChatHistoryItem): Promise<ChatHistoryItem[]> {
  const list = await readStore(keyHash);
  const idx = list.findIndex((h) => h.id === item.id);
  if (idx >= 0) {
    list[idx] = item;
  } else {
    list.unshift(item);
  }
  // 最多保留 50 条
  const trimmed = list.slice(0, 50);
  await writeStore(keyHash, trimmed);
  return trimmed;
}

/** 删除一条历史记录 */
export async function deleteHistory(keyHash: string, id: string): Promise<ChatHistoryItem[]> {
  const list = await readStore(keyHash);
  const filtered = list.filter((h) => h.id !== id);
  await writeStore(keyHash, filtered);
  return filtered;
}

/** 清空全部历史 */
export async function clearHistory(keyHash: string): Promise<ChatHistoryItem[]> {
  await writeStore(keyHash, []);
  return [];
}
