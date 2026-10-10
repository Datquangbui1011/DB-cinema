# AI Advisor — Implementation Plan

Demand forecasting + Business Advisor for DB Cinema, built into the existing app.

> **Status:** plan · **Target:** one-night MVP (~8–9 hours) · **Stack:** existing React (Vite) + Node/Express on Vercel + MongoDB Atlas, plus Python (scikit-learn) for training only.

---

## Table of contents

1. [Goal](#1-goal)
2. [What already exists](#2-what-already-exists)
3. [Key decisions](#3-key-decisions)
4. [Architecture](#4-architecture)
5. [The model](#5-the-model)
6. [Database schema](#6-database-schema)
7. [Business Advisor rules](#7-business-advisor-rules)
8. [Choosing an option applies it automatically](#8-choosing-an-option-applies-it-automatically)
9. [Undo](#9-undo)
10. [Autopilot (optional)](#10-autopilot-optional)
11. [API endpoints](#11-api-endpoints)
12. [Admin page: Insights → AI Advisor](#12-admin-page-insights--ai-advisor)
13. [Customer-facing changes](#13-customer-facing-changes)
14. [Project structure](#14-project-structure)
15. [Build order (one night)](#15-build-order-one-night)
16. [Testing checklist](#16-testing-checklist)
17. [Labeling and honesty](#17-labeling-and-honesty)
18. [Later improvements](#18-later-improvements)

---

## 1. Goal

For every upcoming showtime, predict **final ticket sales, occupancy and revenue**. Based on those predictions, a **Business Advisor** recommends concrete actions for managers (add a showtime, upgrade the room, run a promotion, cancel an empty show), explains **why**, estimates the **business impact**, and — once the manager picks an option — **applies the change automatically**.

The admin dashboard shows predictions, estimated revenue, recommended actions, reasons, potential impact, and how accurate the model has been.

---

## 2. What already exists

The booking system is already built and live. This plan only adds the AI layer.

| Needed for the AI Advisor | Already in the app |
|---|---|
| Movies, showtimes, seat selection, booking | ✅ Live with Stripe checkout |
| Rooms of different types and prices | ✅ 8 room types (Standard, IMAX, Dolby Cinema, 4DX, ScreenX, VIP Recliner, Premium, Kids & Family) |
| Physical theaters | ✅ 12 screens, 90 seats each, screen-aware scheduler with conflict checks |
| Admin dashboard | ✅ Overview, Live Operations, Shows, Analytics, Bookings, Customers, Movies, Screens, System Status, Team |
| Historical data | ✅ Traffic simulator + `seed:demo` demo database — every simulated record flagged `isSimulated` |
| Safe show editing | ✅ Add / move / re-price / cancel with screen-conflict checks; time and screen lock once tickets are sold |
| Nightly job | ✅ Vercel Cron at 05:00 UTC (scheduler + simulator) |

**Not changing tonight:** the app stays JavaScript (no TypeScript migration), and no new hosting is added.

---

## 3. Key decisions

1. **Python only trains; Node predicts.** scikit-learn trains on your Mac. The trained gradient-boosted trees are exported to a plain `model.json` and evaluated by ~25 lines of JavaScript on the server. No Python on Vercel, no new dependencies, no extra deployment.
2. **Features are built once, in Node** (`server/ml/features.js`) and used both for the training export and for live predictions, so training and production can't compute a feature differently.
3. **No data leakage.** Training rows only use what was known *before* the show started (seats sold up to that moment, rebuilt from booking timestamps).
4. **Every action goes through existing safe logic** (conflict checks, "no move once tickets are sold"), re-validated at the moment it's applied.
5. **Every assumption is labeled** on screen (spill-over demand, price response, running costs), and the model's training data is labeled as simulated.

---

## 4. Architecture

```
          ┌──────────── your Mac (offline, whenever you retrain) ─────────────┐
MongoDB ─▶│ npm run ml:export ─▶ ml/data/training.csv ─▶ python ml/train.py   │
(demo DB) │                                         └─▶ server/ml/model.json   │
          └───────────────────────────────────────────────┬───────────────────┘
                                                          │ committed to the repo
Vercel (Node/Express)                                     ▼
  nightly cron / "Refresh" ─▶ runAdvisor ─▶ predictor.js (model.json) ─▶ Prediction docs
                                       └──▶ rules.js ─────────────────▶ Recommendation docs (with options)
  admin picks an option ─▶ apply.js ─▶ validate ─▶ change show(s) ─▶ re-forecast ─▶ refresh recommendations
                                                                                      │
Admin → Insights → AI Advisor  ◀── /api/admin/advisor ◀───────────────────────────────┘
Customer site ◀── same Show data (new showtimes, rooms, promotion prices appear immediately)
```

---

## 5. The model

### 5.1 What it predicts

For each upcoming show: **final seats sold**, given what is known right now. Occupancy and revenue are derived from it:

- `predictedOccupancy = predictedSeats / capacity`
- `predictedRevenue = predictedSeats × (showPrice + roomPremium)`

### 5.2 Features

| Feature | Type | Example |
|---|---|---|
| `hoursUntil` | number | 26 |
| `seatsSoldNow` | number | 31 |
| `roomType` | one-hot (8) | IMAX |
| `roomPremium` | number | 5 |
| `dayOfWeek` | one-hot (7) | Sat |
| `startHour` | number | 19 |
| `isWeekend` | 0/1 | 1 |
| `daysSinceRelease` | number | 12 |
| `isHoliday` | 0/1 | 1 — from `server/configs/holidays.js` |
| `ticketPrice` | number | 17 — `showPrice` + room premium (lower during a promotion) |
| `discountPercent` | number | 20 — 0 when there is no promotion |
| `voteAverage` | number | 7.4 — TMDB rating (unrated → 6.5) |
| `runtime` | number | 128 |
| `genres` | multi-hot (top ~12 genres) | Action, Adventure |
| `movieAvgOccupancy7d` | number | 0.61 — how this movie sold over the previous 7 days |
| `slotAvgOccupancy` | number | 0.74 — history of room × start hour × weekday |

All computed in `server/ml/features.js`:

```js
// Same function for training export and live prediction
export const buildFeatures = ({ show, movie, seatsSoldNow, hoursUntil, history }) => ({ ... });
export const FEATURE_NAMES = [ ... ]; // fixed column order shared with Python
```

### 5.3 Training rows

Each **past** show becomes **4 snapshots**, taken **72h, 24h, 6h and 1h** before its start. For each snapshot, `seatsSoldNow` is rebuilt from paid bookings with `createdAt` before that moment. The **label** is the show's final seats sold. One model then works whether a show is 3 days or 1 hour away.

Rolling features (`movieAvgOccupancy7d`, `slotAvgOccupancy`) only use shows that finished **before** the snapshot time.

### 5.4 Data source

Training uses the **demo database** (`demo_dbcinema`) — **simulated**, and labeled as such everywhere. Recreate it any time:

```bash
cd server && MONGODB_DB=demo_dbcinema npm run seed:demo
```

It covers ~70 days back and 7 ahead: ~4,750 shows (~4,250 already played) and ~57k paid bookings. Each movie gets a staggered demo release date so new films open throughout the window. Simulated demand follows learnable patterns — start hour, weekday, holidays, room, ticket price and promotions (~9% of shows, leaning towards quiet slots), rating, opening-week hype that fades weekly, genre × time of day — plus hidden per-movie buzz and per-show noise, capped at 90 seats (sell-outs). Hyped films and weekends are booked further ahead.

Checked after seeding: opening week 62% full → week 4 28%; evening 55% vs morning 21%; holidays 52% vs ordinary weekdays 34%; 14% / 44% / 72% of seats sold 72h / 24h / 6h before the show.

Expected export: ~17,000 rows (4,250 played shows × 4 snapshots).

### 5.5 Training (`ml/train.py`)

- **Models:** `GradientBoostingRegressor` (≈200 trees, depth 3, learning rate 0.05) for the point estimate, plus two quantile models (`loss="quantile"`, α = 0.1 and 0.9) for a **low–high range**.
- **Split:** by time — train on older days, test on the **most recent 7 days**. Never a random split.
- **Baseline:** average final seats for the same room × start hour × weekday (+ seats sold so far, capped at capacity).
- **Metrics:** MAE (average error in seats) and R², for the model and the baseline.
- **Export:** every tree as nested nodes `{ f: featureIndex, t: threshold, l: left, r: right }` / `{ v: value }`, plus `initialPrediction`, `learningRate`, `featureNames`, metrics, `trainedAt`, `version`, and `trainedOn: "simulated"`.

```bash
cd ml && python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python train.py --csv data/training.csv --out ../server/ml/model.json
```

### 5.6 Prediction (`server/ml/predictor.js`)

```js
// GradientBoosting = initial value + learning rate × sum of every tree's output
const walk = (node, x) => ('v' in node ? node.v : walk(x[node.f] <= node.t ? node.l : node.r, x));
export const predict = (model, x) => model.init + model.lr * model.trees.reduce((s, t) => s + walk(t, x), 0);
```

Results are clamped to `[seatsSoldNow, capacity]`. A check script compares JS predictions against Python's on 100 rows — they must match to 4 decimals.

---

## 6. Database schema

### 6.1 `Prediction` (new)

One per upcoming show, updated in place; frozen once the show starts (used for accuracy).

```js
{
  show:                ObjectId,   // ref Show (unique)
  movie:               String,     // ref Movie
  screen:              String,     // ref Screen
  theaterType:         String,
  showDateTime:        Date,
  capacity:            Number,
  seatsSoldAtPrediction: Number,
  hoursUntilAtPrediction: Number,
  predictedSeats:      Number,
  low:                 Number,     // 10th percentile
  high:                Number,     // 90th percentile
  predictedOccupancy:  Number,
  predictedRevenue:    Number,
  actualSeats:         Number | null,  // filled after the show (for accuracy)
  modelVersion:        String,
  updatedAt:           Date
}
// indexes: { show: 1 } unique, { showDateTime: 1 }
```

### 6.2 `Recommendation` (new)

```js
{
  show:        ObjectId,
  type:        'add_showtime' | 'upgrade_room' | 'promotion' | 'cancel',
  priority:    'high' | 'medium' | 'low',
  title:       String,       // "Add another showing of Dune: Part Three"
  reason:      String,       // "Forecast 97% full · 41 sold with 30h to go · Sat 7:30 PM slots average 88%"
  assumptions: [String],     // shown in the "How is this estimated?" tooltip
  options: [{
    id:        String,       // "slot-screen-3-2145"
    label:     String,       // "Screen 3 · 9:45 PM"
    impact:    { revenue: Number, tickets: Number },
    params:    Object        // what apply.js needs, e.g. { screenId, date, time }
  }],
  status:       'pending' | 'applied' | 'dismissed' | 'expired' | 'undone',
  chosenOption: String | null,
  result:       { before: Object, after: Object, createdShowIds: [ObjectId] } | null,
  undo:         Object | null,          // how to reverse it
  appliedBy:    String | null,          // Clerk user id, or "autopilot"
  appliedAt:    Date | null,
  predictionId: ObjectId,
  modelVersion: String,
  createdAt:    Date
}
// indexes: { status: 1, priority: 1 }, { show: 1, status: 1 }
```

### 6.3 `Show` (changed)

```js
promotion: {
  percent:          Number,   // 10 | 20 | 30
  originalPrice:    Number,
  endsAt:           Date,     // the showtime
  recommendationId: ObjectId
} | null
```

A promotion lowers `showPrice` and remembers `originalPrice`, so **every existing price calculation** (seat page, checkout, Stripe, chatbot, analytics) uses the discounted price automatically.

### 6.4 `AdvisorSettings` (new, optional — autopilot)

```js
{
  _id: 'advisor',
  autopilot: { promotion: false, cancel: false },  // add_showtime / upgrade_room: always manual
  maxAutoActionsPerDay: 5,
  maxAutoDiscountPercent: 20
}
```

---

## 7. Business Advisor rules

All thresholds and assumptions live in `server/advisor/advisorConfig.js`:

```js
export const ADVISOR = {
  sellOutThreshold: 0.95,        // add showtime
  upgradeThreshold: 0.85,        // upgrade room
  promoThreshold: 0.30,          // promotion
  cancelThreshold: 0.15,         // cancel / merge
  promoMinHoursAhead: 48,
  spillOverShare: 0.40,          // ASSUMPTION: extra demand captured by an added showing
  priceResponse: { 10: 0.15, 20: 0.30, 30: 0.40 },  // ASSUMPTION: % more tickets per discount
  runningCostPerShow: 60,        // ASSUMPTION: staff + power per showing, USD
  addShowWindowHours: 3,
  mergeWindowHours: 2,
};
```

| Rule | Trigger | Options offered | Impact estimate |
|---|---|---|---|
| **Add showtime** | forecast ≥ 95% | Best free slots for the same movie within ±3h on any open screen (up to 3) | `capacity × spillOverShare × ticketPrice` for that slot's room |
| **Upgrade room** | forecast ≥ 85%, Standard room, **0 tickets sold**, a premium screen free at the same time | Each free IMAX / Dolby / 4DX / ScreenX screen at that time | `predictedSeats × (newPremium − currentPremium)` |
| **Promotion** | forecast < 30% and ≥ 48h to go | 10% / 20% / 30% off | `(predictedSeats × (1 + response) × discountedPrice) − predictedSeats × price` |
| **Cancel / merge** | forecast < 15%, **0 tickets sold**, same movie plays within ±2h | Cancel · or move to the best free better-performing slot | Cancel: saves `runningCostPerShow`. Move: forecast difference between slots |

- **Note on "larger theaters":** all screens have 90 seats today, so "move to a larger theater" becomes **"upgrade to a premium room"** — the gain comes from a higher ticket price, not more seats.
- **Priority:** high if impact ≥ $300 or the show is < 24h away; medium if ≥ $100; else low.
- **Reasons** are generated from the numbers: forecast, seats sold so far, hours to go, and the slot's historical average.
- Pending recommendations are regenerated on every refresh; ones whose trigger no longer holds become `expired`.

---

## 8. Choosing an option applies it automatically

When an admin clicks an option, `server/advisor/apply.js` runs:

1. **Re-validate** — load fresh data: is the recommendation still pending? Is the slot still free (screen-conflict check)? Have tickets been sold since (blocks moves and cancels)? If not valid → mark `expired`, return a clear message, regenerate.
2. **Apply** using the existing safe logic:
   - `add_showtime` → create the show (same as Add Shows, with conflict check)
   - `upgrade_room` → move the show to the chosen screen (same as Edit Show)
   - `promotion` → set `promotion`, lower `showPrice`
   - `cancel` → delete the show and its unpaid checkouts (same as Cancel Show)
3. **Re-forecast** the affected shows immediately (the original show, any new show, and other showings of the same movie that day). Example: after adding 9:45 PM, the 7:30 PM forecast drops because demand is now split.
4. **Refresh recommendations** for those shows: clear ones that no longer apply, add new ones if needed.
5. **Record** `chosenOption`, `result.before/after`, `undo`, `appliedBy`, `appliedAt`.

Changes are **live for customers immediately** (it's the same Show data the booking pages read). Admin pages pick them up on their next refresh.

---

## 9. Undo

Every applied recommendation stores how to reverse itself. **Undo** is shown on applied cards:

| Action | Undo | Allowed when |
|---|---|---|
| Added showtime | Remove the new show | No tickets sold for it |
| Upgraded room | Move it back | No tickets sold since, original screen still free |
| Promotion | Restore `originalPrice`, clear `promotion` | Always (tickets already sold keep their price) |
| Cancellation | Re-create the show in the same slot | Slot still free and still in the future |

After an undo: status `undone`, re-forecast, refresh recommendations.

---

## 10. Autopilot (optional)

Off by default. When switched on, the nightly run applies selected recommendations **without a click**:

- **Per-type switches** — only low-risk types are eligible: promotions (≤ `maxAutoDiscountPercent`, picks the best-impact option) and cancelling shows with 0 tickets sold. Adding showtimes and room changes always require a person.
- **Daily cap** — at most `maxAutoActionsPerDay`.
- Every automatic action is marked **"Autopilot"**, listed under *Applied automatically*, and can be undone.

---

## 11. API endpoints

All under `/api/admin`. **Staff** can view; **admin** can change.

| Method | Endpoint | Role | Purpose |
|---|---|---|---|
| GET | `/advisor` | staff | Upcoming predictions + pending recommendations + summary (7-day forecast revenue, likely sell-outs, at-risk shows, potential uplift) + model info |
| POST | `/advisor/refresh` | admin | Re-run predictions and rules now |
| POST | `/recommendations/:id/apply` | admin | Body `{ optionId }` → validate, apply, re-forecast, refresh |
| POST | `/recommendations/:id/undo` | admin | Reverse an applied recommendation |
| PATCH | `/recommendations/:id` | admin | Body `{ status: 'dismissed' }` |
| GET | `/advisor/accuracy` | staff | Predicted vs actual for finished shows + model metrics vs baseline |
| GET / PATCH | `/advisor/settings` | admin | Autopilot switches and limits |
| POST | `/shows/:id/end-promotion` | admin | End a promotion early (restores price) |

**Cron:** `/api/cron/schedule-movies` also calls `runAdvisor()` after the scheduler (and autopilot, if enabled).

---

## 12. Admin page: Insights → AI Advisor

1. **Model banner** — "Model trained on **simulated** data · v1 · trained Oct 10 · average error ±X seats (baseline ±Y)". Live data gets an "early estimate" label until 30+ real past shows exist.
2. **Summary cards** — 7-day forecast revenue · shows likely to sell out · at-risk shows · potential uplift if all recommendations are applied.
3. **Recommendations** — cards sorted by priority:
   - title, priority badge, show (movie · screen · time)
   - **reason** and a "How is this estimated?" tooltip with the assumptions
   - **option buttons**, each with its impact → one click applies it
   - Dismiss; Undo on applied cards; "Autopilot" tag where applicable
4. **Forecast table** — every upcoming show: sold now → predicted (range bar), occupancy, revenue, recommendation badge; click to open the existing show details pop-up.
5. **Accuracy panel** — predicted vs actual chart for finished shows; model error vs baseline.
6. **Settings** (admin) — autopilot switches and limits.

---

## 13. Customer-facing changes

- **Promotion badge** on showtimes: "20% off" with the original price crossed out (showtime picker and seat page).
- New showtimes, room changes and cancellations appear automatically — no extra work, they read the same Show data.

---

## 14. Project structure

New and changed files only:

```
DB-cinema/
├── docs/AI_ADVISOR_PLAN.md            ← this file
├── ml/                                 ← Python, runs on your Mac only
│   ├── requirements.txt                scikit-learn, pandas, numpy
│   ├── train.py                        CSV → models → server/ml/model.json
│   ├── check_parity.py                 compares Python vs JS predictions
│   ├── data/                           training.csv (gitignored)
│   └── README.md                       how to retrain
├── server/
│   ├── ml/
│   │   ├── features.js                 shared feature builder
│   │   ├── predictor.js                loads model.json, evaluates trees
│   │   └── model.json                  generated, committed
│   ├── advisor/
│   │   ├── advisorConfig.js            thresholds + labeled assumptions
│   │   ├── rules.js                    prediction → recommendations with options
│   │   ├── apply.js                    validate → apply → re-forecast → record
│   │   ├── undo.js                     reverse applied actions
│   │   └── runAdvisor.js               predict all upcoming shows, regenerate recommendations, autopilot
│   ├── models/
│   │   ├── Prediction.js               new
│   │   ├── Recommendation.js           new
│   │   ├── AdvisorSettings.js          new (optional)
│   │   └── Show.js                     + promotion
│   ├── controllers/advisorController.js
│   ├── routes/adminRoutes.js           + advisor routes
│   ├── routes/cronRoutes.js            + runAdvisor after scheduler
│   └── scripts/exportTrainingData.js   npm run ml:export
└── client/src/
    ├── pages/admin/Advisor.jsx
    ├── components/admin/RecommendationCard.jsx
    ├── lib/adminNav.js                 + Insights → AI Advisor
    └── pages/SeatLayout.jsx            + promotion badge
```

---

## 15. Build order (one night)

| # | Step | Time | Checkpoint |
|---|---|---|---|
| 0 | Setup: Python 3 + venv (`ml/README.md`); richer demo data generator + recreate `demo_dbcinema` | 45m | ✅ Done |
| 1 | `features.js` + `exportTrainingData.js` | 1h | `training.csv` with ~15k rows, no future data |
| 2 | `train.py`: baseline, GBR + quantiles, time split, JSON export | 1h | Prints MAE model vs baseline |
| 3 | `predictor.js` + `check_parity.py` | 45m | JS = Python to 4 decimals |
| 4 | `Prediction` model + `runAdvisor` (predictions) + `/advisor/refresh` | 45m | Predictions stored for every upcoming show |
| 5 | `advisorConfig` + `rules.js` + `Recommendation` + `GET /advisor` | 1h | Recommendations with options, reasons, impact |
| 6 | `Advisor.jsx`: banner, summary, recommendation cards, forecast table | 1.5h | **End-to-end demo works** ✅ |
| 7 | `apply.js` + apply endpoint + re-forecast | 1h | Clicking an option changes the show and refreshes the advisor |
| 8 | Real promotions (Show field, end-promotion, customer badge) | 45m | Discounted price at checkout |
| 9 | Undo + accuracy panel + cron hook + deploy | 1h | Live on Vercel |
| 10 | *Optional:* autopilot settings + nightly auto-apply | 45m | Autopilot actions listed and undoable |

**If time runs short**, cut in this order: autopilot → undo → accuracy panel → quantile ranges. Steps 0–8 deliver the full "choose an option and it updates automatically" demo.

---

## 16. Testing checklist

**Model**
- [ ] No snapshot uses bookings or show results from after its snapshot time
- [ ] Model MAE beats the baseline on the last-7-days test set
- [ ] JS predictor matches Python on 100 sample rows
- [ ] Predictions clamped between seats already sold and capacity

**Advisor**
- [ ] Each rule fires on a hand-picked show that meets its trigger, and not otherwise
- [ ] Options only offer slots/screens that pass the conflict check
- [ ] Upgrade / cancel never offered for shows with tickets sold

**Apply / undo**
- [ ] Applying an option changes the show and the customer booking page reflects it
- [ ] Applying an outdated option (slot taken, tickets sold meanwhile) is refused with a clear message
- [ ] Re-forecast runs for affected shows; stale recommendations expire
- [ ] Promotion price is charged at Stripe checkout; ending it restores the price
- [ ] Each undo path works and respects its "allowed when" rule

**Access**
- [ ] Staff can view but not apply, undo, dismiss or change settings (server rejects)
- [ ] Autopilot respects switches, discount cap and daily cap

---

## 17. Labeling and honesty

- The model banner always states it was **trained on simulated data**, with its error next to the baseline's.
- Recommendations list their **assumptions** (spill-over demand, price response, running cost).
- Live predictions show **"early estimate"** until at least 30 real past shows exist to measure accuracy.
- **Known limitation:** trained on simulated bookings, the model largely learns the simulator's own rules, so its accuracy looks better than it would on real demand. The pipeline is real; accuracy becomes meaningful as real bookings accumulate. Retrain on real bookings (`isSimulated: false`) once there are enough.

---

## 18. Later improvements

- Real seat counts per screen (different seat maps) → true "move to a larger theater"
- Learn price response from real promotion results instead of the assumed values
- Weekly automatic retraining (e.g. a GitHub Action running `train.py`)
- Feed forecasts into the scheduler so in-demand movies get the best rooms and slots automatically
- Per-customer recommendations ("Recommended for you") reusing the same features pipeline
- Gradual TypeScript migration
