"""
Side-by-side comparison of the fine-tuned models, for the thesis results chapter.

Run from the ai-training folder after training both models:
    python compare_models.py

Reads models/eval_report.json and models_xlmr/eval_report.json, measures model size and
CPU inference speed, and writes model_comparison.md.
"""
import json
import math
import os
import time

import pandas as pd
import torch
from transformers import AutoModelForSequenceClassification, AutoTokenizer

MODELS = [("mBERT", "models"), ("XLM-RoBERTa", "models_xlmr_clean")]
TEST = pd.read_csv("data/test.csv")
TEST["text"] = TEST["text"].astype(str).str.strip()


def dir_size_mb(path: str) -> float:
    # Only the files the app loads, not old training checkpoints
    names = ["model.safetensors", "config.json", "tokenizer.json", "tokenizer_config.json", "sentencepiece.bpe.model", "special_tokens_map.json"]
    return sum(os.path.getsize(os.path.join(path, n)) for n in names if os.path.exists(os.path.join(path, n))) / 1e6


def cpu_latency_ms(path: str) -> tuple[int, float]:
    """Average time to classify one sentence on CPU, the way predict_api.py does it."""
    tok = AutoTokenizer.from_pretrained(path)
    model = AutoModelForSequenceClassification.from_pretrained(path).eval()
    params = sum(p.numel() for p in model.parameters())
    texts = TEST["text"].tolist()
    with torch.no_grad():
        for t in texts[:5]:  # warm-up
            model(**tok(t, return_tensors="pt", truncation=True, max_length=64))
        start = time.perf_counter()
        for t in texts:
            model(**tok(t, return_tensors="pt", truncation=True, max_length=64))
    return params, (time.perf_counter() - start) / len(texts) * 1000


def mcnemar_exact_p(b: int, c: int) -> float:
    """Two-sided exact McNemar test: b = only model A right, c = only model B right."""
    n = b + c
    if n == 0:
        return 1.0
    k = min(b, c)
    p = sum(math.comb(n, i) for i in range(k + 1)) / 2 ** n
    return min(1.0, 2 * p)


reports, stats = {}, {}
for name, path in MODELS:
    report_path = os.path.join(path, "eval_report.json")
    if not os.path.exists(report_path):
        raise SystemExit(f"Missing {report_path}. Train it first (see train.py).")
    with open(report_path, encoding="utf-8") as f:
        reports[name] = json.load(f)
    params, ms = cpu_latency_ms(path)
    stats[name] = {"params_m": params / 1e6, "size_mb": dir_size_mb(path), "latency_ms": ms}

(a_name, _), (b_name, _) = MODELS
a, b = reports[a_name], reports[b_name]
wrong_a = {e["text"] for e in a["misclassified"]}
wrong_b = {e["text"] for e in b["misclassified"]}
only_a_right = len(wrong_b - wrong_a)
only_b_right = len(wrong_a - wrong_b)
both_wrong = len(wrong_a & wrong_b)
p_value = mcnemar_exact_p(only_a_right, only_b_right)

lines = [
    "# Model Comparison: mBERT vs XLM-RoBERTa",
    "",
    f"Both models were fine-tuned with identical data ({a['train_size']} sentences), hyperparameters "
    f"(epochs {a['hyperparameters']['epochs']}, learning rate {a['hyperparameters']['learning_rate']}, "
    f"batch size {a['hyperparameters']['batch_size']}, seed {a['hyperparameters']['seed']}), and the same "
    f"{a['test_size']}-sentence held-out test set in English, Tagalog, and Taglish.",
    "",
    "## Overall",
    "",
    "| Model | Base checkpoint | Accuracy | Macro F1 | Parameters | Size on disk | CPU time per question |",
    "|---|---|---|---|---|---|---|",
]
for name, _ in MODELS:
    r, s = reports[name], stats[name]
    lines.append(
        f"| {name} | `{r['base_model']}` | {r['bert']['accuracy']:.1%} | {r['bert']['macro_f1']:.3f} | "
        f"{s['params_m']:.0f}M | {s['size_mb']:.0f} MB | {s['latency_ms']:.0f} ms |"
    )
kw = a["keyword_baseline"]
lines.append(f"| Keyword rules (baseline) | none | {kw['accuracy']:.1%} | {kw['macro_f1']:.3f} | none | none | under 1 ms |")

lines += [
    "",
    "## F1 per intent",
    "",
    f"| Intent | {a_name} | {b_name} | Test sentences |",
    "|---|---|---|---|",
]
for intent in a["intents"]:
    fa, fb = a["per_intent"][intent]["f1-score"], b["per_intent"][intent]["f1-score"]
    mark_a, mark_b = ("**", "") if fa > fb else ("", "**") if fb > fa else ("", "")
    lines.append(f"| {intent} | {mark_a}{fa:.3f}{mark_a} | {mark_b}{fb:.3f}{mark_b} | {int(a['per_intent'][intent]['support'])} |")

lines += [
    "",
    "## Agreement on the test set",
    "",
    f"- Both correct: {a['test_size'] - len(wrong_a | wrong_b)}",
    f"- Only {a_name} correct: {only_a_right}",
    f"- Only {b_name} correct: {only_b_right}",
    f"- Both wrong: {both_wrong}",
    "",
    f"Exact McNemar test: p = {p_value:.3f}. "
    + ("The difference between the two models is statistically significant (p < 0.05)."
       if p_value < 0.05 else
       "The difference between the two models is **not** statistically significant at p < 0.05 on this test set, "
       "so the accuracy gap should be reported as an observed difference, not a proven one."),
    "",
    "CPU time was measured on the development machine and will differ on other hardware; compare the two rows "
    "with each other rather than reading the absolute numbers as a benchmark.",
]

with open("model_comparison.md", "w", encoding="utf-8") as f:
    f.write("\n".join(lines) + "\n")
print("\n".join(lines))
