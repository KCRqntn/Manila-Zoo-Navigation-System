# Statistical analysis of the chatbot evaluation

Held-out test set: **94 questions** in English, Tagalog and Taglish across 10 intents (`data/test.csv`; none appear in the training data). All methods answer the same questions, so comparisons are paired.

## Accuracy and agreement

| Method | Correct | Accuracy | 95% CI (Wilson) | Macro-F1 | 95% CI (bootstrap, 2,000 resamples) | Cohen's κ |
|---|---|---|---|---|---|---|
| mBERT (live chatbot model) | 86/94 | 91.5% | 84.1% – 95.6% | 0.907 | 0.827 – 0.962 | 0.905 |
| XLM-RoBERTa | 89/94 | 94.7% | 88.1% – 97.7% | 0.946 | 0.882 – 0.989 | 0.941 |
| Keyword rules (previous method) | 51/94 | 54.3% | 44.2% – 64.0% | 0.507 | 0.390 – 0.591 | 0.493 |

## Paired comparisons (exact McNemar test)

Counts only the questions where the two methods disagree on correctness. p < 0.05 means the difference is statistically significant.

| Comparison | Only first right | Only second right | p-value | Significant at 0.05? |
|---|---|---|---|---|
| mBERT (live chatbot model) vs XLM-RoBERTa | 2 | 5 | 0.4531 | No |
| mBERT (live chatbot model) vs Keyword rules (previous method) | 37 | 2 | < 0.0001 | Yes |
| XLM-RoBERTa vs Keyword rules (previous method) | 39 | 1 | < 0.0001 | Yes |

## How to read this

- **Wilson interval:** the range the true accuracy likely falls in (95% confidence), given only 94 test questions. It is preferred over the normal approximation for proportions near 100% and small samples.
- **Bootstrap interval for macro-F1:** the test questions are resampled with replacement 2,000 times; the middle 95% of the scores is the interval.
- **Cohen's κ:** agreement between the predicted and correct intents after removing chance agreement (0.81–1.00 is conventionally read as "almost perfect", 0.61–0.80 "substantial").
- **McNemar test:** compares two methods on the same questions; it uses only the questions one method got right and the other got wrong.
- **Limitation:** with 94 test questions (6–12 per intent), per-intent figures have wide uncertainty; the overall figures are more reliable than any single intent's.
