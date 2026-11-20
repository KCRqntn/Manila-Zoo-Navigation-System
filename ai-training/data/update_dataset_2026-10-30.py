"""
Updates ZooBot's dataset for the 2026-10-30 chatbot fixes.

    python data/update_dataset_2026-10-30.py          (from the ai-training folder)

Reads the backups in data/backup_2026-10-30/ (the dataset as it was before this update) and writes
train.csv and test.csv, so running it again gives the same result. What changes:

1. animal_location is split from navigation. "Where is the lion?" asks where an animal or exhibit
   is (answered with its exhibit); "How do I get to the lion?" asks for walking directions
   (navigation). About 50 navigation rows were really location questions and are relabelled.
   "Where is the exit/entrance?" questions are facilities (a place, like a restroom).
2. Feeding time of one named animal ("When is the lion feeding?") is animal_info: it is answered
   from that animal's feeding schedule. General feeding shows stay events.
3. out_of_scope is a trained intent again. The 2026-10-17 cleanup removed it and left unrelated
   questions to server rules only; the 45 original rows (data/backup_2026-10-17/
   train_before_cleanup.csv) come back, plus new ones (other zoos, outside restaurants and hotels,
   general knowledge). The server rules stay as a second safety net.
4. New examples: specific animal details (diet, habitat, appearance, status…), follow-ups ("What
   about its habitat?", "Where can I find it?", "How do I get there?"), Taglish, and common
   misspellings. Test sentences are written separately from the training ones and never overlap.

Prints a summary and refuses to write if a sentence ends up with two different intents.
"""
import os

import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
BACKUP = os.path.join(HERE, "backup_2026-10-30")
OLD = os.path.join(HERE, "backup_2026-10-17")

# ─── Relabelled rows (exact text -> new intent) ──────────────────────────────

TO_LOCATION = [
    "Where is the lion?", "Where can I find the lion?", "Saan ang leon?", "Nasaan ang lion area?",
    "Where can I find the tiger?", "Saan makikita ang tigre?", "Where is the zebra section?", "Nasaan ang capybara area?",
    "Where can I find the lion area?", "Saan banda yung lion area?", "Nasaan yung primates section, malapit ba sa map?",
    "Where is the Indoor Reptiles exhibit?", "Saan ang Philippine Endemic?", "Where are the snakes kept?",
    "Nasaan ang mga ibon?", "Saan makikita ang Philippine Eagle?", "Where is the hyena enclosure?",
    "Saan dito yung mga unggoy?", "nasaan ang mga leon", "where are the hornbills", "saan ang aviary",
    "Where is the zebra?", "saan ang zebra", "Where can I see the white tiger?", "nasan yung white tiger",
    "Where are the capybaras?", "saan makikita ang capybara", "Where is the gibbon enclosure?", "san banda yung mga unggoy",
    "Where is the ostrich?", "Saan ang ostrich at deer?", "where can i find the cassowary", "nasaan ang mga ibon na kalapati",
    "Where is the peacock?", "saan yung peacock", "Where are the cobras?", "saan nakalagay ang cobra",
    "where is outdoor reptiles", "Where is the Savana?", "saan ang mga pagong", "where is the albino python",
    "Where's the lion?", "saan po ang butterfly garden", "Can you show me where the sailfin lizard is?",
]
TO_FACILITIES = [
    "Where is the entrance?", "Saan ang entrance ng zoo?", "Where is the exit?", "Nasaan ang exit?",
    "where is the exit", "saan ang labasan", "pinakamalapit na labasan",
]
TO_ANIMAL_INFO = [
    "When is the lion feeding?", "Anong oras ang feeding ng buwaya?", "What time is the crocodile feeding?",
    "anong oras ang feeding ng tigre",
]
TEST_RELABEL = {
    "Where exactly is the hippo pool?": "animal_location",
    "Anong oras ang pakain sa agila?": "animal_info",
    "When do they feed the crocodiles?": "animal_info",
}

# ─── New training rows ───────────────────────────────────────────────────────

NEW_TRAIN = {
    "animal_location": [
        "What exhibit is the lion in?", "Anong exhibit ang leon?", "Which exhibit is the zebra in?",
        "In which area is the capybara?", "Where is the cassowary located in the zoo?", "Where is the Aviary located?",
        "Nasaan ang Apex Predators?", "Where can we see the crocodile?", "Saan pwede makita ang mga ibon?",
        "Where are the reptiles?", "san makikita ang lemur", "nasan po ung capybara", "Where can I find it?",
        "Saan ko siya makikita?", "Where is it located?", "Which exhibit is it in?", "Nasaan siya?",
        "Where can I see them?", "Saan sila makikita?", "Where do you keep the pythons?", "Where is the Samar cobra?",
        "Saan nakalagay ang mga ahas?", "Where are the macaques?", "Saan ang kulungan ng tigre?",
        "Where is the lemur enclosure?", "Nasaan ang Philippine eagle owl?", "where is the gibbon",
        "Where in the zoo is the deer?", "Saan ang exhibit ng buwaya?", "Location of the white tiger?",
        "Where is the Philippine cockatoo exhibit?", "Saan ko makikita ang capybara dito?",
        "wher is the leon", "were can i fnd the tigre", "saan makikta ang buwaya", "were is the lion exibit",
        "nasaan ang zebraa", "where can i find the crocadile", "saan ang ostritch",
    ],
    "navigation": [
        "How do I get there?", "Paano pumunta doon?", "Take me there", "Directions please", "Pano po pumunta dun?",
        "How do I get to it from here?", "Guide me there", "Ituro mo ang daan papunta sa leon",
        "Give me directions to the zebra", "What's the route from here to the Savana?",
        "Can you show me the way to the restroom?", "Paano pumunta sa CR?", "How do I get to the nearest restroom?",
        "How do I walk to the Apex Predators from here?", "Paano ako pupunta sa exhibit ng zebra?",
        "Which way is the Aviary from here?", "Saan ako dadaan papunta sa capybara?", "Show me how to get to the cassowary",
        "How far is the lion from here?", "Gaano kalayo ang Savana mula dito?", "Lead me to the Indoor Reptiles",
        "Can you give me a route to the food court?", "Paano pumunta sa food court galing dito?",
        "paano pumnta sa aviary", "how do i gt to the savana", "derections to the lion", "pano pmunta sa leon",
    ],
    "animal_info": [
        "What does the zebra look like?", "Ano ang itsura ng cassowary?", "How does the white tiger look?",
        "Describe the appearance of the ostrich", "Anong kulay ng cobra?", "Ano ang diet ng lion?",
        "Anong scientific name ng tigre?", "Ano ang conservation status ng Philippine eagle?",
        "What is the habitat of the zebra?", "Saan nakatira ang capybara sa wild?", "Where do zebras live in the wild?",
        "Where does the lion come from?", "What about its habitat?", "How about its diet?", "Ano naman ang kinakain nito?",
        "What does it eat?", "Is it endangered?", "Gaano kabigat siya?", "When is it fed?", "How long does it live?",
        "And its scientific name?", "What is the zebra's diet?", "Ano ang tirahan ng zebra?",
        "Herbivore ba ang capybara?", "What kind of food does the cassowary eat?", "What is the lion's scientific name?",
        "Vulnerable ba ang leon?", "How much does the lion weigh?", "Feeding time ng lion?",
        "wat does the zebraa eat", "elefant habitat", "crocadile diet", "scientific nam of the capybarra",
        "what dos the leoin eat", "ano ang kinakaen ng buaya",
    ],
    "facilities": [
        "Saan ang main entrance?", "Where is the main gate?", "saan ang restrom", "nasaan ang comfortroom",
        "where is the toilette", "May CR ba malapit sa Savana?", "Is there a restroom near the lion?",
        "Where can I buy water?", "Saan may tubig na mabibili?",
    ],
    "tickets": ["how much is the tiket", "magkno ang tiket", "magkano po ang entrance fee ngayon?"],
    "zoo_hours": ["what tyme do you open", "anong orass kayo bukas", "open ba kayo ngayon?"],
    "events": ["is there an evnt today", "may evnt ba bukas"],
    "emergency": ["i ned help", "emergancy my child is lost"],
    "greeting": ["helo zoobot", "magandang umga"],
    "parking": ["were can i prk my car", "parkng fee"],
    "out_of_scope": [
        "Any good restaurants near the zoo?", "Saan may masarap na kainan malapit sa zoo?",
        "Recommend a hotel near Manila Zoo", "May hotel ba malapit dito?", "What malls are near the zoo?",
        "Is Manila Ocean Park open today?", "How much is the ticket at Avilon Zoo?", "What animals are in the Singapore Zoo?",
        "Which zoo in the Philippines is the best?", "Uulan ba mamaya?", "Sino ang mayor ng Maynila?",
        "Tulungan mo ako sa assignment ko", "Write me a poem", "Kwentuhan mo ako ng joke", "What is the capital of Japan?",
        "Who won the NBA finals?", "How do I cook adobo?", "Paano magluto ng sinigang?", "Recommend a good movie",
        "How do I install Python on my laptop?", "Who is Taylor Swift?", "Magkano ang bitcoin ngayon?",
        "Where can I buy cheap clothes in Divisoria?", "What is the population of Manila?", "Explain photosynthesis",
        "How many legs does a spider have?", "Where is the nearest church?", "Saan may Jollibee malapit dito?",
        "Best hotels near Manila Zoo", "nearest lrt staton", "wats the wether today",
    ],
}

# ─── New test rows (written separately; none appear in training) ─────────────

NEW_TEST = {
    "animal_location": [
        "Where are the lions kept?", "Saan ko makikita ang zebra?", "Which exhibit has the capybara?",
        "Nasaan po ang ostrich?", "Where is the Indoor Reptiles?", "Where can I see the eagle owl?", "san ung tigre",
        "Wher is the crocodile?", "Anong area ang mga unggoy?", "Where would I find the cassowary?",
    ],
    "navigation": [
        "How do I get to the zebra from here?", "Paano po pumunta sa Apex Predators?",
        "Can you give me directions to the aviary?", "Take me to the capybara", "pano pumunta dun",
        "Guide me to the exit please",
    ],
    "animal_info": [
        "How does the cassowary look like?", "Ano ang kulay ng Philippine cockatoo?", "What about its diet?",
        "crocadile habitat", "wat do lemurs eat",
    ],
    "facilities": ["where is the neerest toilet"],
    "tickets": ["magkanu ang entrnce fee"],
    "out_of_scope": [
        "Nearest MRT station to the zoo?", "Can you recommend restaurants outside the zoo?", "Any hotels nearby?",
        "Saan may mall malapit dito?", "What's the capital of France?", "Sino ang nanalo sa eleksyon?",
        "Can you solve 12 x 8?", "Tell me a funny story", "How much is a ticket to Avilon Zoo?",
    ],
}


def main() -> None:
    train = pd.read_csv(os.path.join(BACKUP, "train.csv"))
    test = pd.read_csv(os.path.join(BACKUP, "test.csv"))

    relabel = {**{t: "animal_location" for t in TO_LOCATION}, **{t: "facilities" for t in TO_FACILITIES},
               **{t: "animal_info" for t in TO_ANIMAL_INFO}}
    missing = [t for t in relabel if t not in set(train["text"])] + [t for t in TEST_RELABEL if t not in set(test["text"])]
    if missing:
        raise SystemExit(f"Rows to relabel not found: {missing}")
    train["intent"] = [relabel.get(t, i) for t, i in zip(train["text"], train["intent"])]
    test["intent"] = [TEST_RELABEL.get(t, i) for t, i in zip(test["text"], test["intent"])]

    old_train = pd.read_csv(os.path.join(OLD, "train_before_cleanup.csv"))
    old_test = pd.read_csv(os.path.join(OLD, "test_before_cleanup.csv"))
    restored_train = old_train[old_train["intent"] == "out_of_scope"]
    restored_test = old_test[old_test["intent"] == "out_of_scope"]

    rows = lambda d: pd.DataFrame([{"text": t, "intent": i} for i, ts in d.items() for t in ts])
    train = pd.concat([train, restored_train[["text", "intent"]], rows(NEW_TRAIN)], ignore_index=True)
    test = pd.concat([test, restored_test[["text", "intent"]], rows(NEW_TEST)], ignore_index=True)

    for name, df in (("train", train), ("test", test)):
        df["text"] = df["text"].str.strip()
        key = df["text"].str.lower()
        conflicts = df[key.duplicated(keep=False)].groupby(key)["intent"].nunique()
        if (conflicts > 1).any():
            raise SystemExit(f"{name}: same sentence with different intents: {list(conflicts[conflicts > 1].index)}")
        df.drop_duplicates(subset="text", inplace=True)
    overlap = set(train["text"].str.lower()) & set(test["text"].str.lower())
    if overlap:
        raise SystemExit(f"Test sentences also in training: {sorted(overlap)}")

    train.to_csv(os.path.join(HERE, "train.csv"), index=False)
    test.to_csv(os.path.join(HERE, "test.csv"), index=False)
    print(f"Relabelled: {len(TO_LOCATION)} -> animal_location, {len(TO_FACILITIES)} -> facilities, "
          f"{len(TO_ANIMAL_INFO)} -> animal_info (test: {len(TEST_RELABEL)})")
    print(f"Restored out_of_scope rows: {len(restored_train)} train, {len(restored_test)} test")
    print(f"train.csv: {len(train)} rows | test.csv: {len(test)} rows")
    summary = pd.DataFrame({"train": train["intent"].value_counts(), "test": test["intent"].value_counts()}).fillna(0).astype(int)
    print(summary.sort_index().to_string())


if __name__ == "__main__":
    main()
