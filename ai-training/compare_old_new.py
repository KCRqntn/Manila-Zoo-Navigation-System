"""
Scores the current chatbot model and a retrained one on the SAME test set (data/test.csv).

Run from the ai-training folder after training:
    python compare_old_new.py [old_model_dir] [new_model_dir]      (default: models models_v4)

Writes old_vs_new.md. Use it to decide whether to switch the chatbot to the new model.
"""
import sys

import pandas as pd
import torch
from sklearn.metrics import accuracy_score, f1_score
from transformers import AutoModelForSequenceClassification, AutoTokenizer

OLD, NEW = (sys.argv[1:3] + ["models", "models_v4"][len(sys.argv[1:3]):])[:2]
test = pd.read_csv("data/test.csv")
y = test["intent"].tolist()
labels = sorted(set(y))


def predict(model_dir):
    tok = AutoTokenizer.from_pretrained(model_dir)
    model = AutoModelForSequenceClassification.from_pretrained(model_dir).eval()
    id2label = {int(k): v for k, v in model.config.id2label.items()}
    out = []
    for text in test["text"]:
        with torch.no_grad():
            p = torch.softmax(model(**tok(text, return_tensors="pt", truncation=True, max_length=64)).logits, dim=1)[0]
        out.append((id2label[int(p.argmax())], float(p.max())))
    return out


results = {name: predict(d) for name, d in (("current", OLD), ("retrained", NEW))}
lines = [
    "# Current vs retrained ZooBot model",
    "",
    f"Same test set for both: {len(test)} questions in data/test.csv ({len(labels)} intents).",
    "",
    "| Model | Folder | Accuracy | Macro F1 | Low-confidence answers (<50%) |",
    "|---|---|---|---|---|",
]
for (name, preds), folder in zip(results.items(), (OLD, NEW)):
    p = [x for x, _ in preds]
    low = sum(c < 0.5 for _, c in preds)
    lines.append(f"| {name} | {folder} | {accuracy_score(y, p):.1%} | "
                 f"{f1_score(y, p, average='macro', labels=labels, zero_division=0):.3f} | {low} |")

lines += ["", "## Per intent (accuracy)", "", "| Intent | Questions | Current | Retrained |", "|---|---|---|---|"]
for label in labels:
    idx = [i for i, t in enumerate(y) if t == label]
    cur = sum(results["current"][i][0] == label for i in idx) / len(idx)
    new = sum(results["retrained"][i][0] == label for i in idx) / len(idx)
    lines.append(f"| {label} | {len(idx)} | {cur:.0%} | {new:.0%} |")

lines += ["", "## Retrained model: wrong answers", ""]
for text, want, (got, conf) in zip(test["text"], y, results["retrained"]):
    if got != want:
        lines.append(f"- \"{text}\": expected **{want}**, got **{got}** ({conf:.0%})")

open("old_vs_new.md", "w", encoding="utf-8").write("\n".join(lines) + "\n")
print("\n".join(lines[4:4 + 4]))
print("wrote old_vs_new.md")
