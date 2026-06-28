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

/** 读取已保存的 API Key（sessionStorage）。 */
export function getStoredKey(): string {
  if (typeof window === 'undefined') return '';
  return window.sessionStorage.getItem(KEY_STORAGE) || '';
}

export function setStoredKey(key: string) {
  if (typeof window === 'undefined') return;
  if (key) window.sessionStorage.setItem(KEY_STORAGE, key);
  else window.sessionStorage.removeItem(KEY_STORAGE);
}

/** 构建带鉴权的 headers（Bearer）。 */
export function authHeaders(key: string, extra: Record<string, string> = {}): HeadersInit {
  return {
    Authorization: `Bearer ${key}`,
    ...extra,
  };
}

export type ChatRole = 'user' | 'assistant' | 'system';

export type ApiError = Error & { status?: number; code?: string };

/**
 * 后端有 3 种错误返回格式，统一提取为人类可读字符串 + 错误对象。
 *   1. OpenAI 风格：{ error: { message, type, code } }
 *   2. FastAPI 风格：{ detail: "..." }
 *   3. 裸字符串：{ error: "invalid_key" }
 */
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

/** 将 fetch 响应统一抛出为 ApiError。 */
export async function throwIfError(res: Response, fallback: string): Promise<void> {
  if (res.ok) return;
  let msg = fallback;
  try {
    const data = await res.json();
    msg = extractError(data, fallback);
  } catch {
    // 响应非 JSON
  }
  const err = new Error(msg) as ApiError;
  err.status = res.status;
  throw err;
}

/**
 * 解析 SSE 流：逐行读取 `data: <payload>`，对每个 JSON payload 调用 onChunk，
 * 遇到 `data: [DONE]` 结束。同时把 error 格式数据回调出去。
 *
 * 兼容 OpenAI chat completion chunk 格式：
 *   { choices: [{ delta: { content } }] }
 */
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
          // 忽略无法解析的行
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/** 从可能含 markdown 图片的文本中提取图片 URL。 */
export function extractImageUrls(markdown: string): string[] {
  const urls: string[] = [];
  const re = /!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown)) !== null) {
    urls.push(m[1]);
  }
  return urls;
}

/** 图片任务元信息（GET /v1/images/jobs/:id 返回）。 */
export type ImageJobStatus = {
  id: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  created_at?: number;
  updated_at?: number;
  error?: string | null;
  has_result?: boolean;
  asset_count?: number;
};

/** 生成图片代理文件 URL（接口公开，无需鉴权）。 */
export function imageFileUrl(jobId: string, index: number): string {
  return `/v1/images/jobs/${jobId}/files/${index}`;
}

/** sleep 工具。 */
export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
