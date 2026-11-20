import { readFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import { supabase } from "./lib/supabase";

/**
 * Adds the animals whose information signs were photographed at Manila Zoo (Google Drive folder),
 * with the text from those signs. Most have no photo of the animal yet; add one in Admin → Animals.
 * Updates by name if an animal already exists, so it is safe to run again.
 *
 *   npx tsx --env-file=../../.env ./src/importZooSigns.ts <folder with 001.jpg, 002.jpg…>
 */
const dir = process.argv[2];
if (!dir) { console.error("Usage: importZooSigns.ts <photo folder>"); process.exit(1); }

const BUCKET = "animal-photos";
const CAPTION = "Photo taken at Manila Zoo";
const CAT = { mammals: 1, reptiles: 2, birds: 3 };
// Exhibits are best guesses from where the signs were photographed; check them in Admin → Animals
// The Savannah (pin 25, formerly Hyena) holds the animals of the old Savana exhibit (pin 26, removed)
const PIN = { aviary: 23, savannah: 25, indoorReptiles: 29, primates: 30 };

type Entry = { name: string; photo?: number; gallery?: number[]; fields: Record<string, unknown> };

const ENTRIES: Entry[] = [
  {
    name: "Ring-tailed Lemur",
    fields: {
      scientific_name: "Lemur catta", category_id: CAT.mammals, location_id: PIN.primates, conservation_status: "Endangered",
      description: "The ring-tailed lemur has white fur on its belly and grey or brown fur on its back. Its most recognizable feature is its long tail with black and white rings. Its body is 28–46 cm long, its tail 56–64 cm, and it weighs up to 2.2 kg.",
      habitat: "Dry forests, spiny bush, montane forests, mangroves, rocky outcrops, and rainforests",
      diet: "Mainly herbivore: leaves, fruits, flowers, bark, seeds, and sap; sometimes invertebrates",
      interesting_facts: [
        "Native to southern Madagascar",
        "Active both day and night (cathemeral)",
        "Lives in groups of 3 to 27, usually 13–18, led by the females",
        "Marks its territory with its scent",
      ],
    },
  },
  {
    name: "Lar Gibbon",
    fields: {
      scientific_name: "Hylobates lar", category_id: CAT.mammals, location_id: PIN.primates, conservation_status: "Endangered",
      description: "The lar gibbon has a hairless face framed by a ring of black or white fur. Its coat is either dark (black to grey) or light (cream to light brown).",
      habitat: "Hill, lowland, and upper dipterocarp forests, submontane rainforests, bamboo forests, and seasonal evergreen forests",
      diet: "Mostly ripe fruit, plus leaves, flowers, and insects",
      interesting_facts: ["Found in Southeast Asia, including Malaysia, Laos, Indonesia, Myanmar, and Thailand"],
    },
  },
  {
    name: "Japanese Macaque",
    fields: {
      scientific_name: "Macaca fuscata", common_name: "Japanese red-faced monkey", category_id: CAT.mammals, location_id: PIN.primates,
      conservation_status: "Least Concern",
      description: "Also called \"snow monkeys\", Japanese macaques have long, thick brown or grey fur that contrasts with their bare red face and rump.",
      habitat: "Subalpine, subtropical, evergreen, and deciduous mountain forests",
      diet: "Omnivore: fruits, seeds, leaves, flowers, invertebrates, and other animal matter",
      interesting_facts: ["Lives on Japan's three southern main islands: Kyushu, Shikoku, and Honshu"],
    },
  },
  {
    name: "Philippine Deer",
    fields: {
      scientific_name: "Rusa marianna", common_name: "Usa", category_id: CAT.mammals, location_id: PIN.savannah, conservation_status: "Vulnerable",
      description: "The Philippine deer is a medium-sized brown deer with a whitish or bright brown underside of the tail and inside of the ears. Bucks (males) grow antlers 16–40 cm long. They live in forests and grasslands, usually in small groups.",
      habitat: "Forests and grasslands", diet: "Herbivore",
      interesting_facts: ["Found only in the Philippines"],
    },
  },
  {
    name: "Ostrich",
    fields: {
      scientific_name: "Struthio camelus", category_id: CAT.birds, location_id: PIN.savannah, conservation_status: "Least Concern",
      description: "The ostrich is the largest living bird. It can't fly but is a strong runner. Adult males stand about 275 cm tall and weigh over 150 kg, while females are somewhat smaller. Males are mostly black with white plumes on the wings and tail; females are mostly brown.",
      habitat: "Open, dry grasslands, savannas, and desert-like areas of Africa",
      diet: "Mainly plants (seeds, roots), plus small reptiles and insects",
      lifespan_years: 40,
      interesting_facts: [
        "Lays the world's largest egg: about 15 cm long and 1.35 kg",
        "Lives 30 to 40 years in the wild",
        "Gets most of its water from the plants it eats",
      ],
    },
  },
  {
    name: "Double-wattled Cassowary",
    fields: {
      scientific_name: "Casuarius casuarius", category_id: CAT.birds, location_id: PIN.savannah,
      description: "In cassowaries, the female is larger than the male and leads the pair, while the male incubates the 3–6 eggs for about two months. The helmet-like casque on its head helps it push through rainforest vegetation.",
      habitat: "Rainforests, especially along stream banks and clearings",
      diet: "Fruits and plants, plus insects, small mammals, and birds",
      interesting_facts: ["Lives in the rainforests of northeast Australia and New Guinea"],
    },
  },
  {
    name: "Tarictic Hornbill",
    fields: {
      scientific_name: "Penelopides panini", category_id: CAT.birds, location_id: PIN.aviary, conservation_status: "Endangered",
      description: "A large hornbill from the lowland and foothill forests of Panay and Negros. Males have a creamy-white head and neck and a reddish-brown lower chest; females are mostly black with blue skin around the eyes. Both have a blackish bill and casque with yellowish ridges.",
      diet: "Fruits, insects, beetles, ants, and earthworms",
      interesting_facts: ["Found only in the Philippines"],
    },
  },
  {
    name: "Indian Blue Peafowl",
    fields: {
      scientific_name: "Pavo cristatus", category_id: CAT.birds, location_id: PIN.aviary, conservation_status: "Least Concern",
      description: "Males are large, with a long, ornate tail they fan out during courtship. Females are plainer: brownish grey with a white throat and a green neck, and slightly smaller than males.",
      // The zoo's sign repeats the stork's habitat and diet, so these are general facts about the species
      habitat: "Open forests and farmland",
      diet: "Omnivore: seeds, insects, small reptiles, and plants",
      interesting_facts: ["Native to India, Pakistan, and Sri Lanka"],
    },
  },
  {
    name: "Painted Stork",
    fields: {
      scientific_name: "Mycteria leucocephala", common_name: "Multi-colored stork", category_id: CAT.birds, location_id: PIN.aviary,
      description: "A large wading bird with long legs, a long neck, and a long, slightly curved bill.",
      habitat: "Freshwater marshes, ponds, lakes, lagoons, and flooded fields",
      diet: "Fish, crustaceans, and insects; sometimes frogs",
      interesting_facts: ["Found in India and Southeast Asia"],
    },
  },
  {
    name: "Nicobar Pigeon",
    fields: {
      scientific_name: "Caloenas nicobarica", category_id: CAT.birds, location_id: PIN.aviary, conservation_status: "Near Threatened",
      description: "A thickset pigeon with a small head, heavier than most pigeons its size. It is dark iridescent green with a short white tail, and its neck plumage shines green with coppery and bluish tones. Shy and quiet, it lives in tropical rainforests.",
      diet: "Seeds, berries, and insects",
      interesting_facts: ["Found in southern Asia"],
    },
  },
  {
    name: "Green Imperial Pigeon",
    fields: {
      scientific_name: "Ducula aenea", common_name: "Balud", category_id: CAT.birds, location_id: PIN.aviary, conservation_status: "Near Threatened",
      description: "A large pigeon of coconut groves and forests. It moves alone or in pairs but sometimes gathers in large numbers in fruiting trees, mixing with other species.",
      habitat: "Primary and secondary forests, coconut groves, and forest patches in open grassland",
      diet: "Fruits, buds, and shoots",
      interesting_facts: ["Uncommon in most of Luzon but fairly common elsewhere in the Philippines"],
    },
  },
  {
    name: "White-eared Brown Fruit Dove",
    fields: {
      scientific_name: "Phapitreron leucotis", common_name: "Limukin", category_id: CAT.birds, location_id: PIN.aviary, conservation_status: "Least Concern",
      description: "A shy dove of dense forest that moves alone or in pairs and never forms flocks.",
      habitat: "Forests from the lowlands up to about 1,000 m",
      diet: "Grains and fruits",
      interesting_facts: ["Found throughout the Philippines", "Also called Bato-batong tulog and Alimucon"],
    },
  },
  {
    name: "Philippine Spitting Cobra", photo: 64, gallery: [46],
    fields: {
      scientific_name: "Naja philippinensis", category_id: CAT.reptiles, location_id: PIN.indoorReptiles, conservation_status: "Near Threatened",
      description: "The northern Philippine cobra is light brown with no dark markings along its body, and grows 100–150 cm long. It is venomous and can spit its venom.",
      habitat: "Plains, forests, fields, and grasslands, often near ponds and rivers",
      diet: "Rodents, frogs, lizards, smaller snakes, and small birds",
      interesting_facts: ["Found only in the Philippines: Luzon, Mindoro, Catanduanes, and Masbate"],
    },
  },
  {
    name: "Samar Cobra",
    fields: {
      scientific_name: "Naja samarensis", category_id: CAT.reptiles, location_id: PIN.indoorReptiles, conservation_status: "Least Concern",
      description: "A venomous spitting cobra found only in the Philippines, growing up to about 140 cm. Its scales range from black and green to yellow.",
      habitat: "Tropical moist and mountain forests, plains, rice fields, plantations, and near rural villages",
      diet: "Mice, rats, frogs, lizards, and other small reptiles",
      interesting_facts: ["Found in the southern Philippines, in the Visayas and Mindanao"],
    },
  },
];

const COLUMNS = new Set(["scientific_name", "common_name", "category_id", "location_id", "conservation_status", "description",
  "habitat", "diet", "lifespan_years", "interesting_facts", "image_url"]);

async function uploadPhoto(n: number): Promise<string> {
  const body = await readFile(path.join(dir!, `${String(n).padStart(3, "0")}.jpg`));
  const key = `zoo-visit/${randomUUID()}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(key, body, { contentType: "image/jpeg", cacheControl: "31536000" });
  if (error) throw new Error(`Upload of photo ${n} failed: ${error.message}`);
  return supabase.storage.from(BUCKET).getPublicUrl(key).data.publicUrl;
}

async function main() {
  for (const e of ENTRIES) {
    const values: Record<string, unknown> = { ...e.fields };
    if (e.photo) values["image_url"] = await uploadPhoto(e.photo);
    const cols = Object.keys(values);
    for (const c of cols) if (!COLUMNS.has(c)) throw new Error(`Unknown field ${c}`);
    const params = Object.values(values);

    const { rows: [existing] } = await pool.query<{ id: number }>("SELECT id FROM animals WHERE lower(name) = lower($1)", [e.name]);
    let id: number;
    if (existing) {
      id = existing.id;
      await pool.query(`UPDATE animals SET ${cols.map((c, i) => `${c} = $${i + 2}`).join(", ")}, updated_at = NOW() WHERE id = $1`, [id, ...params]);
      console.log(`updated  ${e.name} (#${id})`);
    } else {
      const { rows: [row] } = await pool.query<{ id: number }>(
        `INSERT INTO animals (name, ${cols.join(", ")}) VALUES ($1, ${cols.map((_, i) => `$${i + 2}`).join(", ")}) RETURNING id`,
        [e.name, ...params]);
      id = row!.id;
      console.log(`created  ${e.name} (#${id})${e.photo ? "" : " (no photo yet)"}`);
    }
    if (e.photo) {
      await pool.query("DELETE FROM animal_gallery WHERE animal_id = $1 AND caption = $2", [id, CAPTION]);
      let order = 0;
      for (const n of [e.photo, ...(e.gallery ?? [])]) {
        const url = n === e.photo ? values["image_url"] : await uploadPhoto(n);
        await pool.query("INSERT INTO animal_gallery (animal_id, image_url, caption, sort_order) VALUES ($1, $2, $3, $4)", [id, url, CAPTION, order++]);
      }
    }
  }
  await pool.end();
  console.log("done");
}

main().catch(err => { console.error(err); process.exit(1); });
