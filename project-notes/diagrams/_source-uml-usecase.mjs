// Draws the two UML use case diagrams as SVG (actors, system boundary, use case ovals,
// associations, «include»/«extend», actor generalization), then renders PNGs with headless Edge.
import { writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";

const OUT = process.argv[2];
mkdirSync(OUT, { recursive: true });

// Palette taken from the architecture diagram: people orange, built-in-project green, AI blue
const C = {
  text: "#1f2b23", muted: "#5d6b61",
  personFill: "#fdebd3", personStroke: "#d9962e",
  boxFill: "#f4f8f2", boxStroke: "#4f7d5b",
  ucFill: "#ffffff", ucStroke: "#4f7d5b",
  aiFill: "#e3ecf8", aiStroke: "#5d86bd",
  line: "#3c4a40", dash: "#6b7a70", note: "#fffbe8", noteStroke: "#c9b45a",
};
const FONT = `"Inter", "Segoe UI", Arial, sans-serif`;
const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function svgDoc(w, h, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family='${FONT}'>
<defs>
  <marker id="open" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="11" markerHeight="11" orient="auto-start-reverse">
    <path d="M1 1 L11 6 L1 11" fill="none" stroke="${C.dash}" stroke-width="1.6"/></marker>
  <marker id="tri" viewBox="0 0 14 14" refX="13" refY="7" markerWidth="15" markerHeight="15" orient="auto-start-reverse">
    <path d="M1 1 L13 7 L1 13 Z" fill="#ffffff" stroke="${C.line}" stroke-width="1.5"/></marker>
</defs>
<rect width="${w}" height="${h}" fill="#ffffff"/>
${body}
</svg>`;
}

function actor(x, y, name, kind = "person") {
  const fill = kind === "system" ? C.aiFill : C.personFill, stroke = kind === "system" ? C.aiStroke : C.personStroke;
  const label = name.split("\n").map((l, i) => `<text x="${x}" y="${y + 58 + i * 18}" text-anchor="middle" font-size="15" font-weight="600" fill="${C.text}">${esc(l)}</text>`).join("");
  return `<g>
  <circle cx="${x}" cy="${y - 46}" r="13" fill="${fill}" stroke="${stroke}" stroke-width="2.2"/>
  <line x1="${x}" y1="${y - 33}" x2="${x}" y2="${y + 6}" stroke="${stroke}" stroke-width="2.4" stroke-linecap="round"/>
  <line x1="${x - 22}" y1="${y - 20}" x2="${x + 22}" y2="${y - 20}" stroke="${stroke}" stroke-width="2.4" stroke-linecap="round"/>
  <line x1="${x}" y1="${y + 6}" x2="${x - 16}" y2="${y + 34}" stroke="${stroke}" stroke-width="2.4" stroke-linecap="round"/>
  <line x1="${x}" y1="${y + 6}" x2="${x + 16}" y2="${y + 34}" stroke="${stroke}" stroke-width="2.4" stroke-linecap="round"/>
  ${kind === "system" ? `<text x="${x}" y="${y - 70}" text-anchor="middle" font-size="12" fill="${C.muted}">«system»</text>` : ""}
  ${label}</g>`;
}

function useCase(u) {
  const lines = u.label.split("\n");
  const t = lines.map((l, i) => `<text x="${u.x}" y="${u.y + 5 + (i - (lines.length - 1) / 2) * 17}" text-anchor="middle" font-size="14.5" fill="${C.text}">${esc(l)}</text>`).join("");
  return `<ellipse cx="${u.x}" cy="${u.y}" rx="${u.rx}" ry="${u.ry}" fill="${u.fill ?? C.ucFill}" stroke="${C.ucStroke}" stroke-width="1.8"/>${t}`;
}

// Point on an ellipse's edge in the direction of (px, py)
function edge(u, px, py) {
  const dx = px - u.x, dy = py - u.y;
  const k = 1 / Math.sqrt((dx * dx) / (u.rx * u.rx) + (dy * dy) / (u.ry * u.ry));
  return [u.x + dx * k, u.y + dy * k];
}

// Associations end at the oval's leftmost point: every oval in a column shares that x, so no line crosses another oval
const assoc = (ax, ay, u, side = "left") => {
  const ex = side === "left" ? u.x - u.rx : u.x + u.rx;
  return `<line x1="${ax}" y1="${ay}" x2="${ex}" y2="${u.y}" stroke="${C.line}" stroke-width="1.5"/>`;
};

// A dashed «include»/«extend» arrow from use case a to use case b (optionally routed through points)
function rel(a, b, kind, via = null, labelAt = null) {
  const pts = via ? [edge(a, via[0][0], via[0][1]), ...via, edge(b, via[via.length - 1][0], via[via.length - 1][1])] : [edge(a, b.x, b.y), edge(b, a.x, a.y)];
  const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const mid = labelAt ?? (via ? via[Math.floor((via.length - 1) / 2)] : [(pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2]);
  const txt = `«${kind}»`;
  return `<path d="${d}" fill="none" stroke="${C.dash}" stroke-width="1.5" stroke-dasharray="7 5" marker-end="url(#open)"/>
  <rect x="${mid[0] - 34}" y="${mid[1] - 11}" width="68" height="20" rx="3" fill="#ffffff"/>
  <text x="${mid[0]}" y="${mid[1] + 4}" text-anchor="middle" font-size="12.5" font-style="italic" fill="${C.muted}">${txt}</text>`;
}

const generalize = (x1, y1, x2, y2) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${C.line}" stroke-width="1.6" marker-end="url(#tri)"/>`;

function boundary(x, y, w, h, title) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="${C.boxFill}" stroke="${C.boxStroke}" stroke-width="2"/>
  <text x="${x + w / 2}" y="${y + 30}" text-anchor="middle" font-size="16" font-weight="700" fill="${C.boxStroke}">${esc(title)}</text>`;
}

const header = (w, title, sub) => `<text x="40" y="44" font-size="24" font-weight="700" fill="#2c5a3a">${esc(title)}</text>
<text x="40" y="70" font-size="14" fill="${C.muted}">${esc(sub)}</text>`;

function legend(x, y) {
  return `<g font-size="13" fill="${C.muted}">
  <line x1="${x}" y1="${y}" x2="${x + 34}" y2="${y}" stroke="${C.line}" stroke-width="1.5"/><text x="${x + 42}" y="${y + 4}">association (actor uses the use case)</text>
  <line x1="${x + 300}" y1="${y}" x2="${x + 334}" y2="${y}" stroke="${C.dash}" stroke-width="1.5" stroke-dasharray="7 5" marker-end="url(#open)"/><text x="${x + 344}" y="${y + 4}">«include» always part of it · «extend» optional addition</text>
  <line x1="${x + 720}" y1="${y}" x2="${x + 754}" y2="${y}" stroke="${C.line}" stroke-width="1.6" marker-end="url(#tri)"/><text x="${x + 764}" y="${y + 4}">generalization (inherits everything above)</text>
  </g>`;
}

// ─────────────── Visitor diagram ───────────────
function visitorDiagram() {
  const W = 1520, top = 190, step = 80;
  const L = (i, label) => ({ x: 610, y: top + i * step, rx: 180, ry: 27, label });
  const left = [
    L(0, "View the zoo map (2D / 3D)"),
    L(1, "Search places and animals"),
    L(2, "Get walking directions"),
    L(3, "Find the nearest restroom,\nfood, first aid or exit"),
    L(4, "Scan a QR code"),
    L(5, "View an animal's profile"),
    L(6, "Ask the AI Guide\n(English / Filipino)"),
    L(7, "Save the zoo for offline use"),
    L(8, "View events, announcements,\nhours and ticket prices"),
    L(9, "Rate an animal or a\nchatbot answer"),
    L(10, "Create an account and\nregister a visit"),
    L(11.6, "Play a scavenger hunt\nand earn points"),
    L(12.6, "Redeem points for rewards"),
    L(13.6, "Save favourite animals"),
  ];
  const R = (y, label) => ({ x: 1050, y, rx: 150, ry: 27, label });
  const setLoc = R(top + 3.5 * step, "Set my location\n(GPS or tap the map)");
  const offline = R(top + 6.9 * step, "Answer offline\n(no signal)");
  const signIn = R(top + 12.6 * step, "Sign in");
  const [map, search, dirs, nearest, scan, profile, ask, saveOff, info, rate, account, hunt, redeem, fav] = left;

  const H = Math.round(top + 13.6 * step + 130);
  const vis = { x: 150, y: top + 5 * step + 10 }, reg = { x: 150, y: top + 12.6 * step - 10 }, ai = { x: 1400, y: offline.y - 10 };
  let b = header(W, "Use case diagram: Visitor", "Manila Zoo Navigation and Information System · visitors use it without signing in; an account adds points, rewards and favourites");
  b += boundary(380, 100, 900, H - 160, "Manila Zoo Navigation and Information System");
  // associations
  for (const u of [map, search, dirs, nearest, scan, profile, ask, saveOff, info, rate, account]) b += assoc(vis.x + 26, vis.y - 18, u);
  for (const u of [hunt, redeem, fav]) b += assoc(reg.x + 26, reg.y - 18, u);
  b += assoc(ai.x - 26, ai.y - 18, ask, "right");
  // relationships
  b += rel(nearest, setLoc, "include");
  b += rel(scan, setLoc, "extend");
  b += rel(offline, ask, "extend");
  b += rel(hunt, scan, "include", [[850, hunt.y], [850, scan.y]], [850, (hunt.y + scan.y) / 2]);
  b += rel(hunt, signIn, "include");
  b += rel(redeem, signIn, "include");
  b += rel(fav, signIn, "include");
  for (const u of [...left, setLoc, offline, signIn]) b += useCase(u);
  // actors and generalization
  b += generalize(reg.x, reg.y - 64, vis.x, vis.y + 82);
  b += actor(vis.x, vis.y, "Visitor");
  b += actor(reg.x, reg.y, "Registered\nvisitor");
  b += actor(ai.x, ai.y, "AI intent\nservice", "system");
  b += legend(40, H - 30);
  return svgDoc(W, H, b);
}

// ─────────────── Staff diagram ───────────────
function staffDiagram() {
  const W = 1520, top = 190, step = 72;
  const U = (i, label) => ({ x: 660, y: top + i * step, rx: 220, ry: 27, label });
  const groups = {
    director: [U(0, "Manage administrator accounts")],
    admin: [U(1.4, "Manage user roles"), U(2.4, "View and export audit logs"), U(3.4, "Back up and restore data"), U(4.4, "Change system settings")],
    editor: [
      U(5.8, "Manage the map: places, outlines,\nwalkways, bridges, facilities"),
      U(6.8, "Manage animals and photo galleries"), U(7.8, "Manage QR codes and their points"),
      U(8.8, "Manage events, announcements, FAQs"), U(9.8, "Manage games and rewards"),
      U(10.8, "Manage park areas and trees"), U(11.8, "Manage chatbot training data"),
      U(12.8, "Update visitor submissions"),
    ],
    viewer: [U(14.2, "Sign in (role-based access)"), U(15.2, "View the dashboard and analytics"), U(16.2, "View submissions and registrations")],
  };
  const publish = { x: 1150, y: groups.editor[0].y, rx: 150, ry: 27, label: "Publish or unpublish\na map element" };
  const signIn = groups.viewer[0];
  const H = Math.round(top + 16.2 * step + 130);
  const ax = 150;
  const mid = arr => (arr[0].y + arr[arr.length - 1].y) / 2;
  const act = { director: { y: groups.director[0].y + 10 }, admin: { y: mid(groups.admin) + 10 }, editor: { y: mid(groups.editor) + 10 }, viewer: { y: mid(groups.viewer) + 10 } };
  let b = header(W, "Use case diagram: Zoo staff (admin dashboard)", "Each role inherits everything the role below it can do: Director → Admin → Editor → Viewer");
  b += boundary(400, 100, 940, H - 160, "Admin dashboard · Manila Zoo Navigation and Information System");
  for (const [role, list] of Object.entries(groups)) for (const u of list) b += assoc(ax + 26, act[role].y - 18, u);
  b += rel(publish, groups.editor[0], "extend");
  // UML note attached (dashed line) to Sign in: every role inherits it from Viewer
  const nx = 990, ny = signIn.y - 34;
  b += `<line x1="${signIn.x + signIn.rx}" y1="${signIn.y}" x2="${nx}" y2="${signIn.y}" stroke="${C.noteStroke}" stroke-width="1.3" stroke-dasharray="4 4"/>
  <g><path d="M${nx} ${ny} h270 v68 h-270 z" fill="${C.note}" stroke="${C.noteStroke}"/><path d="M${nx + 256} ${ny} v14 h14" fill="none" stroke="${C.noteStroke}"/>
    <text x="${nx + 14}" y="${ny + 24}" font-size="13" fill="${C.text}">Every role signs in first; the role</text>
    <text x="${nx + 14}" y="${ny + 42}" font-size="13" fill="${C.text}">decides which use cases it can do.</text>
    <text x="${nx + 14}" y="${ny + 60}" font-size="13" fill="${C.text}">Every change goes to the audit log.</text></g>`;
  for (const u of [...Object.values(groups).flat(), publish]) b += useCase(u);
  // generalization chain: Director → Admin → Editor → Viewer
  b += generalize(ax, act.director.y + 78, ax, act.admin.y - 66);
  b += generalize(ax, act.admin.y + 78, ax, act.editor.y - 66);
  b += generalize(ax, act.editor.y + 78, ax, act.viewer.y - 66);
  b += actor(ax, act.director.y, "Director");
  b += actor(ax, act.admin.y, "Admin");
  b += actor(ax, act.editor.y, "Editor");
  b += actor(ax, act.viewer.y, "Viewer");
  b += legend(40, H - 30);
  return svgDoc(W, H, b);
}

const files = { "3-use-case-visitor": visitorDiagram(), "4-use-case-staff": staffDiagram() };
for (const [name, svg] of Object.entries(files)) {
  writeFileSync(`${OUT}/${name}.svg`, svg);
  const w = Number(svg.match(/width="(\d+)"/)[1]), h = Number(svg.match(/height="(\d+)"/)[1]);
  const htmlPath = `${OUT}/_${name}.html`;
  writeFileSync(htmlPath, `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#fff}</style>${svg}`);
  execFileSync("C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", ["--headless=new", "--disable-gpu", "--hide-scrollbars",
    `--screenshot=${OUT}\\${name}.png`, `--window-size=${w},${h}`, "--force-device-scale-factor=2", `file:///${htmlPath.replace(/\\/g, "/")}`], { stdio: "ignore" });
  console.log(`${name}: ${w}×${h}`);
}
