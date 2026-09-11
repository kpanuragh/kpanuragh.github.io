'use client';

import { useEffect } from 'react';

export default function CopyCodeButton() {
  useEffect(() => {
    const pres = document.querySelectorAll('pre');

    pres.forEach((pre) => {
      if (pre.querySelector('.copy-btn')) return;

      const wrapper = document.createElement('div');
      wrapper.className = 'relative group/code';
      pre.parentNode?.insertBefore(wrapper, pre);
      wrapper.appendChild(pre);

      const btn = document.createElement('button');
      btn.className = 'copy-btn absolute top-3 right-3 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-surf2 text-dim hover:text-tx hover:bg-surf backdrop-blur-sm border border-line opacity-0 group-hover/code:opacity-100 transition-all duration-200 cursor-pointer';
      btn.textContent = 'Copy';

      btn.addEventListener('click', async () => {
        const code = pre.querySelector('code')?.textContent || pre.textContent || '';
        await navigator.clipboard.writeText(code);
        btn.textContent = 'Copied!';
        btn.classList.add('!text-green-400', '!border-green-400/30');
        setTimeout(() => {
          btn.textContent = 'Copy';
          btn.classList.remove('!text-green-400', '!border-green-400/30');
        }, 2000);
      });

      wrapper.appendChild(btn);
    });
  }, []);

  return null;
}
