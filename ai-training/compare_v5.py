"""
Compares the current ZooBot intent model with retrained candidates on the SAME held-out test set
(data/test.csv, never trained on), with an exact McNemar test against the current model.

Run from the ai-training folder after training:
    python compare_v5.py                                   (models vs models_v5 vs models_v5_xlmr)
    python compare_v5.py models models_v5 models_v5_xlmr   (any model folders; the first is the baseline)

Writes model_comparison_v5.md.
"""
import sys
import time
from math import comb

import pandas as pd
import torch
from sklearn.metrics import accuracy_score, f1_score
from transformers import AutoModelForSequenceClassification, AutoTokenizer

DIRS = sys.argv[1:] or ["models", "models_v5", "models_v5_xlmr"]
test = pd.read_csv("data/test.csv")
y = test["intent"].astype(str).str.strip().tolist()
texts = test["text"].astype(str).str.strip().tolist()
labels = sorted(set(y))


def predict(model_dir: str):
    tok = AutoTokenizer.from_pretrained(model_dir)
    model = AutoModelForSequenceClassification.from_pretrained(model_dir).eval()
    id2label = {int(k): v for k, v in model.config.id2label.items()}
    preds, confs = [], []
    start = time.perf_counter()
    for text in texts:
        with torch.no_grad():
            p = torch.softmax(model(**tok(text, return_tensors="pt", truncation=True, max_length=64)).logits, dim=1)[0]
        preds.append(id2label[int(p.argmax())])
        confs.append(float(p.max()))
    ms = (time.perf_counter() - start) * 1000 / len(texts)
    return preds, confs, ms


def mcnemar_exact(base_ok, other_ok) -> tuple[int, int, float]:
    """b = only the baseline right, c = only the other model right; two-sided exact binomial p."""
    b = sum(1 for x, z in zip(base_ok, other_ok) if x and not z)
    c = sum(1 for x, z in zip(base_ok, other_ok) if z and not x)
    n = b + c
    if n == 0:
        return b, c, 1.0
    tail = sum(comb(n, k) for k in range(0, min(b, c) + 1)) / 2 ** n
    return b, c, min(1.0, 2 * tail)


results = {}
for d in DIRS:
    preds, confs, ms = predict(d)
    ok = [p == t for p, t in zip(preds, y)]
    results[d] = dict(preds=preds, confs=confs, ok=ok, ms=ms,
                      acc=accuracy_score(y, preds), f1=f1_score(y, preds, labels=labels, average="macro", zero_division=0),
                      low=sum(c < 0.5 for c in confs))
    print(f"{d}: accuracy {results[d]['acc']:.1%}, macro F1 {results[d]['f1']:.3f}")

base = DIRS[0]
out = ["# ZooBot intent model: current vs retrained", "",
       f"All models scored on the same held-out test set: {len(y)} sentences in data/test.csv ({len(labels)} intents), "
       "none of which appear in any model's training data.", "",
       "| Model folder | Accuracy | Macro F1 | Correct | Low-confidence (<50%) | CPU ms/question | vs current (McNemar) |",
       "|---|---|---|---|---|---|---|"]
for d in DIRS:
    r = results[d]
    if d == base:
        sig = "baseline"
    else:
        b, c, p = mcnemar_exact(results[base]["ok"], r["ok"])
        sig = f"{c} fixed, {b} broken, p = {p:.3f}{' (significant)' if p < 0.05 else ' (not significant)'}"
    out.append(f"| `{d}` | {r['acc']:.1%} | {r['f1']:.3f} | {sum(r['ok'])}/{len(y)} | {r['low']} | {r['ms']:.0f} | {sig} |")

out += ["", "## Accuracy per intent", "", "| Intent | Test sentences | " + " | ".join(f"`{d}`" for d in DIRS) + " |",
        "|---|---|" + "---|" * len(DIRS)]
for lab in labels:
    idx = [i for i, t in enumerate(y) if t == lab]
    cells = [f"{sum(results[d]['ok'][i] for i in idx) / len(idx):.0%}" for d in DIRS]
    out.append(f"| {lab} | {len(idx)} | " + " | ".join(cells) + " |")

for d in DIRS:
    r = results[d]
    wrong = [(texts[i], y[i], r["preds"][i], r["confs"][i]) for i in range(len(y)) if not r["ok"][i]]
    out += ["", f"## `{d}`: wrong answers ({len(wrong)})", ""]
    out += [f"- \"{t}\": expected **{e}**, got **{p}** ({c:.0%})" for t, e, p, c in wrong] or ["- none"]

out += ["", "CPU time was measured on the development machine; compare the rows with each other rather than as a benchmark.",
        "With one test set of this size, a difference that McNemar marks as not significant should be reported as observed, not proven."]
with open("model_comparison_v5.md", "w", encoding="utf-8") as f:
    f.write("\n".join(out) + "\n")
print("Wrote model_comparison_v5.md")
