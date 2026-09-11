import { certifications } from '@/lib/cv';

const MONTH_ABBR = ['', 'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function findCert(idSubstring: string) {
  const c = certifications.find(x => x.name.includes(idSubstring));
  if (!c) throw new Error(`Thread: no certification found matching "${idSubstring}"`);
  return c;
}

function when(issued: string): string {
  const [y, m] = issued.split('-');
  return `${MONTH_ABBR[Number(m)]} ${y}`;
}

/** Descriptive title after the "CODE: " prefix, e.g. "LFEL1002: Getting Started
 *  with Rust" -> "Getting Started with Rust". */
function titleAfterCode(name: string): string {
  const idx = name.indexOf(': ');
  return idx === -1 ? name : name.slice(idx + 2);
}

const rust = findCert('LFEL1002');
const kernel = findCert('LFD103');

// NOTE: kernel.name in lib/cv.ts is "LFD103: A Beginner's Guide to Linux
// Kernel Development" — its full descriptive title does not match the short
// label displayed here ("Linux Kernel Development"). Rather than silently
// switching the display to the longer derived title (a value change) or
// silently keeping the mismatch invisible, the short label stays hardcoded
// and this is flagged in task-8-report.md as a genuine disagreement between
// the two sources. The date below IS derived from cv.ts and matches exactly.

const steps = [
  { when: when(rust.issued), what: titleAfterCode(rust.name), note: 'Linux Foundation, LFEL1002.' },
  { when: when(kernel.issued), what: 'Linux Kernel Development', note: 'Linux Foundation, LFD103.' },
  {
    when: 'AFTER',
    what: '0xOS',
    note: 'An x86_64 kernel in Rust with no blocking primitives. Asynchronous submission is the only interface it offers.',
    last: true,
  },
];

export default function Thread() {
  return (
    <div className="grid sm:grid-cols-3 gap-2.5">
      {steps.map(s => (
        <div key={s.what}
             className={`panel p-3.5 ${s.last ? 'border-[#3a3021] bg-[#191308]' : ''}`}>
          <div className="font-mono text-[9.5px] text-dim tracking-wider">{s.when}</div>
          <b className={`block text-[13px] my-1.5 font-sans font-semibold ${s.last ? 'text-acc' : 'text-[#eceff4]'}`}>
            {s.what}
          </b>
          <p className="m-0 text-[11px] text-mut leading-relaxed">{s.note}</p>
        </div>
      ))}
    </div>
  );
}
