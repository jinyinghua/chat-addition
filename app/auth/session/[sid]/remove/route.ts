import { requireApiKey, tokenManager } from '@/lib/session-manager';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, context: { params: Promise<{ sid: string }> }) {
  const authResult = requireApiKey(request);
  if (authResult) return authResult;

  const { sid } = await context.params;
  if (!tokenManager.removeSession(sid)) {
    return Response.json({ detail: `Session ${sid} not found` }, { status: 404 });
  }
  return Response.json({ status: 'ok', message: `Session ${sid} removed` });
}
