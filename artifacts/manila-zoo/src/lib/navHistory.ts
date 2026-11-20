import { useCallback, useRef, useState } from "react";

/**
 * In-app navigation history for the Back button.
 *
 * Every history entry this site creates is numbered (history.state.__mzIdx): the first page opened in
 * the tab is 0 and each in-app navigation adds 1. The number lives in the browser's own history entry,
 * so it survives a page refresh. When it is 0 the page was opened directly (typed link, bookmark, QR
 * code, new tab), and the Back button goes to the main page instead of leaving the site.
 *
 * Pages can also keep small bits of state in the entry (search text, filters, page number) with
 * usePageState, so going back shows the same results. Scroll position is NOT restored: every page
 * opens at the top (see components/layout/ScrollToTop).
 */

const IDX = "__mzIdx";
const PAGE = "__mzPage";

type MzState = Record<string, unknown> & { [IDX]?: number; [PAGE]?: Record<string, unknown> };

const isPlainState = (s: unknown): s is MzState | null | undefined =>
  s == null || (typeof s === "object" && !Array.isArray(s));

const currentState = (): MzState => (isPlainState(history.state) && history.state ? history.state : {});
const currentIdx = () => {
  const v = currentState()[IDX];
  return typeof v === "number" ? v : 0;
};

/** True when there is an earlier page of this site in the tab's history */
export const canGoBack = () => currentIdx() > 0;

let installed = false;
/** Numbers history entries and turns off the browser's own scroll restoration. Call once, before the app renders. */
export function installNavHistory() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  // The browser must not put back an old scroll position on Back/Forward or refresh (it can land on
  // the footer while the page is still loading); ScrollToTop opens every page at the top instead
  try { history.scrollRestoration = "manual"; } catch { /* old browsers */ }

  // Number the entry the tab opened on (or keep its number after a refresh)
  if (typeof currentState()[IDX] !== "number") {
    history.replaceState({ ...currentState(), [IDX]: 0 }, "");
  }

  // wouter has already wrapped these to announce navigations; this wrapper only adds the entry number.
  // A new page gets the next number and starts with no saved page state; a replaced page keeps its number.
  const wrap = (type: "pushState" | "replaceState") => {
    const inner = history[type];
    history[type] = function (state: unknown, unused: string, url?: string | URL | null) {
      if (!isPlainState(state)) return inner.call(this, state, unused, url);
      const base = state ?? {};
      const idx = type === "pushState" ? currentIdx() + 1 : (base[IDX] ?? currentIdx());
      return inner.call(this, { ...base, [IDX]: idx }, unused, url);
    };
  };
  wrap("pushState");
  wrap("replaceState");
}

/**
 * useState that is kept in the current history entry: when the visitor leaves the page and comes back
 * with Back (or refreshes), the value is still there. Opening the page fresh starts from `initial`.
 * `key` must be unique on the page.
 */
export function usePageState<T>(key: string, initial: T | (() => T)) {
  const [value, setValue] = useState<T>(() => {
    const saved = currentState()[PAGE]?.[key];
    if (saved !== undefined) return saved as T;
    return typeof initial === "function" ? (initial as () => T)() : initial;
  });
  const latest = useRef(value);
  latest.current = value;
  const set = useCallback((next: T | ((prev: T) => T)) => {
    const v = typeof next === "function" ? (next as (p: T) => T)(latest.current) : next;
    latest.current = v;
    const s = currentState();
    try { history.replaceState({ ...s, [PAGE]: { ...(s[PAGE] ?? {}), [key]: v } }, ""); } catch { /* ignore */ }
    setValue(v);
  }, [key]);
  return [value, set] as const;
}
