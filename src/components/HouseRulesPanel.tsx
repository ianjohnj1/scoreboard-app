import { useMemo, useState } from 'react';
import { ListChecks } from 'lucide-react';
import Modal from './Modal';
import { getDisplayableRules } from '../data/ruleDefinitions';

type HouseRulesPanelProps = {
  sport: string;
  houseRules: Record<string, unknown> | null | undefined;
};

export default function HouseRulesPanel({ sport, houseRules }: HouseRulesPanelProps) {
  const [open, setOpen] = useState(false);
  const rules = useMemo(() => getDisplayableRules(sport, houseRules), [sport, houseRules]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="p-2 rounded-xl hover:bg-charcoal-700 text-charcoal-400 transition-colors"
        aria-label="Open house rules"
      >
        <ListChecks size={18} />
      </button>

      <Modal isOpen={open} onClose={() => setOpen(false)} title="House Rules - This Match">
        {rules.length === 0 ? (
          <p className="text-sm text-charcoal-400">No match-specific house rules are active for this game.</p>
        ) : (
          <div className="space-y-3">
            {rules.map(rule => (
              <div key={rule.key} className="rounded-xl border border-charcoal-700 bg-charcoal-900/40 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-charcoal-100">{rule.definition.label}</p>
                    <p className="text-xs text-charcoal-400 mt-1">{rule.definition.explain}</p>
                  </div>
                  <span className="rounded-full border border-success-500/30 bg-success-500/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-success-400">
                    {rule.valueLabel}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </>
  );
}
