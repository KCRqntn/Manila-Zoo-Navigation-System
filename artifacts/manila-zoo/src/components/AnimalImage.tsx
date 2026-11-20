import { useCallback, useEffect, useRef, useState } from "react";
import { Leaf } from "lucide-react";
import { cn } from "@/lib/utils";
import { canResize, photoSrcSet, photoUrl } from "@/lib/photoUrl";

/**
 * Photo with a placeholder when the image can't load (deleted link, offline and not saved),
 * so visitors never see a broken-image icon.
 *
 * fit="whole": a photo taller than its frame (a standing bird, a portrait shot) would lose its
 * head or feet to cropping, so it's shown whole over a blurred copy of itself. Photos as wide as
 * the frame, or wider, still fill it. zoom > 1 enlarges the whole photo a little (never past filling
 * the frame), trimming some of its top and bottom.
 */

// These animals' photos lose too much when zoomed, so they're always shown whole
const SHOW_WHOLE = ["japanese macaque", "ostrich", "philippine eagle", "tarictic hornbill", "samar cobra", "green imperial pigeon"];
/** How far to zoom an animal's tall photo: 1 = whole animal, more = closer */
export const photoZoom = (animalName: string) => (SHOW_WHOLE.includes(animalName.trim().toLowerCase()) ? 1 : 1.35);

export function AnimalImage({
  src,
  alt,
  className,
  iconClassName = "w-12 h-12",
  fit = "cover",
  zoom = 1,
  sizes = "(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw",
  maxWidth = 960,
}: {
  src: string;
  alt: string;
  className?: string;
  iconClassName?: string;
  fit?: "cover" | "whole";
  zoom?: number;
  /** How wide the photo is shown, so the browser downloads a small enough copy (see lib/photoUrl) */
  sizes?: string;
  /** Largest copy offered: 960 px suits cards; a full-width photo can ask for 1600 */
  maxWidth?: number;
}) {
  const [failed, setFailed] = useState(false);
  // The small copy couldn't load (API down, offline with only the original saved): use the original
  const [original, setOriginal] = useState(false);
  const [showWhole, setShowWhole] = useState(false);
  const [coverScale, setCoverScale] = useState(1);
  const imgRef = useRef<HTMLImageElement>(null);
  useEffect(() => { setFailed(false); setOriginal(false); setShowWhole(false); }, [src]);
  const resized = canResize(src) && !original;
  const onError = () => (resized ? setOriginal(true) : setFailed(true));

  // Compare the photo's shape with its frame; the frame changes with the screen size
  const measure = useCallback(() => {
    const img = imgRef.current;
    if (fit !== "whole" || !img || !img.naturalWidth || !img.clientHeight) return;
    const photo = img.naturalWidth / img.naturalHeight, frame = img.clientWidth / img.clientHeight;
    setShowWhole(photo < frame * 0.95);
    setCoverScale(frame / photo);
  }, [fit]);
  useEffect(() => {
    if (fit !== "whole") return;
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [fit, measure]);

  if (failed) {
    return (
      <div role="img" aria-label={alt} className="w-full h-full flex items-center justify-center bg-primary/10">
        <Leaf className={cn(iconClassName, "text-primary/30")} />
      </div>
    );
  }
  const img = (
    <img ref={imgRef} src={resized ? photoUrl(src, 640) : src} srcSet={resized ? photoSrcSet(src, maxWidth) : undefined} sizes={resized ? sizes : undefined}
      alt={alt} loading="lazy" decoding="async" onError={onError} onLoad={measure}
      className={cn(className, showWhole && "relative !object-contain")} />
  );
  if (fit !== "whole") return img;
  return (
    <div className="relative h-full w-full overflow-hidden">
      {showWhole && (
        <img src={resized ? photoUrl(src, 320) : src} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full scale-110 object-cover blur-xl brightness-75" />
      )}
      <div className="relative h-full w-full" style={showWhole && zoom > 1 ? { transform: `scale(${Math.min(zoom, coverScale)})` } : undefined}>
        {img}
      </div>
    </div>
  );
}
