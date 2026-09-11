'use client';
import { useState } from 'react';

export default function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(url).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="px-4 py-1.5 text-xs font-medium rounded-full border border-line text-mut hover:border-acc hover:text-acc transition-colors"
    >
      {copied ? 'Copied!' : 'Copy link'}
    </button>
  );
}
