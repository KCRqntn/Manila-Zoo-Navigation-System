/**
 * Starting data for Facilities and Park Areas, loaded once by the "facilities and park areas"
 * migration (lib/migrations.ts). After that, admins manage it in the dashboard; deleting a seeded
 * item never brings it back.
 *
 * - Facilities: the places named on the official site plan. Positions are the matching map outline's
 *   centre where the map has one, otherwise estimated from the plan (see artifacts/manila-zoo/src/lib/architecturalPlan.ts).
 * - Park areas: the planting zones of the site plan's tree legend, with the species the legend lists.
 * - Trees: the coloured markers on the site plan, placed on the map's walkways and areas
 *   (approximate, a few metres). Their species weren't recorded on the plan, so they start as
 *   "Cannot be identified" until someone surveys them.
 */

export const FACILITY_TYPES = ["enclosure", "building", "water_feature", "landscape", "parking", "security", "restroom", "medical", "utility", "other"] as const;
export const FACILITY_STATUSES = ["open", "maintenance", "closed"] as const;
export const MARKER_SHAPES = ["circle", "ring", "star", "triangle", "diamond", "square", "pentagon", "heart", "asterisk"] as const;
export const TREE_STATUSES = ["healthy", "needs_care", "dead", "unidentified"] as const;

type SeedFacility = { name: string; type: (typeof FACILITY_TYPES)[number]; description: string; lng: number; lat: number };

export const SEED_FACILITIES: SeedFacility[] = [
  { name: "West Fence Paddock", type: "enclosure", description: "Open paddock with its pool along the west fence (3,080.50 m², pool 108.12 m² on the site plan).", lng: 120.9876233, lat: 14.564835 },
  { name: "Habitat Building", type: "building", description: "Habitat building beside the Zebra exhibit.", lng: 120.988212, lat: 14.565375 },
  { name: "Manila's Children's Museum", type: "building", description: "Children's museum on the Quirino Avenue side of the zoo.", lng: 120.98843, lat: 14.56558 },
  { name: "Cascading Fountain", type: "water_feature", description: "Fountain channel along the President Quirino Avenue fence.", lng: 120.98796, lat: 14.56561 },
  { name: "Parking", type: "parking", description: "Visitor parking by the vehicle gate.", lng: 120.9885, lat: 14.5659 },
  { name: "Guard House 1", type: "security", description: "Guard house at the main gate.", lng: 120.9888513, lat: 14.5657486 },
  { name: "Guard House 2", type: "security", description: "Guard house by the vehicle gate, beside the parking.", lng: 120.98868, lat: 14.56588 },
  { name: "Pond", type: "water_feature", description: "Pond inside the aviary.", lng: 120.9885203, lat: 14.5650485 },
  { name: "Main Tank", type: "water_feature", description: "Main tank by the Philippine Endemic area (61.00 m² on the site plan).", lng: 120.9876406, lat: 14.5641673 },
  { name: "Dietary Treatment Plant", type: "utility", description: "Prepares the animals' food.", lng: 120.9880077, lat: 14.5645626 },
  { name: "Interactive Fountain", type: "water_feature", description: "Interactive fountain south of the aviary, by the food court.", lng: 120.9886999, lat: 14.5648645 },
  { name: "Island", type: "landscape", description: "Island in the middle of the lagoon.", lng: 120.9883751, lat: 14.5644445 },
  { name: "Lagoon", type: "water_feature", description: "The zoo's central lagoon.", lng: 120.9887739, lat: 14.5645812 },
  { name: "Public Restroom (West)", type: "restroom", description: "Public restroom by the Philippine Endemic area and the A. Mabini side.", lng: 120.9874567, lat: 14.5643046 },
  { name: "Public Restroom (East)", type: "restroom", description: "Public restroom by the entrance plaza and the botanical garden.", lng: 120.989103, lat: 14.5654148 },
  { name: "Domestic", type: "other", description: "Domestic area next to the west public restroom.", lng: 120.98752, lat: 14.56445 },
  { name: "Veterinary Medical Facility", type: "medical", description: "Veterinary medical facility on the east side.", lng: 120.989461, lat: 14.5652567 },
  { name: "Veterinary Hospital", type: "medical", description: "Animal hospital on the east side.", lng: 120.9896683, lat: 14.565086 },
  { name: "Material Recovery Facility", type: "utility", description: "Sorting and recycling of the zoo's waste.", lng: 120.9899069, lat: 14.5649805 },
];

type SeedZone = { name: string; shape: (typeof MARKER_SHAPES)[number]; color: string; species: string[] };

export const SEED_ZONES: SeedZone[] = [
  { name: "Mali Area", shape: "star", color: "#e61e23", species: ["Mabolo", "Burmese Rosewood / Narra", "Indian Rubber Plant", "False Ashoka", "Star Apple / Caimito", "Manila Palm", "Molave", "Tropical Almond / Talisay"] },
  { name: "Aviary", shape: "circle", color: "#7cc520", species: ["Burmese Rosewood / Narra", "Bignay", "Mango", "Alexander Palm", "Jamaican Cherry / Aratilis", "Papaya", "Balete", "Indian Tree", "Talisay", "Honduras Mahogany", "Peppers"] },
  { name: "Aviary to Food Park", shape: "triangle", color: "#f07d19", species: ["Burmese Rosewood / Narra", "Molave", "Mahogany", "Mango", "Indian Rubber Tree", "Camachile", "Yellow Poinciana", "Star Apple", "Orchid Tree", "Common Coconut Palm", "Pride of India", "Cambodian Dragon Tree", "Palo Santo"] },
  { name: "Botanical Area (Right Side)", shape: "diamond", color: "#1fb5d6", species: ["Pride of India", "Tropical Almond", "Yakooro", "Anahaw", "African Oil Palm", "Pygmi Date Palm", "Fishtail Palm", "Acacia", "Fire Tree", "Buddhist Pine", "Cambodian Dragon Tree", "Money Tree", "False Ashoka", "Burmese Rosewood / Narra", "Palm Tree", "Manila Palm", "Bagrass Tree"] },
  { name: "Right Side Endemic to Mali Area", shape: "square", color: "#e6b800", species: ["Sacred Fig", "Blackboard Tree", "Honduras Mahogany", "Areca Nut Palm", "Cigar Tree", "White Sapote", "Soursop", "Avocado", "Neem Tree", "Indian Mulberry", "Rubber Fig", "Lemon-scented Gum", "Narra"] },
  { name: "Middle Part of Botanical Garden", shape: "pentagon", color: "#783ccd", species: ["Areca Palm", "Ylang-ylang", "Leea", "Ficus Benja", "Starburst", "Catmon", "Round-leaf Fountain Palm", "Burmese Rosewood", "Weeping Fig", "Turkey"] },
  { name: "Sewage Plant to Butterfly Garden", shape: "heart", color: "#eb198c", species: ["False Ashoka", "Rubber Tree", "Narra", "Manila Tamarind", "Fig Tree", "Japanese Superb Fig", "Indian Date", "Balitbitan", "Bishop Wood", "Queen Sago", "Mango", "Siar Tree", "Molave", "Tropical Almond", "Manila Palm", "Common Coconut Palm", "Sacred Fig"] },
  { name: "Botanical Left Side", shape: "ring", color: "#1e5fe1", species: ["West Indian Holly", "Duan Putri", "Starbust Bush", "China Doll Plant", "Sacred Garlic Pear", "Burmese Fishtail Palm", "Blackboard Tree", "White Cedar", "White Sapote", "Molave"] },
  { name: "Apex to Mali (Left)", shape: "asterisk", color: "#8b5a2b", species: ["Honduras Mahogany", "Weeping Fig"] },
];

/** [lng, lat, marker shape index in MARKER_SHAPES]: the site plan's tree markers; the shape gives the zone */
export const SEED_TREES: [number, number, number][] = [
  [120.9884839,14.5653242,5], [120.9890777,14.5653039,0], [120.9884080,14.5652925,5], [120.9891347,14.5652902,0], [120.9890615,14.5652880,0],
  [120.9890757,14.5652862,0], [120.9890693,14.5652810,0], [120.9890769,14.5652774,0], [120.9892128,14.5652764,0], [120.9883618,14.5652731,2],
  [120.9891525,14.5652711,0], [120.9892407,14.5652697,0], [120.9892480,14.5652679,0], [120.9890716,14.5652550,0], [120.9892964,14.5652456,0],
  [120.9892696,14.5652442,0], [120.9884555,14.5652360,2], [120.9893279,14.5652359,1], [120.9893009,14.5652353,0], [120.9892871,14.5652330,0],
  [120.9891055,14.5652260,0], [120.9892926,14.5652253,0], [120.9891183,14.5652169,4], [120.9893810,14.5652149,0], [120.9891384,14.5652144,0],
  [120.9883935,14.5652143,2], [120.9891627,14.5652058,0], [120.9882924,14.5652056,2], [120.9891649,14.5652036,0], [120.9891098,14.5652010,0],
  [120.9883769,14.5652003,2], [120.9894145,14.5651888,0], [120.9890419,14.5651853,0], [120.9894204,14.5651845,0], [120.9883640,14.5651783,2],
  [120.9894430,14.5651767,0], [120.9894086,14.5651763,0], [120.9891037,14.5651759,0], [120.9894168,14.5651740,0], [120.9891874,14.5651735,0],
  [120.9894470,14.5651688,0], [120.9882769,14.5651670,2], [120.9894680,14.5651642,0], [120.9894338,14.5651631,0], [120.9890767,14.5651600,0],
  [120.9883546,14.5651575,2], [120.9894171,14.5651565,0], [120.9888447,14.5651514,4], [120.9885756,14.5651493,1], [120.9894551,14.5651394,0],
  [120.9887531,14.5651369,4], [120.9894318,14.5651363,0], [120.9883934,14.5651346,2], [120.9883423,14.5651338,2], [120.9892186,14.5651322,0],
  [120.9890790,14.5651304,0], [120.9882621,14.5651302,2], [120.9888932,14.5651276,0], [120.9894469,14.5651276,0], [120.9892725,14.5651220,0],
  [120.9889117,14.5651168,4], [120.9892507,14.5651150,0], [120.9892018,14.5651125,0], [120.9894487,14.5651115,0], [120.9891826,14.5651102,0],
  [120.9883333,14.5651097,2], [120.9888758,14.5651061,4], [120.9891446,14.5651049,0], [120.9885122,14.5651035,0], [120.9893118,14.5651010,0],
  [120.9892794,14.5650947,0], [120.9893631,14.5650931,0], [120.9891762,14.5650918,0], [120.9890452,14.5650900,0], [120.9894439,14.5650866,0],
  [120.9890943,14.5650864,0], [120.9893401,14.5650828,0], [120.9887882,14.5650799,4], [120.9884901,14.5650722,1], [120.9893064,14.5650706,0],
  [120.9891687,14.5650694,0], [120.9893299,14.5650672,0], [120.9883237,14.5650605,2], [120.9891263,14.5650568,0], [120.9883352,14.5650515,2],
  [120.9883078,14.5650504,2], [120.9893300,14.5650480,0], [120.9892292,14.5650329,0], [120.9894303,14.5650295,0], [120.9892802,14.5650275,0],
  [120.9883646,14.5650267,0], [120.9891837,14.5650178,0], [120.9883748,14.5650136,0], [120.9882461,14.5650107,2], [120.9881701,14.5650049,5],
  [120.9894222,14.5650040,0], [120.9883847,14.5650032,0], [120.9893561,14.5650028,0], [120.9893796,14.5650026,0], [120.9893722,14.5650016,0],
  [120.9891480,14.5650010,4], [120.9881614,14.5649989,5], [120.9892528,14.5649979,0], [120.9893413,14.5649970,0], [120.9892751,14.5649968,0],
  [120.9893236,14.5649965,0], [120.9882520,14.5649959,0], [120.9893977,14.5649946,0], [120.9892978,14.5649944,0], [120.9884153,14.5649925,4],
  [120.9884034,14.5649924,0], [120.9882551,14.5649882,2], [120.9893861,14.5649817,0], [120.9882579,14.5649813,0], [120.9893736,14.5649787,0],
  [120.9884188,14.5649783,1], [120.9893521,14.5649703,0], [120.9893278,14.5649643,0], [120.9882129,14.5649614,0], [120.9893034,14.5649578,0],
  [120.9882561,14.5649562,2], [120.9882169,14.5649559,0], [120.9884382,14.5649553,1], [120.9882704,14.5649502,3], [120.9883365,14.5649493,3],
  [120.9892824,14.5649426,0], [120.9885244,14.5649402,0], [120.9877935,14.5649380,0], [120.9881857,14.5649379,0], [120.9885277,14.5649369,0],
  [120.9882675,14.5649277,3], [120.9885101,14.5649275,0], [120.9885113,14.5649249,0], [120.9884150,14.5649231,4], [120.9883484,14.5649198,3],
  [120.9881614,14.5649169,0], [120.9885050,14.5648969,5], [120.9884812,14.5648928,1], [120.9884575,14.5648893,1], [120.9879811,14.5648797,5],
  [120.9879037,14.5648717,0], [120.9881266,14.5648717,0], [120.9883044,14.5648657,3], [120.9886755,14.5648369,3], [120.9878482,14.5648353,0],
  [120.9886682,14.5648337,3], [120.9880290,14.5648224,5], [120.9879568,14.5648194,0], [120.9879539,14.5648193,0], [120.9886076,14.5648068,4],
  [120.9887503,14.5648050,4], [120.9883793,14.5647899,3], [120.9882402,14.5647843,3], [120.9886812,14.5647742,5], [120.9881705,14.5647257,3],
  [120.9877041,14.5646821,0], [120.9877123,14.5645247,0], [120.9880343,14.5645155,0], [120.9876499,14.5644893,5], [120.9880072,14.5644754,2],
  [120.9876285,14.5644561,5], [120.9879469,14.5644373,0], [120.9875878,14.5643998,5], [120.9876365,14.5643826,0], [120.9878983,14.5643668,0],
  [120.9879034,14.5643617,4], [120.9888696,14.5643271,0], [120.9879199,14.5643237,0], [120.9876746,14.5643214,0], [120.9876061,14.5643165,5],
  [120.9876308,14.5642767,0], [120.9876426,14.5642577,5], [120.9888836,14.5642479,3], [120.9877617,14.5642342,5], [120.9876597,14.5642301,0],
  [120.9878110,14.5642048,5], [120.9878420,14.5641864,5], [120.9888319,14.5641835,5], [120.9888239,14.5641731,2], [120.9878714,14.5641688,5],
  [120.9883917,14.5641561,0], [120.9884262,14.5641550,0], [120.9884704,14.5641535,0], [120.9885428,14.5641512,5], [120.9885967,14.5641495,0],
  [120.9886462,14.5641401,0], [120.9888012,14.5641362,0], [120.9887271,14.5641315,0], [120.9882514,14.5641200,0], [120.9878451,14.5641149,5],
  [120.9878451,14.5641149,5], [120.9882564,14.5641104,0], [120.9882544,14.5641095,0], [120.9882016,14.5641080,0], [120.9882211,14.5641061,0],
  [120.9882108,14.5641060,4], [120.9882430,14.5641046,0], [120.9882429,14.5641045,0], [120.9882418,14.5641042,4], [120.9878734,14.5641036,5],
  [120.9882391,14.5641029,0], [120.9883818,14.5640994,4], [120.9887768,14.5640965,0], [120.9883523,14.5640867,0], [120.9878512,14.5640702,5],
  [120.9878401,14.5640697,5], [120.9882796,14.5640555,4], [120.9882710,14.5640518,0], [120.9876473,14.5640498,5],
];

const q = (v: string | null) => (v == null ? "NULL" : `'${v.replace(/'/g, "''")}'`);

/** SQL that loads the starting data into empty tables (used once by the migration). */
export function parkSeedSql(): string {
  const facilities = SEED_FACILITIES.map(f =>
    `(${q(f.name)}, ${q(f.type)}, ${q(f.description)}, 'open', ${f.lat}, ${f.lng})`).join(",\n  ");
  const zones = SEED_ZONES.map((z, i) =>
    `(${q(z.name)}, ${q(z.shape)}, ${q(z.color)}, ARRAY[${z.species.map(q).join(", ")}]::text[], ${i})`).join(",\n  ");
  const trees = SEED_TREES.map(([lng, lat, s]) => {
    const zone = SEED_ZONES.find(z => z.shape === MARKER_SHAPES[s])!;
    return `((SELECT id FROM park_zones WHERE name = ${q(zone.name)}), 'unidentified', ${lat}, ${lng}, 'site_plan')`;
  }).join(",\n  ");
  return `
INSERT INTO facilities (name, type, description, status, lat, lng) VALUES
  ${facilities}
ON CONFLICT DO NOTHING;
INSERT INTO park_zones (name, marker_shape, marker_color, legend_species, sort_order) VALUES
  ${zones}
ON CONFLICT DO NOTHING;
INSERT INTO zone_trees (zone_id, status, lat, lng, source) VALUES
  ${trees};
`;
}
