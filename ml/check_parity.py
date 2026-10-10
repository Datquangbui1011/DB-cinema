"""
Check that Node (server/ml/predictor.js) predicts exactly what scikit-learn did.

train.py saves 100 held-out rows and scikit-learn's forecasts to
ml/data/parity_sample.json; this runs the same rows through the exported
model.json in Node and requires every forecast to match to 4 decimals.

Usage:  ~/.venvs/db-cinema-ml/bin/python ml/check_parity.py
"""
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PARITY_FILE = ROOT / "ml/data/parity_sample.json"
PREDICTOR = ROOT / "server/ml/predictor.js"
TOLERANCE = 1e-4

NODE_SCRIPT = """
import fs from 'fs';
const { loadModel, predictFromFeatures } = await import(process.argv[1]);
const sample = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const model = loadModel();
const out = { modelVersion: model.version, point: [], low: [], high: [] };
for (const row of sample.rows) {
    const { seats, low, high } = predictFromFeatures(row.x, row.seatsSoldNow, model);
    out.point.push(seats); out.low.push(low); out.high.push(high);
}
console.log(JSON.stringify(out));
"""


def main():
    sample = json.loads(PARITY_FILE.read_text())
    result = subprocess.run(
        ["node", "--input-type=module", "-e", NODE_SCRIPT, PREDICTOR.as_uri(), str(PARITY_FILE)],
        capture_output=True, text=True, check=True,
    )
    node = json.loads(result.stdout)
    if node["modelVersion"] != sample["modelVersion"]:
        sys.exit(f"Sample is from {sample['modelVersion']} but model.json is {node['modelVersion']}: re-run train.py")

    failed = False
    for name in ["point", "low", "high"]:
        expected = sample["expected"][name]
        if name != "point":
            # Node keeps the range around the estimate, as train.py's coverage check does
            pick = min if name == "low" else max
            expected = [pick(v, p) for v, p in zip(expected, sample["expected"]["point"])]
        diffs = [abs(a - b) for a, b in zip(node[name], expected)]
        worst = max(diffs)
        ok = worst < TOLERANCE
        failed |= not ok
        print(f"{name:>5}: {len(diffs)} rows, largest difference {worst:.2e} seats -> {'OK' if ok else 'MISMATCH'}")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
