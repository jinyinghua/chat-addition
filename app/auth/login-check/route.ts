import { requireApiKey, validateLoginKey } from '@/lib/session-manager';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const authResult = requireApiKey(request);
  if (authResult) return authResult;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 });
  }

  const key = body && typeof body === 'object' && 'key' in body ? String((body as Record<string, unknown>).key || '') : '';
  if (!key) {
    return Response.json({ error: 'invalid_key' }, { status: 401 });
  }

  if (!validateLoginKey(key)) {
    return Response.json({ error: 'invalid_key' }, { status: 401 });
  }

  return Response.json({ status: 'ok' });
}
