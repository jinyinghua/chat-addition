import { BASE_URL, DEFAULT_MODEL, IMAGE_MODELS, SENTINEL_USER_AGENT, buildConversationBody, buildMultimodalBody } from '@/lib/chatgpt-proxy';
import { generateRequirementsToken, solvePow } from '@/lib/chatgpt-sentinel';
import { persistImageBytes } from '@/lib/blob-store';
import { tokenManager } from '@/lib/session-manager';

export type UpstreamImage = {
  url: string;
  revised_prompt?: string;
  file_id?: string;
  gen_id?: string;
};

export type UpstreamImageResult = {
  created: number;
  data: Array<{
    url: string;
    b64_json?: string;
    revised_prompt?: string;
  }>;
  text?: string;
};

function extractFileId(assetPointer: string): string {
  for (const prefix of ['file-service://', 'sediment://']) {
    if (assetPointer.startsWith(prefix)) {
      return assetPointer.slice(prefix.length).split('?')[0];
    }
  }
  if (assetPointer.startsWith('file_')) return assetPointer.split('?')[0];
  return '';
}

function isSediment(assetPointer: string): boolean {
  return assetPointer.startsWith('sediment://');
}

function normalizeMime(contentType: string): string {
  if (contentType.includes('jpeg') || contentType.includes('jpg')) return 'image/jpeg';
  if (contentType.includes('webp')) return 'image/webp';
  return 'image/png';
}

export async function getSentinelTokens(accessToken: string, deviceId: string) {
  const reqToken = generateRequirementsToken();
  const resp = await fetch(`${BASE_URL}/sentinel/chat-requirements`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'User-Agent': SENTINEL_USER_AGENT,
      'oai-device-id': deviceId,
    },
    body: JSON.stringify({ p: reqToken }),
  });

  if (!resp.ok) {
    throw new Error(`chat-requirements failed: ${resp.status} ${await resp.text().catch(() => '')}`);
  }

  const data = (await resp.json()) as Record<string, unknown>;
  const chatToken = typeof data.token === 'string' ? data.token : '';
  const powInfo = (data.proofofwork && typeof data.proofofwork === 'object' ? data.proofofwork : {}) as Record<string, unknown>;
  let proofToken = '';
  if (powInfo.required && typeof powInfo.seed === 'string' && typeof powInfo.difficulty === 'string') {
    proofToken = solvePow(powInfo.seed, powInfo.difficulty);
  }
  return { chatToken, proofToken };
}

export async function uploadFile(accessToken: string, deviceId: string, data: Uint8Array, mimeType: string) {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'User-Agent': SENTINEL_USER_AGENT,
    'OAI-Device-Id': deviceId,
  };

  const filename = `input_image_${Date.now()}.png`;
  const preResp = await fetch(`${BASE_URL}/files`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      file_name: filename,
      file_size: data.byteLength,
      use_case: 'multimodal',
      mime_type: mimeType || 'image/png',
    }),
  });
  if (!preResp.ok) {
    return '';
  }
  const preData = (await preResp.json()) as Record<string, unknown>;
  const uploadUrl = typeof preData.upload_url === 'string' ? preData.upload_url : '';
  const fileId = typeof preData.file_id === 'string' ? preData.file_id : '';
  if (!uploadUrl || !fileId) return '';

  const putResp = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'x-ms-blob-type': 'BlockBlob',
      'Content-Type': mimeType || 'image/png',
    },
    body: Buffer.from(data),
  });
  if (!putResp.ok) return '';

  const confResp = await fetch(`${BASE_URL}/files/${fileId}/uploaded`, {
    method: 'POST',
    headers,
    body: '{}',
  });
  return confResp.ok ? fileId : '';
}

async function resolveImageUrl(accessToken: string, deviceId: string, fileId: string, conversationId: string, sediment: boolean) {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'User-Agent': SENTINEL_USER_AGENT,
    'OAI-Device-Id': deviceId,
  };

  let downloadUrl = '';
  const url = sediment
    ? `${BASE_URL}/conversation/${conversationId}/attachment/${fileId}/download`
    : `${BASE_URL}/files/download/${fileId}?conversation_id=${conversationId}&inline=false`;

  const resp = await fetch(url, { headers, redirect: 'manual' });
  if (resp.status >= 300 && resp.status < 400) {
    downloadUrl = resp.headers.get('location') || '';
  } else if (resp.ok) {
    try {
      const json = (await resp.json()) as Record<string, unknown>;
      downloadUrl = typeof json.download_url === 'string' ? json.download_url : '';
    } catch {
      // ignore
    }
  }

  if (!downloadUrl) {
    const fallbackUrl = sediment ? `${BASE_URL}/files/${fileId}/download` : `${BASE_URL}/attachments/${fileId}`;
    const fallbackResp = await fetch(fallbackUrl, { headers, redirect: 'manual' });
    if (fallbackResp.status >= 300 && fallbackResp.status < 400) {
      downloadUrl = fallbackResp.headers.get('location') || '';
    } else if (fallbackResp.ok) {
      try {
        const json = (await fallbackResp.json()) as Record<string, unknown>;
        downloadUrl = typeof json.download_url === 'string' ? json.download_url : '';
      } catch {
        // ignore
      }
    }
  }

  if (!downloadUrl) {
    const estuaryUrl = `${BASE_URL}/estuary/content?id=${fileId}&p=fs&cid=1`;
    const estuaryResp = await fetch(estuaryUrl, { headers });
    if (estuaryResp.ok) {
      const bytes = new Uint8Array(await estuaryResp.arrayBuffer());
      const mime = normalizeMime(estuaryResp.headers.get('content-type') || 'image/png');
      return { dataUri: `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`, bytes, mimeType: mime };
    }
    return null;
  }

  const dlHeaders: Record<string, string> = {};
  if (downloadUrl.includes('chatgpt.com') || downloadUrl.includes('openai')) {
    dlHeaders.Authorization = `Bearer ${accessToken}`;
    dlHeaders['User-Agent'] = SENTINEL_USER_AGENT;
    dlHeaders['OAI-Device-Id'] = deviceId;
  }

  const imageResp = await fetch(downloadUrl, { headers: dlHeaders });
  if (!imageResp.ok) {
    return { dataUri: downloadUrl, bytes: null, mimeType: '' };
  }
  const bytes = new Uint8Array(await imageResp.arrayBuffer());
  const mime = normalizeMime(imageResp.headers.get('content-type') || 'image/png');
  return { dataUri: `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`, bytes, mimeType: mime };
}

function unwrapEvent(event: Record<string, unknown>) {
  const direct = event.message && typeof event.message === 'object' ? (event.message as Record<string, unknown>) : undefined;
  let conversationId = typeof event.conversation_id === 'string' ? event.conversation_id : '';
  if (direct) return { message: direct, conversationId };

  const nested = event.v && typeof event.v === 'object' ? (event.v as Record<string, unknown>) : undefined;
  if (nested) {
    const msg = nested.message && typeof nested.message === 'object' ? (nested.message as Record<string, unknown>) : undefined;
    if (!conversationId && typeof nested.conversation_id === 'string') conversationId = nested.conversation_id;
    if (msg) return { message: msg, conversationId };
  }
  return { message: undefined, conversationId };
}

async function extractImagesFromMessage(params: {
  accessToken: string;
  deviceId: string;
  message: Record<string, unknown>;
  conversationId: string;
  seenIds: Set<string>;
  persistPrefix?: string;
}) {
  const content = (params.message.content && typeof params.message.content === 'object' ? params.message.content : {}) as Record<string, unknown>;
  if (!['multimodal', 'multimodal_text'].includes(String(content.content_type || ''))) return [] as UpstreamImage[];

  const out: UpstreamImage[] = [];
  const parts = Array.isArray(content.parts) ? content.parts : [];
  for (const rawPart of parts) {
    if (!rawPart || typeof rawPart !== 'object') continue;
    const part = rawPart as Record<string, unknown>;
    if (part.content_type !== 'image_asset_pointer') continue;
    const asset = typeof part.asset_pointer === 'string' ? part.asset_pointer : '';
    const fileId = extractFileId(asset);
    if (!fileId || params.seenIds.has(fileId) || !params.conversationId) continue;

    const resolved = await resolveImageUrl(params.accessToken, params.deviceId, fileId, params.conversationId, isSediment(asset));
    if (!resolved) continue;
    params.seenIds.add(fileId);

    let finalUrl = resolved.dataUri;
    if (resolved.bytes && resolved.mimeType && params.persistPrefix) {
      const ext = resolved.mimeType.includes('jpeg') ? 'jpg' : resolved.mimeType.includes('webp') ? 'webp' : 'png';
      const pathname = `${params.persistPrefix}/${fileId}.${ext}`;
      const persisted = await persistImageBytes({ bytes: resolved.bytes, mimeType: resolved.mimeType, pathname });
      if (persisted) finalUrl = persisted;
    }

    const meta = (part.metadata && typeof part.metadata === 'object' ? (part.metadata as Record<string, unknown>).dalle : undefined) as Record<string, unknown> | undefined;
    out.push({
      url: finalUrl,
      revised_prompt: meta && typeof meta.prompt === 'string' ? meta.prompt : '',
      file_id: fileId,
      gen_id: meta && typeof meta.gen_id === 'string' ? meta.gen_id : '',
    });
  }
  return out;
}

function mergeImages(base: UpstreamImage[], extra: UpstreamImage[]) {
  const seen = new Set(base.map((img) => `${img.file_id || ''}|${img.url}`));
  for (const img of extra) {
    const key = `${img.file_id || ''}|${img.url}`;
    if (!seen.has(key)) {
      base.push(img);
      seen.add(key);
    }
  }
  return base;
}

export async function parseConversationSse(accessToken: string, deviceId: string, chunks: string[], persistPrefix?: string) {
  const images: UpstreamImage[] = [];
  const events: Record<string, unknown>[] = [];
  const seenIds = new Set<string>();
  let conversationId = '';

  for (const chunk of chunks) {
    if (!chunk.startsWith('data: ')) continue;
    const data = chunk.slice(6).trim();
    if (data === '[DONE]' || !data.startsWith('{')) continue;
    try {
      const event = JSON.parse(data) as Record<string, unknown>;
      events.push(event);
      if (typeof event.conversation_id === 'string' && event.conversation_id) conversationId = event.conversation_id;
      const v = event.v && typeof event.v === 'object' ? (event.v as Record<string, unknown>) : undefined;
      if (!conversationId && v && typeof v.conversation_id === 'string') conversationId = v.conversation_id;
    } catch {
      continue;
    }
  }

  for (const event of events) {
    const { message, conversationId: cid } = unwrapEvent(event);
    if (cid) conversationId = cid;
    if (!message) continue;
    const author = (message.author && typeof message.author === 'object' ? message.author : {}) as Record<string, unknown>;
    if (author.role === 'user' || author.role === 'system') continue;
    const found = await extractImagesFromMessage({ accessToken, deviceId, message, conversationId, seenIds, persistPrefix });
    if (found.length) mergeImages(images, found);
  }

  return images;
}

export async function pollConversationForImages(params: {
  accessToken: string;
  deviceId: string;
  conversationId: string;
  parentMessageId?: string;
  persistPrefix?: string;
  maxWaitSeconds?: number;
}) {
  const headers = {
    Authorization: `Bearer ${params.accessToken}`,
    'User-Agent': SENTINEL_USER_AGENT,
    'OAI-Device-Id': params.deviceId,
  };
  const deadline = Date.now() + (params.maxWaitSeconds || 120) * 1000;
  const seenIds = new Set<string>();

  let attempt = 0;
  while (Date.now() < deadline) {
    attempt += 1;
    await new Promise((r) => setTimeout(r, attempt === 1 ? 1000 : 3000));
    const resp = await fetch(`${BASE_URL}/conversation/${params.conversationId}`, { headers });
    if (!resp.ok) {
      if (resp.status === 401 || resp.status === 403) throw new Error(`Poll auth error: ${resp.status}`);
      continue;
    }
    let conv: Record<string, unknown>;
    try {
      conv = (await resp.json()) as Record<string, unknown>;
    } catch {
      continue;
    }

    const mapping = (conv.mapping && typeof conv.mapping === 'object' ? conv.mapping : {}) as Record<string, unknown>;
    const images: UpstreamImage[] = [];
    let refusalText = '';
    for (const node of Object.values(mapping)) {
      if (!node || typeof node !== 'object') continue;
      const message = (node as Record<string, unknown>).message as Record<string, unknown> | undefined;
      if (!message) continue;
      if (params.parentMessageId && message.id === params.parentMessageId) continue;
      const author = (message.author && typeof message.author === 'object' ? message.author : {}) as Record<string, unknown>;
      if (author.role === 'user' || author.role === 'system') continue;

      const content = (message.content && typeof message.content === 'object' ? message.content : {}) as Record<string, unknown>;
      if (author.role === 'assistant' && message.status === 'finished_successfully' && content.content_type === 'text') {
        const parts = Array.isArray(content.parts) ? content.parts : [];
        if (parts.length && typeof parts[0] === 'string') {
          const text = parts[0];
          const lower = text.toLowerCase();
          if (['content polic', 'violat', 'got it wrong', 'sorry', "can't create", 'cannot create', 'unable to generate', 'inappropriate'].some((kw) => lower.includes(kw))) {
            refusalText = text;
          }
        }
      }

      const found = await extractImagesFromMessage({
        accessToken: params.accessToken,
        deviceId: params.deviceId,
        message,
        conversationId: params.conversationId,
        seenIds,
        persistPrefix: params.persistPrefix,
      });
      if (found.length) mergeImages(images, found);
    }

    if (images.length) return images;
    if (refusalText) throw new Error(`Content policy refusal: ${refusalText.slice(0, 300)}`);
  }

  throw new Error('Timed out waiting for async image generation');
}

export function buildImagesResponse(images: UpstreamImage[], responseFormat: string, text = ''): UpstreamImageResult {
  return {
    created: Math.floor(Date.now() / 1000),
    data: images.map((img) => {
      if (responseFormat === 'b64_json' && img.url.startsWith('data:')) {
        return {
          url: '',
          b64_json: img.url.includes(',') ? img.url.split(',', 2)[1] : '',
          revised_prompt: img.revised_prompt || '',
        };
      }
      return {
        url: img.url,
        revised_prompt: img.revised_prompt || '',
      };
    }),
    text,
  };
}

export async function handleImageViaConversation(params: {
  prompt: string;
  model: string;
  n: number;
  size: string;
  quality: string;
  background: string;
  responseFormat: string;
  inputImages?: Array<{ url: string }>;
  persistPrefix?: string;
}) {
  let fullPrompt = params.prompt;
  if (params.size && !['auto', '1024x1024'].includes(params.size)) {
    fullPrompt = `Generate an image with size ${params.size}. ${fullPrompt}`;
  }
  if (['hd', 'high'].includes(params.quality)) {
    fullPrompt = `Generate a high-quality, detailed image: ${fullPrompt}`;
  }
  if (params.background === 'transparent') {
    fullPrompt += ' The image must have a transparent background (PNG with alpha channel).';
  }

  const accessToken = await tokenManager.getValidToken();
  const deviceId = tokenManager.deviceId;
  const { chatToken, proofToken } = await getSentinelTokens(accessToken, deviceId);

  let body: Record<string, unknown> | null = null;
  if (params.inputImages && params.inputImages.length) {
    const fileIds: string[] = [];
    for (const image of params.inputImages) {
      if (!image.url.startsWith('data:')) continue;
      const header = image.url.split(',', 2)[0];
      const mime = header.split(':', 2)[1]?.split(';', 1)[0] || 'image/png';
      const data = Uint8Array.from(Buffer.from(image.url.split(',', 2)[1] || '', 'base64'));
      const fid = await uploadFile(accessToken, deviceId, data, mime);
      if (fid) fileIds.push(fid);
    }
    if (fileIds.length) {
      body = buildMultimodalBody(fullPrompt, params.model, fileIds) as Record<string, unknown>;
    }
  }
  if (!body) {
    body = buildConversationBody(fullPrompt, params.model) as Record<string, unknown>;
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'User-Agent': SENTINEL_USER_AGENT,
    'OAI-Device-Id': deviceId,
    'OAI-Language': 'en-US',
    Accept: '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    Origin: 'https://chatgpt.com',
    Referer: 'https://chatgpt.com/',
    Priority: 'u=1, i',
    'Sec-CH-UA': '"Chromium";v="146", "Google Chrome";v="146", "Not?A_Brand";v="99"',
    'Sec-CH-UA-Mobile': '?0',
    'Sec-CH-UA-Platform': '"macOS"',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
    'openai-sentinel-chat-requirements-token': chatToken,
  };
  if (proofToken) headers['openai-sentinel-proof-token'] = proofToken;

  const parentMessageId = String(((body.messages as Array<Record<string, unknown>>)[0] || {}).id || '');
  for (const path of ['/f/conversation', '/conversation']) {
    const resp = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      if ((resp.status === 403 || resp.status === 404) && path === '/f/conversation') continue;
      throw new Error(`${path} returned ${resp.status}`);
    }
    if (!resp.body) throw new Error('No response body');

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    const chunks: string[] = [];
    let conversationId = '';
    let asyncMode = false;
    const liveImages: UpstreamImage[] = [];
    const seenIds = new Set<string>();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      for (const line of text.split(/\r?\n/)) {
        if (line) chunks.push(line);
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6).trim();
        if (payload === '[DONE]' || !payload.startsWith('{')) continue;
        let event: Record<string, unknown>;
        try {
          event = JSON.parse(payload) as Record<string, unknown>;
        } catch {
          continue;
        }
        const cid = typeof event.conversation_id === 'string' ? event.conversation_id : '';
        if (cid) conversationId = cid;
        const v = event.v && typeof event.v === 'object' ? (event.v as Record<string, unknown>) : undefined;
        if (!conversationId && v && typeof v.conversation_id === 'string') conversationId = v.conversation_id;
        if (typeof event.async_status === 'number' && event.async_status > 0) asyncMode = true;
        if (event.error) {
          throw new Error(`Upstream error: ${typeof event.error === 'string' ? event.error : JSON.stringify(event.error)}`);
        }
        const { message, conversationId: evtCid } = unwrapEvent(event);
        const found = message
          ? await extractImagesFromMessage({ accessToken, deviceId, message, conversationId: evtCid || conversationId, seenIds, persistPrefix: params.persistPrefix })
          : [];
        if (found.length) mergeImages(liveImages, found);
      }
    }
    reader.releaseLock();

    let images = liveImages;
    if (images.length < params.n) {
      const reparsed = await parseConversationSse(accessToken, deviceId, chunks, params.persistPrefix);
      mergeImages(images, reparsed);
    }
    if (images.length) {
      return buildImagesResponse(images.slice(0, params.n), params.responseFormat);
    }
    if (asyncMode && conversationId) {
      images = await pollConversationForImages({ accessToken, deviceId, conversationId, parentMessageId, persistPrefix: params.persistPrefix });
      if (images.length) return buildImagesResponse(images.slice(0, params.n), params.responseFormat);
    }
  }

  throw new Error('No images in response');
}
