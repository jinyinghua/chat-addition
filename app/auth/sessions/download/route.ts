import { requireApiKey, tokenManager } from '@/lib/session-manager';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const authResult = requireApiKey(request);
  if (authResult) return authResult;

  await tokenManager.getAllStatus();
  const all = tokenManager.sessions
    .filter((s) => s.raw_session)
    .map((s) => s.raw_session);

  if (!all.length) {
    return Response.json({ detail: 'No sessions with raw data to export' }, { status: 404 });
  }

  return new Response(JSON.stringify(all, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': 'attachment; filename="chatgpt_sessions.json"',
    },
  });
}
