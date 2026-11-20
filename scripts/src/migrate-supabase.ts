import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env["VITE_SUPABASE_URL"];
const supabaseServiceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function run() {
  console.log("Applying Manila Zoo schema to Supabase...");

  // Test connection first
  const { error: connErr } = await supabase.rpc("version");
  if (connErr && !connErr.message.includes("Could not find")) {
    console.error("Connection error:", connErr.message);
  }

  // Seed categories
  const categories = [
    { name: "Mammals", description: "Warm-blooded vertebrates with hair or fur", icon: "paw-print", color: "#F4A261" },
    { name: "Reptiles", description: "Cold-blooded vertebrates with scales", icon: "egg", color: "#52B788" },
    { name: "Birds", description: "Feathered vertebrates with wings", icon: "bird", color: "#74C0FC" },
    { name: "Amphibians", description: "Animals that live on land and in water", icon: "droplets", color: "#96CEB4" },
    { name: "Fish", description: "Aquatic vertebrates with gills and fins", icon: "fish", color: "#3D9BE9" },
    { name: "Insects", description: "Six-legged invertebrates", icon: "bug", color: "#F9C74F" },
  ];

  for (const cat of categories) {
    const { error } = await supabase.from("categories").upsert(cat, { onConflict: "name", ignoreDuplicates: true });
    if (error) console.error("Category error:", cat.name, error.message);
    else console.log("Category OK:", cat.name);
  }

  // Seed map pins
  const mapPins = [
    { name: "Main Entrance", pin_type: "entrance", lat: 14.56350, lng: 121.01620, description: "Zoo main entrance and ticketing area", color: "#2D6A4F", icon: "door-open", is_active: true },
    { name: "Reptile House", pin_type: "building", lat: 14.56300, lng: 121.01680, description: "Home to crocodiles, pythons, and lizards", color: "#52B788", icon: "building", is_active: true },
    { name: "Bird Sanctuary", pin_type: "building", lat: 14.56250, lng: 121.01720, description: "Various bird species", color: "#74C0FC", icon: "bird", is_active: true },
    { name: "African Savanna", pin_type: "building", lat: 14.56200, lng: 121.01650, description: "Lions, giraffes, and other African animals", color: "#F4A261", icon: "building", is_active: true },
    { name: "Restroom A", pin_type: "restroom", lat: 14.56330, lng: 121.01660, description: "Restroom near main entrance", color: "#ADB5BD", icon: "restroom", is_active: true },
    { name: "Restroom B", pin_type: "restroom", lat: 14.56230, lng: 121.01700, description: "Restroom near bird sanctuary", color: "#ADB5BD", icon: "restroom", is_active: true },
    { name: "Food Stall", pin_type: "food_stall", lat: 14.56280, lng: 121.01630, description: "Food and beverage stalls", color: "#FF9F1C", icon: "utensils", is_active: true },
    { name: "First Aid Station", pin_type: "emergency", lat: 14.56320, lng: 121.01640, description: "First aid and emergency services", color: "#E63946", icon: "heart-pulse", is_active: true },
    { name: "South Exit", pin_type: "exit", lat: 14.56170, lng: 121.01680, description: "Emergency exit — south side", color: "#6C757D", icon: "sign-out", is_active: true },
    { name: "Aquatic Center", pin_type: "building", lat: 14.56240, lng: 121.01750, description: "Fish, amphibians, and aquatic exhibits", color: "#3D9BE9", icon: "building", is_active: true },
  ];

  for (const pin of mapPins) {
    const { error } = await supabase.from("map_pins").upsert(pin, { onConflict: "name", ignoreDuplicates: true });
    if (error) console.error("Map pin error:", pin.name, error.message);
    else console.log("Map pin OK:", pin.name);
  }

  // Get category IDs
  const { data: cats } = await supabase.from("categories").select("id, name");
  const catMap = Object.fromEntries((cats || []).map((c: { id: number; name: string }) => [c.name, c.id]));

  // Get map pin IDs
  const { data: pins } = await supabase.from("map_pins").select("id, name");
  const pinMap = Object.fromEntries((pins || []).map((p: { id: number; name: string }) => [p.name, p.id]));

  // Seed animals
  const animals = [
    {
      name: "African Lion", scientific_name: "Panthera leo", common_name: "Lion",
      category_id: catMap["Mammals"], kingdom: "Animalia", phylum: "Chordata", class: "Mammalia",
      order: "Carnivora", family: "Felidae", genus: "Panthera", species: "leo",
      habitat: "Savanna and grassland", diet: "Carnivore", weight_kg: 190, height_cm: 120, lifespan_years: 16,
      conservation_status: "Vulnerable",
      description: "The African lion is the largest wild cat in Africa and the second largest in the world.",
      interesting_facts: ["Lions are the only cats that live in groups called prides", "A lion's roar can be heard up to 8 km away", "Female lions do most of the hunting"],
      feeding_schedule: "Daily at 10:00 AM and 3:00 PM",
      image_url: "https://images.unsplash.com/photo-1546182990-dffeafbe841d?w=600",
      location_id: pinMap["African Savanna"], is_featured: true, view_count: 1500,
    },
    {
      name: "Reticulated Python", scientific_name: "Malayopython reticulatus", common_name: "Python",
      category_id: catMap["Reptiles"], kingdom: "Animalia", phylum: "Chordata", class: "Reptilia",
      order: "Squamata", family: "Pythonidae", genus: "Malayopython", species: "reticulatus",
      habitat: "Tropical rainforests", diet: "Carnivore", weight_kg: 75, height_cm: 200, lifespan_years: 25,
      conservation_status: "Least Concern",
      description: "The reticulated python is the world's longest snake, native to Southeast Asia.",
      interesting_facts: ["World's longest snake", "Excellent swimmers", "Native to the Philippines"],
      feeding_schedule: "Weekly on Wednesdays at 2:00 PM",
      image_url: "https://images.unsplash.com/photo-1531386151447-fd76ad50012f?w=600",
      location_id: pinMap["Reptile House"], is_featured: true, view_count: 890,
    },
    {
      name: "Philippine Eagle", scientific_name: "Pithecophaga jefferyi", common_name: "Agila ng Pilipinas",
      category_id: catMap["Birds"], kingdom: "Animalia", phylum: "Chordata", class: "Aves",
      order: "Accipitriformes", family: "Accipitridae", genus: "Pithecophaga", species: "jefferyi",
      habitat: "Tropical forests", diet: "Carnivore", weight_kg: 8, height_cm: 100, lifespan_years: 60,
      conservation_status: "Critically Endangered",
      description: "The Philippine Eagle is the national bird of the Philippines and one of the largest eagles in the world.",
      interesting_facts: ["National bird of the Philippines", "One of the rarest birds in the world", "Can live up to 60 years in captivity"],
      feeding_schedule: "Daily at 11:00 AM",
      image_url: "https://images.unsplash.com/photo-1611273426858-450d8e3c9fce?w=600",
      location_id: pinMap["Bird Sanctuary"], is_featured: true, view_count: 2100,
    },
    {
      name: "Saltwater Crocodile", scientific_name: "Crocodylus porosus", common_name: "Buwaya",
      category_id: catMap["Reptiles"], kingdom: "Animalia", phylum: "Chordata", class: "Reptilia",
      order: "Crocodilia", family: "Crocodylidae", genus: "Crocodylus", species: "porosus",
      habitat: "Coastal waters and rivers", diet: "Carnivore", weight_kg: 450, height_cm: 250, lifespan_years: 70,
      conservation_status: "Least Concern",
      description: "The saltwater crocodile is the largest living reptile and the largest riparian predator in the world.",
      interesting_facts: ["Largest living reptile", "Can swim far into the ocean", "Found in Southeast Asia and Australia"],
      feeding_schedule: "Tuesdays and Fridays at 2:30 PM",
      image_url: "https://images.unsplash.com/photo-1611154172018-f89d4c0c6c4e?w=600",
      location_id: pinMap["Reptile House"], is_featured: false, view_count: 760,
    },
    {
      name: "Sun Bear", scientific_name: "Helarctos malayanus", common_name: "Honey Bear",
      category_id: catMap["Mammals"], kingdom: "Animalia", phylum: "Chordata", class: "Mammalia",
      order: "Carnivora", family: "Ursidae", genus: "Helarctos", species: "malayanus",
      habitat: "Tropical forests", diet: "Omnivore", weight_kg: 65, height_cm: 70, lifespan_years: 25,
      conservation_status: "Vulnerable",
      description: "The sun bear is the smallest bear species, native to Southeast Asia, known for its distinctive chest patch.",
      interesting_facts: ["Smallest bear in the world", "Loves eating honey", "Has the longest tongue of any bear species"],
      feeding_schedule: "Daily at 8:00 AM and 4:00 PM",
      image_url: "https://images.unsplash.com/photo-1564349683136-77e08dba1ef3?w=600",
      location_id: pinMap["African Savanna"], is_featured: true, view_count: 1200,
    },
    {
      name: "Brahminy Kite", scientific_name: "Haliastur indus", common_name: "Lawin",
      category_id: catMap["Birds"], kingdom: "Animalia", phylum: "Chordata", class: "Aves",
      order: "Accipitriformes", family: "Accipitridae", genus: "Haliastur", species: "indus",
      habitat: "Coastal areas and wetlands", diet: "Carnivore", weight_kg: 0.45, height_cm: 48, lifespan_years: 26,
      conservation_status: "Least Concern",
      description: "A bird of prey with distinctive reddish-brown plumage and white head, common in Southeast Asia.",
      interesting_facts: ["Symbol of Langkawi island", "Feeds mainly on fish", "Sacred to Hindu communities"],
      feeding_schedule: "Daily at 10:30 AM",
      image_url: "https://images.unsplash.com/photo-1544984243-ec57ea16fe25?w=600",
      location_id: pinMap["Bird Sanctuary"], is_featured: false, view_count: 450,
    },
    {
      name: "Philippine Cockatoo", scientific_name: "Cacatua haematuropygia", common_name: "Kalangay",
      category_id: catMap["Birds"], kingdom: "Animalia", phylum: "Chordata", class: "Aves",
      order: "Psittaciformes", family: "Cacatuidae", genus: "Cacatua", species: "haematuropygia",
      habitat: "Forests near water", diet: "Herbivore", weight_kg: 0.3, height_cm: 32, lifespan_years: 40,
      conservation_status: "Critically Endangered",
      description: "The Philippine cockatoo is a critically endangered parrot endemic to the Philippines.",
      interesting_facts: ["Endemic to the Philippines", "Highly intelligent and social", "Can mimic human speech"],
      feeding_schedule: "Daily at 9:30 AM",
      image_url: "https://images.unsplash.com/photo-1548767797-d8c844163c4a?w=600",
      location_id: pinMap["Bird Sanctuary"], is_featured: false, view_count: 580,
    },
    {
      name: "Asian Elephant", scientific_name: "Elephas maximus", common_name: "Elepante",
      category_id: catMap["Mammals"], kingdom: "Animalia", phylum: "Chordata", class: "Mammalia",
      order: "Proboscidea", family: "Elephantidae", genus: "Elephas", species: "maximus",
      habitat: "Forests and grasslands", diet: "Herbivore", weight_kg: 5000, height_cm: 280, lifespan_years: 60,
      conservation_status: "Endangered",
      description: "The Asian elephant is the largest land animal in Asia, known for its intelligence and social behavior.",
      interesting_facts: ["Largest land animal in Asia", "Highly intelligent with strong memory", "Live in matriarchal herds"],
      feeding_schedule: "Daily at 8:30 AM and 3:30 PM",
      image_url: "https://images.unsplash.com/photo-1557050543-4d5f4e07ef46?w=600",
      location_id: pinMap["African Savanna"], is_featured: true, view_count: 1800,
    },
    {
      name: "Common Tree Monitor", scientific_name: "Varanus salvator", common_name: "Bayawak",
      category_id: catMap["Reptiles"], kingdom: "Animalia", phylum: "Chordata", class: "Reptilia",
      order: "Squamata", family: "Varanidae", genus: "Varanus", species: "salvator",
      habitat: "Forests and wetlands", diet: "Carnivore", weight_kg: 19.5, height_cm: 70, lifespan_years: 12,
      conservation_status: "Least Concern",
      description: "A large monitor lizard native to South and Southeast Asia, excellent swimmer and climber.",
      interesting_facts: ["Excellent swimmer and climber", "Forked tongue detects prey", "Common throughout Southeast Asia"],
      feeding_schedule: "Tuesdays and Thursdays at 11:00 AM",
      image_url: "https://images.unsplash.com/photo-1557201501-2e2e98bcec8f?w=600",
      location_id: pinMap["Reptile House"], is_featured: false, view_count: 290,
    },
    {
      name: "Red-footed Tortoise", scientific_name: "Chelonoidis carbonarius", common_name: "Tortoise",
      category_id: catMap["Reptiles"], kingdom: "Animalia", phylum: "Chordata", class: "Reptilia",
      order: "Testudines", family: "Testudinidae", genus: "Chelonoidis", species: "carbonarius",
      habitat: "Tropical forests and savannas", diet: "Herbivore", weight_kg: 9, height_cm: 30, lifespan_years: 50,
      conservation_status: "Vulnerable",
      description: "A medium-sized tortoise from South America, popular in zoos for its distinctive red-scaled feet.",
      interesting_facts: ["Named for their distinctive red scales", "Excellent diggers", "Omnivorous in the wild"],
      feeding_schedule: "Daily at 9:00 AM",
      image_url: "https://images.unsplash.com/photo-1559715541-5daf8a0296d0?w=600",
      location_id: pinMap["Reptile House"], is_featured: false, view_count: 340,
    },
  ];

  for (const animal of animals) {
    const { error } = await supabase.from("animals").upsert(animal, { onConflict: "name", ignoreDuplicates: true });
    if (error) console.error("Animal error:", animal.name, error.message);
    else console.log("Animal OK:", animal.name);
  }

  // Update map pins with animal references
  const { data: animalRows } = await supabase.from("animals").select("id, name");
  const animalMap = Object.fromEntries((animalRows || []).map((a: { id: number; name: string }) => [a.name, a.id]));

  if (pinMap["African Savanna"] && animalMap["African Lion"]) {
    await supabase.from("map_pins").update({ animal_id: animalMap["African Lion"] }).eq("id", pinMap["African Savanna"]);
  }
  if (pinMap["Bird Sanctuary"] && animalMap["Philippine Eagle"]) {
    await supabase.from("map_pins").update({ animal_id: animalMap["Philippine Eagle"] }).eq("id", pinMap["Bird Sanctuary"]);
  }

  // Map config
  const { data: existingConfig } = await supabase.from("map_config").select("id").limit(1).single();
  if (!existingConfig) {
    await supabase.from("map_config").insert({ map_image_url: "", center_lat: 14.5632, center_lng: 121.0167, default_zoom: 17 });
    console.log("Map config OK");
  } else {
    console.log("Map config already exists");
  }

  // FAQ
  const faqs = [
    { question: "What are the zoo opening hours?", answer: "Manila Zoo is open every day.\n• Tuesdays to Sundays: 9:00 AM – 8:00 PM\n• Holidays: 9:00 AM – 8:00 PM\n• Mondays (including Monday holidays): 11:00 AM – 8:00 PM\nLast entry of visitors is at 6:00 PM.", category: "general", language: "en", is_active: true },
    { question: "How much are the admission tickets?", answer: "Admission rates (updated September 14, 2023), Manila residents / non-Manila residents:\n• Adults and children 3 years old and above: ₱150 / ₱300\n• Students: ₱100 / ₱200\n• Senior citizens and PWDs (20% discount): ₱120 / ₱240\n• Children 2 years old and below: free (no registration needed)\n• Manila LGU employees and teachers under the Manila Division of City Schools: ₱100\nSenior citizens of Manila with a valid OSCA ID visit free every Wednesday.\nDiscounted visitors must show a valid ID at the entrance (Manila residents: an ID with a Manila address).", category: "tickets", language: "en", is_active: true },
    { question: "Is there parking available?", answer: "Yes, parking is available at the main entrance along Adriatico Street, Malate, Manila.", category: "facilities", language: "en", is_active: true },
    { question: "Where are the restrooms located?", answer: "Restrooms are located near the main entrance, central plaza, and near the bird sanctuary.", category: "facilities", language: "en", is_active: true },
    { question: "Are strollers allowed inside?", answer: "Yes, strollers are allowed. Pathways are accessible for strollers and wheelchairs.", category: "accessibility", language: "en", is_active: true },
    { question: "Can I bring outside food?", answer: "Guests may bring light snacks. Alcoholic beverages and glass containers are not permitted.", category: "general", language: "en", is_active: true },
    { question: "Anong oras bukas ang Manila Zoo?", answer: "Bukas ang Manila Zoo araw-araw.\n• Martes hanggang Linggo: 9:00 AM – 8:00 PM\n• Mga holiday: 9:00 AM – 8:00 PM\n• Lunes (kasama ang holiday na tumapat sa Lunes): 11:00 AM – 8:00 PM\nAng huling pagpasok ng mga bisita ay 6:00 PM.", category: "general", language: "fil", is_active: true },
    { question: "Magkano ang ticket sa Manila Zoo?", answer: "Presyo ng pagpasok (na-update noong Setyembre 14, 2023), residente ng Maynila / hindi residente ng Maynila:\n• Matatanda at mga batang 3 taong gulang pataas: ₱150 / ₱300\n• Mga estudyante: ₱100 / ₱200\n• Senior citizen at PWD (20% diskwento): ₱120 / ₱240\n• Mga batang 2 taong gulang pababa: libre (hindi kailangang magparehistro)\n• Mga empleyado ng Manila LGU at guro sa ilalim ng Manila Division of City Schools: ₱100\nLibre ang mga senior citizen ng Maynila na may valid OSCA ID tuwing Miyerkules.\nPaalala: Ang mga may diskwentong bisita ay kinakailangang magpakita ng kanilang valid ID bago pumasok ng Manila Zoo.", category: "tickets", language: "fil", is_active: true },
    { question: "Saan matatagpuan ang comfort rooms?", answer: "Ang mga comfort room ay matatagpuan malapit sa main entrance, central plaza, at malapit sa bird sanctuary.", category: "facilities", language: "fil", is_active: true },
    { question: "Maaari bang magdala ng pagkain sa loob?", answer: "Maaaring magdala ng magaang na merienda. Ipinagbabawal ang mga alcoholic beverages at glass containers.", category: "general", language: "fil", is_active: true },
  ];
  for (const faq of faqs) {
    const { error } = await supabase.from("faq").upsert(faq, { onConflict: "question", ignoreDuplicates: true });
    if (error) console.error("FAQ error:", faq.question.slice(0, 30), error.message);
    else console.log("FAQ OK:", faq.question.slice(0, 40));
  }

  // Announcements
  const announcements = [
    { title: "Welcome to Manila Zoo!", content: "Experience the wonders of wildlife in the heart of Manila. Use our interactive map to explore!", type: "info", is_active: true },
    { title: "New Animal Exhibit Opening", content: "Visit our newly renovated Reptile House with 5 new species!", type: "success", is_active: true },
    { title: "Zoo Hours Notice", content: "The zoo will be closed for maintenance every first Monday of the month.", type: "warning", is_active: true },
  ];
  for (const ann of announcements) {
    const { error } = await supabase.from("announcements").upsert(ann, { onConflict: "title", ignoreDuplicates: true });
    if (error) console.error("Announcement error:", ann.title, error.message);
    else console.log("Announcement OK:", ann.title);
  }

  // Events
  const now = new Date();
  const events = [
    { title: "Animal Feeding Show", description: "Watch our keepers feed the lions up close!", start_date: new Date(now.getTime() + 2 * 86400000).toISOString(), end_date: new Date(now.getTime() + 2 * 86400000 + 3600000).toISOString(), location: "African Savanna", is_active: true },
    { title: "Educational Talk: Philippine Eagles", description: "Learn about the endangered Philippine Eagle and conservation efforts.", start_date: new Date(now.getTime() + 5 * 86400000).toISOString(), end_date: new Date(now.getTime() + 5 * 86400000 + 7200000).toISOString(), location: "Bird Sanctuary", is_active: true },
    { title: "Junior Zookeeper Day", description: "Kids get to assist zookeepers in daily animal care activities.", start_date: new Date(now.getTime() + 7 * 86400000).toISOString(), end_date: new Date(now.getTime() + 7 * 86400000 + 10800000).toISOString(), location: "Education Center", is_active: true },
  ];
  for (const ev of events) {
    const { error } = await supabase.from("events").upsert(ev, { onConflict: "title", ignoreDuplicates: true });
    if (error) console.error("Event error:", ev.title, error.message);
    else console.log("Event OK:", ev.title);
  }

  // Training dataset
  const training = [
    { input: "Where is the lion?", output: "The African Lion can be found at the African Savanna exhibit.", intent: "navigation", language: "en", is_validated: true },
    { input: "What time does the zoo open?", output: "Manila Zoo is open every day.\n• Tuesdays to Sundays: 9:00 AM – 8:00 PM\n• Holidays: 9:00 AM – 8:00 PM\n• Mondays (including Monday holidays): 11:00 AM – 8:00 PM\nLast entry of visitors is at 6:00 PM.", intent: "zoo_hours", language: "en", is_validated: true },
    { input: "Saan ang banyo?", output: "Ang mga comfort room ay matatagpuan malapit sa main entrance, central plaza, at malapit sa bird sanctuary.", intent: "facilities", language: "fil", is_validated: true },
    { input: "How much is the ticket?", output: "Admission rates (updated September 14, 2023), Manila residents / non-Manila residents:\n• Adults and children 3 years old and above: ₱150 / ₱300\n• Students: ₱100 / ₱200\n• Senior citizens and PWDs (20% discount): ₱120 / ₱240\n• Children 2 years old and below: free (no registration needed)\n• Manila LGU employees and teachers under the Manila Division of City Schools: ₱100\nSenior citizens of Manila with a valid OSCA ID visit free every Wednesday.\nDiscounted visitors must show a valid ID at the entrance (Manila residents: an ID with a Manila address).", intent: "tickets", language: "en", is_validated: true },
    { input: "Anong oras bukas?", output: "Bukas ang Manila Zoo araw-araw.\n• Martes hanggang Linggo: 9:00 AM – 8:00 PM\n• Mga holiday: 9:00 AM – 8:00 PM\n• Lunes (kasama ang holiday na tumapat sa Lunes): 11:00 AM – 8:00 PM\nAng huling pagpasok ng mga bisita ay 6:00 PM.", intent: "zoo_hours", language: "fil", is_validated: true },
  ];
  for (const t of training) {
    const { error } = await supabase.from("training_dataset").insert(t);
    if (error && !error.message.includes("duplicate")) console.error("Training error:", t.input.slice(0, 30), error.message);
    else console.log("Training OK:", t.input.slice(0, 40));
  }

  console.log("\nSeed complete!");
}

run().catch(console.error);
