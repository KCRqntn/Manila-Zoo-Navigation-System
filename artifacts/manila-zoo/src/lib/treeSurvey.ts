/**
 * Tree survey markers for the 3D map, copied from the 2D site plan with coloured tree markers and
 * its legend (planting zones and species).
 *
 * How the positions were made: every coloured marker was read off the plan (position, shape, colour),
 * then placed on this map's own layout, because the plan is not to scale and doesn't line up with
 * the surveyed outlines by a single transform:
 * - markers along a walkway go to the same point along the matching map walkway, on the same side;
 * - markers in the pond go into the Aviary, those in the right-side botanical area into the Botanical Garden;
 * - the few others follow a smooth warp through those matches.
 * Positions are therefore approximate (a few metres); the shape and colour are the plan's.
 *
 * Marker shapes stand for the legend's planting zones (stars = Mali Area, circles = Aviary, …).
 * The plan's marker colours are brighter than the legend's swatches, so a tree's species can't be
 * read reliably from its colour; the legend below lists each zone's species as the reference does.
 */

export type TreeShape = "circle" | "ring" | "star" | "triangle" | "diamond" | "square" | "pentagon" | "heart" | "asterisk";

/** Shape codes used in TREE_MARKERS (index = code) */
export const SHAPES: TreeShape[] = ["circle", "ring", "star", "triangle", "diamond", "square", "pentagon", "heart", "asterisk"];

/** The plan's marker colours (index = code in TREE_MARKERS) */
export const MARKER_COLORS = ["#e61e23", "#f07d19", "#f8d214", "#8ccd23", "#2dc8eb", "#1e5fe1", "#783ccd", "#eb198c", "#f28cb4"];

export type TreeZone = { name: string; shape: TreeShape; species: { name: string; color: string; outline?: boolean }[] };

/** The legend, zone by zone, with the reference's species names and swatch colours */
export const TREE_ZONES: TreeZone[] = [
  { name: "Mali Area", shape: "star", species: [
    { name: "Mabolo", color: "#c9a24a" }, { name: "Burmese Rosewood / Narra", color: "#8a4a3a" },
    { name: "Indian Rubber Plant", color: "#4a6fa5" }, { name: "False Ashoka", color: "#5a6b3a" },
    { name: "Star Apple / Caimito", color: "#c0703a" }, { name: "Manila Palm", color: "#6a4a7a" },
    { name: "Molave", color: "#c06a7a" }, { name: "Tropical Almond / Talisay", color: "#7a6a3a" },
  ] },
  { name: "Aviary", shape: "circle", species: [
    { name: "Burmese Rosewood / Narra", color: "#8a5a4a" }, { name: "Bignay", color: "#5a4a6a" },
    { name: "Mango", color: "#d4a03a" }, { name: "Alexander Palm", color: "#b04a4a" },
    { name: "Jamaican Cherry / Aratilis", color: "#8aa060" }, { name: "Papaya", color: "#d49a6a" },
    { name: "Balete", color: "#8aa0b0" }, { name: "Indian Tree", color: "#4a7aa5" },
    { name: "Talisay", color: "#5a6a3a" }, { name: "Honduras Mahogany", color: "#c08aa0" },
    { name: "Peppers", color: "#b0603a" },
  ] },
  { name: "Aviary to Food Park", shape: "triangle", species: [
    { name: "Burmese Rosewood / Narra", color: "#7a8ab0" }, { name: "Molave", color: "#b08040" },
    { name: "Mahogany", color: "#c06030" }, { name: "Mango", color: "#e0b030" },
    { name: "Indian Rubber Tree", color: "#7a9a5a" }, { name: "Camachile", color: "#e0906a" },
    { name: "Yellow Poinciana", color: "#6aa0c0" }, { name: "Star Apple", color: "#a05080" },
    { name: "Orchid Tree", color: "#d07090" }, { name: "Common Coconut Palm", color: "#5a9a4a" },
    { name: "Pride of India", color: "#c0a0c0" }, { name: "Cambodian Dragon Tree", color: "#a0b8d0" },
    { name: "Palo Santo", color: "#303040" },
  ] },
  { name: "Botanical Area (Right Side)", shape: "diamond", species: [
    { name: "Pride of India", color: "#a0b070" }, { name: "Tropical Almond", color: "#e0b060" },
    { name: "Yakooro", color: "#3a6aa0" }, { name: "Anahaw", color: "#7a9a5a" },
    { name: "African Oil Palm", color: "#c04a4a" }, { name: "Pygmi Date Palm", color: "#c07090" },
    { name: "Fishtail Palm", color: "#a0b0c0" }, { name: "Acacia", color: "#c0a070" },
    { name: "Fire Tree", color: "#d07040" }, { name: "Buddhist Pine", color: "#a070a0" },
    { name: "Cambodian Dragon Tree", color: "#5a9aa0" }, { name: "Money Tree", color: "#4a6a3a" },
    { name: "False Ashoka", color: "#d090a0" }, { name: "Burmese Rosewood / Narra", color: "#b08050" },
    { name: "Palm Tree", color: "#e0a040" }, { name: "Manila Palm", color: "#5a9ab0" },
    { name: "Bagrass Tree", color: "#5a8a6a" },
  ] },
  { name: "Right Side Endemic to Mali Area", shape: "square", species: [
    { name: "Sacred Fig", color: "#d9a59a" }, { name: "Blackboard Tree", color: "#d4b06a" },
    { name: "Honduras Mahogany", color: "#c08a3e" }, { name: "Areca Nut Palm", color: "#6a8fbf" },
    { name: "Cigar Tree", color: "#e2b93b" }, { name: "White Sapote", color: "#c98aa8" },
    { name: "Soursop", color: "#b5524a" }, { name: "Avocado", color: "#8aa65a" },
    { name: "Neem Tree", color: "#5fa0b5" }, { name: "Indian Mulberry", color: "#c46a3a" },
    { name: "Rubber Fig", color: "#5f7f3f" }, { name: "Lemon-scented Gum", color: "#d9b86a" },
    { name: "Narra", color: "#a98ac0" },
  ] },
  { name: "Middle Part of Botanical Garden", shape: "pentagon", species: [
    { name: "Areca Palm", color: "#9ab07a" }, { name: "Ylang-ylang", color: "#8ab0d0" },
    { name: "Leea", color: "#d9906a" }, { name: "Ficus Benja", color: "#7a9ac0" },
    { name: "Starburst", color: "#a08ab0" }, { name: "Catmon", color: "#d07a8a" },
    { name: "Round-leaf Fountain Palm", color: "#6a9a4a" }, { name: "Burmese Rosewood", color: "#d9b060" },
    { name: "Weeping Fig", color: "#a07a4a" }, { name: "Turkey", color: "#e0a040" },
  ] },
  { name: "Sewage Plant (Right Side) to Butterfly Garden", shape: "heart", species: [
    { name: "False Ashoka", color: "#a090b0" }, { name: "Rubber Tree", color: "#d0906a" },
    { name: "Narra", color: "#e0b040" }, { name: "Manila Tamarind", color: "#a0a060" },
    { name: "Fig Tree", color: "#c0a0c0" }, { name: "Japanese Superb Fig", color: "#a0a0a0", outline: true },
    { name: "Indian Date", color: "#b08080", outline: true }, { name: "Balitbitan", color: "#b0a0a0", outline: true },
    { name: "Bishop Wood", color: "#c09050" }, { name: "Queen Sago", color: "#60b0a0" },
    { name: "Mango", color: "#e0b020" }, { name: "Siar Tree", color: "#d06070" },
    { name: "Molave", color: "#a05080" }, { name: "Tropical Almond", color: "#b09050" },
    { name: "Manila Palm", color: "#5070b0" }, { name: "Common Coconut Palm", color: "#4060a0" },
    { name: "Sacred Fig", color: "#c03030" },
  ] },
  { name: "Botanical Left Side", shape: "ring", species: [
    { name: "West Indian Holly", color: "#d08060" }, { name: "Duan Putri", color: "#7080b0" },
    { name: "Starbust Bush", color: "#e0b040" }, { name: "China Doll Plant", color: "#7aa060" },
    { name: "Sacred Garlic Pear", color: "#a070a0" }, { name: "Burmese Fishtail Palm", color: "#c09050" },
    { name: "Blackboard Tree", color: "#6a8ab0" }, { name: "White Cedar", color: "#6a9ac0" },
    { name: "White Sapote", color: "#9ab060" }, { name: "Molave", color: "#d06070" },
  ] },
  { name: "Apex to Mali (Left)", shape: "asterisk", species: [
    { name: "Honduras Mahogany", color: "#5a7a4a" }, { name: "Weeping Fig", color: "#d08aa0" },
  ] },
];

export const zoneOfShape = (shape: TreeShape) => TREE_ZONES.find(z => z.shape === shape);

/**
 * SVG path (24×24 box) of each marker shape, shared by the map's icons (canvas Path2D) and the legend (SVG).
 * "Stroke" shapes (asterisk) are drawn as lines; the ring is a circle with a hole.
 */
export function shapePath(shape: TreeShape): { d: string; stroke?: boolean } {
  const pt = (r: number, a: number) => `${(12 + r * Math.sin(a)).toFixed(2)} ${(12.6 - r * Math.cos(a)).toFixed(2)}`;
  switch (shape) {
    case "star": return { d: "M" + Array.from({ length: 10 }, (_, k) => pt(k % 2 ? 4.4 : 10, (k * Math.PI) / 5)).join(" L") + " Z" };
    case "pentagon": return { d: "M" + Array.from({ length: 5 }, (_, k) => pt(9.6, (k * 2 * Math.PI) / 5)).join(" L") + " Z" };
    case "triangle": return { d: "M12 2.5 L21.5 20 L2.5 20 Z" };
    case "diamond": return { d: "M12 2 L22 12 L12 22 L2 12 Z" };
    case "square": return { d: "M4 4 H20 V20 H4 Z" };
    case "heart": return { d: "M12 21 C5 15.5 2.5 12.2 2.5 8.6 C2.5 5.6 4.8 3.5 7.5 3.5 C9.4 3.5 11 4.6 12 6.2 C13 4.6 14.6 3.5 16.5 3.5 C19.2 3.5 21.5 5.6 21.5 8.6 C21.5 12.2 19 15.5 12 21 Z" };
    case "asterisk": return { d: "M12 2.5 V21.5 M3.8 7.2 L20.2 16.8 M3.8 16.8 L20.2 7.2", stroke: true };
    case "ring": return { d: "M12 2.5 A9.5 9.5 0 1 1 11.99 2.5 Z M12 8 A4 4 0 1 0 12.01 8 Z" };
    default: return { d: "M12 2.5 A9.5 9.5 0 1 1 11.99 2.5 Z" };
  }
}

/** [lng, lat, shape code, colour code] for each marker on the plan */
export const TREE_MARKERS: [number, number, number, number][] = [
  [120.9884839,14.5653242,5,2], [120.9890777,14.5653039,0,2], [120.9884080,14.5652925,5,2], [120.9891347,14.5652902,0,3],
  [120.9890615,14.5652880,0,2], [120.9890757,14.5652862,0,2], [120.9890693,14.5652810,0,2], [120.9890769,14.5652774,0,1],
  [120.9892128,14.5652764,0,1], [120.9883618,14.5652731,2,0], [120.9891525,14.5652711,0,7], [120.9892407,14.5652697,0,2],
  [120.9892480,14.5652679,0,1], [120.9890716,14.5652550,0,4], [120.9892964,14.5652456,0,2], [120.9892696,14.5652442,0,7],
  [120.9884555,14.5652360,2,6], [120.9893279,14.5652359,1,2], [120.9893009,14.5652353,0,1], [120.9892871,14.5652330,0,7],
  [120.9891055,14.5652260,0,4], [120.9892926,14.5652253,0,8], [120.9891183,14.5652169,4,3], [120.9893810,14.5652149,0,2],
  [120.9891384,14.5652144,0,3], [120.9883935,14.5652143,2,0], [120.9891627,14.5652058,0,3], [120.9882924,14.5652056,2,5],
  [120.9891649,14.5652036,0,3], [120.9891098,14.5652010,0,4], [120.9883769,14.5652003,2,6], [120.9894145,14.5651888,0,3],
  [120.9890419,14.5651853,0,4], [120.9894204,14.5651845,0,3], [120.9883640,14.5651783,2,6], [120.9894430,14.5651767,0,4],
  [120.9894086,14.5651763,0,2], [120.9891037,14.5651759,0,3], [120.9894168,14.5651740,0,1], [120.9891874,14.5651735,0,3],
  [120.9894470,14.5651688,0,5], [120.9882769,14.5651670,2,5], [120.9894680,14.5651642,0,2], [120.9894338,14.5651631,0,3],
  [120.9890767,14.5651600,0,3], [120.9883546,14.5651575,2,6], [120.9894171,14.5651565,0,5], [120.9888447,14.5651514,4,0],
  [120.9885756,14.5651493,1,3], [120.9894551,14.5651394,0,4], [120.9887531,14.5651369,4,2], [120.9894318,14.5651363,0,7],
  [120.9883934,14.5651346,2,0], [120.9883423,14.5651338,2,0], [120.9892186,14.5651322,0,3], [120.9890790,14.5651304,0,3],
  [120.9882621,14.5651302,2,5], [120.9888932,14.5651276,0,4], [120.9894469,14.5651276,0,1], [120.9892725,14.5651220,0,1],
  [120.9889117,14.5651168,4,1], [120.9892507,14.5651150,0,1], [120.9892018,14.5651125,0,3], [120.9894487,14.5651115,0,0],
  [120.9891826,14.5651102,0,3], [120.9883333,14.5651097,2,0], [120.9888758,14.5651061,4,1], [120.9891446,14.5651049,0,7],
  [120.9885122,14.5651035,0,2], [120.9893118,14.5651010,0,3], [120.9892794,14.5650947,0,1], [120.9893631,14.5650931,0,2],
  [120.9891762,14.5650918,0,7], [120.9890452,14.5650900,0,1], [120.9894439,14.5650866,0,3], [120.9890943,14.5650864,0,3],
  [120.9893401,14.5650828,0,3], [120.9887882,14.5650799,4,1], [120.9884901,14.5650722,1,3], [120.9893064,14.5650706,0,1],
  [120.9891687,14.5650694,0,2], [120.9893299,14.5650672,0,3], [120.9883237,14.5650605,2,6], [120.9891263,14.5650568,0,4],
  [120.9883352,14.5650515,2,0], [120.9883078,14.5650504,2,0], [120.9893300,14.5650480,0,1], [120.9892292,14.5650329,0,5],
  [120.9894303,14.5650295,0,2], [120.9892802,14.5650275,0,5], [120.9883646,14.5650267,0,3], [120.9891837,14.5650178,0,5],
  [120.9883748,14.5650136,0,3], [120.9882461,14.5650107,2,4], [120.9881701,14.5650049,5,1], [120.9894222,14.5650040,0,3],
  [120.9883847,14.5650032,0,3], [120.9893561,14.5650028,0,8], [120.9893796,14.5650026,0,7], [120.9893722,14.5650016,0,7],
  [120.9891480,14.5650010,4,7], [120.9881614,14.5649989,5,1], [120.9892528,14.5649979,0,2], [120.9893413,14.5649970,0,2],
  [120.9892751,14.5649968,0,2], [120.9893236,14.5649965,0,2], [120.9882520,14.5649959,0,1], [120.9893977,14.5649946,0,7],
  [120.9892978,14.5649944,0,2], [120.9884153,14.5649925,4,5], [120.9884034,14.5649924,0,0], [120.9882551,14.5649882,2,4],
  [120.9893861,14.5649817,0,1], [120.9882579,14.5649813,0,1], [120.9893736,14.5649787,0,4], [120.9884188,14.5649783,1,3],
  [120.9893521,14.5649703,0,3], [120.9893278,14.5649643,0,5], [120.9882129,14.5649614,0,7], [120.9893034,14.5649578,0,5],
  [120.9882561,14.5649562,2,4], [120.9882169,14.5649559,0,7], [120.9884382,14.5649553,1,3], [120.9882704,14.5649502,3,1],
  [120.9883365,14.5649493,3,1], [120.9892824,14.5649426,0,5], [120.9885244,14.5649402,0,8], [120.9877935,14.5649380,0,2],
  [120.9881857,14.5649379,0,7], [120.9885277,14.5649369,0,8], [120.9882675,14.5649277,3,1], [120.9885101,14.5649275,0,8],
  [120.9885113,14.5649249,0,8], [120.9884150,14.5649231,4,5], [120.9883484,14.5649198,3,1], [120.9881614,14.5649169,0,7],
  [120.9885050,14.5648969,5,0], [120.9884812,14.5648928,1,3], [120.9884575,14.5648893,1,3], [120.9879811,14.5648797,5,1],
  [120.9879037,14.5648717,0,3], [120.9881266,14.5648717,0,7], [120.9883044,14.5648657,3,1], [120.9886755,14.5648369,3,8],
  [120.9878482,14.5648353,0,3], [120.9886682,14.5648337,3,8], [120.9880290,14.5648224,5,3], [120.9879568,14.5648194,0,7],
  [120.9879539,14.5648193,0,0], [120.9886076,14.5648068,4,4], [120.9887503,14.5648050,4,4], [120.9883793,14.5647899,3,0],
  [120.9882402,14.5647843,3,1], [120.9886812,14.5647742,5,6], [120.9881705,14.5647257,3,1], [120.9877041,14.5646821,0,3],
  [120.9877123,14.5645247,0,3], [120.9880343,14.5645155,0,3], [120.9876499,14.5644893,5,0], [120.9880072,14.5644754,2,0],
  [120.9876285,14.5644561,5,4], [120.9879469,14.5644373,0,1], [120.9875878,14.5643998,5,1], [120.9876365,14.5643826,0,3],
  [120.9878983,14.5643668,0,2], [120.9879034,14.5643617,4,1], [120.9888696,14.5643271,0,2], [120.9879199,14.5643237,0,2],
  [120.9876746,14.5643214,0,3], [120.9876061,14.5643165,5,2], [120.9876308,14.5642767,0,3], [120.9876426,14.5642577,5,0],
  [120.9888836,14.5642479,3,8], [120.9877617,14.5642342,5,0], [120.9876597,14.5642301,0,1], [120.9878110,14.5642048,5,2],
  [120.9878420,14.5641864,5,4], [120.9888319,14.5641835,5,0], [120.9888239,14.5641731,2,6], [120.9878714,14.5641688,5,2],
  [120.9883917,14.5641561,0,3], [120.9884262,14.5641550,0,3], [120.9884704,14.5641535,0,3], [120.9885428,14.5641512,5,6],
  [120.9885967,14.5641495,0,1], [120.9886462,14.5641401,0,3], [120.9888012,14.5641362,0,5], [120.9887271,14.5641315,0,5],
  [120.9882514,14.5641200,0,3], [120.9878451,14.5641149,5,1], [120.9878451,14.5641149,5,2], [120.9882564,14.5641104,0,4],
  [120.9882544,14.5641095,0,1], [120.9882016,14.5641080,0,3], [120.9882211,14.5641061,0,4], [120.9882108,14.5641060,4,0],
  [120.9882430,14.5641046,0,4], [120.9882429,14.5641045,0,0], [120.9882418,14.5641042,4,0], [120.9878734,14.5641036,5,2],
  [120.9882391,14.5641029,0,5], [120.9883818,14.5640994,4,0], [120.9887768,14.5640965,0,0], [120.9883523,14.5640867,0,3],
  [120.9878512,14.5640702,5,2], [120.9878401,14.5640697,5,1], [120.9882796,14.5640555,4,0], [120.9882710,14.5640518,0,2],
  [120.9876473,14.5640498,5,1],
];
