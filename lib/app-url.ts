export function getPublicBaseUrl(request?: Request) {
  if (request) {
    try {
      return new URL(request.url).origin;
    } catch {
      // ignore
    }
  }

  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, '');

  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (production) return production.startsWith('http') ? production.replace(/\/$/, '') : `https://${production}`;

  const deploy = process.env.VERCEL_URL?.trim();
  if (deploy) return deploy.startsWith('http') ? deploy.replace(/\/$/, '') : `https://${deploy}`;

  return 'http://localhost:3000';
}

export function buildImageJobFileUrl(baseUrl: string, jobId: string, index: number) {
  return `${baseUrl.replace(/\/$/, '')}/v1/images/jobs/${jobId}/files/${index}`;
}
