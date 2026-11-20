import { db, pool, categoriesTable, mapPinsTable, animalsTable, faqTable, eventsTable, announcementsTable, mapConfigTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { ensureMapLayoutSchema } from "./lib/mapSchema";
import { ZOO_PINS, ZOO_MAP_CONFIG, ANIMAL_LOCATIONS } from "./data/manilaZooLayout";

async function run() {
  console.log("Creating extra tables if needed...");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS animal_gallery (
      id SERIAL PRIMARY KEY,
      animal_id INTEGER REFERENCES animals(id) ON DELETE CASCADE,
      image_url TEXT NOT NULL,
      caption TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  console.log("Seeding categories...");
  const catRows = await db.insert(categoriesTable).values([
    { name: "Mammals", description: "Warm-blooded vertebrates with hair or fur", icon: "paw-print", color: "#F4A261" },
    { name: "Reptiles", description: "Cold-blooded vertebrates with scales", icon: "egg", color: "#52B788" },
    { name: "Birds", description: "Feathered vertebrates with wings", icon: "bird", color: "#74C0FC" },
    { name: "Amphibians", description: "Animals that live on land and in water", icon: "droplets", color: "#96CEB4" },
    { name: "Fish", description: "Aquatic vertebrates with gills and fins", icon: "fish", color: "#3D9BE9" },
    { name: "Insects", description: "Six-legged invertebrates", icon: "bug", color: "#F9C74F" },
  ]).onConflictDoNothing().returning();
  console.log(`Categories: ${catRows.length} inserted`);

  const allCats = await db.select().from(categoriesTable);
  const catMap = Object.fromEntries(allCats.map(c => [c.name, c.id]));

  console.log("Seeding map pins...");
  const pinRows = await db.insert(mapPinsTable).values(ZOO_PINS.map(p => ({
    name: p.name, pinType: p.pinType, lat: String(p.lat), lng: String(p.lng), description: p.description, isActive: true,
  }))).onConflictDoNothing().returning();
  console.log(`Map pins: ${pinRows.length} inserted`);

  const allPins = await db.select().from(mapPinsTable);
  const pinMap = Object.fromEntries(allPins.map(p => [p.name, p.id]));

  console.log("Seeding animals...");
  const animalData: (typeof animalsTable.$inferInsert)[] = [
    { name: "African Lion", scientificName: "Panthera leo", commonName: "Lion", categoryId: catMap["Mammals"], kingdom: "Animalia", phylum: "Chordata", class: "Mammalia", order: "Carnivora", family: "Felidae", genus: "Panthera", species: "leo", habitat: "Savanna and grassland", diet: "Carnivore", weightKg: "190", heightCm: "120", lifespanYears: "16", conservationStatus: "Vulnerable", description: "The African lion is the largest wild cat in Africa and the second largest in the world.", interestingFacts: ["Lions are the only cats that live in groups called prides", "A lion's roar can be heard up to 8 km away", "Female lions do most of the hunting"], feedingSchedule: "Daily at 10:00 AM and 3:00 PM", imageUrl: "/animals/african-lion.jpg", locationId: pinMap[ANIMAL_LOCATIONS["African Lion"]!], isFeatured: true, viewCount: 1500 },
    { name: "Reticulated Python", scientificName: "Malayopython reticulatus", commonName: "Python", categoryId: catMap["Reptiles"], kingdom: "Animalia", phylum: "Chordata", class: "Reptilia", order: "Squamata", family: "Pythonidae", genus: "Malayopython", species: "reticulatus", habitat: "Tropical rainforests", diet: "Carnivore", weightKg: "75", lifespanYears: "25", conservationStatus: "Least Concern", description: "The reticulated python is the world's longest snake, native to Southeast Asia.", interestingFacts: ["World's longest snake", "Excellent swimmers", "Native to the Philippines"], feedingSchedule: "Weekly on Wednesdays at 2:00 PM", imageUrl: "/animals/reticulated-python.jpg", locationId: pinMap[ANIMAL_LOCATIONS["Reticulated Python"]!], isFeatured: true, viewCount: 890 },
    { name: "Philippine Eagle", scientificName: "Pithecophaga jefferyi", commonName: "Agila ng Pilipinas", categoryId: catMap["Birds"], kingdom: "Animalia", phylum: "Chordata", class: "Aves", order: "Accipitriformes", family: "Accipitridae", genus: "Pithecophaga", species: "jefferyi", habitat: "Tropical forests", diet: "Carnivore", weightKg: "8", heightCm: "100", lifespanYears: "60", conservationStatus: "Critically Endangered", description: "The Philippine Eagle is the national bird of the Philippines and one of the largest eagles in the world.", interestingFacts: ["National bird of the Philippines", "One of the rarest birds in the world", "Can live up to 60 years in captivity"], feedingSchedule: "Daily at 11:00 AM", imageUrl: "/animals/philippine-eagle.jpg", locationId: pinMap[ANIMAL_LOCATIONS["Philippine Eagle"]!], isFeatured: true, viewCount: 2100 },
    { name: "Saltwater Crocodile", scientificName: "Crocodylus porosus", commonName: "Buwaya", categoryId: catMap["Reptiles"], kingdom: "Animalia", phylum: "Chordata", class: "Reptilia", order: "Crocodilia", family: "Crocodylidae", genus: "Crocodylus", species: "porosus", habitat: "Coastal waters and rivers", diet: "Carnivore", weightKg: "450", lifespanYears: "70", conservationStatus: "Least Concern", description: "The saltwater crocodile is the largest living reptile.", interestingFacts: ["Largest living reptile", "Can swim far into the ocean", "Found in Southeast Asia and Australia"], feedingSchedule: "Tuesdays and Fridays at 2:30 PM", imageUrl: "/animals/saltwater-crocodile.jpg", locationId: pinMap[ANIMAL_LOCATIONS["Saltwater Crocodile"]!], isFeatured: false, viewCount: 760 },
    { name: "Philippine Eagle Owl", scientificName: "Bubo philippensis", commonName: "Kuwago", categoryId: catMap["Birds"], kingdom: "Animalia", phylum: "Chordata", class: "Aves", order: "Strigiformes", family: "Strigidae", genus: "Bubo", species: "philippensis", habitat: "Lowland forests", diet: "Carnivore", weightKg: "0.8", heightCm: "50", lifespanYears: "20", conservationStatus: "Vulnerable", description: "A large owl endemic to the Philippines, known for its impressive ear tufts.", interestingFacts: ["Endemic to the Philippines", "Active at night", "Excellent night vision"], feedingSchedule: "Evenings at 6:00 PM", imageUrl: "/animals/philippine-eagle-owl.jpg", locationId: pinMap[ANIMAL_LOCATIONS["Philippine Eagle Owl"]!], isFeatured: false, viewCount: 430 },
    { name: "Common Tree Monitor", scientificName: "Varanus salvator", commonName: "Bayawak", categoryId: catMap["Reptiles"], kingdom: "Animalia", phylum: "Chordata", class: "Reptilia", order: "Squamata", family: "Varanidae", genus: "Varanus", species: "salvator", habitat: "Forests and wetlands", diet: "Carnivore", weightKg: "19.5", lifespanYears: "12", conservationStatus: "Least Concern", description: "A large monitor lizard native to South and Southeast Asia.", interestingFacts: ["Excellent swimmer and climber", "Forked tongue detects prey", "Common throughout Southeast Asia"], feedingSchedule: "Tuesdays and Thursdays at 11:00 AM", imageUrl: "/animals/common-tree-monitor.jpg", locationId: pinMap[ANIMAL_LOCATIONS["Common Tree Monitor"]!], isFeatured: false, viewCount: 290 },
    { name: "Red-footed Tortoise", scientificName: "Chelonoidis carbonarius", commonName: "Pagong", categoryId: catMap["Reptiles"], kingdom: "Animalia", phylum: "Chordata", class: "Reptilia", order: "Testudines", family: "Testudinidae", genus: "Chelonoidis", species: "carbonarius", habitat: "Tropical forests and savannas", diet: "Herbivore", weightKg: "9", heightCm: "30", lifespanYears: "50", conservationStatus: "Vulnerable", description: "A medium-sized tortoise from South America.", interestingFacts: ["Named for their distinctive red scales", "Excellent diggers", "Omnivorous in the wild"], feedingSchedule: "Daily at 9:00 AM", imageUrl: "/animals/red-footed-tortoise.jpg", locationId: pinMap[ANIMAL_LOCATIONS["Red-footed Tortoise"]!], isFeatured: false, viewCount: 340 },
    { name: "Philippine Cockatoo", scientificName: "Cacatua haematuropygia", commonName: "Kalangay", categoryId: catMap["Birds"], kingdom: "Animalia", phylum: "Chordata", class: "Aves", order: "Psittaciformes", family: "Cacatuidae", genus: "Cacatua", species: "haematuropygia", habitat: "Forests near water", diet: "Herbivore", weightKg: "0.3", heightCm: "32", lifespanYears: "40", conservationStatus: "Critically Endangered", description: "The Philippine cockatoo is a critically endangered parrot endemic to the Philippines.", interestingFacts: ["Endemic to the Philippines", "Highly intelligent and social", "Can mimic human speech"], feedingSchedule: "Daily at 9:30 AM", imageUrl: "/animals/philippine-cockatoo.jpg", locationId: pinMap[ANIMAL_LOCATIONS["Philippine Cockatoo"]!], isFeatured: false, viewCount: 580 },
  ];
  const animalRows = await db.insert(animalsTable).values(animalData).onConflictDoNothing().returning();
  console.log(`Animals: ${animalRows.length} inserted`);

  console.log("Seeding FAQ...");
  await db.insert(faqTable).values([
    { question: "What are the opening hours?", answer: "Manila Zoo is open every day.\n• Tuesdays to Sundays: 9:00 AM – 8:00 PM\n• Holidays: 9:00 AM – 8:00 PM\n• Mondays (including Monday holidays): 11:00 AM – 8:00 PM\nLast entry of visitors is at 6:00 PM.", category: "general", language: "en", isActive: true },
    { question: "How much is the entrance fee?", answer: "Admission rates (updated September 14, 2023), Manila residents / non-Manila residents:\n• Adults and children 3 years old and above: ₱150 / ₱300\n• Students: ₱100 / ₱200\n• Senior citizens and PWDs (20% discount): ₱120 / ₱240\n• Children 2 years old and below: free (no registration needed)\n• Manila LGU employees and teachers under the Manila Division of City Schools: ₱100\nSenior citizens of Manila with a valid OSCA ID visit free every Wednesday.\nDiscounted visitors must show a valid ID at the entrance (Manila residents: an ID with a Manila address).", category: "tickets", language: "en", isActive: true },
    { question: "Is there parking available?", answer: "Yes, parking is available at the main entrance along Adriatico Street, Malate, Manila.", category: "facilities", language: "en", isActive: true },
    { question: "Are pets allowed?", answer: "No, pets are not allowed inside Manila Zoo to ensure the safety and comfort of zoo animals.", category: "rules", language: "en", isActive: true },
    { question: "Where can I get food?", answer: "You can buy meals and drinks at the Food Court and the Plaza Restaurant. Outside food and drinks are not allowed inside the zoo.", category: "facilities", language: "en", isActive: true },
    { question: "Anong oras bukas ang Manila Zoo?", answer: "Bukas ang Manila Zoo araw-araw.\n• Martes hanggang Linggo: 9:00 AM – 8:00 PM\n• Mga holiday: 9:00 AM – 8:00 PM\n• Lunes (kasama ang holiday na tumapat sa Lunes): 11:00 AM – 8:00 PM\nAng huling pagpasok ng mga bisita ay 6:00 PM.", category: "general", language: "fil", isActive: true },
    { question: "Magkano ang pasok sa Manila Zoo?", answer: "Presyo ng pagpasok (na-update noong Setyembre 14, 2023), residente ng Maynila / hindi residente ng Maynila:\n• Matatanda at mga batang 3 taong gulang pataas: ₱150 / ₱300\n• Mga estudyante: ₱100 / ₱200\n• Senior citizen at PWD (20% diskwento): ₱120 / ₱240\n• Mga batang 2 taong gulang pababa: libre (hindi kailangang magparehistro)\n• Mga empleyado ng Manila LGU at guro sa ilalim ng Manila Division of City Schools: ₱100\nLibre ang mga senior citizen ng Maynila na may valid OSCA ID tuwing Miyerkules.\nPaalala: Ang mga may diskwentong bisita ay kinakailangang magpakita ng kanilang valid ID bago pumasok ng Manila Zoo.", category: "tickets", language: "fil", isActive: true },
    { question: "Are wheelchairs available?", answer: "Yes, wheelchairs are available at the entrance for PWDs. Please inform our staff at the ticketing booth.", category: "facilities", language: "en", isActive: true },
  ]).onConflictDoNothing();
  console.log("FAQ seeded");

  console.log("Seeding events...");
  const now = new Date();
  await db.insert(eventsTable).values([
    { title: "Weekend Animal Feeding Show", description: "Watch our zookeepers feed the lions, elephants, and other animals up close!", startDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 3, 10, 0), endDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 3, 12, 0), location: "Apex Predators", imageUrl: "https://images.unsplash.com/photo-1474511320723-9a56873867b5?w=600", isActive: true },
    { title: "Philippine Eagle Conservation Talk", description: "Learn about the critically endangered Philippine Eagle and conservation efforts.", startDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7, 14, 0), endDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7, 15, 30), location: "Aviary", imageUrl: "/animals/philippine-eagle.jpg", isActive: true },
    { title: "Kids Zoo Camp", description: "An educational camp for children aged 6-12 to learn about animals and conservation.", startDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 14, 8, 0), endDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 14, 17, 0), location: "Education Center", imageUrl: "https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=600", isActive: true },
    { title: "Night Zoo Safari", description: "Experience the zoo at night! See nocturnal animals in their active state.", startDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 10, 18, 0), endDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 10, 21, 0), location: "Entire Zoo", imageUrl: "https://images.unsplash.com/photo-1534567153574-2b12153a87f0?w=600", isActive: true },
  ]).onConflictDoNothing();
  console.log("Events seeded");

  console.log("Seeding announcements...");
  await db.insert(announcementsTable).values([
    { title: "New Philippine Eagle Exhibit Open!", content: "Visit our newly renovated Philippine Eagle habitat featuring interactive educational panels.", type: "info", isActive: true },
    { title: "Construction Notice", content: "The north pathway near the Aquatic Center is temporarily closed for renovation. Please use alternate routes.", type: "warning", isActive: true },
    { title: "Free Admission for Kids This Sunday!", content: "Children 12 and below enter free every Sunday in July. Bring the whole family!", type: "success", isActive: true },
  ]).onConflictDoNothing();
  console.log("Announcements seeded");

  // Runs after pins are seeded (footprints link to pins) and before map_config, which needs the new columns
  console.log("Seeding map layout...");
  await ensureMapLayoutSchema();
  console.log("Map layout ready");

  console.log("Seeding map config...");
  const [existingConfig] = await db.select().from(mapConfigTable).limit(1);
  if (!existingConfig) {
    await db.insert(mapConfigTable).values({
      mapImageUrl: "", centerLat: String(ZOO_MAP_CONFIG.centerLat), centerLng: String(ZOO_MAP_CONFIG.centerLng), defaultZoom: ZOO_MAP_CONFIG.defaultZoom,
    });
    console.log("Map config seeded");
  } else {
    console.log("Map config already exists, skipping");
  }

  console.log("\n✅ Migration complete!");
  await pool.end();
  process.exit(0);
}

run().catch(err => {
  console.error("Migration failed:", err);
  process.exit(1);
});
