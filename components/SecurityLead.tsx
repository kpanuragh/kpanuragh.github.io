import Link from 'next/link';
import { getAllPosts } from '@/lib/posts';
import { securityFindings } from '@/lib/security';

export default function SecurityLead() {
  const writeup = getAllPosts().find(p => p.slug.includes('injection-vector'));
  const langchain = securityFindings.find(f => f.cve !== null)!;
  const laravel = securityFindings.find(f => f.cve === null)!;

  const laravelMeta: [string, string][] = [
    ['commit', laravel.commit],
    ['released', laravel.shippedIn],
    ['grammars', String(laravel.grammarsAffected.length)],
    ['advisory', laravel.ghsaId],
  ];

  const langchainMeta: [string, string][] = [
    ['cve', langchain.cve],
    ['severity', langchain.severity],
    ['affected', langchain.affectedVersions],
    ['patched', langchain.patchedVersion],
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="panel overflow-hidden" data-finding={langchain.id}>
        <div className="p-4 border-b border-line">
          <div className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-acc font-semibold">
            {langchain.cve} · {langchain.packageName}
          </div>
          <h3 className="mt-2 mb-2 text-[20px] leading-snug">{langchain.title}</h3>
          <p className="m-0 text-[12.5px] text-mut leading-relaxed">{langchain.summary}</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 border-b border-line">
          {langchainMeta.map(([k, v], i) => (
            <div
              key={k}
              className={`px-3.5 py-2.5 font-mono ${i < langchainMeta.length - 1 ? 'sm:border-r border-line' : ''}`}
            >
              <div className="text-[9px] uppercase tracking-wider text-dim">{k}</div>
              <div className="text-[11.5px] text-tx mt-1">{v}</div>
            </div>
          ))}
        </div>

        <div className="p-4">
          <p className="m-0 text-[11.5px] text-mut leading-relaxed">
            Credited as <b className="text-tx font-medium">reporter</b> on{' '}
            <a
              href={langchain.ghsaUrl}
              className="text-acc2 underline underline-offset-2"
              rel="noopener noreferrer"
            >
              {langchain.ghsaId}
            </a>
            , published {langchain.published}. CVSS v3.1: <span className="font-mono">{langchain.cvssVector}</span>.
          </p>
        </div>
      </div>

      <div className="panel overflow-hidden" data-finding={laravel.id}>
        <div className="p-4 border-b border-line">
          <div className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-acc font-semibold">
            {laravel.packageName} · shipped in {laravel.shippedIn}
          </div>
          <h3 className="mt-2 mb-2 text-[20px] leading-snug">{laravel.title}</h3>
          <p className="m-0 text-[12.5px] text-mut leading-relaxed">
            <b className="text-tx font-medium">forceIndex()</b> and{' '}
            <b className="text-tx font-medium">inRandomOrder()</b> passed their argument into the
            compiled SQL without validation. I reported it through Laravel&rsquo;s security process,
            wrote the patch, and it shipped across the MySQL, SQLite and SQL Server grammars.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 border-b border-line">
          {laravelMeta.map(([k, v], i) => (
            <div
              key={k}
              className={`px-3.5 py-2.5 font-mono ${i < laravelMeta.length - 1 ? 'sm:border-r border-line' : ''}`}
            >
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
            Laravel didn&rsquo;t issue a CVE for it. {laravel.declinedRationale}
          </p>
          <p className="m-0 text-[11.5px] text-mut leading-relaxed">
            {laravel.defenseInDepthNote} It&rsquo;s also why the langchain finding above is worth
            reading alongside this one: when the process does end in a CVE, that&rsquo;s reported
            just as plainly.
          </p>
          {writeup && (
            <p className="m-0 mt-3 text-[11.5px] text-mut leading-relaxed">
              <Link href={`/blog/${writeup.slug}`} className="text-acc2 underline underline-offset-2">
                I wrote up how it was found and why no CVE was issued.
              </Link>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
