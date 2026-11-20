# Demo guide: presenting the system to the statistician

## Before the meeting (10 minutes)

1. Plug the laptop in and connect to the internet.
2. Double-click **Start Manila Zoo Demo** on the desktop (or `start-demo.cmd` in the project folder). It starts the
   AI service, the API and the website, waits until all three are ready (about a minute), then starts the
   **phone link** and waits until it works from the internet (up to 3 minutes). The link is saved into the
   system automatically, so **every QR code uses it**: the website / Visitor Registration QR code, the exhibit
   QR codes and the poster in `visitor-qr-code/`. It is also written to `current-phone-link.txt`.
   Keep the minimised **"Zoo phone link"** window open; closing it takes the site off phones.
3. On your own phone: scan the website QR code (refresh any page on the laptop, or open Admin → QR Code
   Access), and ask the AI Guide one question, to confirm everything answers.
4. Printed exhibit QR signs made before the demo day contain an old link: reprint them from
   Admin → Exhibit QR Codes → **Print all** (the website QR / registration poster is in `visitor-qr-code/`).
5. Keep these files open in tabs: `ai-training/statistical_analysis.md`, `ai-training/models/eval_report.md`,
   and `project-notes/iso25010-evaluation-survey.md`.

If something doesn't start, read the error in the server window that closed or shows red text, fix it, and run `start-demo.cmd` again.

## Suggested demo order (10–15 minutes)

1. **What the system is** (1 minute): a web app for Manila Zoo visitors with a map, animal information, QR codes and an AI chatbot, plus an admin dashboard for zoo staff.
2. **Visitor side on the phone:**
   - Scan the website QR code → **Visitor Login** → **Sign up** → **Manila Zoo Visitor Registration**: create the account, choose
     **With companions** and add them (for example 2 children and a senior citizen who is a PWD) → review → **Confirm & Register**
     → the zoo map opens. Then log out, scan again → **Visitor Login** → **Register Your New Visit** with a different
     group, to show repeat visits. The dashboard updates within 30 seconds.
   - Map → **My location** (or **Select location**) → **Find Nearest Restroom**: shows the route, distance and walking time.
   - Scan a printed QR sign: opens that animal's page.
   - AI Guide: ask in English ("How much is the ticket?"), Filipino ("Saan ang leon?"), with a typo ("wher is the capybra"), and something unrelated ("What's the weather?") to show the fallback reply.
     Specific questions get only what was asked ("What is the habitat of the lion?"), and anything not in the
     database is refused ("What is the largest animal in the world?").
3. **Admin dashboard** on the laptop: **Visitors (from registrations)** (registered visitor accounts, visits, total
   attendance, first-time vs returning visits, companions, average group size, children, adults, senior
   citizens, PWDs, daily, weekly and monthly charts, age distribution), **Visitors → Visitor
   Registrations** (visit history per visitor, CSV export, **Reset password** for a visitor who forgot theirs), then
   animals, the 3D map editor and analytics.
4. **The numbers** (the part the statistician cares about): below.

## The chatbot evaluation, in numbers

**Design.** Intent classification with 10 intents. The model (bert-base-multilingual-cased) was fine-tuned on **476** training questions and evaluated on **94 held-out test questions** that were written separately and never used in training (English, Tagalog, Taglish; 6–12 per intent). The previous keyword rules and an alternative model (XLM-RoBERTa) were scored on the same 94 questions.

| Method | Accuracy | 95% CI | Macro-F1 (95% CI) | Cohen's κ |
|---|---|---|---|---|
| **mBERT (used by the chatbot)** | **91.5%** (86/94) | 84.1% – 95.6% | 0.907 (0.827 – 0.962) | 0.905 |
| XLM-RoBERTa | 94.7% (89/94) | 88.1% – 97.7% | 0.946 (0.882 – 0.989) | 0.941 |
| Keyword rules (previous) | 54.3% (51/94) | 44.2% – 64.0% | 0.507 (0.390 – 0.591) | 0.493 |

**Significance (exact McNemar test, paired on the same questions):**
- mBERT vs keyword rules: 37 questions only mBERT got right, 2 only the rules got right, **p < 0.0001**, a significant improvement.
- mBERT vs XLM-RoBERTa: 2 vs 5, **p = 0.453**, not significant. mBERT was kept because the panel specified it and it is smaller and faster (714 MB vs 1,129 MB; 136 ms vs 162 ms per question).

Accuracy intervals use the Wilson method, which suits proportions near 100% and small samples. Macro-F1 intervals are bootstrap intervals from 2,000 resamples. Full details are in `ai-training/statistical_analysis.md`; rerun it with `python statistical_analysis.py` in the `ai-training` folder.

**Where the model goes wrong.** 5 of its 8 errors were questions wrongly labelled *facilities* (for example "Where is the ticket booth?" and "Nasaan ang clinic?"). The chatbot's place and rule detection still answers most of these correctly in practice, but the classifier itself over-predicts *facilities*. The confusion matrix is in `ai-training/models/eval_report.md`.

## The survey (ISO/IEC 25010)

- **Instrument:** 41 Likert items (1 = Strongly Disagree to 5 = Strongly Agree) across the eight ISO/IEC 25010 characteristics. Visitors answer the visitor items, zoo staff also rate the admin dashboard, and IT experts answer everything.
- **Respondents:** at least 30 visitors, chosen by **convenience sampling** (visitors available at the zoo); 3–5 zoo staff and 3–5 IT experts, chosen by **purposive sampling**.
- **Treatment:** weighted mean and standard deviation per item and characteristic, interpreted on the 5-point scale (4.21–5.00 Strongly Agree … 1.00–1.80 Strongly Disagree), reported per group and overall.
- **Reliability:** Cronbach's alpha per characteristic from a pilot test of 10–15 people, aiming for 0.70 or higher.
- **Tool:** `project-notes/survey/survey_analysis.py` produces all the tables from the typed responses.

## Questions the statistician may ask

- **"Why only 94 test questions?"** It is a held-out set written separately from the training data. The confidence intervals show the uncertainty (mBERT's accuracy is likely between 84% and 96%). Per-intent figures have wider uncertainty because each intent has only 6–12 questions.
- **"Is the improvement over the old method real?"** Yes. McNemar p < 0.0001 on the same 94 questions.
- **"Is XLM-RoBERTa better?"** It scored higher, but the difference is not significant (p = 0.453).
- **"How were the test questions made?"** They were written separately from the training questions to cover realistic visitor wording, then checked so they only ask about what Manila Zoo actually has (see `ai-training/DATASET_CLEANUP.md`).
- **"Can visitors' results be generalised to all zoo visitors?"** Not strictly, because they're a convenience sample. Report the results as describing the respondents.
- **"What is the 'Avg. confidence' on the dashboard?"** It is the model's average confidence in its own answers to real chat messages. It is **not** accuracy; accuracy comes only from the labelled test set above.

## Visitor counts (from the registration form)

- **Accounts and visits:** a first visit creates a visitor account (email + password) and registers that day's group;
  returning visitors scan the same QR code, log in, and register a **new visit** with that day's group (earlier
  companions don't carry over). Each visit is its own record, numbered per account; earlier visits never change.
- **Unit of count:** a **person-visit** (one person on one visit). A visitor who comes three times with groups of 4, 5
  and 2 makes 1 account, 3 visits and 11 person-visits. Scanning the QR code, opening pages or logging in never counts
  anyone; a visit counts only after it is saved with all its people. Failed or repeated submissions are not counted (one registration ID
  per form, stored once; the same person and group within 30 minutes is treated as the same registration).
- **Categories:** each person has one age category (child below 18, adult 18–59, senior citizen 60+ as in RA 9994),
  so children + adults + seniors = unique visitors. **PWD** is a flag on a person, not a separate group: a senior
  who is a PWD is in both "seniors" and "PWD" but counted once in the total.
- **Age and sex of the registrant** describe the person who filled in the form; ages of everyone else come from
  the group details.
- **If asked about validity:** registration is voluntary and self-reported, so the counts describe registered
  visitors, not everyone who entered the zoo. Compare with gate/ticket counts if the zoo provides them.

## Things to keep in mind

- The admin dashboard's chat statistics include about 450 automated test messages from October 19–21, 2026. Clear them before collecting real usage data, or don't cite those numbers.
- Feeding times, parking fees and upcoming events are still unconfirmed with the zoo. Don't present them as official.
- The phone link changes every time it is restarted (after a laptop restart, run the desktop shortcut again).
  Send the link from `current-phone-link.txt` to people on the day of the demo.
- Before collecting real visitor data, delete any test registrations made while practising (Admin → Visitor
  Registrations shows them; ask for help removing them so the counts start at zero).
- The privacy notice on the registration form is draft wording; have it reviewed before real use.
