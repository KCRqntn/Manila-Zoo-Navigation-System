import { readFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import { supabase } from "./lib/supabase";

/**
 * One-off import of the team's Manila Zoo photos (Google Drive, converted to JPEG) and the details
 * printed on the zoo's own information signs. Creates missing animals, updates existing ones by
 * name, and puts extra photos in each animal's gallery. Safe to run again: it updates in place.
 *
 *   npx tsx --env-file=../../.env ./src/importDrivePhotos.ts <folder with 001.jpg, 002.jpg…>
 */
const dir = process.argv[2];
if (!dir) { console.error("Usage: importDrivePhotos.ts <photo folder>"); process.exit(1); }

const BUCKET = "animal-photos";
const CAPTION = "Photo taken at Manila Zoo";
const CAT = { mammals: 1, reptiles: 2, birds: 3 };
// The zebra has its own exhibit (pin 24, formerly Elephant & Hippopotamus) since the Savana merged into the Savannah
const PIN = { apex: 27, aviary: 23, indoorReptiles: 29, outdoorReptiles: 28, primates: 30, zebra: 24 };

type Entry = {
  name: string;
  photo: number;            // main photo (file number)
  gallery?: number[];       // extra photos
  fields: Record<string, unknown>;
};

// Text comes from the zoo's signs unless noted; numbers are photo files from the shared folder
const ENTRIES: Entry[] = [
  {
    name: "White Bengal Tiger", photo: 18, gallery: [11],
    fields: {
      scientific_name: "Panthera tigris tigris", category_id: CAT.mammals, location_id: PIN.apex,
      conservation_status: "Endangered",
      description: "White Bengal Tigers are among the largest cats. They have black stripes, but their fur is white because of a mutation in the SLC45A2 gene, and they are known for their blue eyes. Their body is 152–182 cm long with a 60–91 cm tail, and they weigh about 108–226 kg. They are excellent swimmers thanks to their large muscles and webbed toes.",
      habitat: "Boreal forests, tropical and subtropical forests, shrublands, and grasslands",
      diet: "Carnivore: large mammals such as bovines, rhinos and elephants, plus smaller mammals, fish, birds, reptiles, insects and amphibians",
      interesting_facts: [
        "Mostly found in India, Bangladesh, Nepal, Bhutan, and China",
        "Solitary animals that hunt mostly at night and rest during the day",
        "Territorial: they scent-mark their territories to keep other animals away",
      ],
    },
  },
  {
    name: "Zebra", photo: 103, gallery: [2, 3],
    fields: {
      scientific_name: "Equus grevyi, Equus quagga, Equus zebra", category_id: CAT.mammals, location_id: PIN.zebra,
      description: "Zebras belong to the horse family. They have short manes and distinct black and white stripes, which help with social recognition and temperature regulation and create a \"dazzle\" effect that confuses predators. They live in herds, usually family groups of a stallion, several mares, and their offspring.",
      diet: "Herbivore: feeds mostly by grazing on grass",
      interesting_facts: ["Found in Eastern and Southern Africa"],
    },
  },
  {
    name: "Capybara", photo: 85, gallery: [31, 37, 99],
    fields: {
      scientific_name: "Hydrochoerus hydrochaeris", category_id: CAT.mammals, family: "Caviidae",
      description: "The capybara is the world's largest rodent and belongs to the family Caviidae, together with guinea pigs. Capybaras live in groups of 10–20 that can merge into herds of up to 100 in the dry season, and they talk to each other with barks, whistles, clicks, and purrs.",
      habitat: "Native to South America, near rivers, lakes, swamps, and marshes",
      diet: "Herbivore: grasses, aquatic plants, fruits, and tree bark",
      height_cm: 120, lifespan_years: 12,
      interesting_facts: [
        "Weighs 35–68 kg and grows up to 1.2 meters long",
        "Excellent swimmers that can stay underwater for up to five minutes",
        "Their teeth never stop growing",
        "Lives 6–10 years in the wild and up to 12 years in captivity",
      ],
    },
  },
  {
    name: "Burmese Python (Albino)", photo: 59, gallery: [9, 100],
    fields: {
      scientific_name: "Python bivittatus", category_id: CAT.reptiles, location_id: PIN.indoorReptiles,
      conservation_status: "Vulnerable",
      description: "One of the largest snakes in the world, growing from 365 cm up to 580 cm long. Albino Burmese pythons have white patterns in butterscotch yellow and burnt orange. They are usually docile in captivity but can also be aggressive.",
      habitat: "Forests and rainforests, wet rocky areas near small bodies of water, grasslands, marshes, streams and rivers",
      diet: "Carnivore: small mammals and birds",
      interesting_facts: ["Found across South and Southeast Asia and southern China; introduced in Singapore and the United States"],
    },
  },
  {
    name: "Burmese Python", photo: 81,
    fields: {
      scientific_name: "Python bivittatus", category_id: CAT.reptiles, location_id: PIN.indoorReptiles,
      conservation_status: "Vulnerable",
      description: "A python with a bold pattern of browns and yellows. Small spurs near its tail are remnants of hind limbs. It grows to about 20 feet (the record is 25 feet) and can weigh as much as 200 pounds; females are larger than males.",
      habitat: "Near water and semi-aquatic areas",
      diet: "Carnivore: small mammals, birds, reptiles, frogs and even fish, killed by constriction",
      interesting_facts: [
        "A nocturnal hunter that prowls for prey or waits by a water hole",
        "Found from India to southern China, the Malay Peninsula, and some islands of the East Indies",
      ],
    },
  },
  {
    name: "Philippine Long-tailed Macaque", photo: 45, gallery: [68, 70],
    fields: {
      scientific_name: "Macaca fascicularis philippensis", common_name: "Unggoy", category_id: CAT.mammals, location_id: PIN.primates,
      conservation_status: "Near Threatened",
      description: "The Philippine long-tailed macaque has fur ranging from gray to red-brown with a white underside, and the fur on its head forms a pointed crest. Males have cheek whiskers, while females have beards.",
      habitat: "Mangroves, coastal and riverine forests, and nipa swamps; also near towns and farmland",
      diet: "Omnivore: fruit, crabs, flowers, insects, leaves, grass, and clay",
      interesting_facts: [
        "Males weigh 3.5–8 kg and females 2.5–5.7 kg",
        "They eat clay for its potassium",
        "Found in the Philippines, Indochina, Malaysia, and Indonesia",
      ],
    },
  },
  {
    name: "Sailfin Water Lizard", photo: 79, gallery: [96, 66],
    fields: {
      scientific_name: "Hydrosaurus pustulatus", common_name: "Ibid", category_id: CAT.reptiles, location_id: PIN.indoorReptiles,
      conservation_status: "Least Concern",
      description: "Adults are usually 24–30 inches long (up to 36 inches). Males have large sail fins on the back and tail, while females have a fringe. Scale fringes on their toes let them run across the water on their hind legs.",
      habitat: "Rainforests, never far from water",
      diet: "Omnivore: fish, frogs, fruits, vegetables, and insects",
      interesting_facts: [
        "Found all over the Philippines except Palawan",
        "Has a visible \"third eye\" on top of its head that senses the sun's angle and is thought to help it find its way",
        "Young ones can run on top of the water for short distances",
      ],
    },
  },
  {
    name: "Sulcata Tortoise", photo: 40,
    fields: {
      scientific_name: "Centrochelys sulcata", common_name: "African Spurred Tortoise", category_id: CAT.reptiles, location_id: PIN.outdoorReptiles,
      conservation_status: "Endangered",
      description: "Also known as the African spurred tortoise, it is the third-largest tortoise species in the world. It has a brown to yellow shell, very thick yellowish-brown skin, and pointed scales or spurs on its legs.",
      habitat: "The Sahara region of Africa",
      diet: "Herbivore: grass, leafy greens, fruits, flowers, and plants including cactus pads",
    },
  },
  {
    name: "Elongated Tortoise", photo: 67, gallery: [48],
    fields: {
      scientific_name: "Indotestudo elongata", category_id: CAT.reptiles, location_id: PIN.indoorReptiles,
      // The zoo's sign says "Least Concern"; the IUCN Red List assesses this species as Critically Endangered
      conservation_status: "Critically Endangered",
      description: "A tortoise with a long, flattened shell that is greenish yellow, each shield usually marked with an irregular black spot or blotch.",
      habitat: "Mainly damp upland forests",
      diet: "Herbivore: grasses, fruits, vegetables, shrubs, leafy greens, and flowers; sometimes insects",
      interesting_facts: ["Found in India, Nepal, Bangladesh, Myanmar, Laos, Thailand, Cambodia, Vietnam, western Malaysia, and southern China"],
    },
  },
  {
    // No sign was photographed; these are well-established facts about the species
    name: "Brahminy Kite", photo: 111, gallery: [42, 50],
    fields: {
      scientific_name: "Haliastur indus", category_id: CAT.birds, location_id: PIN.aviary,
      conservation_status: "Least Concern",
      description: "A medium-sized bird of prey with a chestnut body and a white head and breast. It is one of the most common raptors in the Philippines.",
      habitat: "Coasts, mangroves, rivers, lakes, and rice fields",
      diet: "Carnivore: fish, crabs, frogs, and other small animals, as well as carrion",
    },
  },
  {
    name: "Celebes Crested Macaque", photo: 14, gallery: [24],
    fields: {
      scientific_name: "Macaca nigra", conservation_status: "Critically Endangered",
      description: "The Celebes crested macaque is an Old World monkey with a black face and body and a tuft of hair on its head that forms a crest. A pair of kidney-shaped, pink pads on its buttocks is also a prominent feature. They live in groups in rainforests at moderate elevations, usually where fruit is plentiful.",
      diet: "Fruits, and sometimes small vertebrates and insects",
      interesting_facts: ["Found in Indonesia"],
    },
  },
  {
    name: "Reticulated Python", photo: 60, gallery: [90, 107],
    fields: {
      habitat: "Grasslands and tropical rainforests, wetlands, near bodies of water, and moist highlands",
      diet: "Carnivore: small to medium mammals such as bats, tree shrews, deer and sun bears, as well as birds",
      interesting_facts: [
        "Females grow to about 609 cm and 90 kg; males to about 450 cm and 45 kg",
        "Moves in a straight line (rectilinear motion) when moving quickly",
        "Native to Southeast Asia; introduced in Africa and southern Florida",
      ],
    },
  },
];

const COLUMNS: Record<string, string> = {
  scientific_name: "scientific_name", common_name: "common_name", category_id: "category_id", location_id: "location_id",
  conservation_status: "conservation_status", description: "description", habitat: "habitat", diet: "diet",
  family: "family", height_cm: "height_cm", lifespan_years: "lifespan_years", interesting_facts: "interesting_facts",
  image_url: "image_url",
};

async function uploadPhoto(n: number): Promise<string> {
  const body = await readFile(path.join(dir!, `${String(n).padStart(3, "0")}.jpg`));
  const key = `zoo-visit/${randomUUID()}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(key, body, { contentType: "image/jpeg", cacheControl: "31536000" });
  if (error) throw new Error(`Upload of photo ${n} failed: ${error.message}`);
  return supabase.storage.from(BUCKET).getPublicUrl(key).data.publicUrl;
}

async function main() {
  // Same public bucket the admin upload uses
  const { data: bucket } = await supabase.storage.getBucket(BUCKET);
  if (!bucket) {
    const { error } = await supabase.storage.createBucket(BUCKET, { public: true, fileSizeLimit: 6 * 1024 * 1024, allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"] });
    if (error && !/already exists/i.test(error.message)) throw error;
  }

  for (const e of ENTRIES) {
    const values: Record<string, unknown> = { ...e.fields, image_url: await uploadPhoto(e.photo) };
    const cols = Object.keys(values).map(k => COLUMNS[k]!);
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
      console.log(`created  ${e.name} (#${id})`);
    }

    // Replace this import's gallery photos (keeps any added by hand)
    await pool.query("DELETE FROM animal_gallery WHERE animal_id = $1 AND caption = $2", [id, CAPTION]);
    let order = 0;
    for (const n of [e.photo, ...(e.gallery ?? [])]) {
      const url = n === e.photo ? values["image_url"] : await uploadPhoto(n);
      await pool.query("INSERT INTO animal_gallery (animal_id, image_url, caption, sort_order) VALUES ($1, $2, $3, $4)", [id, url, CAPTION, order++]);
    }
  }
  await pool.end();
  console.log("done");
}

main().catch(err => { console.error(err); process.exit(1); });
