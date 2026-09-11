import { roles, yearsWorking } from '@/lib/cv';

const MONTHS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatMonth(s: string): string {
  const [y, m] = s.split('-');
  return `${MONTHS[Number(m)]} ${y}`;
}

const current = roles.find(r => r.end === null && r.org === 'Cubet Techno Labs');
if (!current) throw new Error('FactsPanel: no current Cubet Techno Labs role found in lib/cv.ts roles');

const facts: [string, string][] = [
  ['role', current.title],
  ['company', current.org],
  ['since', formatMonth(current.start)],
  ['based', current.location ?? ''],
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
