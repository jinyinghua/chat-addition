/**
 * DELETE /v1/chat/history/:id — 删除单条历史记录
 */
import { requireApiKey, getAuthTokenFromRequest } from '@/lib/session-manager';
import { hashApiKey, getHistory, deleteHistory } from '@/lib/chat-history-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const authErr = requireApiKey(request);
  if (authErr) return authErr;

  const { id } = await context.params;
  if (!id) {
    return Response.json({ error: 'missing id' }, { status: 400 });
  }

  const token = getAuthTokenFromRequest(request);
  const keyHash = hashApiKey(token);
  const list = await deleteHistory(keyHash, id);
  return Response.json(list);
}
