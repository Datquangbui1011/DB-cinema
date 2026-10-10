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
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, r2_score

ROOT = Path(__file__).resolve().parent.parent
CAPACITY = 90
TEST_DAYS = 7
LEARNING_RATE = 0.05
QUANTILES = {"low": 0.1, "high": 0.9}
GRID = [(200, 3), (400, 3), (400, 4), (600, 4)]   # (trees, depth)
SEED = 42
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
    print(f"{len(data):,} rows, {len(features)} features")
    print(f"Train: {len(train):,} rows up to {cutoff:%Y-%m-%d %H:%M} UTC | Test: {len(test):,} rows (last {TEST_DAYS} days)")

    # 1. Pick hyperparameters on the week before the test week
    fit_part, val_part, _ = split_by_time(train, TEST_DAYS)
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
    bounds = {name: gbr(trees, depth, loss="quantile", alpha=a).fit(X_train, y_train) for name, a in QUANTILES.items()}

    # 3. Evaluate on the held-out week
    pred = forecast(point, test)
    low = forecast(bounds["low"], test)
    high = forecast(bounds["high"], test)
    base = SlotBaseline().fit(train).predict(test)
    pace = pace_baseline(train, test)

    model_scores, base_scores, pace_scores = scores(y_test, pred), scores(y_test, base), scores(y_test, pace)
    coverage = float(np.mean((y_test >= np.minimum(low, pred)) & (y_test <= np.maximum(high, pred))))
    by_snapshot = {
        int(h): {"model": scores(y_test[m], pred[m]), "baseline": scores(y_test[m], base[m]), "pace": scores(y_test[m], pace[m])}
        for h in sorted(test.snapshotHours.unique(), reverse=True)
        for m in [(test.snapshotHours == h).to_numpy()]
    }
    improvement = 1 - model_scores["mae"] / base_scores["mae"]

    print(f"\nTest week ({len(test) // 4:,} shows):")
    print(f"  Baseline (room x hour x weekday): MAE {base_scores['mae']:.2f} seats, R2 {base_scores['r2']:.3f}")
    print(f"  Baseline (sales pace so far):     MAE {pace_scores['mae']:.2f} seats, R2 {pace_scores['r2']:.3f}")
    print(f"  Model:                            MAE {model_scores['mae']:.2f} seats, R2 {model_scores['r2']:.3f}  ({improvement:.0%} lower error)")
    print(f"  80% range ({QUANTILES['low']:.0%}-{QUANTILES['high']:.0%}) contained the actual result {coverage:.0%} of the time")
    for h, s in by_snapshot.items():
        print(f"    {h:>2}h before: model MAE {s['model']['mae']:5.2f} | slot baseline {s['baseline']['mae']:5.2f} | pace {s['pace']['mae']:5.2f}")

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
            "rangeCoverage": round(coverage, 4), "bySnapshotHours": by_snapshot,
        },
        "featureImportance": [{"feature": n, "importance": round(float(v), 4)} for n, v in importance],
        "models": {"point": export_ensemble(point, X_train), **{n: export_ensemble(m, X_train) for n, m in bounds.items()}},
    }
    Path(args.out).write_text(json.dumps(out, separators=(",", ":")))
    print(f"\nSaved {out['version']} to {args.out} ({Path(args.out).stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
