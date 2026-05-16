export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json({
    object: 'list',
    data: [
      { id: 'gpt-image-2', object: 'model', owned_by: 'chatgpt' },
      { id: 'gpt-image-1', object: 'model', owned_by: 'chatgpt' },
      { id: 'gpt-4o', object: 'model', owned_by: 'chatgpt' },
      { id: 'gpt-5.4-mini', object: 'model', owned_by: 'chatgpt' },
      { id: 'gpt-5.5', object: 'model', owned_by: 'chatgpt' },
      { id: 'auto', object: 'model', owned_by: 'chatgpt' },
    ],
  });
}
