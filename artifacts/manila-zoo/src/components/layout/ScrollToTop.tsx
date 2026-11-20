import { useLayoutEffect } from "react";
import { useLocation } from "wouter";

/** Puts the window and the admin pages' own scroll panel (data-scroll-root) back at the top */
export function scrollToTop() {
  window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  document.querySelectorAll<HTMLElement>("[data-scroll-root]").forEach(el => { el.scrollTop = 0; el.scrollLeft = 0; });
}

/**
 * Every page opens at the top: on links, the Back button, the browser's Back/Forward and a refresh.
 * Runs before the new page is painted, so it never shows the old position (or the footer) first.
 * Only a change of page counts; a change of only the query (a tab like ?tab=news) keeps the position.
 */
export function ScrollToTop() {
  const [path] = useLocation();
  useLayoutEffect(() => { scrollToTop(); }, [path]);
  return null;
}
