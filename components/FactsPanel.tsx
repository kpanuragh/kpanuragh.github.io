import { yearsWorking } from '@/lib/cv';

const facts: [string, string][] = [
  ['role', 'Technical Lead'],
  ['company', 'Cubet Techno Labs'],
  ['since', 'Jan 2021'],
  ['based', 'Kochi, Kerala'],
  ['working since', `2017 · ${yearsWorking()} years`],
  ['writes', 'PHP · Node · Rust'],
];

export default function FactsPanel() {
  return (
    <div className="panel font-mono">
      {facts.map(([k, v], i) => (
        <div key={k}
             className={`flex justify-between gap-3 px-3 py-2 text-[11px] ${i < facts.length - 1 ? 'border-b border-line' : ''}`}>
          <span className="text-dim">{k}</span>
          <span className="text-tx text-right">{v}</span>
        </div>
      ))}
    </div>
  );
}
