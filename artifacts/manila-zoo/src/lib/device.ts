/**
 * Which phone and browser the visitor is using, for the few places where iPhone and Android need
 * different help: turning location or camera back on, and leaving an app's built-in browser.
 */
const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;

// iPadOS reports itself as a Mac, so a touch screen gives it away
export const isIOS = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && typeof navigator !== "undefined" && navigator.maxTouchPoints > 1);
export const isAndroid = /Android/i.test(ua);

/**
 * The app whose built-in browser this page is open in (Messenger, Facebook…), or null in a real
 * browser. Links shared in chats open there, and those browsers often block the camera and GPS,
 * especially on iPhone, so visitors are asked to open the page in Safari or Chrome instead.
 */
export const inAppBrowser: string | null = (() => {
  if (/FBAN\/Messenger|FB_IAB\/MESSENGER|MessengerForiOS|Orca-Android/i.test(ua)) return "Messenger";
  if (/FBAN|FBAV|FB_IAB|FBIOS/i.test(ua)) return "Facebook";
  if (/Instagram/i.test(ua)) return "Instagram";
  if (/musical_ly|Bytedance|TikTok/i.test(ua)) return "TikTok";
  if (/\bLine\//i.test(ua)) return "LINE";
  if (/Viber/i.test(ua)) return "Viber";
  if (/Snapchat/i.test(ua)) return "Snapchat";
  if (/Twitter/i.test(ua)) return "X";
  return null;
})();

type Lang = "en" | "fil";

/** Where to switch location back on for this site, on this phone. */
export function locationSettingsHelp(lang: Lang): string {
  const chromeOnIOS = isIOS && /CriOS/.test(ua);
  if (isIOS) {
    return lang === "fil"
      ? `Sa iPhone: Settings → Privacy & Security → Location Services → i-on, tapos ${chromeOnIOS ? "Chrome" : "Safari Websites"} → "While Using the App". Pagkatapos, i-reload ang page.`
      : `On iPhone: Settings → Privacy & Security → Location Services → turn it on, then ${chromeOnIOS ? "Chrome" : "Safari Websites"} → "While Using the App". Then reload this page.`;
  }
  if (isAndroid) {
    return lang === "fil"
      ? "Sa Android: i-on ang Location sa quick settings (hilahin pababa mula sa itaas), tapos i-tap ang icon sa kaliwa ng address bar → Permissions → Location → Allow. Pagkatapos, i-reload ang page."
      : "On Android: turn on Location in quick settings (swipe down from the top), then tap the icon left of the address bar → Permissions → Location → Allow. Then reload this page.";
  }
  return lang === "fil"
    ? "Payagan ang lokasyon sa settings ng browser para sa site na ito, tapos i-reload ang page."
    : "Allow location for this site in your browser's settings, then reload this page.";
}

/** Where to switch the camera back on for this site, on this phone. */
export function cameraSettingsHelp(lang: Lang): string {
  const chromeOnIOS = isIOS && /CriOS/.test(ua);
  if (isIOS) {
    return chromeOnIOS
      ? (lang === "fil" ? "Sa iPhone: Settings → Apps → Chrome → Camera → i-on, tapos i-reload ang page." : "On iPhone: Settings → Apps → Chrome → Camera → turn it on, then reload this page.")
      : (lang === "fil" ? 'Sa iPhone: i-tap ang "aA" sa address bar → Website Settings → Camera → Allow, tapos i-reload ang page.' : 'On iPhone: tap "aA" in the address bar → Website Settings → Camera → Allow, then reload this page.');
  }
  if (isAndroid) {
    return lang === "fil"
      ? "Sa Android: i-tap ang icon sa kaliwa ng address bar → Permissions → Camera → Allow, tapos i-reload ang page."
      : "On Android: tap the icon left of the address bar → Permissions → Camera → Allow, then reload this page.";
  }
  return lang === "fil" ? "Payagan ang camera sa settings ng browser, tapos i-reload ang page." : "Allow the camera in your browser's settings, then reload this page.";
}

/**
 * On Android, a link that opens this page in Chrome straight from an app's built-in browser
 * (Chrome must be installed; other browsers ignore it). iPhone has no such link.
 */
export function openInChromeUrl(): string | null {
  if (!isAndroid || typeof location === "undefined") return null;
  return `intent://${location.host}${location.pathname}${location.search}#Intent;scheme=https;package=com.android.chrome;end`;
}
