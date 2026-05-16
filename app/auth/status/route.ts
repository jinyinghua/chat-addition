import { requireApiKey, tokenManager } from '@/lib/session-manager';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const authResult = requireApiKey(request);
  if (authResult) return authResult;

  const sessions = await tokenManager.getAllStatus();
  const healthy = sessions.filter((s) => s.is_healthy).length;

  return Response.json({
    status: sessions.length ? 'ok' : 'no_session',
    device_id: tokenManager.deviceId,
    total: sessions.length,
    healthy,
    sessions,
  });
}
