// Client image pipeline (addendum section 9): downscale to ~1024 px on the long side and
// re-encode as JPEG 0.8 through a canvas. Re-encoding drops all EXIF, including location.

export const MAX_EDGE = 1024;
export const JPEG_QUALITY = 0.8;

export function fitSize(w: number, h: number, max = MAX_EDGE): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(w, h));
  return { width: Math.round(w * scale), height: Math.round(h * scale) };
}

function encode(source: CanvasImageSource, w: number, h: number): Promise<Blob> {
  const { width, height } = fitSize(w, h);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d');
  if (!g) return Promise.reject(new Error('canvas unavailable'));
  g.drawImage(source, 0, 0, width, height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/jpeg', JPEG_QUALITY),
  );
}

export function frameToJpeg(video: HTMLVideoElement): Promise<Blob> {
  return encode(video, video.videoWidth, video.videoHeight);
}

/** A picked file: orientation applied from EXIF, then EXIF dropped by the re-encode. */
export async function fileToJpeg(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    return await encode(bmp, bmp.width, bmp.height);
  } finally {
    bmp.close();
  }
}
