import { useEffect, useState } from 'react';
import { Bot, Play } from 'lucide-react';
import { Panel, Badge, filterSelectClass } from './ui';
import { formatRelative } from '../../lib/adminFormat';

const TYPES = [
    { key: 'promotion', label: 'Promotions', description: 'Discount quiet shows 2+ days ahead, up to the largest discount below, when it is expected to add revenue.' },
    { key: 'cancel', label: 'Cancel empty showings', description: 'Remove showings with no tickets sold whose forecast sales are below their running cost.' },
];

const Toggle = ({ checked, disabled, onChange }) => (
    <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 flex-shrink-0 rounded-full transition-colors disabled:opacity-50 ${checked ? 'bg-emerald-500' : 'bg-zinc-700'}`}
    >
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${checked ? 'left-[18px]' : 'left-0.5'}`} />
    </button>
);

/**
 * Autopilot switches and limits. Admins edit; staff only see them.
 * `onSave(settings)` and `onRun()` return promises; the parent reloads afterwards.
 */
const AutopilotSettings = ({ settings, lastRun, isAdmin, onSave, onRun }) => {
    const [draft, setDraft] = useState(settings);
    const [saving, setSaving] = useState(false);
    const [running, setRunning] = useState(false);
    useEffect(() => { setDraft(settings); }, [settings]);
    if (!draft) return null;

    const dirty = JSON.stringify(draft) !== JSON.stringify(settings);
    const anyOn = Object.values(settings.autopilot).some(Boolean);
    const save = async () => { setSaving(true); try { await onSave(draft); } finally { setSaving(false); } };
    const run = async () => { setRunning(true); try { await onRun(); } finally { setRunning(false); } };

    return (
        <Panel
            title="Autopilot"
            description="After the nightly forecast, apply the low-risk advice you allow here without a click. Adding showtimes and changing rooms always need a person."
            actions={<Badge tone={anyOn ? 'success' : 'neutral'}><Bot className="w-3 h-3" />{anyOn ? 'On' : 'Off'}</Badge>}
            className="mb-6"
        >
            <div className="grid gap-5 lg:grid-cols-2">
                <div className="space-y-3">
                    {TYPES.map(t => (
                        <label key={t.key} className="flex items-start gap-3">
                            <Toggle checked={draft.autopilot[t.key]} disabled={!isAdmin} onChange={v => setDraft({ ...draft, autopilot: { ...draft.autopilot, [t.key]: v } })} />
                            <span>
                                <span className="block text-sm text-zinc-100">{t.label}</span>
                                <span className="block text-xs text-zinc-500">{t.description}</span>
                            </span>
                        </label>
                    ))}
                </div>
                <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-3">
                        <label className="flex items-center gap-2 text-xs text-zinc-400">
                            At most
                            <input type="number" min={0} max={20} value={draft.maxAutoActionsPerDay} disabled={!isAdmin}
                                onChange={e => setDraft({ ...draft, maxAutoActionsPerDay: Number(e.target.value) })}
                                className={`${filterSelectClass} w-16 tabular-nums`} />
                            changes a day
                        </label>
                        <label className="flex items-center gap-2 text-xs text-zinc-400">
                            Largest discount
                            <select value={draft.maxAutoDiscountPercent} disabled={!isAdmin}
                                onChange={e => setDraft({ ...draft, maxAutoDiscountPercent: Number(e.target.value) })} className={filterSelectClass}>
                                {[10, 20, 30].map(p => <option key={p} value={p}>{p}%</option>)}
                            </select>
                        </label>
                    </div>
                    <p className="text-xs text-zinc-500">
                        Every automatic change is listed under Recently applied as "Applied by autopilot" and can be undone.
                        {lastRun && ` Last run ${formatRelative(lastRun.ranAt)}: ${!lastRun.enabled.length ? 'off' : lastRun.limitReached ? `daily limit of ${lastRun.limit} already reached` : `${lastRun.applied.length} applied`}.`}
                    </p>
                    {isAdmin && (
                        <div className="flex flex-wrap gap-2">
                            <button onClick={save} disabled={!dirty || saving} className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-dull disabled:opacity-50">
                                {saving ? 'Saving…' : 'Save settings'}
                            </button>
                            <button onClick={run} disabled={dirty || running || !anyOn} title={dirty ? 'Save your changes first' : !anyOn ? 'Switch something on first' : 'Apply allowed advice now'}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-900 disabled:opacity-50">
                                <Play className="w-3.5 h-3.5" />{running ? 'Running…' : 'Run now'}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </Panel>
    );
};

export default AutopilotSettings;
