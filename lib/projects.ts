export type Project = {
  slug: string;
  name: string;
  /** One line, shown in lists. No superlatives. */
  blurb: string;
  /** Paragraphs for the detail page. */
  body: string[];
  repo: string;
  npm?: string;
  language: string;
  featured: boolean;
};

export const projects: Project[] = [
  {
    slug: 'zstd-js',
    name: 'zstd-js',
    blurb: 'Zstandard compression in pure JavaScript — no WebAssembly, no native bindings.',
    body: [
      'React Native and Hermes do not give you WebAssembly, and they do not give you native modules without ejecting. If you need Zstandard there, you need it in JavaScript.',
      'So this is the format implemented directly: FSE and Huffman decoding, the sequence decoder, and the frame parser, in plain JS that runs anywhere JavaScript does.',
      'It is slower than a native binding. That is the trade, and on a platform where the alternative is nothing at all, it is an easy one.',
    ],
    repo: 'https://github.com/kpanuragh/zstd-js',
    npm: 'https://www.npmjs.com/package/zstd-js',
    language: 'JavaScript',
    featured: true,
  },
  {
    slug: 'react-zlib-js',
    name: 'react-zlib-js',
    blurb: "Node's zlib core module reimplemented in JavaScript: Gzip, Deflate, Inflate, Brotli.",
    body: [
      'The same constraint as zstd-js, one layer down. A lot of libraries assume `require("zlib")` resolves to something; under React Native it does not.',
      'This is a drop-in implementation of that surface, so code written against the Node API keeps working on platforms that have no Node.',
    ],
    repo: 'https://github.com/kpanuragh/zlib',
    npm: 'https://www.npmjs.com/package/react-zlib-js',
    language: 'JavaScript',
    featured: true,
  },
  {
    slug: '0xos',
    name: '0xOS',
    blurb: 'An x86_64 kernel in Rust with no blocking primitives anywhere.',
    body: [
      'I took the Linux Foundation courses on Rust and on kernel development in March and April 2024. The obvious question afterwards was whether any of it had actually landed.',
      'The constraint I set was that the kernel offers exactly one interface: asynchronous submission. No blocking syscall, no sleeping primitive in the core. Everything is a queue.',
      'It is a learning project and I would not run anything on it. It has taught me more about scheduling and interrupt handling than the courses did.',
    ],
    repo: 'https://github.com/kpanuragh/0xOS',
    language: 'Rust',
    featured: true,
  },
  {
    slug: 'xdebug-mcp',
    name: 'xdebug-mcp',
    blurb: 'An MCP server that exposes PHP Xdebug sessions, over Unix sockets or TCP.',
    body: [
      'Xdebug speaks DBGp. Language models do not. This bridges the two, so a debugging session — breakpoints, stack frames, variable inspection — is available as MCP tools.',
      'It handles both Unix-socket and TCP transports, because local PHP setups and containerised ones disagree about which they offer.',
    ],
    repo: 'https://github.com/kpanuragh/xdebug-mcp',
    npm: 'https://www.npmjs.com/package/xdebug-mcp',
    language: 'TypeScript',
    featured: false,
  },
  {
    slug: 'ssh-mcp',
    name: 'ssh-mcp',
    blurb: 'MCP server for SSH: command execution, SFTP, and interactive shell sessions.',
    body: [
      'Connection management, command execution, file transfer and an interactive shell, exposed as MCP tools.',
      'The interactive-shell piece is the interesting part — keeping a PTY alive across tool calls is not what the protocol was designed for.',
    ],
    repo: 'https://github.com/kpanuragh/ssh-mcp',
    npm: 'https://www.npmjs.com/package/@kpanuragh/ssh-mcp',
    language: 'TypeScript',
    featured: false,
  },
  {
    slug: 'impact-cli',
    name: 'impact-cli',
    blurb: 'Change-based test selection: runs only the tests a diff can actually affect.',
    body: [
      'Builds a dependency graph from the changed files outward, directly and transitively, and runs the intersection with your test suite.',
      'Supports node, vitest, mocha, python, phpunit and pest, because the problem is identical across all of them and nobody wants six tools for it.',
    ],
    repo: 'https://github.com/kpanuragh/impact-cli',
    language: 'Python',
    featured: false,
  },
];

export function getProject(slug: string): Project | undefined {
  return projects.find(p => p.slug === slug);
}

export function featuredProjects(): Project[] {
  return projects.filter(p => p.featured);
}
