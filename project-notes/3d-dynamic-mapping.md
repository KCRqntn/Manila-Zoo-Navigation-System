# 3D Mapping and Dynamic Map Updates

Technical notes for two panel requirements:

- **Mr. Blusan:** implement 3D mapping using Leaflet.
- **Mr. Carlos:** the map must be dynamic, so layout or location changes can be made without redeploying.

## 1. 3D mapping approach

### Leaflet's limitation

Leaflet is a 2D library. Its camera always looks straight down, and no plugin can make it tilt or rotate the view the way Google Earth or MapLibre GL can. "3D in Leaflet" therefore means **2.5D**: shapes are drawn with height on a top-down map. We describe the feature as **2.5D extruded mapping on Leaflet**.

### Options considered

| Option | How it works | Supports dynamic updates? | Decision |
|---|---|---|---|
| OSMBuildings (Leaflet build) | Plugin that extrudes GeoJSON polygons | Yes | Not used. The Leaflet build is old and unmaintained, and it predates Leaflet 1.9 |
| Pre-rendered 3D tiles (Blender → `gdal2tiles`) | A rendered image cut into map tiles | **No.** Every layout change means re-rendering | Allowed only as an optional background image (floor-plan overlay) |
| Three.js layer synced to Leaflet | Full 3D models drawn on a canvas that follows the map | Yes | Too complex for the project's timeline; listed as future work |
| CSS `perspective`/`rotateX` on the map | Tilts the whole map with CSS | — | Rejected. Leaflet's click and drag math doesn't account for the tilt, so taps land in the wrong place |
| **Custom 2.5D extrusion layer (chosen)** | Our own `L.Layer` that draws walls and roofs on a canvas, using the same technique as OSMBuildings | **Yes.** Shapes come from the database | **Used** |

### How the extrusion layer works

Source: `artifacts/manila-zoo/src/lib/extrusionLayer.ts`

1. Each enclosure or building is a GeoJSON polygon (its footprint) with a height in meters.
2. On every pan or zoom, each footprint vertex is converted from lat/lng to a screen pixel.
3. The height is converted from meters to pixels for the current zoom level:
   `metersPerPixel = 40,075,016.686 × cos(latitude) / (256 × 2^zoom)`
4. A virtual camera sits above the center of the screen at height `camZ`. Each roof point is pushed away from the screen center:
   `roof = center + (base − center) × camZ / (camZ − heightPx)`
   Buildings near the edge of the screen therefore "lean out", and panning produces parallax, which is what makes it read as 3D.
5. Drawing order: shapes farthest from the center are drawn first, so nearer ones cover them. Within one shape, walls are drawn back to front, then the roof.
6. Walls are shaded according to which way they face relative to a fixed light direction. Soft ground shadows are drawn on a scratch canvas and blended in once, so overlapping shadows don't get darker.
7. Clicks are matched against the drawn roof, floor and wall shapes, nearest first, which opens a popup for that shape.

Layer stacking: tiles → floor-plan image → walkways → **extrusions (pane z-index 450)** → markers (600) → popups (700).

## 2. Dynamic map updates

### Architecture

```
Admin: Map Management page (leaflet-draw)
  draw footprint / walkway, edit height, close a path, move a pin
        │  POST/PATCH/DELETE /api/map/*   (admin only)
        ▼
Express API ── every write calls bumpMapVersion() ──► map_layout_meta.version += 1
        │
        ▼
Visitor map: useLiveMapLayout()
  polls GET /api/map/version every 30 s (and when the tab regains focus)
  version changed? → refetch /api/map/layout, /api/map/pins, /api/map/config
```

The version check returns a single integer, so polling it is cheap. The full layout is downloaded only when something has actually changed.

### Database tables

| Table | Purpose | Key columns |
|---|---|---|
| `map_pins` (existing) | Points of interest | `lat`, `lng`, `pin_type`, `is_active` |
| `map_features` (new) | Enclosure and building footprints | `geometry` (GeoJSON Polygon, jsonb), `height_m`, `min_height_m`, `wall_color`, `roof_color`, `map_pin_id`, `is_active` |
| `map_paths` (new) | Walkways | `geometry` (GeoJSON LineString, jsonb), `is_open`, `is_accessible` |
| `map_layout_meta` (new) | Version counter (one row) | `version`, `updated_at` |
| `map_config` (extended) | Base settings plus floor-plan overlay | `map_image_url`, `sw_lat`, `sw_lng`, `ne_lat`, `ne_lng` |

GeoJSON coordinates are stored in `[lng, lat]` order, as the GeoJSON standard requires. Leaflet takes `[lat, lng]`, so the frontend converts them.

### API endpoints

| Method | Path | Auth |
|---|---|---|
| GET | `/api/map/layout` | public |
| GET | `/api/map/version` | public |
| POST | `/api/map/features` | admin |
| PATCH / DELETE | `/api/map/features/:id` | admin |
| POST | `/api/map/paths` | admin |
| PATCH / DELETE | `/api/map/paths/:id` | admin |
| PATCH | `/api/map/config` (now also sets overlay bounds) | admin |

Pin and config writes also bump the version, so moving a pin reaches visitors the same way.

### Admin workflow (Admin → Map Management)

- **Add a footprint:** use the polygon or rectangle tool, then enter the name, type, height, colors, and optionally a linked pin.
- **Change a height:** edit the number in the Footprints table. It saves when the field loses focus or you press Enter.
- **Hide a footprint temporarily** (e.g. an exhibit under renovation): turn off its Visible switch.
- **Add a walkway:** use the line tool. Close or reopen it, or mark it wheelchair accessible, with the switches in the table. Closed walkways appear red and dashed.
- **Floor-plan overlay:** paste an image URL, zoom the editor map to the area the image covers, click "Use current map view", then Save.

## 3. Files

| File | Role |
|---|---|
| `lib/db/src/schema/mapLayout.ts` | Drizzle tables: `map_features`, `map_paths`, `map_layout_meta` |
| `lib/db/src/schema/mapConfig.ts` | Overlay bounds columns |
| `lib/api-spec/openapi.yaml` | New endpoints and schemas (hooks and Zod are generated from this) |
| `artifacts/api-server/src/routes/map.ts` | Layout, version, feature and path routes; `bumpMapVersion()` |
| `artifacts/api-server/src/migrate.ts` | Creates the tables and seeds placeholder footprints and walkways |
| `artifacts/api-server/supabase-schema.sql` | Same tables with row-level security (RLS) policies, for Supabase |
| `artifacts/manila-zoo/src/lib/extrusionLayer.ts` | The 2.5D renderer |
| `artifacts/manila-zoo/src/components/map/ZooMapLayers.tsx` | `ExtrudedFeatures`, `Walkways`, `FloorPlanOverlay`, `useLiveMapLayout` |
| `artifacts/manila-zoo/src/components/admin/MapLayoutEditor.tsx` | Admin drawing and editing UI |
| `artifacts/manila-zoo/src/pages/visitor/Map.tsx` | Visitor map, with "3D Buildings" and "Walkways" toggles |

## 4. Setup

```bash
pnpm --filter @workspace/db run push            # create the new tables/columns
pnpm --filter @workspace/api-server run migrate # seeds placeholder footprints + walkways
```

The seeded footprints are rough rectangles around the seeded pins. Replace them with shapes traced from a satellite view or a drone survey.

## 5. Limitations and future work

- **No camera tilt or rotation.** This is a Leaflet limitation, and it is the reason the approach is called 2.5D.
- **No holes in footprints.** Only the outer ring of each polygon is extruded.
- **Updates can take up to 30 seconds to appear.** For instant push, add `map_layout_meta` to Supabase's `supabase_realtime` publication and subscribe to it from the visitor map, invalidating the same queries `useLiveMapLayout` does.
- **Routing:** walkway vertices can be turned into a graph, then Dijkstra's shortest-path algorithm can be run over walkways where `is_open` is true (and `is_accessible` is true for wheelchair routing). Closures would then change routes automatically.
- **Detailed 3D models** of landmark exhibits would need a Three.js layer, or a move to MapLibre GL, which supports tilt natively.
