# Demand model (AI Advisor)

Trains the showtime occupancy model offline with scikit-learn. The trained trees
are exported to JSON and evaluated in Node (`server/ml/predictor.js`), so the
server never runs Python. Full design: [`docs/AI_ADVISOR_PLAN.md`](../docs/AI_ADVISOR_PLAN.md).

## One-time setup

The virtualenv lives outside the repo (the project folder syncs to iCloud):

```bash
python3 -m venv ~/.venvs/db-cinema-ml
~/.venvs/db-cinema-ml/bin/pip install -r ml/requirements.txt
```

## Training data

Training uses the **simulated** demo database, never live data. Rebuild it with:

```bash
cd server && MONGODB_DB=demo_dbcinema npm run seed:demo
```

The seeder (`server/scripts/seedDemoData.js`) copies the live movies read-only and
generates ~70 days of shows and bookings using `server/simulator/demandModel.js`
(the same demand model as the live traffic simulator). Each played show becomes up
to 13 training rows, forecast 1h to 14 days before it. Exported CSVs go to
`ml/data/` (git-ignored).

## Train

```bash
cd server && npm run ml:export            # -> ml/data/training.csv
cd .. && ~/.venvs/db-cinema-ml/bin/python ml/train.py   # -> server/ml/model.json
~/.venvs/db-cinema-ml/bin/python ml/check_parity.py      # Node must match Python
```

Prints accuracy on the most recent 7 days against two baselines, and saves the
trees as JSON (committed, so the server can load them on Vercel).

## Validation and limitations

Every training run checks that no show has snapshots in both train and test (the
split is chronological), reports error per horizon (1h to 14 days) against two
baselines, calibrates the 80% range per horizon on the validation week, tests
10/20/30% discounts against the simulator's known effect, and reports accuracy on
films never seen in training (they are noticeably harder).

Training data and production traffic both come from `server/simulator/demandModel.js`.
All numbers are on **simulated** data and do not guarantee real-world accuracy.

## TMDB popularity history (for later)

The nightly scheduler saves each showing film's TMDB popularity, vote average and
vote count once a day (`MovieStats`, one row per film per cinema-local day). TMDB
only returns today's values, so this history is what makes popularity usable
without leaking the future. These are **not model features yet**: the simulated
training data doesn't depend on them. Once real bookings and a few weeks of
snapshots exist, add them via `createStatsIndex().statsAsOf(movie, at)` in
`server/scheduler/movieStats.js`, which only returns snapshots from days before
the forecast. The System Status page shows how many days have been collected.
