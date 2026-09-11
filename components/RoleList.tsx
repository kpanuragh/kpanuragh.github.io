import { roles } from '@/lib/cv';

function span(start: string, end: string | null): string {
  const y = (s: string) => s.split('-')[0];
  return end === null ? `${y(start)} —` : y(start) === y(end) ? y(start) : `${y(start)} – ${y(end)}`;
}

export default function RoleList() {
  return (
    <div className="panel">
      {roles.map((r, i) => (
        <div key={`${r.org}-${r.start}`}
             className={`grid grid-cols-[84px_1fr] gap-3.5 px-3.5 py-2.5 text-[11.5px] items-baseline ${i < roles.length - 1 ? 'border-b border-line' : ''}`}>
          <span className="font-mono text-[10.5px] text-dim">{span(r.start, r.end)}</span>
          <span>
            <b className="text-tx font-semibold">{r.org}</b>
            <span className="text-mut"> · {r.title}</span>
            {r.location && <span className="text-dim">, {r.location}</span>}
          </span>
        </div>
      ))}
    </div>
  );
}
