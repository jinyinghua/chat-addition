import { buildImageJobFileUrl, getPublicBaseUrl } from '@/lib/app-url';
import { getJobById } from '@/lib/image-job-store';
import { requireApiKey } from '@/lib/session-manager';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function decodeB64(b64: string) {
  return Uint8Array.from(Buffer.from(b64, 'base64'));
}

export async function GET(request: Request, context: { params: Promise<{ jobId: string; index: string }> }) {
  const authResult = requireApiKey(request);
  if (authResult) return authResult;

  const { jobId, index } = await context.params;
  const job = await getJobById(jobId);
  if (!job || job.status !== 'succeeded' || !job.result) {
    return Response.json({ detail: 'image not ready' }, { status: 404 });
  }

  const asset = job.result.assets[Number(index)];
  if (!asset) {
    return Response.json({ detail: 'image index not found' }, { status: 404 });
  }

  if (asset.originUrl) {
    return Response.redirect(asset.originUrl, 302);
  }

  if (asset.b64Json) {
    const bytes = decodeB64(asset.b64Json);
    return new Response(bytes, {
      headers: {
        'Content-Type': asset.mimeType || 'image/png',
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Content-Length': String(bytes.byteLength),
        'X-Canonical-Image-Url': buildImageJobFileUrl(getPublicBaseUrl(request), jobId, Number(index)),
      },
    });
  }

  return Response.json({ detail: 'image data unavailable' }, { status: 404 });
}
