'use client';

/**
 * 前端工具库：API Key 管理、鉴权头、SSE 流式解析、统一错误提取、模型清单。
 * 仅在客户端组件中使用。
 */

export const KEY_STORAGE = '_uapi_proxy_key';
export const THEME_STORAGE = 'ca_theme';
export type ThemeName = 'aurora' | 'daylight';

export const TEXT_MODELS = [
  { id: 'gpt-5.4-mini', label: 'gpt-5.4-mini', desc: '快速 · 推荐' },
  { id: 'gpt-4o', label: 'gpt-4o', desc: '通用' },
  { id: 'gpt-5.5', label: 'gpt-5.5', desc: '更强' },
  { id: 'auto', label: 'auto', desc: '自动路由' },
] as const;

export const IMAGE_MODELS = [
  { id: 'gpt-image-2', label: 'gpt-image-2', desc: '新一代 · 推荐' },
  { id: 'gpt-image-1', label: 'gpt-image-1', desc: '经典' },
] as const;

export const IMAGE_SIZES = ['auto', '1024x1024', '1024x1536', '1536x1024'] as const;
export const IMAGE_QUALITIES = ['auto', 'high', 'medium', 'low'] as const;
export const IMAGE_BACKGROUNDS = ['auto', 'transparent', 'opaque'] as const;

export function isImageModel(model: string): boolean {
  return IMAGE_MODELS.some((m) => m.id === model.toLowerCase());
}

export function getStoredKey(): string {
  if (typeof window === 'undefined') return '';
  return window.sessionStorage.getItem(KEY_STORAGE) || '';
}

export function setStoredKey(key: string) {
  if (typeof window === 'undefined') return;
  if (key) window.sessionStorage.setItem(KEY_STORAGE, key);
  else window.sessionStorage.removeItem(KEY_STORAGE);
}

export function authHeaders(key: string, extra: Record<string, string> = {}): HeadersInit {
  return {
    Authorization: `Bearer ${key}`,
    ...extra,
  };
}

export type ChatRole = 'user' | 'assistant' | 'system';

export type ApiError = Error & { status?: number; code?: string };

export function extractError(data: unknown, fallback = '请求失败'): string {
  if (!data || typeof data !== 'object') return fallback;
  const obj = data as Record<string, unknown>;
  const err = obj.error;
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>;
    if (typeof e.message === 'string') return e.message;
    if (typeof e.code === 'string') return e.code;
  }
  if (typeof obj.detail === 'string') return obj.detail;
  return fallback;
}

export async function throwIfError(res: Response, fallback: string): Promise<void> {
  if (res.ok) return;
  let msg = fallback;
  try {
    const data = await res.json();
    msg = extractError(data, fallback);
  } catch {
    // non-JSON response
  }
  const err = new Error(msg) as ApiError;
  err.status = res.status;
  throw err;
}

export async function streamChatCompletion(
  res: Response,
  onDelta: (text: string) => void,
  onError: (msg: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  if (!res.body) throw new Error('无响应体');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      if (signal?.aborted) break;
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6).trim();
        if (payload === '[DONE]') return;
        if (!payload.startsWith('{')) continue;
        try {
          const evt = JSON.parse(payload) as Record<string, unknown>;
          if (evt.error) {
            onError(extractError(evt));
            continue;
          }
          const choices = Array.isArray(evt.choices) ? evt.choices : [];
          const delta = choices[0]?.delta as Record<string, unknown> | undefined;
          if (delta && typeof delta.content === 'string' && delta.content) {
            onDelta(delta.content);
          }
        } catch {
          // ignore unparseable lines
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export function extractImageUrls(markdown: string): string[] {
  const urls: string[] = [];
  const re = /!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown)) !== null) {
    urls.push(m[1]);
  }
  return urls;
}

export type ImageJobStatus = {
  id: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  created_at?: number;
  updated_at?: number;
  error?: string | null;
  has_result?: boolean;
  asset_count?: number;
};

export function imageFileUrl(jobId: string, index: number): string {
  return `/v1/images/jobs/${jobId}/files/${index}`;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ================================================================
// 聊天历史 API (云端数据库，含消息)
// ================================================================

export interface ChatHistoryMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  images?: string[];
  error?: string;
}

export interface ChatHistoryItem {
  id: string;
  title: string;
  time: number;
  messages?: ChatHistoryMessage[];
}

/** 获取聊天历史列表（不含消息体，仅用于侧栏展示） */
export async function fetchChatHistory(key: string): Promise<ChatHistoryItem[]> {
  const res = await fetch('/v1/chat/history', { headers: authHeaders(key) });
  if (!res.ok) return [];
  return res.json();
}

/** 根据 id 加载单条历史（含 messages） */
export async function fetchChatHistoryById(key: string, id: string): Promise<ChatHistoryItem | null> {
  const res = await fetch(`/v1/chat/history?id=${encodeURIComponent(id)}`, { headers: authHeaders(key) });
  if (!res.ok) return null;
  return res.json();
}

/** 新增/更新一条历史记录（含 messages） */
export async function saveChatHistory(key: string, item: ChatHistoryItem): Promise<ChatHistoryItem[]> {
  const res = await fetch('/v1/chat/history', {
    method: 'POST',
    headers: authHeaders(key, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(item),
  });
  if (!res.ok) throw new Error('Failed to save chat history');
  return res.json();
}

/** 删除一条历史记录 */
export async function deleteChatHistory(key: string, id: string): Promise<ChatHistoryItem[]> {
  const res = await fetch(`/v1/chat/history/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeaders(key),
  });
  if (!res.ok) throw new Error('Failed to delete chat history');
  return res.json();
}
