/** Coordinates shown on the map: "14.56481° N, 120.98780° E" (5 decimals is about 1 m). */
export function formatCoords(latIn: number | string, lngIn: number | string): string {
  const lat = Number(latIn), lng = Number(lngIn);
  return `${Math.abs(lat).toFixed(5)}° ${lat >= 0 ? "N" : "S"}, ${Math.abs(lng).toFixed(5)}° ${lng >= 0 ? "E" : "W"}`;
}

/** The plain "lat, lng" form other apps accept (Google Maps, GPS apps). */
export const plainCoords = (lat: number, lng: number) => `${lat.toFixed(6)}, ${lng.toFixed(6)}`;

export const googleMapsUrl = (lat: number, lng: number) => `https://www.google.com/maps?q=${lat.toFixed(6)},${lng.toFixed(6)}`;

/** Copies "lat, lng" to the clipboard; false if the browser doesn't allow it. */
export async function copyCoords(lat: number, lng: number): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(plainCoords(lat, lng));
    return true;
  } catch {
    return false;
  }
}
