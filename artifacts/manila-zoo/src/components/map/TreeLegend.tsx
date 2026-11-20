import { TreePine, X } from "lucide-react";
import { TREE_ZONES, shapePath, type TreeShape } from "@/lib/treeSurvey";

/** A legend shape (24×24 path) in a colour; outline-only for the legend's hollow entries */
export function ShapeIcon({ shape, color, size = 14, outline = false }: { shape: TreeShape; color: string; size?: number; outline?: boolean }) {
  const { d, stroke } = shapePath(shape);
  const lines = stroke || outline;
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" className="shrink-0">
      <path d={d} fill={lines ? "none" : color} fillRule="evenodd" stroke={color} strokeWidth={lines ? 2.6 : 0.8} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** A zone as the legend shows it: its marker (shape, and colour when the zone has one) and species */
export type LegendZone = { name: string; shape: TreeShape; color?: string; species: { name: string; color: string; outline?: boolean }[] };

/** The built-in legend (from the site plan), used when the park areas can't be loaded */
export const STATIC_LEGEND: LegendZone[] = TREE_ZONES;

/**
 * The tree legend: the planting zones and their species, as managed in Park Areas (or the site
 * plan's legend when offline), with the marker each zone's trees use on the map. A side panel on
 * wide screens, a bottom sheet on phones.
 */
export function TreeLegend({ open, onOpen, onClose, showMarkers, onShowMarkers, counts, zones = STATIC_LEGEND }: {
  open: boolean; onOpen: () => void; onClose: () => void;
  showMarkers: boolean; onShowMarkers: (on: boolean) => void;
  /** Trees on the map per zone name */
  counts: Record<string, number>;
  zones?: LegendZone[];
}) {
  const total = Object.values(counts).reduce((a, b) => a + (b ?? 0), 0);
  if (!open) {
    return (
      <button type="button" onClick={onOpen} aria-expanded={false}
        className="absolute bottom-[10.75rem] right-3 z-10 flex items-center gap-1.5 rounded-full border bg-card/95 px-3 py-1.5 text-xs font-semibold shadow-lg backdrop-blur hover:bg-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
        <TreePine className="h-4 w-4 text-primary" /> Tree legend
      </button>
    );
  }
  return (
    <section aria-label="Tree legend"
      className="absolute inset-x-2 bottom-2 z-[1001] flex max-h-[70%] flex-col rounded-2xl border bg-card/95 text-card-foreground shadow-2xl backdrop-blur md:inset-x-auto md:bottom-3 md:right-3 md:top-28 md:max-h-none md:w-80">
      <header className="flex items-start justify-between gap-2 border-b px-4 pb-2 pt-3">
        <div>
          <h2 className="flex items-center gap-1.5 text-sm font-bold"><TreePine className="h-4 w-4 text-primary" /> Tree legend</h2>
          <p className="text-[11px] text-muted-foreground">{total} trees from the site plan · grouped by zone</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close tree legend" className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </header>

      <label className="flex cursor-pointer items-center justify-between gap-3 border-b px-4 py-2 text-xs font-medium">
        Show tree markers on the map
        <input type="checkbox" checked={showMarkers} onChange={e => onShowMarkers(e.target.checked)} className="h-4 w-4 accent-primary" />
      </label>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {zones.map(zone => (
          <div key={zone.name}>
            <h3 className="mb-1 flex items-center gap-1.5 rounded-md bg-muted/70 px-2 py-1 text-[11px] font-bold uppercase tracking-wide">
              <ShapeIcon shape={zone.shape} color={zone.color ?? "currentColor"} size={13} />
              <span className="flex-1">{zone.name}</span>
              <span className="font-mono font-normal normal-case text-muted-foreground">{counts[zone.name] ? `${counts[zone.name]} on map` : "none on map"}</span>
            </h3>
            {zone.species.length === 0 && <p className="px-1 text-xs text-muted-foreground">No species listed.</p>}
            <ul className="grid grid-cols-1 gap-x-3 gap-y-0.5 px-1 text-xs sm:grid-cols-2 md:grid-cols-1">
              {zone.species.map(s => (
                <li key={s.name} className="flex items-center gap-2">
                  <ShapeIcon shape={zone.shape} color={s.color} outline={s.outline} />
                  {s.name}
                </li>
              ))}
            </ul>
          </div>
        ))}
        <ul className="space-y-0.5 border-t pt-2 text-xs">
          <li className="flex items-center gap-2"><span aria-hidden="true" className="w-3.5 text-center">⊘</span> Cannot be identified</li>
          <li className="flex items-center gap-2"><span aria-hidden="true" className="w-3.5 text-center">✕</span> Dead</li>
        </ul>
        <p className="rounded-md bg-muted/60 px-2 py-1.5 text-[11px] leading-relaxed text-muted-foreground">
          Each zone's trees use its marker shape and colour; ✕ marks a dead tree. Trees from the 2D site plan were
          copied onto this map's walkways and areas, so their positions are approximate (a few metres).
        </p>
      </div>
    </section>
  );
}
