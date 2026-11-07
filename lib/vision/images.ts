import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import type { VisionImage } from './client';

const MAX_BYTES = 5 * 1024 * 1024;
export const MAX_REFERENCES = 4;

function isImage(b: Buffer): string | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  return null;
}

/** A stored photo as model input. Only real JPEG/PNG bytes under 5 MB are sent. */
export async function downloadImage(path: string): Promise<VisionImage | null> {
  const { data } = await createAdminClient().storage.from('photos').download(path);
  if (!data) return null;
  const buf = Buffer.from(await data.arrayBuffer());
  const mimeType = isImage(buf);
  return mimeType && buf.length <= MAX_BYTES ? { data: buf, mimeType } : null;
}

/** Up to 4 reference photos, one per SKU, in the given order (closed set, addendum section 9). */
export async function referenceImages(products: { sku: string; referencePhotoPaths: string[] }[]): Promise<{ sku: string; image: VisionImage }[]> {
  const refPaths = products.flatMap((p) => p.referencePhotoPaths.slice(0, 1).map((path) => ({ sku: p.sku, path }))).slice(0, MAX_REFERENCES);
  return (await Promise.all(refPaths.map(async (r) => ({ sku: r.sku, image: await downloadImage(r.path) })))).filter(
    (r): r is { sku: string; image: VisionImage } => !!r.image,
  );
}
