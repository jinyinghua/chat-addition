/**
 * GET  /v1/chat/history       — 获取聊天历史列表
 * POST /v1/chat/history       — 创建/更新一条历史（含 messages）
 * DELETE /v1/chat/history     — 清空所有历史
 */
import { requireApiKey, getAuthTokenFromRequest } from '@/lib/session-manager';
import { hashApiKey, getHistory, getHistoryById, upsertHistory, clearHistory, type ChatHistoryItem } from '@/lib/chat-history-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const authErr = requireApiKey(request);
  if (authErr) return authErr;

  const token = getAuthTokenFromRequest(request);
  const keyHash = hashApiKey(token);

  // 支持 ?id=xxx 查询单条历史（含 messages）
  const url = new URL(request.url);
  const singleId = url.searchParams.get('id');
  if (singleId) {
    const item = await getHistoryById(keyHash, singleId);
    if (!item) {
      return Response.json({ error: 'not found' }, { status: 404 });
    }
    return Response.json(item);
  }

  const list = await getHistory(keyHash);
  return Response.json(list);
}

export async function POST(request: Request) {
  const authErr = requireApiKey(request);
  if (authErr) return authErr;

  const token = getAuthTokenFromRequest(request);
  const keyHash = hashApiKey(token);

  let body: ChatHistoryItem;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON' }, { status: 400 });
  }

  if (!body.id || !body.title || typeof body.time !== 'number') {
    return Response.json({ error: 'missing required fields: id, title, time' }, { status: 400 });
  }

  const list = await upsertHistory(keyHash, body);
  return Response.json(list);
}

export async function DELETE(request: Request) {
  const authErr = requireApiKey(request);
  if (authErr) return authErr;

  const token = getAuthTokenFromRequest(request);
  const keyHash = hashApiKey(token);
  await clearHistory(keyHash);
  return Response.json([]);
}
