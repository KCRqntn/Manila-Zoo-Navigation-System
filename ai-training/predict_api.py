"""
ZooBot intent API. Loads the fine-tuned model from ./models (fully offline once trained).

Run from the ai-training folder:
    python -m uvicorn predict_api:app --host 127.0.0.1 --port 8000
"""
import json
import os

import torch
from fastapi import FastAPI
from pydantic import BaseModel
from transformers import AutoModelForSequenceClassification, AutoTokenizer

# ZOO_MODEL_PATH tries another trained model (e.g. models_v3) without replacing models/
MODEL_PATH = os.environ.get("ZOO_MODEL_PATH", "models")

tokenizer = AutoTokenizer.from_pretrained(MODEL_PATH)
model = AutoModelForSequenceClassification.from_pretrained(MODEL_PATH)
model.eval()

# Intent names come from the model config (train.py sets id2label); labels.json is the backup.
labels = {int(i): name for i, name in model.config.id2label.items()}
if all(name.startswith("LABEL_") for name in labels.values()):
    with open(f"{MODEL_PATH}/labels.json", encoding="utf-8") as file:
        labels = {int(index): name for name, index in json.load(file).items()}

app = FastAPI()


class UserInput(BaseModel):
    text: str


@app.get("/")
def root():
    return {"message": "Manila Zoo AI API is running!", "intents": sorted(labels.values())}


@app.get("/report")
def report():
    """Summary of the loaded model's evaluation (written by train.py), for the admin dashboard."""
    try:
        with open(f"{MODEL_PATH}/eval_report.json", encoding="utf-8") as file:
            r = json.load(file)
    except FileNotFoundError:
        return {"available": False, "intents": sorted(labels.values())}
    return {
        "available": True,
        "base_model": r.get("base_model"),
        "trained_at": r.get("trained_at"),
        "train_size": r.get("train_size"),
        "admin_examples_used": r.get("admin_examples_used", 0),
        "test_size": r.get("test_size"),
        "accuracy": r["bert"]["accuracy"],
        "macro_f1": r["bert"]["macro_f1"],
        "keyword_accuracy": r["keyword_baseline"]["accuracy"],
        "intents": sorted(labels.values()),
    }


@app.post("/predict")
def predict(data: UserInput):
    inputs = tokenizer(data.text, return_tensors="pt", truncation=True, max_length=64)
    with torch.no_grad():
        probs = torch.softmax(model(**inputs).logits, dim=1)[0]
    top = torch.topk(probs, k=min(3, len(labels)))
    ranked = [{"intent": labels[i.item()], "confidence": round(p.item(), 4)} for p, i in zip(top.values, top.indices)]
    return {"intent": ranked[0]["intent"], "confidence": ranked[0]["confidence"], "alternatives": ranked[1:]}
