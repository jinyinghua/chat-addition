import { put } from '@vercel/blob';

export async function persistImageBytes(params: {
  bytes: Uint8Array;
  mimeType: string;
  pathname: string;
}) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return null;
  }

  const blob = await put(params.pathname, Buffer.from(params.bytes), {
    access: 'public',
    contentType: params.mimeType,
    addRandomSuffix: false,
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });

  return blob.url;
}
