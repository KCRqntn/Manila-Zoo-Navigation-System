import React from "react";

/** The AI Guide's mascot: a little zookeeper in a safari hat. Decorative unless given a title. */
export function Zookeeper({ className = "w-10 h-10", title }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} role={title ? "img" : undefined} aria-hidden={title ? undefined : true}>
      {title && <title>{title}</title>}
      {/* Shirt */}
      <path d="M14 64c0-11 8-17 18-17s18 6 18 17z" fill="#c8a96a" />
      <path d="M26 48l6 7 6-7" fill="none" stroke="#a88a4e" strokeWidth="2" strokeLinejoin="round" />
      <circle cx="32" cy="58" r="1.6" fill="#7a6232" />
      {/* Face */}
      <circle cx="32" cy="32" r="16" fill="#f6d2b0" />
      <ellipse cx="16.5" cy="33" rx="3" ry="4" fill="#f0c19c" />
      <ellipse cx="47.5" cy="33" rx="3" ry="4" fill="#f0c19c" />
      {/* Hair peeking out */}
      <path d="M19 24c3 3 7 4 11 3-3 2-7 2-11 0z" fill="#5b3a26" />
      {/* Safari hat */}
      <ellipse cx="32" cy="21" rx="22" ry="5.5" fill="#d9bd7f" />
      <path d="M18 21c0-9 6-14 14-14s14 5 14 14z" fill="#e8cf94" />
      <path d="M18.4 18.5h27.2v3.4H18.4z" fill="#5f9e6e" />
      <circle cx="40" cy="20.2" r="2.2" fill="#f4a261" />
      {/* Eyes, blush, smile */}
      <ellipse cx="26" cy="32" rx="2.3" ry="2.8" fill="#2f2a25" />
      <ellipse cx="38" cy="32" rx="2.3" ry="2.8" fill="#2f2a25" />
      <circle cx="26.8" cy="31" r="0.8" fill="#fff" />
      <circle cx="38.8" cy="31" r="0.8" fill="#fff" />
      <ellipse cx="22.5" cy="37.5" rx="3" ry="1.8" fill="#f4a3a3" opacity="0.8" />
      <ellipse cx="41.5" cy="37.5" rx="3" ry="1.8" fill="#f4a3a3" opacity="0.8" />
      <path d="M28 38.5q4 3.5 8 0" fill="none" stroke="#7a4a3a" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
