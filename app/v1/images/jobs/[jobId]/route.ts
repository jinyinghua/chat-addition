import { requireApiKey } from '@/lib/session-manager';
import { getJobById } from '@/lib/image-job-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ jobId: string }> }) {
  const authResult = requireApiKey(request);
  if (authResult) return authResult;

  const { jobId } = await context.params;
  const job = await getJobById(jobId);
  if (!job) {
    return Response.json({ detail: 'job not found' }, { status: 404 });
  }

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
