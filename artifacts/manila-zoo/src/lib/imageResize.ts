/**
 * Shrinks a photo in the browser before upload: phone photos are often 3–8 MB, while a 1600 px
 * JPEG looks the same on screen at ~200–400 KB. Also fixes sideways photos (browsers apply the
 * camera's rotation when drawing).
 */
export async function resizeImage(file: File, maxSide = 1600, quality = 0.85): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("This browser can't open that image. Use a JPEG or PNG photo."));
      el.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(b => (b ? resolve(b) : reject(new Error("Couldn't process the photo"))), "image/jpeg", quality));
  } finally {
    URL.revokeObjectURL(url);
  }
}
