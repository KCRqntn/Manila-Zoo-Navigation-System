# ZooBot intent model: current vs retrained

All models scored on the same held-out test set: 138 sentences in data/test.csv (12 intents), none of which appear in any model's training data.

| Model folder | Accuracy | Macro F1 | Correct | Low-confidence (<50%) | CPU ms/question | vs current (McNemar) |
|---|---|---|---|---|---|---|
| `models` | 89.1% | 0.884 | 123/138 | 3 | 76 | baseline |
| `models_v5` | 92.8% | 0.923 | 128/138 | 1 | 123 | 6 fixed, 1 broken, p = 0.125 (not significant) |
| `models_v5_xlmr` | 93.5% | 0.930 | 129/138 | 2 | 106 | 11 fixed, 5 broken, p = 0.210 (not significant) |

## Accuracy per intent

| Intent | Test sentences | `models` | `models_v5` | `models_v5_xlmr` |
|---|---|---|---|---|
| animal_info | 14 | 100% | 93% | 93% |
| animal_location | 11 | 82% | 91% | 100% |
| emergency | 12 | 92% | 92% | 92% |
| events | 7 | 86% | 86% | 100% |
| facilities | 8 | 100% | 100% | 88% |
| general | 8 | 75% | 100% | 88% |
| greeting | 12 | 100% | 100% | 92% |
| navigation | 11 | 73% | 91% | 91% |
| out_of_scope | 21 | 86% | 90% | 100% |
| parking | 11 | 100% | 100% | 82% |
| tickets | 11 | 82% | 82% | 100% |
| zoo_hours | 12 | 92% | 92% | 92% |

## `models`: wrong answers (15)

- "Where exactly is the hippo pool?": expected **animal_location**, got **facilities** (73%)
- "saan dadaan papuntang savanna": expected **navigation**, got **facilities** (77%)
- "Which direction is the main gate?": expected **navigation**, got **facilities** (96%)
- "Malapit ba dito yung bird sanctuary?": expected **navigation**, got **animal_location** (91%)
- "Where is the ticket booth?": expected **tickets**, got **facilities** (84%)
- "How much is it to get in?": expected **tickets**, got **parking** (47%)
- "When do you stop letting people in?": expected **zoo_hours**, got **general** (58%)
- "Nasaan ang clinic?": expected **emergency**, got **facilities** (97%)
- "What's on at the zoo this Saturday?": expected **events**, got **zoo_hours** (70%)
- "Do you have a hotline?": expected **general**, got **facilities** (96%)
- "Thanks! Goodbye": expected **general**, got **greeting** (90%)
- "Wher is the crocodile?": expected **animal_location**, got **animal_info** (89%)
- "Sino ang nanalo sa eleksyon?": expected **out_of_scope**, got **animal_location** (59%)
- "Can you solve 12 x 8?": expected **out_of_scope**, got **general** (93%)
- "Tell me a funny story": expected **out_of_scope**, got **animal_info** (45%)

## `models_v5`: wrong answers (10)

- "Where exactly is the hippo pool?": expected **animal_location**, got **facilities** (95%)
- "Which direction is the main gate?": expected **navigation**, got **facilities** (98%)
- "Where is the ticket booth?": expected **tickets**, got **facilities** (75%)
- "How much is it to get in?": expected **tickets**, got **navigation** (56%)
- "When do you stop letting people in?": expected **zoo_hours**, got **out_of_scope** (36%)
- "Nasaan ang clinic?": expected **emergency**, got **facilities** (97%)
- "Anong oras ang pakain sa agila?": expected **animal_info**, got **events** (66%)
- "What's on at the zoo this Saturday?": expected **events**, got **zoo_hours** (97%)
- "Sino ang nanalo sa eleksyon?": expected **out_of_scope**, got **tickets** (51%)
- "Can you solve 12 x 8?": expected **out_of_scope**, got **general** (80%)

## `models_v5_xlmr`: wrong answers (9)

- "Kumusta po kayo diyan": expected **greeting**, got **general** (34%)
- "saan dadaan papuntang savanna": expected **navigation**, got **animal_location** (96%)
- "When do you stop letting people in?": expected **zoo_hours**, got **general** (71%)
- "Saan may kainan dito?": expected **facilities**, got **tickets** (86%)
- "Nasaan ang clinic?": expected **emergency**, got **facilities** (91%)
- "Where do tour buses unload?": expected **parking**, got **out_of_scope** (92%)
- "Where can Grab drop us off?": expected **parking**, got **out_of_scope** (34%)
- "Anong oras ang pakain sa agila?": expected **animal_info**, got **zoo_hours** (78%)
- "Do you have a hotline?": expected **general**, got **facilities** (90%)

CPU time was measured on the development machine; compare the rows with each other rather than as a benchmark.
With one test set of this size, a difference that McNemar marks as not significant should be reported as observed, not proven.
