"""
Results tables for the ISO/IEC 25010 survey (project-notes/iso25010-evaluation-survey.md).

1. Type each completed questionnaire as one row of survey_responses.csv (copy survey_responses_template.csv):
   respondent, group (Visitor / Staff / IT), then the rating 1-5 for each item. Leave an item blank if the
   respondent's group doesn't answer it (e.g. visitors skip 6.x-9.x) or they left it unanswered.
2. Run:  python survey_analysis.py [survey_responses.csv]
3. Open survey_results.md: per-item and per-characteristic weighted mean, standard deviation and verbal
   interpretation, per respondent group and overall, plus Cronbach's alpha for each characteristic.
"""
import csv
import math
import sys
from collections import defaultdict

CHARACTERISTICS = [
    ("Functional suitability", ["1.1", "1.2", "1.3", "1.4", "1.5", "1.6"]),
    ("Performance efficiency", ["2.1", "2.2", "2.3", "2.4"]),
    ("Compatibility", ["3.1", "3.2"]),
    ("Usability", ["4.1", "4.2", "4.3", "4.4", "4.5", "4.6", "4.7"]),
    ("Reliability", ["5.1", "5.2", "5.3"]),
    ("Functional suitability: admin dashboard", ["6.1", "6.2", "6.3", "6.4", "6.5", "6.6", "6.7"]),
    ("Security", ["7.1", "7.2", "7.3", "7.4"]),
    ("Maintainability", ["8.1", "8.2", "8.3", "8.4", "8.5"]),
    ("Portability", ["9.1", "9.2", "9.3"]),
]
ITEMS = [i for _, items in CHARACTERISTICS for i in items]
GROUPS = ["Visitor", "Staff", "IT"]
SCALE = [(4.21, "Strongly Agree", "Excellent"), (3.41, "Agree", "Very good"), (2.61, "Neutral", "Good"),
         (1.81, "Disagree", "Fair"), (1.00, "Strongly Disagree", "Poor")]


def interpret(mean: float) -> str:
    for low, verbal, quality in SCALE:
        if mean >= low - 1e-9:
            return f"{verbal} ({quality})"
    return "-"


def mean_sd(values: list[float]) -> tuple[float, float]:
    n = len(values)
    m = sum(values) / n
    sd = math.sqrt(sum((v - m) ** 2 for v in values) / (n - 1)) if n > 1 else 0.0  # sample SD
    return m, sd


def cronbach_alpha(rows: list[dict], items: list[str]) -> tuple[float | None, int]:
    """Alpha over respondents who answered every item of the characteristic."""
    complete = [[r[i] for i in items] for r in rows if all(r.get(i) is not None for i in items)]
    k, n = len(items), len(complete)
    if k < 2 or n < 3:
        return None, n
    item_var = sum(mean_sd([row[j] for row in complete])[1] ** 2 for j in range(k))
    total_var = mean_sd([sum(row) for row in complete])[1] ** 2
    if total_var == 0:
        return None, n
    return k / (k - 1) * (1 - item_var / total_var), n


def alpha_label(a: float) -> str:
    return ("Excellent" if a >= 0.9 else "Good" if a >= 0.8 else "Acceptable" if a >= 0.7
            else "Questionable" if a >= 0.6 else "Poor" if a >= 0.5 else "Unacceptable")


path = sys.argv[1] if len(sys.argv) > 1 else "survey_responses.csv"
rows = []
with open(path, newline="", encoding="utf-8-sig") as f:
    for raw in csv.DictReader(f):
        group = (raw.get("group") or "").strip().title()
        group = {"It": "IT", "It Expert": "IT", "Zoo Staff": "Staff"}.get(group, group)
        if group not in GROUPS:
            sys.exit(f"Row {raw.get('respondent')}: group must be Visitor, Staff or IT (got {raw.get('group')!r})")
        row = {"group": group}
        for item in ITEMS:
            v = (raw.get(item) or "").strip()
            if v and v not in "12345":
                sys.exit(f"Row {raw.get('respondent')}, item {item}: rating must be 1-5 (got {v!r})")
            row[item] = float(v) if v else None
        rows.append(row)

by_group = defaultdict(list)
for r in rows:
    by_group[r["group"]].append(r)
counts = ", ".join(f"{g}: {len(by_group[g])}" for g in GROUPS)
out = [
    "# ISO/IEC 25010 survey results",
    "",
    f"Respondents: **{len(rows)}** ({counts}). Ratings 1 (Strongly Disagree) to 5 (Strongly Agree).",
    "Weighted mean WM = Σ(f·x)/N; SD is the sample standard deviation. Blank answers are left out of each item's N.",
    "",
]

summary = []
for name, items in CHARACTERISTICS:
    out += [f"## {name}", "", "| Item | N | WM | SD | Interpretation |", "|---|---|---|---|---|"]
    all_vals = []
    for item in items:
        vals = [r[item] for r in rows if r[item] is not None]
        all_vals += vals
        if vals:
            m, sd = mean_sd(vals)
            out.append(f"| {item} | {len(vals)} | {m:.2f} | {sd:.2f} | {interpret(m)} |")
        else:
            out.append(f"| {item} | 0 | - | - | no answers |")
    if all_vals:
        m, sd = mean_sd(all_vals)
        out.append(f"| **Overall** | {len(all_vals)} | **{m:.2f}** | {sd:.2f} | **{interpret(m)}** |")
        per_group = {g: [r[i] for r in by_group[g] for i in items if r[i] is not None] for g in GROUPS}
        alpha, n_alpha = cronbach_alpha(rows, items)
        summary.append((name, m, sd, {g: (sum(v) / len(v) if v else None) for g, v in per_group.items()}, alpha, n_alpha))
    out.append("")

out += ["## Summary by characteristic", "",
        "| Characteristic | Visitor WM | Staff WM | IT WM | Overall WM | SD | Interpretation | Cronbach's α (n) |",
        "|---|---|---|---|---|---|---|---|"]
for name, m, sd, pg, alpha, n_alpha in summary:
    cells = " | ".join(f"{pg[g]:.2f}" if pg[g] is not None else "-" for g in GROUPS)
    a = f"{alpha:.2f} {alpha_label(alpha)} ({n_alpha})" if alpha is not None else f"- (needs 3+ complete answers; {n_alpha})"
    out.append(f"| {name} | {cells} | {m:.2f} | {sd:.2f} | {interpret(m)} | {a} |")
everything = [r[i] for r in rows for i in ITEMS if r[i] is not None]
if everything:
    m, sd = mean_sd(everything)
    out.append(f"| **All characteristics** | | | | **{m:.2f}** | {sd:.2f} | **{interpret(m)}** | |")

out += ["", "Cronbach's α: ≥ 0.90 excellent, 0.80–0.89 good, 0.70–0.79 acceptable, 0.60–0.69 questionable, "
        "0.50–0.59 poor, < 0.50 unacceptable. It is computed per characteristic from respondents who answered all its items; "
        "characteristics with few items (e.g. Compatibility, 2 items) tend to give lower α."]
open("survey_results.md", "w", encoding="utf-8").write("\n".join(out) + "\n")
print(f"{len(rows)} respondents -> survey_results.md")
