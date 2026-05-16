import { requireApiKey, tokenManager } from '@/lib/session-manager';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ sid: string }> }) {
  const authResult = requireApiKey(request);
  if (authResult) return authResult;

  await tokenManager.getAllStatus();
  const { sid } = await context.params;
  const session = tokenManager.sessions.find((s) => s.sid === sid);
  if (!session || !session.raw_session) {
    return Response.json({ detail: `Session ${sid} not found` }, { status: 404 });
  }

  return new Response(JSON.stringify(session.raw_session, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="session_${sid}.json"`,
    },
  });
}
