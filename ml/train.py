"""
Train the showtime demand model and export it as JSON for Node.

Input:  ml/data/training.csv from `npm run ml:export` (one row per show snapshot)
Output: server/ml/model.json - three gradient-boosted tree ensembles:
        point (expected), low (10th percentile), high (90th percentile)

The models predict the seats still to be sold (final - sold so far); the final
forecast is seatsSoldNow + that, clamped to [seatsSoldNow, capacity]. Trees
handle "how much more will sell" far better than the ratio-like final total,
especially close to showtime.

The split is by time: the most recent TEST_DAYS days are held out as the test
set, never shuffled. Hyperparameters are picked on the TEST_DAYS days before
that, then the final model is refit on everything except the test days.

Usage:  ~/.venvs/db-cinema-ml/bin/python ml/train.py [--csv ml/data/training.csv] [--out server/ml/model.json]
"""
import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
import sklearn
from sklearn.dummy import DummyRegressor
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, r2_score

ROOT = Path(__file__).resolve().parent.parent
PARITY_FILE = ROOT / "ml/data/parity_sample.json"
PARITY_ROWS = 100
CAPACITY = 90
TEST_DAYS = 7
LEARNING_RATE = 0.05
QUANTILES = {"low": 0.1, "high": 0.9}
GRID = [(200, 3), (400, 3), (400, 4), (600, 4)]   # (trees, depth)
SEED = 42
DISCOUNTS = [10, 20, 30]
# How the demo seeder lifts demand per 1% discount (PROMO_LIFT_PER_PERCENT in
# server/scripts/seedDemoData.js); only used to check the model against it
SIMULATED_LIFT_PER_PERCENT = 0.015
PROMO_TOLERANCE = 0.05          # model lift may differ from the simulator by 5 points
PROMO_HORIZON = 72              # promotions start at least 48h ahead, so judge them 3 days out
DATA_NOTE = ("Trained and evaluated on SIMULATED bookings from the demo database. Accuracy on "
             "simulated data does not guarantee the same accuracy with real customers.")
ID_COLUMNS = ["showId", "showDateTime", "snapshotHours"]
LABEL = "finalSeats"
TARGET = "remaining seats (finalSeats - seatsSoldNow)"


def load(csv):
    data = pd.read_csv(csv, parse_dates=["showDateTime"])
    features = [c for c in data.columns if c not in ID_COLUMNS + [LABEL]]
    return data, features


def split_by_time(data, days):
    cutoff = data.showDateTime.max() - pd.Timedelta(days=days)
    return data[data.showDateTime <= cutoff], data[data.showDateTime > cutoff], cutoff


def check_split(train, test, label):
    """Every snapshot of a show stays on one side, and the test side is strictly later."""
    overlap = set(train.showId) & set(test.showId)
    assert not overlap, f"{label}: {len(overlap)} shows have snapshots on both sides"
    assert train.showDateTime.max() < test.showDateTime.min(), f"{label}: test shows are not all later than training shows"
    print(f"  {label}: {train.showId.nunique():,} vs {test.showId.nunique():,} shows, no show on both sides, "
          f"test starts {test.showDateTime.min():%Y-%m-%d %H:%M} after training ends {train.showDateTime.max():%Y-%m-%d %H:%M}")


def promotion_check(model, test):
    """
    Counterfactual: take test shows without a promotion, apply 10/20/30% off at
    PROMO_HORIZON hours out, and compare the model's predicted lift in final seats
    with what the simulator would produce (demand x lift, capped at capacity).
    """
    rows = test[(test.snapshotHours == PROMO_HORIZON) & (test.discountPercent == 0)]
    base_pred = forecast(model, rows)
    results = {}
    for pct in DISCOUNTS:
        promo = rows.assign(discountPercent=pct, ticketPrice=rows.ticketPrice - 12 * pct / 100)
        model_lift = forecast(model, promo).sum() / base_pred.sum() - 1
        expected = np.minimum(CAPACITY, rows[LABEL] * (1 + SIMULATED_LIFT_PER_PERCENT * pct))
        sim_lift = expected.sum() / rows[LABEL].sum() - 1
        results[pct] = {
            "modelLift": round(float(model_lift), 4), "simulatedLift": round(float(sim_lift), 4),
            "pass": bool(abs(model_lift - sim_lift) <= PROMO_TOLERANCE),
        }
    # Bias on shows that really had a promotion: does the model under-predict them?
    real = test[test.discountPercent > 0]
    bias = {
        "promotedShows": int(real.showId.nunique()),
        "promotedBias": round(float((forecast(model, real) - real[LABEL]).mean()), 3) if len(real) else None,
        "otherBias": round(float((forecast(model, test[test.discountPercent == 0]) - test[test.discountPercent == 0][LABEL]).mean()), 3),
    }
    return {"shows": int(len(rows)), "horizonHours": PROMO_HORIZON, "byDiscount": results, **bias}


def clamp(pred, sold_now):
    return np.clip(pred, sold_now, CAPACITY)


def remaining(data):
    return data[LABEL] - data.seatsSoldNow


def forecast(model, data):
    """Final seats = sold so far + predicted remaining, kept within [sold, capacity]."""
    sold = data.seatsSoldNow.to_numpy()
    return clamp(sold + model.predict(data[features_of(data)]), sold)


def features_of(data):
    return [c for c in data.columns if c not in ID_COLUMNS + [LABEL]]


class SlotBaseline:
    """Average final seats for the same room x start hour x weekday, from training data."""

    def fit(self, data):
        self.rooms = [c for c in data.columns if c.startswith("room_")]
        self.days = [c for c in data.columns if c.startswith("dow_")]
        keyed = data.assign(_key=self._keys(data)).drop_duplicates("showId")
        self.table = keyed.groupby("_key")[LABEL].mean().to_dict()
        self.overall = keyed[LABEL].mean()
        return self

    def _keys(self, data):
        room = data[self.rooms].to_numpy().argmax(axis=1)
        day = data[self.days].to_numpy().argmax(axis=1)
        return [f"{r}|{h}|{d}" for r, h, d in zip(room, data.startHour, day)]

    def predict(self, data):
        raw = np.array([self.table.get(k, self.overall) for k in self._keys(data)])
        return clamp(raw, data.seatsSoldNow.to_numpy())


def pace_baseline(train, test):
    """Seats sold so far / the share usually sold by that many hours before the show."""
    share = train.groupby("snapshotHours").seatsSoldNow.sum() / train.groupby("snapshotHours")[LABEL].sum()
    return clamp(test.seatsSoldNow / test.snapshotHours.map(share).clip(lower=0.01), test.seatsSoldNow.to_numpy()).to_numpy()


def gbr(trees, depth, **kwargs):
    return GradientBoostingRegressor(
        n_estimators=trees, max_depth=depth, learning_rate=LEARNING_RATE,
        subsample=0.8, random_state=SEED, **kwargs,
    )


def scores(y, pred):
    return {"mae": round(float(mean_absolute_error(y, pred)), 3), "r2": round(float(r2_score(y, pred)), 4)}


def export_ensemble(model, X):
    """Every tree as nested nodes {f, t, l, r} / {v}; prediction = init + lr * sum(trees)."""
    def node(tree, i):
        if tree.children_left[i] == -1:
            return {"v": round(float(tree.value[i][0][0]), 8)}
        return {
            "f": int(tree.feature[i]),
            "t": float(tree.threshold[i]),
            "l": node(tree, tree.children_left[i]),
            "r": node(tree, tree.children_right[i]),
        }

    trees = [node(est[0].tree_, 0) for est in model.estimators_]
    # The starting value (mean or quantile of the labels), recovered from one row
    x0 = X.iloc[:1]
    tree_sum = sum(est[0].predict(x0.to_numpy(dtype=np.float32))[0] for est in model.estimators_)
    init = float(model.predict(x0)[0] - model.learning_rate * tree_sum)
    return {"init": init, "lr": model.learning_rate, "trees": trees}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv", default=ROOT / "ml/data/training.csv")
    parser.add_argument("--out", default=ROOT / "server/ml/model.json")
    args = parser.parse_args()

    data, features = load(args.csv)
    train, test, cutoff = split_by_time(data, TEST_DAYS)
    print(f"NOTE: {DATA_NOTE}\n")
    print(f"{len(data):,} rows, {len(features)} features")
    print(f"Train: {len(train):,} rows up to {cutoff:%Y-%m-%d %H:%M} UTC | Test: {len(test):,} rows (last {TEST_DAYS} days)")

    # 1. Pick hyperparameters on the week before the test week
    fit_part, val_part, _ = split_by_time(train, TEST_DAYS)
    print("Chronological splits:")
    check_split(fit_part, val_part, "fit / validation")
    check_split(train, test, "train / test")
    best = None
    for trees, depth in GRID:
        m = gbr(trees, depth).fit(fit_part[features], remaining(fit_part))
        mae = mean_absolute_error(val_part[LABEL], forecast(m, val_part))
        print(f"  validation: {trees} trees, depth {depth} -> MAE {mae:.2f} seats")
        if best is None or mae < best[0]:
            best = (mae, trees, depth)
    _, trees, depth = best
    print(f"Chosen: {trees} trees, depth {depth}")

    # 2. Fit the final models on all training rows
    X_train, y_train = train[features], remaining(train)
    y_test = test[LABEL]
    point = gbr(trees, depth).fit(X_train, y_train)
    # Quantile models start from the mean: starting from the 10th percentile
    # (0 remaining seats, because most 1h snapshots have nothing left to sell)
    # leaves the low model stuck predicting 0 for almost every show
    bounds = {
        name: gbr(trees, depth, loss="quantile", alpha=a, init=DummyRegressor(strategy="mean")).fit(X_train, y_train)
        for name, a in QUANTILES.items()
    }

    # 3. Evaluate on the held-out week
    pred = forecast(point, test)
    low = forecast(bounds["low"], test)
    high = forecast(bounds["high"], test)
    base = SlotBaseline().fit(train).predict(test)
    pace = pace_baseline(train, test)

    model_scores, base_scores, pace_scores = scores(y_test, pred), scores(y_test, base), scores(y_test, pace)
    # Judged in whole seats, on the range as shown (kept around the estimate)
    low, high = np.minimum(low, pred), np.maximum(high, pred)
    actual = y_test.to_numpy()
    below, above = actual < np.round(low), actual > np.round(high)
    coverage = float(np.mean(~below & ~above))
    by_snapshot = {
        int(h): {"model": scores(y_test[m], pred[m]), "baseline": scores(y_test[m], base[m]), "pace": scores(y_test[m], pace[m]),
                 "rangeCoverage": round(float(np.mean(~below[m] & ~above[m])), 4),
                 "rangeWidth": round(float(np.mean(high[m] - low[m])), 2)}
        for h in sorted(test.snapshotHours.unique(), reverse=True)
        for m in [(test.snapshotHours == h).to_numpy()]
    }
    improvement = 1 - model_scores["mae"] / base_scores["mae"]

    print(f"\nTest week ({len(test) // 4:,} shows):")
    print(f"  Baseline (room x hour x weekday): MAE {base_scores['mae']:.2f} seats, R2 {base_scores['r2']:.3f}")
    print(f"  Baseline (sales pace so far):     MAE {pace_scores['mae']:.2f} seats, R2 {pace_scores['r2']:.3f}")
    print(f"  Model:                            MAE {model_scores['mae']:.2f} seats, R2 {model_scores['r2']:.3f}  ({improvement:.0%} lower error)")
    print(f"  80% range ({QUANTILES['low']:.0%}-{QUANTILES['high']:.0%}): actual inside {coverage:.0%}, "
          f"below low {np.mean(below):.0%}, above high {np.mean(above):.0%} (target ~80 / 10 / 10)")
    for h, s in by_snapshot.items():
        print(f"    {h:>2}h before: model MAE {s['model']['mae']:5.2f} | slot baseline {s['baseline']['mae']:5.2f} | pace {s['pace']['mae']:5.2f}"
              f" | range covers {s['rangeCoverage']:.0%}, avg width {s['rangeWidth']:.1f} seats")

    promo = promotion_check(point, test)
    print(f"\nPromotion check ({promo['shows']} unpromoted test shows, discount applied {PROMO_HORIZON}h out):")
    for pct, res in promo["byDiscount"].items():
        verdict = "OK" if res["pass"] else f"FAILS (off by more than {PROMO_TOLERANCE:.0%} points)"
        print(f"  {pct}% off: model {res['modelLift']:+.1%} seats | simulator {res['simulatedLift']:+.1%}  -> {verdict}")
    print(f"  Shows that really had a promotion ({promo['promotedShows']}): average error {promo['promotedBias']:+.2f} seats "
          f"(other shows {promo['otherBias']:+.2f}; negative = under-predicted)")

    importance = sorted(zip(features, point.feature_importances_), key=lambda p: -p[1])
    print("\nMost important features:")
    for name, value in importance[:10]:
        print(f"  {name:<22} {value:.3f}")

    # 4. Export for Node
    now = datetime.now(timezone.utc)
    out = {
        "version": f"v{now:%Y%m%d-%H%M}",
        "trainedAt": now.isoformat(timespec="seconds"),
        "trainedOn": "simulated",
        "dataNote": DATA_NOTE,
        "library": f"scikit-learn {sklearn.__version__}",
        "capacity": CAPACITY,
        "target": "remaining",   # final seats = seatsSoldNow + prediction, clamped to [seatsSoldNow, capacity]
        "featureNames": features,
        "hyperparameters": {"trees": trees, "depth": depth, "learningRate": LEARNING_RATE, "subsample": 0.8, "quantiles": QUANTILES},
        "data": {
            "rows": len(data), "trainRows": len(train), "testRows": len(test),
            "testFrom": (cutoff + pd.Timedelta(seconds=1)).isoformat(), "testTo": data.showDateTime.max().isoformat(),
        },
        "metrics": {
            "model": model_scores, "baseline": base_scores, "paceBaseline": pace_scores, "improvement": round(improvement, 4),
            "rangeCoverage": round(coverage, 4), "rangeBelowLow": round(float(np.mean(below)), 4), "rangeAboveHigh": round(float(np.mean(above)), 4),
            "bySnapshotHours": by_snapshot,
            "promotion": promo,
        },
        "featureImportance": [{"feature": n, "importance": round(float(v), 4)} for n, v in importance],
        "models": {"point": export_ensemble(point, X_train), **{n: export_ensemble(m, X_train) for n, m in bounds.items()}},
    }
    Path(args.out).write_text(json.dumps(out, separators=(",", ":")))
    print(f"\nSaved {out['version']} to {args.out} ({Path(args.out).stat().st_size / 1024:.0f} KB)")

    # 5. Rows + scikit-learn's own forecasts, for ml/check_parity.py to compare against Node
    sample = test.sample(n=min(PARITY_ROWS, len(test)), random_state=SEED)
    PARITY_FILE.parent.mkdir(parents=True, exist_ok=True)
    PARITY_FILE.write_text(json.dumps({
        "modelVersion": out["version"],
        "rows": [
            {"x": [float(v) for v in row[features]], "seatsSoldNow": float(row.seatsSoldNow)}
            for _, row in sample.iterrows()
        ],
        "expected": {name: forecast(m, sample).tolist() for name, m in {"point": point, **bounds}.items()},
    }))
    print(f"Saved {len(sample)} parity rows to {PARITY_FILE}")


if __name__ == "__main__":
    main()
