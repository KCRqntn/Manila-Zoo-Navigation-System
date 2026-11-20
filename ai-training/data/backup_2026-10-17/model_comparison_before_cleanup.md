# Model Comparison: mBERT vs XLM-RoBERTa

Both models were fine-tuned with identical data (292 sentences), hyperparameters (epochs 10, learning rate 3e-05, batch size 16, seed 42), and the same 120-sentence held-out test set in English, Tagalog, and Taglish.

## Overall

| Model | Base checkpoint | Accuracy | Macro F1 | Parameters | Size on disk | CPU time per question |
|---|---|---|---|---|---|---|
| mBERT | `bert-base-multilingual-cased` | 80.8% | 0.811 | 178M | 714 MB | 50 ms |
| XLM-RoBERTa | `xlm-roberta-base` | 75.0% | 0.741 | 278M | 1129 MB | 60 ms |
| Keyword rules (baseline) | none | 49.2% | 0.473 | none | none | under 1 ms |

## F1 per intent

| Intent | mBERT | XLM-RoBERTa | Test sentences |
|---|---|---|---|
| animal_info | **0.833** | 0.815 | 12 |
| emergency | **0.917** | 0.857 | 12 |
| events | **0.783** | 0.632 | 12 |
| facilities | **0.667** | 0.583 | 12 |
| general | **0.696** | 0.588 | 12 |
| greeting | 0.889 | 0.889 | 12 |
| navigation | **0.696** | 0.690 | 12 |
| parking | **0.909** | 0.737 | 12 |
| tickets | 0.857 | 0.857 | 12 |
| zoo_hours | **0.870** | 0.759 | 12 |

## Agreement on the test set

- Both correct: 80
- Only mBERT correct: 17
- Only XLM-RoBERTa correct: 10
- Both wrong: 13

Exact McNemar test: p = 0.248. The difference between the two models is **not** statistically significant at p < 0.05 on this test set, so the accuracy gap should be reported as an observed difference, not a proven one.

CPU time was measured on the development machine and will differ on other hardware; compare the two rows with each other rather than reading the absolute numbers as a benchmark.
