"""Interactive console test for the trained ZooBot intent model. Run: python predict.py"""
import torch
from transformers import AutoModelForSequenceClassification, AutoTokenizer

model_path = "models"

tokenizer = AutoTokenizer.from_pretrained(model_path)
model = AutoModelForSequenceClassification.from_pretrained(model_path)
model.eval()
labels = {int(i): name for i, name in model.config.id2label.items()}

print("=== Manila Zoo Chatbot Test ===")
print("Type 'exit' to quit.\n")

while True:
    text = input("You: ")
    if text.lower() == "exit":
        break

    inputs = tokenizer(text, return_tensors="pt", truncation=True, max_length=64)
    with torch.no_grad():
        probs = torch.softmax(model(**inputs).logits, dim=1)[0]
    prediction = int(probs.argmax())

    print(f"Intent: {labels[prediction]} ({probs[prediction]:.0%})")
    print()
