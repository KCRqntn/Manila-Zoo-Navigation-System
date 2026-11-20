// The QR code drawer is loaded the first time a code is drawn, not with every page
const loadQRCode = () => import("qrcode").then(m => m.default);

/**
 * Exhibit and location QR codes hold a full web link (…/q/MNL-ZOO-…), so any phone's own
 * camera app (iPhone, Android) opens the website straight away; the in-app scanner reads the same
 * link. The link is built from the public address set in Admin → QR Code Access, so codes follow
 * it when it changes (printed signs must then be reprinted).
 */
const LOCAL_HOST = /^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;

/** The address phones should open: the saved public address, else this page's address when it's public */
export function publicSiteBase(savedUrl: string | null | undefined): string {
  const saved = (savedUrl ?? "").trim().replace(/\/+$/, "");
  if (saved) return saved;
  const here = window.location;
  return here.protocol === "https:" && !LOCAL_HOST.test(here.hostname) ? here.origin : "";
}

export const scanLink = (base: string, code: string) => `${base}/q/${encodeURIComponent(code)}`;

/** Where the website QR code leads: the visitor registration form (visitors are counted when it's saved) */
export const REGISTRATION_PATH = "/visitor-registration";
/** The short address the website QR code holds (it opens REGISTRATION_PATH): fewer characters, bigger squares */
export const SHORT_REGISTRATION_PATH = "/r";
export const registrationLink = (base: string) => `${base.replace(/\/+$/, "")}${SHORT_REGISTRATION_PATH}`;

/**
 * One style for every QR code, chosen for phone cameras (iPhone Camera, Google Lens, Android camera
 * apps): pure black on white, the 4-square white border the QR standard asks for (cameras find the
 * code by it), and "M" error correction: it survives about 15% damage while keeping the squares
 * large enough to read from a distance (higher levels make a denser, harder-to-read code).
 */
export const QR_STYLE = { errorCorrectionLevel: "M" as const, margin: 4, color: { dark: "#000000", light: "#ffffff" } };

export const qrDataUrl = async (text: string, width = 512) => (await loadQRCode()).toDataURL(text, { ...QR_STYLE, width });

/**
 * The website QR code is shown on a clean screen or a fresh poster, so it uses "L" error correction:
 * with the short link that gives a 33×33 grid instead of 41×41, so each square is about 25% bigger and
 * phone cameras (iPhone Camera, Google Lens, Samsung/Android camera) lock on faster and from further away.
 * Exhibit signs keep "M", since they stay outdoors.
 */
export const registrationQrDataUrl = async (text: string, width = 600) => (await loadQRCode()).toDataURL(text, { ...QR_STYLE, errorCorrectionLevel: "L", width });

/** A print-ready PNG: the QR code with the animal or place name and the code written under it */
export async function labelledQrPng(link: string, title: string, code: string): Promise<string> {
  const size = 1024, pad = 48, textArea = 190;
  const qr = new Image();
  qr.src = await qrDataUrl(link, size - pad * 2);
  await qr.decode();
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size + textArea;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(qr, pad, pad, size - pad * 2, size - pad * 2);
  ctx.fillStyle = "#1b4332";
  ctx.textAlign = "center";
  ctx.font = "bold 64px Arial, sans-serif";
  ctx.fillText(title, size / 2, size + 40, size - pad * 2);
  ctx.font = "40px Arial, sans-serif";
  ctx.fillStyle = "#444444";
  ctx.fillText(code, size / 2, size + 110, size - pad * 2);
  return canvas.toDataURL("image/png");
}
