import { requireApiKey, tokenManager } from '@/lib/session-manager';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, context: { params: Promise<{ sid: string }> }) {
  const authResult = requireApiKey(request);
  if (authResult) return authResult;

  const { sid } = await context.params;
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const disabled = !!(body && typeof body === 'object' && 'disabled' in body ? (body as Record<string, unknown>).disabled : false);
  if (!tokenManager.toggleSession(sid, disabled)) {
    return Response.json({ detail: `Session ${sid} not found` }, { status: 404 });
  }

  return Response.json({ status: 'ok', message: `Session ${sid} ${disabled ? 'disabled' : 'enabled'}` });
}
