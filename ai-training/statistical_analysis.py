"""
Statistical treatment of the chatbot evaluation, for Chapter 4 and the statistician.

Run from the ai-training folder:
    python statistical_analysis.py

Scores the live model (models/), XLM-RoBERTa (models_xlmr_clean/, if present) and the keyword rules
on the same held-out test set (data/test.csv), then writes statistical_analysis.md with:
  - accuracy with a 95% Wilson confidence interval
  - macro-F1 with a 95% bootstrap confidence interval
  - Cohen's kappa (agreement with the correct intents beyond chance)
  - exact McNemar tests between methods (same questions, paired)
"""
import math
import os
import random
import re
import sys

import pandas as pd
import torch
from sklearn.metrics import accuracy_score, cohen_kappa_score, f1_score
from transformers import AutoModelForSequenceClassification, AutoTokenizer

test = pd.read_csv("data/test.csv")
texts = test["text"].astype(str).str.strip().tolist()
truth = test["intent"].tolist()
labels = sorted(set(truth))
n = len(truth)

# The keyword rules exactly as train.py defines them (the chatbot's previous method)
source = open("train.py", encoding="utf-8").read()
rules_src = re.search(r"^KEYWORD_RULES = \[.*?^\]", source, re.S | re.M).group(0)
scope: dict = {}
exec(rules_src, {}, scope)  # noqa: S102 - our own file, a list literal of (pattern, intent)
KEYWORD_RULES = scope["KEYWORD_RULES"]


def keyword_intent(text: str) -> str:
    for pattern, intent in KEYWORD_RULES:
        if re.search(pattern, text, re.IGNORECASE):
            return intent
    return "general"


def model_predictions(folder: str) -> list[str]:
    tok = AutoTokenizer.from_pretrained(folder)
    model = AutoModelForSequenceClassification.from_pretrained(folder).eval()
    id2label = {int(k): v for k, v in model.config.id2label.items()}
    out = []
    with torch.no_grad():
        for t in texts:
            logits = model(**tok(t, return_tensors="pt", truncation=True, max_length=64)).logits
            out.append(id2label[int(logits.argmax())])
    return out


def wilson(correct: int, total: int, z: float = 1.96) -> tuple[float, float]:
    p = correct / total
    centre = (p + z * z / (2 * total)) / (1 + z * z / total)
    half = z * math.sqrt(p * (1 - p) / total + z * z / (4 * total * total)) / (1 + z * z / total)
    return centre - half, centre + half


def bootstrap_macro_f1(pred: list[str], reps: int = 2000, seed: int = 42) -> tuple[float, float]:
    rng = random.Random(seed)
    scores = []
    for _ in range(reps):
        idx = [rng.randrange(n) for _ in range(n)]
        scores.append(f1_score([truth[i] for i in idx], [pred[i] for i in idx], average="macro", labels=labels, zero_division=0))
    scores.sort()
    return scores[int(0.025 * reps)], scores[int(0.975 * reps) - 1]


def mcnemar_exact(a: list[str], b: list[str]) -> tuple[int, int, float]:
    """b10 = only A right, b01 = only B right; two-sided exact binomial p-value."""
    only_a = sum(x == t and y != t for x, y, t in zip(a, b, truth))
    only_b = sum(y == t and x != t for x, y, t in zip(a, b, truth))
    k, m = min(only_a, only_b), only_a + only_b
    p = 1.0 if m == 0 else min(1.0, 2 * sum(math.comb(m, i) for i in range(k + 1)) / 2 ** m)
    return only_a, only_b, p


methods = {"mBERT (live chatbot model)": model_predictions("models")}
if os.path.isdir("models_xlmr_clean"):
    methods["XLM-RoBERTa"] = model_predictions("models_xlmr_clean")
methods["Keyword rules (previous method)"] = [keyword_intent(t) for t in texts]

lines = [
    "# Statistical analysis of the chatbot evaluation",
    "",
    f"Held-out test set: **{n} questions** in English, Tagalog and Taglish across {len(labels)} intents "
    f"(`data/test.csv`; none appear in the training data). All methods answer the same questions, so comparisons are paired.",
    "",
    "## Accuracy and agreement",
    "",
    "| Method | Correct | Accuracy | 95% CI (Wilson) | Macro-F1 | 95% CI (bootstrap, 2,000 resamples) | Cohen's κ |",
    "|---|---|---|---|---|---|---|",
]
for name, pred in methods.items():
    correct = sum(p == t for p, t in zip(pred, truth))
    lo, hi = wilson(correct, n)
    f1 = f1_score(truth, pred, average="macro", labels=labels, zero_division=0)
    flo, fhi = bootstrap_macro_f1(pred)
    kappa = cohen_kappa_score(truth, pred)
    lines.append(f"| {name} | {correct}/{n} | {accuracy_score(truth, pred):.1%} | {lo:.1%} – {hi:.1%} | {f1:.3f} | {flo:.3f} – {fhi:.3f} | {kappa:.3f} |")

lines += [
    "",
    "## Paired comparisons (exact McNemar test)",
    "",
    "Counts only the questions where the two methods disagree on correctness. p < 0.05 means the difference is statistically significant.",
    "",
    "| Comparison | Only first right | Only second right | p-value | Significant at 0.05? |",
    "|---|---|---|---|---|",
]
names = list(methods)
for i in range(len(names)):
    for j in range(i + 1, len(names)):
        a, b, p = mcnemar_exact(methods[names[i]], methods[names[j]])
        shown = "< 0.0001" if p < 0.0001 else f"{p:.4f}"
        lines.append(f"| {names[i]} vs {names[j]} | {a} | {b} | {shown} | {'Yes' if p < 0.05 else 'No'} |")

lines += [
    "",
    "## How to read this",
    "",
    "- **Wilson interval:** the range the true accuracy likely falls in (95% confidence), given only 94 test questions. "
    "It is preferred over the normal approximation for proportions near 100% and small samples.",
    "- **Bootstrap interval for macro-F1:** the test questions are resampled with replacement 2,000 times; the middle 95% of the scores is the interval.",
    "- **Cohen's κ:** agreement between the predicted and correct intents after removing chance agreement "
    "(0.81–1.00 is conventionally read as \"almost perfect\", 0.61–0.80 \"substantial\").",
    "- **McNemar test:** compares two methods on the same questions; it uses only the questions one method got right and the other got wrong.",
    "- **Limitation:** with 94 test questions (6–12 per intent), per-intent figures have wide uncertainty; "
    "the overall figures are more reliable than any single intent's.",
]
open("statistical_analysis.md", "w", encoding="utf-8").write("\n".join(lines) + "\n")
sys.stdout.reconfigure(encoding="utf-8")  # the Windows console can't show "κ" otherwise
print("\n".join(lines[6:6 + 2 + len(methods)]))
print("wrote statistical_analysis.md")
