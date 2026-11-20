# Model Comparison: mBERT vs XLM-RoBERTa

Both models were fine-tuned with identical data (476 sentences), hyperparameters (epochs 10, learning rate 3e-05, batch size 16, seed 42), and the same 94-sentence held-out test set in English, Tagalog, and Taglish.

## Overall

| Model | Base checkpoint | Accuracy | Macro F1 | Parameters | Size on disk | CPU time per question |
|---|---|---|---|---|---|---|
| mBERT | `bert-base-multilingual-cased` | 91.5% | 0.907 | 178M | 714 MB | 136 ms |
| XLM-RoBERTa | `xlm-roberta-base` | 94.7% | 0.946 | 278M | 1129 MB | 162 ms |
| Keyword rules (baseline) | none | 54.3% | 0.507 | none | none | under 1 ms |

## F1 per intent

| Intent | mBERT | XLM-RoBERTa | Test sentences |
|---|---|---|---|
| animal_info | 0.857 | **0.933** | 7 |
| emergency | 0.957 | 0.957 | 12 |
| events | 0.875 | 0.875 | 9 |
| facilities | 0.737 | **0.933** | 7 |
| general | 0.875 | **0.933** | 8 |
| greeting | 1.000 | 1.000 | 12 |
| navigation | 0.909 | **1.000** | 6 |
| parking | **1.000** | 0.957 | 11 |
| tickets | 0.947 | **0.952** | 10 |
| zoo_hours | 0.917 | 0.917 | 12 |

## Agreement on the test set

- Both correct: 84
- Only mBERT correct: 2
- Only XLM-RoBERTa correct: 5
- Both wrong: 3

Exact McNemar test: p = 0.453. The difference between the two models is **not** statistically significant at p < 0.05 on this test set, so the accuracy gap should be reported as an observed difference, not a proven one.

CPU time was measured on the development machine and will differ on other hardware; compare the two rows with each other rather than reading the absolute numbers as a benchmark.
