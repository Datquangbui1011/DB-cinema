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
generates ~70 days of shows and bookings. Demand follows learnable patterns
(start hour, weekday, holidays, room, price/promotions, rating, opening-week hype,
genre x time) plus hidden per-movie buzz and per-show noise. Exported CSVs go to
`ml/data/` (git-ignored).
