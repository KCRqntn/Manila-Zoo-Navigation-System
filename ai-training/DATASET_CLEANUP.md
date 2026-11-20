# ZooBot dataset cleanup (October 17, 2026)

Goal: the chatbot's training data contains only useful, relevant and verified Manila Zoo examples.
Unrelated questions are no longer a trained intent; the server answers them with a fallback reply.

## 1. Files

| File | What it is |
|---|---|
| `data/train.csv` | Cleaned training set (`text,intent`) |
| `data/test.csv` | Cleaned held-out test set (never trained on) |
| `data/cleanup_report.csv` | Every removed or flagged row, with the reason |
| `data/clean_dataset.py` | The cleanup itself: lists of removed/flagged rows and the rules used |
| `data/backup_2026-10-17/` | Backups: `train_original.csv` (before October edits), `train_before_cleanup.csv`, `test_original.csv`, `test_before_cleanup.csv` |
| `models/` | The retrained model the chatbot now uses |
| `models_previous_2026-10/` | The previous model (backup) |
| `old_vs_new.md` | Previous vs retrained model on the same cleaned test set |

## 2. How rows were judged

Each row was read for its meaning and checked against what the system actually knows: the official zoo
rules (`lib/zooRules.ts`), opening hours and admission rates (`lib/visitInfo.ts`), the places on the map,
the FAQ table, the events table and the animal records. Keywords alone did not decide anything: for
example "Where can the school bus park?" and "Where should our Grab drop us off?" are kept as zoo parking
questions, while "What bus should I take to get to Manila Zoo?" is removed as transport.

- **Removed**: unrelated to Manila Zoo; names an animal not in the zoo's records or a place not on its map;
  or asks about a service/policy the system has no verified information on.
- **Flagged (kept)**: a real zoo question whose answer is only partly verified. Listed in section 6.
- **Kept**: greetings, thanks and goodbyes (part of talking to ZooBot).

## 3. Row counts

| | Training | Test |
|---|---|---|
| Before cleanup | 581 | 132 |
| Removed | 105 | 38 |
| Remaining | **476** | **94** |
| `out_of_scope` rows remaining | **0** | **0** |
| Overlap between training and test | 0 | |

## 4. Remaining intents (10)

| Intent | Training examples | Test questions |
|---|---|---|
| animal_info | 61 | 7 |
| emergency | 50 | 12 |
| events | 36 | 9 |
| facilities | 40 | 7 |
| general | 43 | 8 |
| greeting | 34 | 12 |
| navigation | 93 | 6 |
| parking | 31 | 11 |
| tickets | 37 | 10 |
| zoo_hours | 51 | 12 |

The `out_of_scope` intent is gone from the dataset, the trained model (`models/config.json` lists the 10
intents above) and the admin intent list (`api-server/src/routes/training.ts`).

## 5. Removed examples

### Training set (105)

**Not about Manila Zoo, former `out_of_scope` intent (45):** How do I get to Manila Zoo by jeep? · Paano pumunta sa Manila Zoo mula sa LRT? · Which LRT station is nearest? · How do I commute to Manila Zoo? · Paano mag-commute papunta sa zoo? · What jeep goes to Manila Zoo? · Can I take a Grab to the zoo? · Which LRT stop is closest to the zoo? · Malapit ba ang Quirino station? · Where is the nearest LRT station? · What is the nearest MRT station? · What bus should I take to get to Manila Zoo? · Which bus goes to Manila Zoo from Makati? · How do I get to Manila Zoo from Quezon City? · How much is a taxi from the airport to the zoo? · Where is the nearest bus terminal? · Is there a P2P bus to Manila Zoo? · How do I get to NAIA from here? · Where can I ride a tricycle? · How long is the train ride from Cubao? · Saan ang pinakamalapit na LRT? · Anong bus papuntang Manila Zoo? · Paano pumunta sa Manila Zoo galing Cubao? · Saan ang sakayan ng jeep pauwi? · Magkano ang taxi papuntang airport? · Malapit ba ang MRT dito? · Saan bababa sa LRT papunta sa zoo? · Where is SM Manila? · How far is Rizal Park from here? · Where is the nearest Jollibee outside the zoo? · Can you recommend a hotel nearby? · Where is Manila Bay? · Saan ang pinakamalapit na mall? · What tourist spots are near the zoo? · How do I get to Robinsons Place Manila? · Where can I find a pharmacy outside? · Paano pumunta sa Intramuros galing dito? · What's the weather today? · Who is the president of the Philippines? · Can you help me with my homework? · What is 25 times 4? · Ano ang balita ngayon? · Can you order food for me? · Translate this to Japanese · Tell me a joke about cars

**Not about Manila Zoo (1):** Pwede bang mag-park sa labas? (street parking outside the zoo)

**Service or policy with no verified information (59):**
- Facilities not confirmed to exist: May water refilling station ba? · Is there a stroller rental? · Where can we sit and rest? · May lockers ba kayo? · Is there a breastfeeding room? · May picnic area ba dito? · Where can I charge my phone? · Is there a snack bar near the aviary? · Where can I buy ice cream? · Is there a prayer room? · Is there a coffee shop? · May tubig ba na libre? · Where is the drinking fountain? · Is there a place to change diapers? · May changing table ba sa CR? · Are there benches in the shade? · saan pwede magpahinga · Is there an ATM inside? · May ATM ba dito?
- Policies not in the official rules: Can I take pictures? · Pwede bang mag-picture? · Is flash photography allowed? · Can I use a drone? · Can I bring a tripod? · Are umbrellas allowed? · Can I bring a speaker? · Is there a dress code? · Is it okay to bring a skateboard? · pwede ba bike sa loob
- Services/programs the system doesn't have: Is there Wi-Fi? · May wifi ba dito? · Can I volunteer at the zoo? · Paano mag-apply bilang volunteer? · How do I adopt an animal? · Can schools arrange a field trip? · When is the next zoo tour? · May guided tour ba? · Can I book a guided tour for my class? · Can we join the keeper talk? · What time does the keeper talk start? · Are there workshops for students? · Is there a feeding show for the birds? · Is there a summer camp?
- Ticket details beyond the verified rates and discounts: Can I buy tickets online? · Pwede bang online bumili ng ticket? · Can I buy the tickets online or sa entrance lang? · Do you accept GCash for tickets? · Pwede GCash sa entrance? · Can I pay with Maya? · Pwede bang cash lang pambayad? · Is there a family package? · Are tickets cheaper on weekdays? · Is there a group discount for schools? · Magkano para sa field trip? · Can I get a refund? · Pwede bang i-refund ang ticket? · Is my ticket valid all day? · Can I go out and come back in with the same ticket?
- Opinion: When is the best time to visit?

### Test set (38)

**Not about Manila Zoo (13):** How do I commute to the zoo? · Anong jeep papuntang Manila Zoo? · Nearest train station to the zoo? · Paano pumunta dito galing Quiapo? · Is the MRT near here? · Saan ang sakayan ng bus pa-Cubao? · How do I get to Intramuros from the zoo? · Where's the nearest mall? · Malapit ba dito ang Rizal Park? · What's the weather tomorrow? · Can you book me a taxi? · Saan ang terminal ng jeep papuntang Pasay? · Is there free parking nearby?

**Animal or place not at Manila Zoo (12):** Can you point me to the flamingos? · Nasan yung aquatic center? · Help me find the tarsier exhibit · Where is the orangutan located in the zoo? · How do I reach the south exit from the reptiles? · Ituro mo nga kung nasaan ang elepante · How big do hippos get? · Are tarsiers nocturnal? · Explain the diet of the sun bear · How many years can an elephant live? · Why do giraffes have long necks? · Kailan ang pakain sa elepante?

**Service or policy with no verified information (13):** Can I pay by card? · Is there a promo for groups? · May drinking fountain ba? · Where can I change my baby's diaper? · Saan pwedeng umupo at magpahinga? · May tindahan ba ng kape? · Where can I store my bag? · Is there a keeper talk today? · Schedule ng guided tour? · Can I take a selfie with the animals? · Can I use a selfie stick? · How do I become a volunteer? · Is there internet here?

Nothing was invented to replace removed rows. If the zoo confirms one of these services (for example GCash payment or Wi-Fi), add the fact to the FAQ or system first, then add the questions back.

## 6. Flagged entries (kept, please verify)

| Issue | Rows | What to do |
|---|---|---|
| Feeding times come from the animal records' starter data, not confirmed with the zoo | 7 train, 2 test (e.g. "When is the lion feeding?") | Confirm each animal's feeding time with the zoo, or clear the field in Admin → Animals. The chatbot repeats these times. |
| No verified history of the zoo in the system | 5 train, 1 test (e.g. "When was Manila Zoo founded?") | Add a history answer to the FAQ |
| Only the security hotline is in the system | 3 train, 1 test (e.g. "How can I contact the zoo?") | Add the office phone/email to the FAQ |
| Parking: location verified, fees/hours/capacity/drop-off not | 17 train, 7 test | Confirm with the zoo; the chatbot currently only gives the location |
| Foreigners assumed to pay the non-Manila-resident rate | 2 train | Confirm with the zoo |
| Wheelchairs only confirmed by an FAQ answer | 2 train, 1 test | Confirm with the zoo |
| Place named differently from the map (Reptile House, Bird Sanctuary, hippo pool) | 3 test | Kept: they mean Indoor Reptiles, Aviary and the Elephant & Hippopotamus exhibit |
| General question, not about the zoo's own animals | 1 train ("What animals are native to the Philippines?") | Keep or remove as you prefer |

**Conflicting information found:** the official rules say *"No outside food and drinks allowed"*, but the
FAQ answer to "Where can I get food?" says *"You may also bring your own food"*. Correct the FAQ in
Admin → Chatbot & FAQ.

## 7. Chatbot code changes

| File | Change |
|---|---|
| `artifacts/api-server/src/routes/chat.ts` | Unrelated questions (transport, places outside the zoo, general knowledge) are detected by meaning-based rules and answered with a fallback reply (logged as `fallback`, which is not a trained intent). The same reply is used when nothing in the zoo matches. No walking route is ever planned for them. "From A to B" questions now start from the place named ("from the Aviary to Indoor Reptiles", "mula sa Aviary papunta sa Savana"). |
| `artifacts/api-server/src/routes/training.ts` | Admin intent list: the 10 intents only |
| `ai-training/train.py` | Keyword baseline matches the server's keyword fallback again (10 intents) |
| `ai-training/compare_old_new.py` | New: scores two models on the same test set |

Fallback reply (English): *"I'm ZooBot, your Manila Zoo guide! I can help you with animal information, exhibits, facilities, and navigation inside Manila Zoo. Please ask me something related to your zoo visit."* A Filipino version is used when the app is in Filipino.

Not changed: the model type (bert-base-multilingual-cased), React frontend, Express API structure, Supabase database, and every other feature.

## 8. Results

Both models were scored on the same cleaned test set (94 questions):

| Model | Accuracy | Macro F1 |
|---|---|---|
| Previous model | 81.9% | 0.797 |
| **Retrained model (in use)** | **91.5%** | **0.907** |
| Keyword rules (baseline) | 54.3% | 0.507 |

Per-intent scores and the confusion matrix are in `models/eval_report.md`. The previous model's reported
80.8% was measured on the old 120-question test set, which included the animals and places listed in
section 5; the numbers above are the ones to report going forward.

### Live tests (through the running chatbot)

| Question | Result |
|---|---|
| Where is the nearest restroom? / Saan ang pinakamalapit na CR? | facilities, walking route to the nearest restroom |
| Where can I find the lion? | navigation, route to Apex Predators |
| How do I get from the Aviary to Indoor Reptiles? | navigation, route **from the Aviary** (283 m) |
| How can I return to the main entrance? | navigation |
| What does the capybara eat? | animal_info |
| Magkano ang ticket ng estudyante? | tickets, verified rates |
| What time do you close? | zoo_hours |
| Where can I park? / Where can the school bus park? / Where should our Grab drop us off? | parking |
| My child is lost | emergency, security hotline |
| Can I bring my dog? | official rule: no pets |
| Hello ZooBot / Thank you | greeting / you're welcome |
| Where is the nearest LRT station? · What bus should I take to get to Manila Zoo? · Saan ang sakayan ng jeep? · How far is Rizal Park from here? · What's the weather today? · Ano ang panahon bukas? · What is 25 times 4? · Who is the president of the Philippines? · Can you translate this to Japanese? · Can you recommend a good movie? | fallback reply |

Directions start at the Main Entrance unless the visitor names a starting place, shares their location
(GPS, a spot picked on the map, or a scanned QR code), or has scanned an exhibit's QR code; the reply says
so when it starts at the entrance.

## 9. Retraining and testing

From the `ai-training` folder (the project's Python environment is `..\..\.venv`):

1. Edit `data/train.csv` (keep `data/test.csv` separate; never copy test questions into training).
2. Check the data without training: `..\..\.venv\Scripts\python.exe train.py --data-only`
3. Train into a new folder: `..\..\.venv\Scripts\python.exe train.py --output models_new` (about 15 minutes on this laptop).
   Approved examples that admins add in Admin → Chatbot & FAQ are included automatically when the API is running; add `--no-admin-data` to leave them out.
4. Compare with the model in use: `..\..\.venv\Scripts\python.exe compare_old_new.py models models_new` → `old_vs_new.md`
5. If the new one is better: stop the AI service window, rename `models` to a backup name, rename `models_new` to `models`, then start the AI service again (`start-zoo.cmd`). The chatbot loads `models/` when the AI service starts.
6. Test in the app's AI Guide, or send questions to `POST /api/chat`.

## 11. mBERT vs XLM-RoBERTa on the cleaned data (October 19, 2026)

XLM-RoBERTa was retrained on the same cleaned data (`models_xlmr_clean`) with the same settings. Full report: `model_comparison.md` (the earlier report is in `data/backup_2026-10-17/model_comparison_before_cleanup.md`).

| Model | Accuracy | Macro F1 | Size | CPU time per question |
|---|---|---|---|---|
| mBERT (live) | 91.5% | 0.907 | 714 MB | 136 ms |
| XLM-RoBERTa | 94.7% | 0.946 | 1,129 MB | 162 ms |

McNemar p = 0.453 (5 questions only XLM-R got right, 2 only mBERT), so the gap is not statistically significant. The chatbot still uses mBERT, the model the panel specified.

## 12. Official zoo information added (October 19, 2026)

Source: the Manila Zoo website text (Guidelines, Terms and Conditions, About Us, Contact Us, hours and rates), supplied by the team as a Google Doc.

- **Now verified, no longer flagged:** zoo history (opened July 25, 1959 under Mayor Arsenio H. Lacson) and contact details (manilazoo@manila.gov.ph, official Facebook page, Info Desk). The flagged history and contact rows in train.csv and test.csv are now backed by real answers.
- **Now verified:** reservations and refunds (paid in advance by e-payment; no refund except declared calamities; 7-day reuse), personal tumblers allowed, and banned items (sharp objects, loud music, alcohol). The refund rows removed earlier can be restored at the next retraining; the chatbot already answers these through `zooRules.ts`, whatever intent the model picks.
- Hours and rates in the document match the system; the 10 posted rules match exactly.
- **Not added:** the document names Ma'ali the Asian elephant as a main attraction; that text is out of date (she died in 2023, and the elephant record was removed). It calls Kois a "white Siberian tiger", while the zoo's sign and the animal record say White Bengal Tiger; only the name and donation (Zoocobia, 2021) were added to the tiger's facts.
- The Privacy Notice is the City Government of Manila's general notice and was not added.
