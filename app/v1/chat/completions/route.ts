import { getAuthTokenFromRequest, requireApiKey, tokenManager } from '@/lib/session-manager';
import { buildOpenAiStreamChunk, buildTextConversationBody, extractPromptAndImages, IMAGE_MODELS, DEFAULT_MODEL, BASE_URL, WEB_USER_AGENT } from '@/lib/chatgpt-proxy';
import { generateRequirementsToken, solvePow } from '@/lib/chatgpt-sentinel';
import { buildChatCompletionImageResponse, buildImageTimeoutResponse, createOrGetImageJob, ensureImageJobStarted } from '@/lib/image-job-service';
import { getPublicBaseUrl } from '@/lib/app-url';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

async function getSentinelTokens(accessToken: string) {
  console.log('[chat] getSentinelTokens start');
  const reqToken = generateRequirementsToken();
  const resp = await fetch(`${BASE_URL}/sentinel/chat-requirements`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'User-Agent': WEB_USER_AGENT,
      'oai-device-id': tokenManager.deviceId,
    },
    body: JSON.stringify({ p: reqToken }),
  });

  console.log(`[chat] chat-requirements status=${resp.status}`);
  if (!resp.ok) {
    throw new Error(`chat-requirements failed: ${resp.status}`);
  }

  const data = (await resp.json()) as Record<string, unknown>;
  const chatToken = typeof data.token === 'string' ? data.token : '';
  const pow = (data.proofofwork && typeof data.proofofwork === 'object' ? data.proofofwork : {}) as Record<string, unknown>;
  const proofToken = pow.required && typeof pow.seed === 'string' && typeof pow.difficulty === 'string'
    ? solvePow(pow.seed, pow.difficulty)
    : '';
  console.log(`[chat] getSentinelTokens done chatToken=${chatToken ? 'yes' : 'no'} proof=${proofToken ? 'yes' : 'no'}`);
  return { chatToken, proofToken };
}

async function callConversation(body: Record<string, unknown>, accessToken: string) {
  console.log('[chat] callConversation start');
  const { chatToken, proofToken } = await getSentinelTokens(accessToken);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'User-Agent': WEB_USER_AGENT,
    'oai-device-id': tokenManager.deviceId,
    'OAI-Language': 'en-US',
    Accept: 'text/event-stream',
    'openai-sentinel-chat-requirements-token': chatToken,
  };
  if (proofToken) headers['openai-sentinel-proof-token'] = proofToken;

  const resp = await fetch(`${BASE_URL}/conversation`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  console.log(`[chat] conversation status=${resp.status}`);
  if (!resp.ok || !resp.body) {
    const text = await resp.text().catch(() => '');
    console.warn('[chat] conversation failed body=', text.slice(0, 500));
    throw new Error(`upstream conversation failed: ${resp.status}`);
  }

  return resp;
}

function extractAssistantFullTextFromEvent(event: Record<string, unknown>) {
  const message = (event.message && typeof event.message === 'object' ? event.message : undefined) as Record<string, unknown> | undefined;
  const nested = (event.v && typeof event.v === 'object' ? (event.v as Record<string, unknown>).message : undefined) as Record<string, unknown> | undefined;
  const msg = message || nested;
  if (!msg) return '';

  const author = (msg.author && typeof msg.author === 'object' ? msg.author : {}) as Record<string, unknown>;
  if (author.role === 'user' || author.role === 'system') return '';

  const content = (msg.content && typeof msg.content === 'object' ? msg.content : {}) as Record<string, unknown>;
  if (content.content_type !== 'text') return '';
  const parts = Array.isArray(content.parts) ? content.parts : [];
  return parts.filter((p) => typeof p === 'string').join('');
}

function computeDelta(previousText: string, currentText: string) {
  if (!currentText) return '';
  if (!previousText) return currentText;
  if (currentText === previousText) return '';
  if (currentText.startsWith(previousText)) {
    return currentText.slice(previousText.length);
  }
  return currentText;
}

async function streamConversationToOpenAI(body: Record<string, unknown>, model: string, accessToken: string) {
  const upstream = await callConversation(body, accessToken);
  const reader = upstream.body!.getReader();
  const decoder = new TextDecoder();
  const cmplId = `chatcmpl-${crypto.randomUUID().slice(0, 12)}`;
  const created = Math.floor(Date.now() / 1000);

  return new ReadableStream({
    async start(controller) {
      let buffer = '';
      let lastText = '';
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() || '';
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const payload = line.slice(6).trim();
            if (payload === '[DONE]') {
              controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
              controller.close();
              return;
            }
            if (!payload.startsWith('{')) continue;
            try {
              const event = JSON.parse(payload) as Record<string, unknown>;
              const fullText = extractAssistantFullTextFromEvent(event);
              const delta = computeDelta(lastText, fullText);
              if (!delta) continue;
              lastText = fullText;
              const chunk = buildOpenAiStreamChunk({ id: cmplId, created, model, content: delta });
              controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(chunk)}\n\n`));
            } catch {
              continue;
            }
          }
        }
        controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
        controller.close();
      } catch (error) {
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ error: { message: error instanceof Error ? error.message : String(error) } })}\n\n`));
        controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
        controller.close();
      } finally {
        reader.releaseLock();
      }
    },
  });
}

export async function POST(request: Request) {
  const authResult = requireApiKey(request);
  if (authResult) return authResult;

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: { message: 'invalid_json' } }, { status: 400 });
  }

  const model = String(payload.model || DEFAULT_MODEL).toLowerCase();
  const stream = payload.stream === true;
  const messages = Array.isArray(payload.messages) ? (payload.messages as Array<Record<string, unknown>>) : [];
  const { prompt, images } = extractPromptAndImages(messages as never[]);
  console.log(`[chat] POST /v1/chat/completions model=${model} stream=${stream} messages=${messages.length}`);

  if (IMAGE_MODELS.has(model)) {
    const ownerToken = getAuthTokenFromRequest(request);
    const { job } = await createOrGetImageJob({
      ownerToken,
      model,
      prompt: prompt || 'hello',
      size: typeof payload.size === 'string' ? payload.size : 'auto',
      quality: typeof payload.quality === 'string' ? payload.quality : 'auto',
      background: typeof payload.background === 'string' ? payload.background : 'auto',
      responseFormat: 'url',
      n: typeof payload.n === 'number' ? payload.n : 1,
      inputImages: images,
    });

    console.log(`[chat-image] start job id=${job.id} stream=${stream}`);
    const waited = await ensureImageJobStarted(job);
    if (!waited || waited.status === 'queued' || waited.status === 'running') {
      console.warn(`[chat-image] pending job id=${job.id}`);
      if (stream) {
        return new Response(
          new ReadableStream({
            start(controller) {
              const msg = 'Image generation is still running. Retry the same request later.';
              const chunk = buildOpenAiStreamChunk({
                id: `chatcmpl-${crypto.randomUUID().slice(0, 12)}`,
                created: Math.floor(Date.now() / 1000),
                model,
                content: msg,
                finishReason: 'stop',
              });
              controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(chunk)}\n\n`));
              controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
              controller.close();
            },
          }),
          {
            headers: {
              'Content-Type': 'text/event-stream; charset=utf-8',
              'Cache-Control': 'no-cache, no-transform',
              Connection: 'keep-alive',
              'X-Image-Job-Id': job.id,
            },
          },
        );
      }
      return buildImageTimeoutResponse(job, request);
    }
    if (waited.status === 'failed') {
      console.warn(`[chat-image] failed job id=${waited.id} error=${waited.error || ''}`);
      if (stream) {
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ error: { message: waited.error || 'image generation failed' } })}\n\n`));
              controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
              controller.close();
            },
          }),
          {
            headers: {
              'Content-Type': 'text/event-stream; charset=utf-8',
              'Cache-Control': 'no-cache, no-transform',
              Connection: 'keep-alive',
              'X-Image-Job-Id': waited.id,
            },
          },
        );
      }
      return Response.json({ error: { message: waited.error || 'image generation failed' } }, { status: 502, headers: { 'X-Image-Job-Id': waited.id } });
    }

    const baseUrl = getPublicBaseUrl(request);
    if (stream) {
      const response = buildChatCompletionImageResponse(waited, model, baseUrl);
      const content = String(response.choices[0]?.message?.content || '');
      return new Response(
        new ReadableStream({
          start(controller) {
            const chunk = buildOpenAiStreamChunk({
              id: response.id,
              created: response.created,
              model,
              content,
              finishReason: 'stop',
            });
            controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(chunk)}\n\n`));
            controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
            controller.close();
          },
        }),
        {
          headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
            'X-Image-Job-Id': waited.id,
          },
        },
      );
    }

    console.log(`[chat-image] succeeded job id=${waited.id} assets=${waited.result?.assets?.length || 0}`);
    return Response.json(buildChatCompletionImageResponse(waited, model, baseUrl), {
      headers: { 'X-Image-Job-Id': waited.id },
    });
  }

  let accessToken = '';
  try {
    console.log('[chat] getValidToken start');
    accessToken = await tokenManager.getValidToken();
    console.log('[chat] getValidToken done');
  } catch (error) {
    console.warn('[chat] getValidToken failed:', error);
    return Response.json({ error: { message: error instanceof Error ? error.message : String(error) } }, { status: 502 });
  }

  const body = buildTextConversationBody(messages as never[], model);
  if (stream) {
    const streamBody = await streamConversationToOpenAI(body as Record<string, unknown>, model, accessToken);
    return new Response(streamBody, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
  }

  try {
    const upstream = await callConversation(body as Record<string, unknown>, accessToken);
    const reader = upstream.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let latestText = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim();
        if (raw === '[DONE]' || !raw.startsWith('{')) continue;
        try {
          const event = JSON.parse(raw) as Record<string, unknown>;
          const fullText = extractAssistantFullTextFromEvent(event);
          if (fullText) latestText = fullText;
        } catch {
          // ignore
        }
      }
    }
    reader.releaseLock();
    console.log(`[chat] non-stream content length=${latestText.length}`);

    return Response.json({
      id: `chatcmpl-${crypto.randomUUID().slice(0, 12)}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: latestText },
          finish_reason: 'stop',
        },
      ],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    });
  } catch (error) {
    console.warn('[chat] non-stream conversation failed:', error);
    return Response.json({ error: { message: error instanceof Error ? error.message : String(error) } }, { status: 502 });
  }
}
