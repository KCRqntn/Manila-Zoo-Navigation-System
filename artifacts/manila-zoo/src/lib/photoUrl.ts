/**
 * Small copies of uploaded photos. Photos in Supabase Storage are kept at full size (400–650 KB),
 * so cards and lists ask the API for a copy just wide enough (GET /api/img, WebP, cached for a
 * year): about a tenth of the download. Bundled photos (/animals/…) and other links are used as is.
 */
const STORAGE_PREFIX = `${(import.meta.env.VITE_SUPABASE_URL || "").replace(/\/+$/, "")}/storage/v1/object/public/`;
const API = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/img`;

/** Widths the API makes (keep in step with THUMB_WIDTHS in api-server/src/routes/images.ts) */
const WIDTHS = [320, 640, 960, 1600];

export const canResize = (src: string | null | undefined): src is string =>
  !!src && STORAGE_PREFIX.length > 30 && src.startsWith(STORAGE_PREFIX);

/** A copy of the photo about `width` pixels wide, or the photo itself when it can't be resized */
export function photoUrl(src: string, width = 640): string {
  return canResize(src) ? `${API}?src=${encodeURIComponent(src)}&w=${width}` : src;
}

/** srcset for a resizable photo, so the browser picks the size the screen needs; undefined otherwise */
// maxWidth: cards stop at 960 px, which is sharp on a phone's 3x screen; only big photos offer 1600
export function photoSrcSet(src: string, maxWidth = 960): string | undefined {
  return canResize(src) ? WIDTHS.filter(w => w <= maxWidth).map(w => `${photoUrl(src, w)} ${w}w`).join(", ") : undefined;
}
