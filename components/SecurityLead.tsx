const meta: [string, string][] = [
  ['commit', '1dcf0b38'],
  ['released', 'v12.48.0'],
  ['grammars', '3'],
  ['date', 'Jan 2026'],
];

export default function SecurityLead() {
  return (
    <div className="panel overflow-hidden">
      <div className="p-4 border-b border-line">
        <div className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-acc font-semibold">
          laravel/framework · shipped in v12.48.0
        </div>
        <h3 className="mt-2 mb-2 text-[20px] leading-snug">
          An injection vector in query-builder index hints
        </h3>
        <p className="m-0 text-[12.5px] text-mut leading-relaxed">
          <b className="text-tx font-medium">forceIndex()</b> and{' '}
          <b className="text-tx font-medium">inRandomOrder()</b> passed their argument into the
          compiled SQL without validation. I reported it through Laravel&rsquo;s security process,
          wrote the patch, and it shipped across the MySQL, SQLite and SQL Server grammars.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 border-b border-line">
        {meta.map(([k, v], i) => (
          <div key={k} className={`px-3.5 py-2.5 font-mono ${i < meta.length - 1 ? 'sm:border-r border-line' : ''}`}>
            <div className="text-[9px] uppercase tracking-wider text-dim">{k}</div>
            <div className="text-[11.5px] text-tx mt-1">{v}</div>
          </div>
        ))}
      </div>

      <div className="p-4 bg-[#15120a] border-l-2 border-acc">
        <h5 className="m-0 mb-1.5 text-[12.5px] font-sans font-semibold text-[#f0f2f6]">
          The part most people would leave out
        </h5>
        <p className="m-0 mb-2 text-[11.5px] text-mut leading-relaxed">
          Laravel didn&rsquo;t issue a CVE for it. The maintainers&rsquo; position was that not
          passing user input into an index hint is the developer&rsquo;s responsibility — the same
          contract as <b className="text-tx font-medium">DB::raw()</b>. They aren&rsquo;t wrong:
          nothing in the docs ever suggested those arguments were escaped.
        </p>
        <p className="m-0 text-[11.5px] text-mut leading-relaxed">
          The patch shipped anyway, which I think is the right outcome. A framework can hold a
          documented contract <i>and</i> still refuse to compile a string that could never be a
          valid index name. That&rsquo;s defence in depth, and it costs one{' '}
          <b className="text-tx font-medium">preg_match</b>.
        </p>
      </div>
    </div>
  );
}
