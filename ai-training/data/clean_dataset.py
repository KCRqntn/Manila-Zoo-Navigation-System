"""
Cleans ZooBot's dataset so it only contains useful, Manila-Zoo-related examples.

    python data/clean_dataset.py          (from the ai-training folder)

Each row was reviewed by meaning against what the system actually knows: the official zoo rules
(lib/zooRules.ts), opening hours and admission rates (lib/visitInfo.ts), the places on the map,
the FAQ, the events table and the animal records. A row is REMOVED when it is unrelated to Manila
Zoo, names an animal not in the zoo's records or a place not on its map, or asks about a service the
system has no verified information on. A row is FLAGGED (kept, listed for checking) when it is a
real zoo question but only part of the answer is verified. The "out_of_scope" intent is removed:
unrelated questions are handled by the chatbot's fallback reply, not by a trained intent.

Writes train.csv and test.csv in place and cleanup_report.csv (every removed/flagged row and why).
Backups of the originals are in data/backup_2026-10-17/.
"""
import csv
import os
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))

# ─── Removed from training ───────────────────────────────────────────────────

UNRELATED = "Not about Manila Zoo (transport, outside places, or general knowledge)"
NOT_HERE = "Animal or place that is not at Manila Zoo (not in the animal records or on the map)"
UNVERIFIED = "Service or policy the system has no verified information on"

REMOVE_TRAIN = {
    # Every former out_of_scope row is removed through the intent rule below; these are the rest
    UNVERIFIED: [
        # facilities not confirmed to exist
        "May water refilling station ba?", "Is there a stroller rental?", "Where can we sit and rest?",
        "May lockers ba kayo?", "Is there a breastfeeding room?", "May picnic area ba dito?",
        "Where can I charge my phone?", "Is there a snack bar near the aviary?", "Where can I buy ice cream?",
        "Is there a prayer room?", "Is there a coffee shop?", "May tubig ba na libre?", "Where is the drinking fountain?",
        "Is there a place to change diapers?", "May changing table ba sa CR?", "Are there benches in the shade?",
        "saan pwede magpahinga", "Is there an ATM inside?", "May ATM ba dito?",
        # policies not in the official rules
        "Can I take pictures?", "Pwede bang mag-picture?", "Is flash photography allowed?", "Can I use a drone?",
        "Can I bring a tripod?", "Are umbrellas allowed?", "Can I bring a speaker?", "Is there a dress code?",
        "Is it okay to bring a skateboard?", "pwede ba bike sa loob",
        # services and programs the system doesn't have
        "Is there Wi-Fi?", "May wifi ba dito?", "Can I volunteer at the zoo?", "Paano mag-apply bilang volunteer?",
        "How do I adopt an animal?", "Can schools arrange a field trip?",
        "When is the next zoo tour?", "May guided tour ba?", "Can I book a guided tour for my class?",
        "Can we join the keeper talk?", "What time does the keeper talk start?", "Are there workshops for students?",
        "Is there a feeding show for the birds?", "Is there a summer camp?",
        # ticket details beyond the verified rates and discounts
        "Can I buy tickets online?", "Pwede bang online bumili ng ticket?", "Can I buy the tickets online or sa entrance lang?",
        "Do you accept GCash for tickets?", "Pwede GCash sa entrance?", "Can I pay with Maya?", "Pwede bang cash lang pambayad?",
        "Is there a family package?", "Are tickets cheaper on weekdays?", "Is there a group discount for schools?",
        "Magkano para sa field trip?", "Can I get a refund?", "Pwede bang i-refund ang ticket?",
        "Is my ticket valid all day?", "Can I go out and come back in with the same ticket?",
        # opinion, not a fact the system holds
        "When is the best time to visit?",
    ],
    UNRELATED: [
        "Pwede bang mag-park sa labas?",  # street parking outside the zoo
    ],
}

# ─── Removed from the test set (same rules) ──────────────────────────────────

REMOVE_TEST = {
    NOT_HERE: [
        "How big do hippos get?", "Are tarsiers nocturnal?", "Explain the diet of the sun bear",
        "How many years can an elephant live?", "Why do giraffes have long necks?", "Kailan ang pakain sa elepante?",
        "Can you point me to the flamingos?", "Nasan yung aquatic center?", "Help me find the tarsier exhibit",
        "Where is the orangutan located in the zoo?", "How do I reach the south exit from the reptiles?",
        "Ituro mo nga kung nasaan ang elepante",
    ],
    UNVERIFIED: [
        "Is there a keeper talk today?", "Schedule ng guided tour?", "May drinking fountain ba?",
        "Where can I change my baby's diaper?", "Saan pwedeng umupo at magpahinga?", "May tindahan ba ng kape?",
        "Where can I store my bag?", "Can I take a selfie with the animals?", "Can I use a selfie stick?",
        "How do I become a volunteer?", "Is there internet here?", "Can I pay by card?", "Is there a promo for groups?",
    ],
    UNRELATED: ["Is there free parking nearby?"],
}

# ─── Kept but flagged: real zoo questions whose answer is only partly verified ──

FLAG = {
    "Feeding times come from the animal records' starter data, which hasn't been confirmed with the zoo": [
        "What time is the animal feeding?", "Anong oras ang pagpapakain sa mga hayop?", "When is the lion feeding?",
        "Anong oras ang feeding ng buwaya?", "What time is the crocodile feeding?", "anong oras ang feeding ng tigre",
        "When is the next feeding show?", "Anong oras ang pakain sa agila?", "When do they feed the crocodiles?",
    ],
    "The system has no verified history of the zoo yet; add it to the FAQ": [
        "What is the history of Manila Zoo?", "Kailan itinayo ang Manila Zoo?", "Who built the Manila Zoo?",
        "how old is manila zoo", "Ilang taon na ang Manila Zoo?", "When was Manila Zoo founded?",
    ],
    "Only the security hotline is in the system; add the zoo's office contact details to the FAQ": [
        "How can I contact the zoo?", "Ano ang contact number ninyo?", "What is the zoo's email address?", "Do you have a hotline?",
    ],
    "Parking location is verified (main entrance, Adriatico St.); fees, hours, capacity and drop-off details are not": [
        "How much is the parking fee?", "Magkano ang parking?", "Is parking free?", "Libre ba ang parking?",
        "How many parking slots are there?", "Is the parking area safe?", "Pwede bang mag-overnight park?",
        "May bayad ba ang parking?", "parking rates please", "How much is parking per hour?", "Is the parking lot open early?",
        "Is the parking covered?", "Is there a bike rack?", "Saan pwedeng iparada ang bisikleta?", "Is there a drop-off point?",
        "Saan pwedeng ibaba ang pasahero?", "Where should our Grab drop us off?", "Magkano bayad sa parking ng kotse?",
        "Where do tour buses unload?", "Is parking included in the ticket?", "Can I leave my bike somewhere?",
        "Where can Grab drop us off?", "How much to park a motorcycle?", "Is the parking lot guarded?",
    ],
    "Foreigners are assumed to pay the non-Manila-resident rate; confirm with the zoo": [
        "What is the price for foreigners?", "How much is the ticket for a foreigner?",
    ],
    "Wheelchairs are only confirmed by an FAQ answer (available at the entrance)": [
        "Do you have wheelchairs available?", "Where can I rent a wheelchair?", "Can I rent a wheelchair?",
    ],
    "Names a place by a different name than the map (Reptile House = Indoor Reptiles, Bird Sanctuary = Aviary, hippo pool = Elephant & Hippopotamus exhibit)": [
        "Pano pumunta sa reptile house galing dito?", "Malapit ba dito yung bird sanctuary?", "Where exactly is the hippo pool?",
    ],
    "General question, not specific to the zoo's own animals": ["What animals are native to the Philippines?"],
}


def norm(s: str) -> str:
    return " ".join(s.lower().split())


def clean(name: str, removals: dict, report: list) -> None:
    path = os.path.join(HERE, name)
    with open(path, encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    reason_of = {norm(t): why for why, texts in removals.items() for t in texts}
    flag_of = {norm(t): why for why, texts in FLAG.items() for t in texts}
    found = set()
    kept, seen = [], set()
    for r in rows:
        k = norm(r["text"])
        if r["intent"] == "out_of_scope":
            report.append([name, "removed", r["intent"], r["text"], UNRELATED + " (out_of_scope intent removed)"])
        elif k in reason_of:
            found.add(k)
            report.append([name, "removed", r["intent"], r["text"], reason_of[k]])
        elif k in seen:
            report.append([name, "removed", r["intent"], r["text"], "Duplicate"])
        else:
            seen.add(k)
            kept.append({"text": r["text"].strip(), "intent": r["intent"]})
            if k in flag_of:
                report.append([name, "flagged (kept)", r["intent"], r["text"], flag_of[k]])
    missing = set(reason_of) - found
    if missing:
        raise SystemExit(f"{name}: listed for removal but not found, nothing written: {sorted(missing)}")
    with open(path, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["text", "intent"])
        w.writeheader()
        w.writerows(kept)
    print(f"{name}: {len(rows)} rows -> {len(kept)} kept, {len(rows) - len(kept)} removed")
    print("   ", dict(sorted(Counter(r["intent"] for r in kept).items())))


report: list = []
clean("train.csv", REMOVE_TRAIN, report)
clean("test.csv", REMOVE_TEST, report)
with open(os.path.join(HERE, "cleanup_report.csv"), "w", encoding="utf-8", newline="") as f:
    w = csv.writer(f)
    w.writerow(["file", "action", "intent", "text", "reason"])
    w.writerows(report)
print("wrote cleanup_report.csv")
