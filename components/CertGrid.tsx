import { certifications } from '@/lib/cv';

function label(c: (typeof certifications)[number]): string {
  const fmt = (s: string) => {
    const [y, m] = s.split('-');
    return `${['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m)]} ${y}`;
  };
  return c.lapsed && c.expires
    ? `${c.issued.split('-')[0]} – ${c.expires.split('-')[0]}, lapsed`
    : fmt(c.issued);
}

export default function CertGrid() {
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
      {certifications.map(c => (
        <div key={c.name} className="panel p-3">
          <div className="text-[9px] uppercase tracking-wider text-dim">{c.issuer}</div>
          <div className="text-[11.5px] my-1.5 leading-snug text-tx font-medium">{c.name}</div>
          <div className={`font-mono text-[10px] ${c.lapsed ? 'text-[#8a6d3f]' : 'text-dim'}`}>
            {label(c)}
          </div>
        </div>
      ))}
    </div>
  );
}
