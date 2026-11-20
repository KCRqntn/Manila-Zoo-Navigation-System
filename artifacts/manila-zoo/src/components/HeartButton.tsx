import React, { useState } from "react";
import { Heart } from "lucide-react";

/** Heart toggle with a like count. Stops the click from opening the card it sits on. */
export function HeartButton({
  liked, count, onToggle, label, size = "sm",
}: { liked: boolean; count: number; onToggle: () => void; label: string; size?: "sm" | "lg" }) {
  const [pop, setPop] = useState(false);
  const big = size === "lg";

  return (
    <button
      type="button"
      aria-pressed={liked}
      aria-label={label}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setPop(true);
        onToggle();
      }}
      onAnimationEnd={() => setPop(false)}
      className={`flex items-center gap-1.5 rounded-full bg-white/90 font-semibold text-rose-500 shadow-md backdrop-blur transition-transform hover:scale-105 dark:bg-black/50 ${
        big ? "px-4 py-2 text-base" : "px-2.5 py-1 text-xs"
      }`}
    >
      <Heart className={`${big ? "h-5 w-5" : "h-4 w-4"} ${liked ? "fill-rose-500" : ""} ${pop ? "heart-pop" : ""}`} />
      <span className="tabular-nums">{count}</span>
    </button>
  );
}
