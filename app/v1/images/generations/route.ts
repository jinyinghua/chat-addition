import { getAuthTokenFromRequest, requireApiKey } from '@/lib/session-manager';
import { extractPromptAndImages } from '@/lib/chatgpt-proxy';
import { buildOpenAiImageGenerationResponse, buildImageTimeoutResponse, createOrGetImageJob, ensureImageJobStarted } from '@/lib/image-job-service';
import { getPublicBaseUrl } from '@/lib/app-url';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(request: Request) {
  const authResult = requireApiKey(request);
  if (authResult) return authResult;

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ detail: '无效的 JSON' }, { status: 400 });
  }

  const model = String(payload.model || 'gpt-image-2').toLowerCase();
  const prompt = typeof payload.prompt === 'string' ? payload.prompt : '';
  const size = typeof payload.size === 'string' ? payload.size : 'auto';
  const quality = typeof payload.quality === 'string' ? payload.quality : 'auto';
  const background = typeof payload.background === 'string' ? payload.background : 'auto';
  const responseFormat = typeof payload.response_format === 'string' ? payload.response_format : 'url';
  const n = typeof payload.n === 'number' ? payload.n : 1;
  const stream = payload.stream === true;

  const messages = Array.isArray(payload.messages) ? (payload.messages as Array<Record<string, unknown>>) : [];
  const { prompt: msgPrompt, images: msgImages } = extractPromptAndImages(messages as never[]);

  const inputImages: Array<{ url: string }> = [];
  if (Array.isArray(payload.input_images)) {
    for (const item of payload.input_images) {
      if (item && typeof item === 'object' && typeof (item as Record<string, unknown>).url === 'string') {
        inputImages.push({ url: (item as Record<string, unknown>).url as string });
      }
    }
  }
  inputImages.push(...msgImages);

  const finalPrompt = (prompt || msgPrompt || '').trim();
  if (!finalPrompt) {
    return Response.json({ detail: 'prompt is required' }, { status: 400 });
  }

  if (stream) {
    return Response.json({ detail: 'streaming image generation is not supported in compatibility mode' }, { status: 400 });
  }

  const ownerToken = getAuthTokenFromRequest(request);
  const { job } = await createOrGetImageJob({
    ownerToken,
    model,
    prompt: finalPrompt,
    size,
    quality,
    background,
    responseFormat,
    n,
    inputImages,
  });

  console.log(`[images] start job id=${job.id} model=${model}`);
  const waited = await ensureImageJobStarted(job);
  if (!waited || waited.status === 'queued' || waited.status === 'running') {
    console.warn(`[images] job still pending id=${job.id}`);
    return buildImageTimeoutResponse(job, request);
  }
  if (waited.status === 'failed') {
    console.warn(`[images] job failed id=${waited.id} error=${waited.error || ''}`);
    return Response.json({ detail: waited.error || 'image generation failed' }, { status: 502, headers: { 'X-Image-Job-Id': waited.id } });
  }

  const baseUrl = getPublicBaseUrl(request);
  console.log(`[images] job succeeded id=${waited.id} assets=${waited.result?.assets?.length || 0}`);
  return Response.json(buildOpenAiImageGenerationResponse(waited, baseUrl, responseFormat), {
    headers: { 'X-Image-Job-Id': waited.id },
  });
}
