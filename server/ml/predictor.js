/**
 * Runs the demand model exported by ml/train.py (server/ml/model.json) in Node.
 *
 * Each ensemble is gradient-boosted regression trees:
 *   raw = init + learningRate x sum(tree outputs)
 * The trees predict seats still to be sold, so the forecast is
 *   seatsSoldNow + raw, clamped to [seatsSoldNow, capacity].
 */
import { createRequire } from 'module';
import { buildFeatures, FEATURE_NAMES } from './features.js';

const require = createRequire(import.meta.url);
let cached = null;

// scikit-learn compares features as 32-bit floats, so round the same way to
// take exactly the same branch at every split
const walk = (node, x) => {
    while (!('v' in node)) node = Math.fround(x[node.f]) <= node.t ? node.l : node.r;
    return node.v;
};

export const rawPredict = (ensemble, x) => {
    let sum = 0;
    for (const tree of ensemble.trees) sum += walk(tree, x);
    return ensemble.init + ensemble.lr * sum;
};

// The model must have been trained on exactly the features we build today
export const loadModel = () => {
    if (cached) return cached;
    const model = require('./model.json');
    const mismatch = model.featureNames.length !== FEATURE_NAMES.length || model.featureNames.some((name, i) => name !== FEATURE_NAMES[i]);
    if (mismatch) throw new Error(`Model ${model.version} was trained on different features; re-run npm run ml:export and ml/train.py`);
    cached = model;
    return model;
};

/**
 * Forecast from a feature row (FEATURE_NAMES order).
 * @returns {{ seats: number, low: number, high: number }} final paid seats, unrounded
 */
export const predictFromFeatures = (x, seatsSoldNow, model = loadModel()) => {
    const clamp = (raw) => Math.min(model.capacity, Math.max(seatsSoldNow, seatsSoldNow + raw));
    const seats = clamp(rawPredict(model.models.point, x));
    // Quantile models are fitted separately, so keep the range around the estimate
    let low = Math.min(clamp(rawPredict(model.models.low, x)), seats);
    let high = Math.max(clamp(rawPredict(model.models.high, x)), seats);
    // Stretch each side per horizon group so ~80% of outcomes land inside (fitted in train.py)
    const groups = model.rangeCalibration?.groups;
    if (groups) {
        const hours = x[model.featureNames.indexOf('hoursUntil')];
        const g = groups.find(gr => gr.maxHours == null || hours <= gr.maxHours);
        low = seats - g.low * (seats - low);
        high = seats + g.high * (high - seats);
    }
    const bound = (v) => Math.min(model.capacity, Math.max(seatsSoldNow, v));
    return { seats, low: bound(low), high: bound(high) };
};

/**
 * Forecast one show at time `at` (see buildFeatures for the inputs).
 * @returns {{ seats, low, high, occupancy, modelVersion }}
 */
export const forecastShow = ({ show, movie, seatsSoldNow, at = new Date(), history }) => {
    const model = loadModel();
    const x = buildFeatures({ show, movie, seatsSoldNow, at, history });
    const { seats, low, high } = predictFromFeatures(x, seatsSoldNow, model);
    return { seats, low, high, occupancy: seats / model.capacity, modelVersion: model.version };
};

export const modelInfo = () => {
    const { version, trainedAt, trainedOn, dataNote, metrics, featureImportance, hyperparameters } = loadModel();
    return { version, trainedAt, trainedOn, dataNote, metrics, featureImportance: featureImportance.slice(0, 10), hyperparameters };
};
