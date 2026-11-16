"use client";

/**
 * Client-side image compression before upload (NFR: performance on slow
 * mobile data). Resizes to at most 1600 px and re-encodes as JPEG ~0.8.
 */
export async function compressImage(file: File, maxDim = 1600, quality = 0.8): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", quality));
  return blob && blob.size < file.size ? blob : file;
}

export interface PhotoMeta {
  lat: number | null;
  lng: number | null;
  takenAt: string | null;
}

/** Read GPS and capture time from the original photo's EXIF, if present. */
export async function readExif(file: File): Promise<PhotoMeta> {
  try {
    const exifr = (await import("exifr")).default;
    const [gps, tags] = await Promise.all([
      exifr.gps(file).catch(() => null),
      exifr.parse(file, ["DateTimeOriginal", "CreateDate"]).catch(() => null),
    ]);
    const taken = (tags?.DateTimeOriginal ?? tags?.CreateDate) as Date | undefined;
    return {
      lat: gps && Number.isFinite(gps.latitude) ? gps.latitude : null,
      lng: gps && Number.isFinite(gps.longitude) ? gps.longitude : null,
      takenAt: taken instanceof Date && !Number.isNaN(taken.getTime()) ? taken.toISOString() : null,
    };
  } catch {
    return { lat: null, lng: null, takenAt: null };
  }
}
