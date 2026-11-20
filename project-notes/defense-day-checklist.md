# Final defense: day-of checklist

The full demo script and the statistics answers are in `demo-for-statistician.md`. This page covers the day-of setup, how the demo maps to the thesis objectives, and the panel's likely questions.

## The night before

- [ ] Clear practice data if the panel should see a clean dashboard (ask for help: real registrations are kept unless you say otherwise).
- [ ] Check the admin login works (`raquintankc@gmail.com`). If a password is forgotten, it can be reset; it can't be recovered.
- [ ] Charge the laptop and one phone per member who will demo. Have one iPhone and one Android ready.
- [ ] Bring a phone hotspot in case the venue Wi-Fi blocks the phone link.

## One hour before

1. Connect the laptop to the internet and plug it in.
2. Double-click **Start Manila Zoo Demo**. Wait for the checklist window (up to about 4 minutes).
3. Leave the minimised **"Zoo phone link"** window open for the whole defense.
4. Reprint the exhibit QR signs from **Admin → Exhibit QR Codes → Print all**: the phone link changes each time the laptop restarts. The registration poster is regenerated automatically in `visitor-qr-code/`.
5. On a phone: scan the website QR code, register, open the map, scan one exhibit sign, ask the AI Guide one question.

**If the phone link fails at the venue:** run the whole demo on the laptop at http://localhost:4173. Every feature works there except scanning with a phone.

## Demo mapped to the objectives

| Objective | What to show |
|---|---|
| 1. Map, QR code and chatbot in one system | Scan the website QR code → Visitor Login → Sign up → register → map opens. Scan an exhibit sign → that animal's page and your location on the map. |
| 2. Multilingual chatbot that gives directions | AI Guide: "Saan ang leon?" → turn-by-turn walking directions in Tagalog. "Where is the nearest restroom?" |
| 3. Accurate, location-aware answers | "What is the habitat of the lion?" (only the habitat). "What is the largest animal in the world?" (refused: not in the database). Model results: mBERT 91.5% on 94 held-out questions vs 54.3% for keyword rules (McNemar p < 0.0001). |
| 4. Admin maintenance of animals and map | Edit an animal record; move a pin in the Map Editor; the visitor map updates within 30 seconds. |
| 5. Usable in a real zoo | Works on iPhone and Android (older iPhones get the 2D map); offline save; visitor statistics for the zoo (registered accounts, visits, total attendance with companions, first-time vs returning, average group size, children, adults, seniors, PWDs). |

## Questions the panel may ask

- **"Why mBERT and not XLM-RoBERTa, if XLM-R scored higher?"** The difference isn't significant (McNemar p = 0.453), the panel specified mBERT, and mBERT is smaller and faster (714 MB vs 1,129 MB; 136 ms vs 162 ms).
- **"Does the chatbot make up facts?"** No. Animal answers come only from the zoo's database; anything not in it gets "not in the Manila Zoo database." It was checked with a 76-question test (76/76 correct).
- **"How do you avoid counting a visitor twice?"** A visit counts only after it is saved. Each form has its own id, so retries are ignored; the same group from the same account within 30 minutes counts once. PWDs are a flag on a person, so they're never added on top of the age groups.
- **"Children, adults, seniors: what are the cut-offs?"** Child under 18, adult 18–59, senior 60+ (RA 9994, the Expanded Senior Citizens Act).
- **"How is visitors' personal data protected?"** Consent is recorded; the database has row-level security; only staff can see records, and viewing, exporting and password resets are written to a tamper-evident audit log. Disability details are never asked, only a yes/no PWD flag.
- **"What if a visitor forgets their password?"** Staff check the visitor's identity and give a temporary password from Visitor Registrations (admins only).
- **"Does it work offline?"** The chatbot model loads from local files with no outside AI service. Visitors can save the map and animal pages for offline use.
- **"Why does the link change?"** For the defense it runs from a laptop through a free Cloudflare tunnel. For real use it would be hosted on a server with a fixed address (the `deploy/` folder has the setup), and the QR codes would never change again.

## Limitations to state plainly

- The phone link is temporary until the system is hosted on a server.
- Visitor accounts are confirmed without an email check, so visitors can register at the gate without waiting for an email.
- The privacy notice wording is a draft for the zoo's data protection officer to approve.
- The chatbot supports English, Tagalog and Taglish only.
- Full styling needs iOS 16.4 or newer; older iPhones still work with simpler styling and the 2D map.
- Walkways were traced from satellite imagery and should be checked on site.
