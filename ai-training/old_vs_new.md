# Current vs retrained ZooBot model

Same test set for both: 94 questions in data/test.csv (10 intents).

| Model | Folder | Accuracy | Macro F1 | Low-confidence answers (<50%) |
|---|---|---|---|---|
| current | models | 81.9% | 0.797 | 9 |
| retrained | models_v4 | 91.5% | 0.907 | 3 |

## Per intent (accuracy)

| Intent | Questions | Current | Retrained |
|---|---|---|---|
| animal_info | 7 | 57% | 86% |
| emergency | 12 | 83% | 92% |
| events | 9 | 78% | 78% |
| facilities | 7 | 100% | 100% |
| general | 8 | 50% | 88% |
| greeting | 12 | 100% | 100% |
| navigation | 6 | 83% | 83% |
| parking | 11 | 91% | 100% |
| tickets | 10 | 70% | 90% |
| zoo_hours | 12 | 92% | 92% |

## Retrained model: wrong answers

- "Where exactly is the hippo pool?": expected **navigation**, got **facilities** (93%)
- "Ano ang natural na tirahan ng agila?": expected **animal_info**, got **general** (45%)
- "Where is the ticket booth?": expected **tickets**, got **facilities** (74%)
- "When do you stop letting people in?": expected **zoo_hours**, got **facilities** (28%)
- "Nasaan ang clinic?": expected **emergency**, got **facilities** (95%)
- "When do they feed the crocodiles?": expected **events**, got **animal_info** (91%)
- "What's on at the zoo this Saturday?": expected **events**, got **zoo_hours** (54%)
- "Do you have a hotline?": expected **general**, got **facilities** (91%)
