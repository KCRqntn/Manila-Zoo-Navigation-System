/**
 * Aerial photos (Esri World Imagery) for the 3D map's realistic look. Free to use with the
 * attribution below; sharp up to zoom 19 over the zoo (zoom 20 returns "no data" tiles).
 * Offline saving fetches the same URLs so the service worker can keep them.
 */
export const SATELLITE_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
export const SATELLITE_MAX_ZOOM = 19;
export const SATELLITE_ATTRIBUTION = "Imagery &copy; Esri, Maxar, Earthstar Geographics";
