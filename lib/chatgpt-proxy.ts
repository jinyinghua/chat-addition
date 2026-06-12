export const BASE_URL = 'https://chatgpt.com/backend-api';
export const WEB_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';
export const SENTINEL_USER_AGENT = WEB_USER_AGENT;

export const IMAGE_MODELS = new Set(['gpt-image-1', 'gpt-image-2', 'auto']);
export const DEFAULT_MODEL = 'gpt-5.4-mini';
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export type ChatMessage = {
  role: string;
  content?: string | Array<Record<string, unknown>> | null;
};

export function normalizeTextContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';

  const texts: string[] = [];
  for (const item of content) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    if (typeof obj.text === 'string') texts.push(obj.text);
    else if (typeof obj.input_text === 'string') texts.push(obj.input_text);
  }
  return texts.join('\n');
}

export function extractPromptAndImages(messages: ChatMessage[]) {
  const parts: string[] = [];
  const images: Array<{ url: string }> = [];

  for (const msg of messages || []) {
    if (!msg || typeof msg !== 'object') continue;
    if (['assistant', 'tool'].includes(msg.role)) continue;

    if (typeof msg.content === 'string') {
      if (msg.content.trim()) parts.push(msg.content);
      continue;
    }

    if (Array.isArray(msg.content)) {
      for (const item of msg.content) {
        if (!item || typeof item !== 'object') {
          parts.push(String(item));
          continue;
        }
        const obj = item as Record<string, unknown>;
        if (obj.type === 'text') {
          const text = typeof obj.text === 'string' ? obj.text : '';
          if (text) parts.push(text);
        } else if (obj.type === 'image_url') {
          const imageUrl = obj.image_url as Record<string, unknown> | undefined;
          const url = imageUrl && typeof imageUrl.url === 'string' ? imageUrl.url : '';
          if (url) images.push({ url });
        }
      }
    }
  }

  return {
    prompt: parts.join('\n\n').trim(),
    images,
  };
}

export function buildConversationBody(prompt: string, model = DEFAULT_MODEL) {
  return {
    action: 'next',
    messages: [
      {
        id: crypto.randomUUID(),
        author: { role: 'user' },
        content: { content_type: 'text', parts: [prompt] },
        metadata: {
          system_hints: ['picture_v2'],
          serialization_metadata: { custom_symbol_offsets: [] },
        },
      },
    ],
    parent_message_id: 'client-created-root',
    model: IMAGE_MODELS.has(model) ? 'auto' : model,
    timezone_offset_min: 420,
    timezone: 'America/Los_Angeles',
    conversation_mode: { kind: 'primary_assistant' },
    enable_message_followups: true,
    client_prepare_state: 'none',
    system_hints: ['picture_v2'],
    supports_buffering: true,
    supported_encodings: ['v1'],
    client_contextual_info: {
      is_dark_mode: true,
      time_since_loaded: 1000,
      page_height: 717,
      page_width: 1200,
      pixel_ratio: 2,
      screen_height: 878,
      screen_width: 1352,
      app_name: 'chatgpt.com',
    },
    paragen_cot_summary_display_override: 'allow',
    force_parallel_switch: 'auto',
  };
}

export function buildTextConversationBody(messages: ChatMessage[], model = DEFAULT_MODEL) {
  const parts: string[] = [];
  for (const msg of messages || []) {
    const role = (msg.role || 'user').toLowerCase();
    const content = normalizeTextContent(msg.content).trim();
    if (!content) continue;
    if (role === 'system') parts.push(`[system]\n${content}`);
    else if (role === 'assistant') parts.push(`[assistant]\n${content}`);
    else parts.push(`[user]\n${content}`);
  }
  const prompt = parts.join('\n\n') || '[user]\nhello';
  return {
    action: 'next',
    messages: [
      {
        id: crypto.randomUUID(),
        author: { role: 'user' },
        content: { content_type: 'text', parts: [prompt] },
      },
    ],
    parent_message_id: 'client-created-root',
    model: IMAGE_MODELS.has(model) ? 'auto' : model,
    timezone_offset_min: 420,
    timezone: 'America/Los_Angeles',
    conversation_mode: { kind: 'primary_assistant' },
    enable_message_followups: true,
    supports_buffering: true,
  };
}

export function buildMultimodalBody(prompt: string, model: string, fileIds: string[]) {
  const parts: Array<string | Record<string, unknown>> = [prompt];
  const attachments: Array<Record<string, unknown>> = [];

  for (let i = 0; i < fileIds.length; i += 1) {
    const fid = fileIds[i];
    parts.push({
      content_type: 'image_asset_pointer',
      asset_pointer: `file-service://${fid}`,
      size_bytes: 0,
    });
    attachments.push({
      id: fid,
      name: `image_${i}.png`,
      mimeType: 'image/png',
    });
  }

  return {
    action: 'next',
    messages: [
      {
        id: crypto.randomUUID(),
        author: { role: 'user' },
        content: { content_type: 'multimodal_text', parts },
        metadata: {
          attachments,
          system_hints: ['picture_v2'],
        },
      },
    ],
    parent_message_id: 'client-created-root',
    model: IMAGE_MODELS.has(model) ? 'auto' : model,
    timezone_offset_min: 420,
    timezone: 'America/Los_Angeles',
    conversation_mode: { kind: 'primary_assistant' },
    enable_message_followups: true,
    system_hints: ['picture_v2'],
    supports_buffering: true,
    supported_encodings: ['v1'],
    paragen_cot_summary_display_override: 'allow',
    force_parallel_switch: 'auto',
  };
}

export function parseDataUri(uri: string): { bytes: Uint8Array; mimeType: string } | null {
  if (!uri.startsWith('data:')) return null;
  try {
    const [header, data] = uri.split(',', 2);
    const mimeType = header.split(':', 2)[1].split(';', 1)[0] || 'application/octet-stream';
    const bytes = Uint8Array.from(Buffer.from(data, 'base64'));
    return { bytes, mimeType };
  } catch {
    return null;
  }
}

export async function fetchImageAsBase64(imageUrl: string) {
  const response = await fetch(imageUrl, {
    headers: {
      'User-Agent': 'chat-addition/1.0',
    },
  });

  if (!response.ok) {
    throw new Error(`图片下载失败: ${response.status}`);
  }

  const contentType = response.headers.get('content-type') || 'application/octet-stream';
  const arrayBuffer = await response.arrayBuffer();

  if (arrayBuffer.byteLength > MAX_IMAGE_BYTES) {
    throw new Error(`图片过大，当前限制 ${Math.floor(MAX_IMAGE_BYTES / 1024 / 1024)}MB`);
  }

  const base64 = Buffer.from(arrayBuffer).toString('base64');
  return { contentType, base64 };
}

export function buildOpenAiStreamChunk({
  id,
  created,
  model,
  content,
  finishReason = null,
}: {
  id: string;
  created: number;
  model: string;
  content: string;
  finishReason?: string | null;
}) {
  return {
    id,
    object: 'chat.completion.chunk',
    created,
    model,
    choices: [
      {
        index: 0,
        delta: content ? { content } : {},
        finish_reason: finishReason,
      },
    ],
  };
}
