"""
Fine-tune bert-base-multilingual-cased as the ZooBot intent classifier, then evaluate it
on a separately written test set and compare it with the rule-based keyword matcher.

Run from the ai-training folder:
    python train.py                                   # mBERT -> models/ (the model the chatbot uses)
    python train.py --model xlm-roberta-base --output models_xlmr   # XLM-RoBERTa, for comparison
    python compare_models.py                          # side-by-side table of both reports

Approved examples that admins add on the Chatbot Configuration page are downloaded from the
running API (--admin-api) and added to the training data. Use --no-admin-data to skip them.

Outputs (in models/):
    model.safetensors, config.json, tokenizer files  -> loaded by predict_api.py
    labels.json                                      -> intent name <-> class id
    eval_report.json / eval_report.md                -> accuracy, F1, confusion matrix
"""
import argparse
import json
import os
import re
import random
import urllib.request
from datetime import datetime, timezone

import numpy as np
import pandas as pd
import torch
from datasets import Dataset
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, f1_score
from transformers import (
    AutoModelForSequenceClassification,
    AutoTokenizer,
    DataCollatorWithPadding,
    Trainer,
    TrainingArguments,
)

parser = argparse.ArgumentParser(description="Fine-tune and evaluate a ZooBot intent classifier")
parser.add_argument("--model", default="bert-base-multilingual-cased", help="Hugging Face base model")
parser.add_argument("--output", default="models", help="Where to save the model and evaluation report")
parser.add_argument("--train", default="data/train.csv", help="Training data (text,intent); the test set is always data/test.csv")
parser.add_argument("--admin-api", default="http://127.0.0.1:5000/api/training/dataset",
                    help="API endpoint listing admin-entered training examples")
parser.add_argument("--no-admin-data", action="store_true", help="Train on data/train.csv only")
parser.add_argument("--data-only", action="store_true", help="Show what would be trained on, then stop (no training)")
cli = parser.parse_args()

BASE_MODEL = cli.model
OUTPUT_DIR = cli.output
SEED = 42
EPOCHS = 10
LEARNING_RATE = 3e-5
BATCH_SIZE = 16
MAX_LENGTH = 64

random.seed(SEED)
np.random.seed(SEED)
torch.manual_seed(SEED)
os.makedirs(OUTPUT_DIR, exist_ok=True)


def load(path: str) -> pd.DataFrame:
    df = pd.read_csv(path)
    df["text"] = df["text"].astype(str).str.strip()
    df["intent"] = df["intent"].astype(str).str.strip()
    df = df[df["text"] != ""].drop_duplicates(subset="text")
    return df.reset_index(drop=True)


train_df = load(cli.train)
test_df = load("data/test.csv")
known_intents = set(train_df["intent"])


def load_admin_examples() -> pd.DataFrame:
    """Approved admin examples with a known intent; never mixed into the test set."""
    empty = pd.DataFrame(columns=["text", "intent"])
    if cli.no_admin_data:
        return empty
    try:
        with urllib.request.urlopen(cli.admin_api, timeout=10) as response:
            rows = json.load(response)
    except Exception as error:  # API not running: train on the CSV alone
        print(f"Admin examples skipped (could not reach {cli.admin_api}: {error})")
        return empty
    approved = [r for r in rows if r.get("is_validated")]
    df = pd.DataFrame(
        [{"text": str(r.get("question", "")).strip(), "intent": str(r.get("intent", "")).strip()} for r in approved],
        columns=["text", "intent"],
    )
    df = df[df["text"] != ""]
    bad = df[~df["intent"].isin(known_intents)]
    if len(bad):
        print(f"Skipping {len(bad)} admin examples with unknown intents: {sorted(set(bad['intent']))}")
    df = df[df["intent"].isin(known_intents)]
    # Keep the test set honest: an admin example identical to a test sentence is not trained on
    leaked = df["text"].str.lower().isin(set(test_df["text"].str.lower()))
    if leaked.any():
        print(f"Skipping {int(leaked.sum())} admin examples that duplicate test sentences")
    df = df[~leaked]
    print(f"Admin examples: {len(rows)} total, {len(approved)} approved, {len(df)} used for training")
    return df.reset_index(drop=True)


admin_df = load_admin_examples()
before = len(train_df)
train_df = pd.concat([train_df, admin_df], ignore_index=True).drop_duplicates(subset="text").reset_index(drop=True)
admin_examples_used = len(train_df) - before

# The test set must stay unseen: drop any sentence that also appears in training.
overlap = set(train_df["text"].str.lower()) & set(test_df["text"].str.lower())
if overlap:
    print(f"Removing {len(overlap)} test sentences that also appear in train: {sorted(overlap)}")
    test_df = test_df[~test_df["text"].str.lower().isin(overlap)].reset_index(drop=True)

labels = sorted(train_df["intent"].unique())
unknown = set(test_df["intent"]) - set(labels)
if unknown:
    raise SystemExit(f"Test set has intents missing from training: {unknown}")

label2id = {label: i for i, label in enumerate(labels)}
id2label = {i: label for label, i in label2id.items()}
with open(f"{OUTPUT_DIR}/labels.json", "w", encoding="utf-8") as f:
    json.dump(label2id, f, ensure_ascii=False, indent=2)

print(f"Train: {len(train_df)} sentences | Test: {len(test_df)} sentences | Intents: {labels}")
print(train_df["intent"].value_counts().sort_index().to_string())
if cli.data_only:
    raise SystemExit(0)

tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL)


def to_dataset(df: pd.DataFrame) -> Dataset:
    ds = Dataset.from_dict({"text": df["text"].tolist(), "label": [label2id[i] for i in df["intent"]]})
    return ds.map(lambda b: tokenizer(b["text"], truncation=True, max_length=MAX_LENGTH), batched=True)


train_ds = to_dataset(train_df)
test_ds = to_dataset(test_df)

model = AutoModelForSequenceClassification.from_pretrained(
    BASE_MODEL, num_labels=len(labels), id2label=id2label, label2id=label2id
)

args = TrainingArguments(
    output_dir=f"{OUTPUT_DIR}/_run",
    num_train_epochs=EPOCHS,
    learning_rate=LEARNING_RATE,
    per_device_train_batch_size=BATCH_SIZE,
    per_device_eval_batch_size=32,
    weight_decay=0.01,
    warmup_steps=0.1,     # transformers 5: a value below 1 is a fraction of total steps
    logging_steps=10,
    save_strategy="no",   # fixed number of epochs; the test set is never used to pick a checkpoint
    eval_strategy="no",
    seed=SEED,
    report_to=[],
)

trainer = Trainer(
    model=model,
    args=args,
    train_dataset=train_ds,
    processing_class=tokenizer,
    data_collator=DataCollatorWithPadding(tokenizer),
)
trainer.train()

model.save_pretrained(OUTPUT_DIR)
tokenizer.save_pretrained(OUTPUT_DIR)

# ─── Evaluation on the held-out test set ─────────────────────────────────────

pred = trainer.predict(test_ds)
probs = torch.softmax(torch.tensor(pred.predictions), dim=1).numpy()
bert_ids = probs.argmax(axis=1)
bert_pred = [id2label[i] for i in bert_ids]
bert_conf = probs.max(axis=1)
y_true = test_df["intent"].tolist()


# Python port of detectIntent() in artifacts/api-server/src/routes/chat.ts (same order, same patterns),
# used as the rule-based baseline.
KEYWORD_RULES = [
    (r"where|location|find|locate|saan|nasa saan", "navigation"),
    (r"lion|tiger|elephant|giraffe|monkey|snake|bird|crocodile|bear|eagle|python|tortoise", "animal_info"),
    (r"time|open|close|hours|oras|bukas|sarado", "zoo_hours"),
    (r"ticket|price|fee|bayad|presyo|magkano", "tickets"),
    (r"food|eat|restaurant|canteen|pagkain|merienda", "facilities"),
    (r"emergency|help|lost|first aid|ambulance", "emergency"),
    (r"restroom|cr|comfort room|toilet|banyo", "facilities"),
    (r"parking|park", "parking"),
    (r"event|show|feeding|program|show", "events"),
    (r"hello|hi|kumusta|magandang|good morning|good afternoon", "greeting"),
]


def keyword_intent(text: str) -> str:
    for pattern, intent in KEYWORD_RULES:
        if re.search(pattern, text, re.IGNORECASE):
            return intent
    return "general"


kw_pred = [keyword_intent(t) for t in test_df["text"]]


def summarize(y_pred):
    return {
        "accuracy": round(accuracy_score(y_true, y_pred), 4),
        "macro_f1": round(f1_score(y_true, y_pred, average="macro", labels=labels, zero_division=0), 4),
        "weighted_f1": round(f1_score(y_true, y_pred, average="weighted", labels=labels, zero_division=0), 4),
    }


bert_scores = summarize(bert_pred)
kw_scores = summarize(kw_pred)
per_class = classification_report(y_true, bert_pred, labels=labels, output_dict=True, zero_division=0)
cm = confusion_matrix(y_true, bert_pred, labels=labels)
errors = [
    {"text": t, "expected": e, "predicted": p, "confidence": round(float(c), 3)}
    for t, e, p, c in zip(test_df["text"], y_true, bert_pred, bert_conf)
    if e != p
]

report = {
    "base_model": BASE_MODEL,
    "trained_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    "admin_examples_used": admin_examples_used,
    "train_size": len(train_df),
    "test_size": len(test_df),
    "intents": labels,
    "hyperparameters": {"epochs": EPOCHS, "learning_rate": LEARNING_RATE, "batch_size": BATCH_SIZE, "max_length": MAX_LENGTH, "seed": SEED},
    "bert": bert_scores,
    "keyword_baseline": kw_scores,
    "per_intent": {k: {m: round(v, 4) for m, v in per_class[k].items()} for k in labels},
    "confusion_matrix": {"labels": labels, "rows_true_cols_pred": cm.tolist()},
    "misclassified": errors,
}
with open(f"{OUTPUT_DIR}/eval_report.json", "w", encoding="utf-8") as f:
    json.dump(report, f, ensure_ascii=False, indent=2)

# Markdown version, ready to paste into the thesis results chapter
lines = [
    "# ZooBot Intent Classifier: Evaluation",
    "",
    f"Model: `{BASE_MODEL}` fine-tuned for {EPOCHS} epochs on {len(train_df)} sentences "
    f"(English, Tagalog, Taglish{f'; {admin_examples_used} added by admins' if admin_examples_used else ''}). "
    f"Evaluated on {len(test_df)} separately written test sentences.",
    "",
    "| Method | Accuracy | Macro F1 | Weighted F1 |",
    "|---|---|---|---|",
    f"| Fine-tuned {BASE_MODEL} | {bert_scores['accuracy']:.1%} | {bert_scores['macro_f1']:.3f} | {bert_scores['weighted_f1']:.3f} |",
    f"| Keyword rules (previous) | {kw_scores['accuracy']:.1%} | {kw_scores['macro_f1']:.3f} | {kw_scores['weighted_f1']:.3f} |",
    "",
    f"## Per intent ({BASE_MODEL})",
    "",
    "| Intent | Precision | Recall | F1 | Test sentences |",
    "|---|---|---|---|---|",
]
for k in labels:
    r = per_class[k]
    lines.append(f"| {k} | {r['precision']:.3f} | {r['recall']:.3f} | {r['f1-score']:.3f} | {int(r['support'])} |")
lines += ["", "## Confusion matrix (rows = expected, columns = predicted)", "", "| | " + " | ".join(labels) + " |", "|---" * (len(labels) + 1) + "|"]
for label, row in zip(labels, cm):
    lines.append(f"| **{label}** | " + " | ".join(str(v) for v in row) + " |")
lines += ["", f"## Misclassified test sentences ({len(errors)})", ""]
lines += [f"- \"{e['text']}\": expected **{e['expected']}**, got **{e['predicted']}** ({e['confidence']:.0%})" for e in errors] or ["None."]
with open(f"{OUTPUT_DIR}/eval_report.md", "w", encoding="utf-8") as f:
    f.write("\n".join(lines) + "\n")

print("\n=== Test set results ===")
print(f"{BASE_MODEL}: accuracy {bert_scores['accuracy']:.1%}, macro F1 {bert_scores['macro_f1']:.3f}")
print(f"Keyword rules:  accuracy {kw_scores['accuracy']:.1%}, macro F1 {kw_scores['macro_f1']:.3f}")
print(classification_report(y_true, bert_pred, labels=labels, zero_division=0))
print(f"Report saved to {OUTPUT_DIR}/eval_report.md")
