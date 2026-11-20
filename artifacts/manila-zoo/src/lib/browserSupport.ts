/**
 * Whether this browser can run the 3D map. MapLibre (the 3D map library) uses Array.prototype.at and
 * Object.hasOwn, including in its background worker where they can't be added from outside; iPhones
 * on iOS 15.3 or older (and similarly old Android browsers) don't have them. Those phones get the 2D
 * map, which works everywhere. WebGL 2 is checked when the 3D map starts.
 */
export const can3D: boolean = (() => {
  try {
    return typeof Object.hasOwn === "function" && typeof Array.prototype.at === "function";
  } catch {
    return false;
  }
})();
