import { formatMoney } from '../../lib/adminFormat';

export const ChartTooltip = ({ active, payload, label, formatter = formatMoney, labelFormatter }) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs shadow-xl">
            <p className="mb-1 font-medium text-zinc-200">{labelFormatter ? labelFormatter(label) : label}</p>
            {payload.map(p => (
                <p key={p.dataKey} className="flex items-center gap-2 text-zinc-400">
                    <span className="h-2 w-2 rounded-full" style={{ background: p.color || p.payload?.color || p.fill }} />
                    {p.name}: <span className="font-medium tabular-nums text-zinc-100">{formatter(p.value, p.dataKey)}</span>
                </p>
            ))}
        </div>
    );
};
