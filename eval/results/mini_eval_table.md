# Mini-Eval — DayPlay pipeline vs text-only baseline (2026-10-31T20:25:15Z)

**Provider: mock (deterministic offline; fixture ground truth of 12 real validator-passed pins). NOT a real Muse Spark / live-MCP run.**

| # | prompt | class | pipeline pins | pipeline: all IDs real? | pipeline halluc | freshness live/sched/standing | baseline venues | baseline: fabricated IDs |
|---|--------|-------|---------------|-------------------------|-----------------|-------------------------------|----------------|--------------------------|
| 1 | what's live within a 10-min walk right now? | time=now | 7 | YES | 0 | 0/0/7 | 1 | 1 |
| 2 | pin my Mission gems for tonight | time=tonight | 10 | YES | 0 | 0/0/10 | 1 | 1 |
| 3 | best coffee with seats free now on Valencia | time=now | 10 | YES | 0 | 0/0/10 | 2 | 2 |
| 4 | live music starting within the hour near 16th and Mi | time=now | 10 | YES | 0 | 0/0/10 | 2 | 2 |
| 5 | quiet bar for a first date, chill vibe, walkable | radius-walk | 10 | YES | 0 | 0/0/10 | 1 | 1 |
| 6 | cheap eats open late tonight in the Mission | time=tonight | 10 | YES | 0 | 0/0/10 | 1 | 1 |
| 7 | gallery openings happening today nearby | category/vibe | 10 | YES | 0 | 0/0/10 | 1 | 1 |
| 8 | where are locals actually going right now? | time=now | 10 | YES | 0 | 0/0/10 | 1 | 1 |
| 9 | hidden gems within 15 minutes on foot | radius-walk | 10 | YES | 0 | 0/0/10 | 1 | 1 |
| 10 | outdoor seating, sunny spot, right now | time=now | 10 | YES | 0 | 0/0/10 | 1 | 1 |
| 11 | plan a 3-stop evening: drinks, dinner, dessert on Va | category/vibe | 10 | YES | 0 | 0/0/10 | 3 | 3 |
| 12 | what's happening today that a tourist would miss? | category/vibe | 10 | YES | 0 | 0/0/10 | 1 | 1 |
| 13 | taco spot with a 4.5+ rating within 10 minutes | category/vibe | 10 | YES | 0 | 0/0/10 | 1 | 1 |
| 14 | bookshop-cafe hybrid open now nearby | time=now | 10 | YES | 0 | 0/0/10 | 1 | 1 |
| 15 | cocktail bar with no TVs, quiet, tonight | time=tonight | 10 | YES | 0 | 0/0/10 | 1 | 1 |
| 16 | free event within a 15 minute walk today | radius-walk | 10 | YES | 0 | 0/0/10 | 1 | 1 |
| 17 | veg-friendly dinner, walkable, 8pm tonight | time=tonight | 10 | YES | 0 | 0/0/10 | 1 | 1 |
| 18 | best new spot this month in the Mission | neighborhood=mission | 10 | YES | 0 | 0/0/10 | 1 | 1 |
| 19 | live comedy tonight within walking distance | time=now | 10 | YES | 0 | 0/0/10 | 1 | 1 |
| 20 | dessert open past 10pm near 18th and Valencia | category/vibe | 10 | YES | 0 | 0/0/10 | 1 | 1 |

**Headline:** pipeline 20/20 prompts with 100% real listing IDs, 0 hallucinated pins, zero-hallucination assert 20/20 pass | baseline 24 fabricated listing IDs (20/20 prompts fully fabricated), 24 unverifiable venue names.

_Mock-provider baseline results. Rerun required once Meta/Baseten key lands (same harness, MODEL_PROVIDER=meta)._
