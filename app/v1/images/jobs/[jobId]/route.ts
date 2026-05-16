import { requireApiKey } from '@/lib/session-manager';
import { getJobById } from '@/lib/image-job-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await context.params;
  const job = await getJobById(jobId);
  if (!job) {
    return Response.json({ detail: 'job not found' }, { status: 404 });
  }

  // 对于已完成的job，允许公开访问状态
  if (job.status === 'succeeded' || job.status === 'failed') {
    return Response.json({
      id: job.id,
      status: job.status,
      created_at: job.createdAt,
      updated_at: job.updatedAt,
      error: job.error,
      has_result: !!job.result,
      asset_count: job.result?.assets?.length || 0,
    });
  }

  // 对于正在运行的job，需要身份验证
  const authResult = requireApiKey(request);
  if (authResult) return authResult;

  return Response.json({
    id: job.id,
    status: job.status,
    created_at: job.createdAt,
    updated_at: job.updatedAt,
    error: job.error,
    has_result: !!job.result,
    asset_count: job.result?.assets?.length || 0,
  });
}
