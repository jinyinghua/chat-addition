/**
 * GET  /v1/chat/history  — 获取当前用户的聊天历史列表
 * POST /v1/chat/history  — 创建/更新一条历史记录
 *       body: { id, title, time }
 * DELETE /v1/chat/history — 清空所有历史
 */
import { requireApiKey, getAuthTokenFromRequest } from '@/lib/session-manager';
import { hashApiKey, getHistory, upsertHistory, clearHistory, type ChatHistoryItem } from '@/lib/chat-history-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 获取历史列表 */
export async function GET(request: Request) {
  const authErr = requireApiKey(request);
  if (authErr) return authErr;

  const token = getAuthTokenFromRequest(request);
  const keyHash = hashApiKey(token);
  const list = await getHistory(keyHash);
  return Response.json(list);
}

/** 新增/更新一条历史 */
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

/** 清空历史 */
export async function DELETE(request: Request) {
  const authErr = requireApiKey(request);
  if (authErr) return authErr;

  const token = getAuthTokenFromRequest(request);
  const keyHash = hashApiKey(token);
  await clearHistory(keyHash);
  return Response.json([]);
}
