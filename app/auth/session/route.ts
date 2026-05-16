import { requireApiKey, tokenManager } from '@/lib/session-manager';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const authResult = requireApiKey(request);
  if (authResult) return authResult;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ detail: '无效的 JSON' }, { status: 400 });
  }

  if (!body || typeof body !== 'object') {
    return Response.json({ detail: '无效的 JSON' }, { status: 400 });
  }

  if (!('accessToken' in body) && !('sessionToken' in body)) {
    return Response.json({ detail: 'JSON 中缺少 accessToken 和 sessionToken' }, { status: 400 });
  }

  try {
    const result = tokenManager.loadSessionFromJson(body as Record<string, unknown>);
    return Response.json(result);
  } catch (error) {
    return Response.json(
      { detail: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
}
