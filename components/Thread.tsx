const steps = [
  { when: 'MAR 2024', what: 'Getting Started with Rust', note: 'Linux Foundation, LFEL1002.' },
  { when: 'APR 2024', what: 'Linux Kernel Development', note: 'Linux Foundation, LFD103.' },
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
