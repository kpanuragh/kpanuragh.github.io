# SEO Self-Promotion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the existing technical-SEO foundation into a self-promotion engine — consistent real-name identity, a crawlable hire-me page, internal linking, and social sharing — mapped to the owner's goals of leads, traffic, and social reach.

**Architecture:** Next.js 16 App Router, fully static (`output: 'export'`). All work is build-time: identity flows from `lib/seo-config.ts` → `lib/schema.ts` → page metadata + JSON-LD; new pages/components render to static HTML in `/out`. No server runtime, no client-side data fetching.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind v4, gray-matter frontmatter.

## Global Constraints

- Static export only: every route must be statically renderable; dynamic segments need `generateStaticParams`. `/about` is static (no params).
- No Next.js Image optimization beyond current usage; plain `<img>` / unoptimized `next/image` only.
- Path alias `@/*` → repo root. Prefer `@/lib/...`, `@/components/...`.
- **Canonical name is exactly `Anuragh KP`** everywhere user-facing. Eliminate `Anurag KP` and `Anuragh K P`.
- **Current role:** `Technical Lead` at `Cubet Techno Labs`. Do not describe the owner as "Laravel Developer". Acodez only with chronology cues (~1 in 5), per `CLAUDE.md` author voice.
- **Real handles (authoritative):** GitHub `kpanuragh`, LinkedIn `anuraghkp`, X `anuragh_kp`, contact email `kpanuragh@gmail.com`.
- No test suite exists. "Tests" in this plan are build success (`npm run build`), `grep` assertions, and inspection of prerendered HTML in `/out`.
- Commit messages: plain, no `Co-Authored-By` trailer.
- Do not assume `main` is quiet — a bot commits daily. Changes must be additive to post shape (the new `updated` frontmatter field is optional).

---

### Task 1: Identity source of truth (`seo-config.ts` + root metadata)

**Files:**
- Modify: `lib/seo-config.ts`
- Modify: `app/layout.tsx:9-14` (title/description/keywords) and metadata object

**Interfaces:**
- Produces: `siteConfig.title`, `siteConfig.description`, `siteConfig.tagline`, `siteConfig.author.name` (= `"Anuragh KP"`), `siteConfig.contactEmail` (= `"kpanuragh@gmail.com"`), `siteConfig.social.linkedin` (= `"anuraghkp"`), `siteConfig.social.twitter` (= `"@anuragh_kp"`). Consumed by every metadata + schema function.

- [ ] **Step 1: Baseline grep (should currently find the stale values)**

Run: `grep -rn "Laravel Developer\|Anuragh K P\|anuragh-k-p" lib/ app/`
Expected: matches in `lib/seo-config.ts` (and `lib/schema.ts`, `app/page.tsx` — fixed in later tasks).

- [ ] **Step 2: Rewrite `lib/seo-config.ts`**

```ts
export const siteConfig = {
  name: "0x55aa",
  tagline: "0x55aa",
  title: "Anuragh KP — Technical Lead, Backend & Security Engineer",
  description:
    "Technical Lead at Cubet Techno Labs, writing about backend engineering, application security, and DevOps — Laravel, Node.js, Kubernetes, and the messy realities of production.",
  url: "https://iamanuragh.in",
  author: {
    name: "Anuragh KP",
    email: "noreply@iamanuragh.in",
    url: "https://iamanuragh.in",
  },
  contactEmail: "kpanuragh@gmail.com",
  social: {
    twitter: "@anuragh_kp",
    github: "kpanuragh",
    linkedin: "anuraghkp",
  },
  locale: "en_US",
  ogImage: "/og/og-default.png",
};
```

- [ ] **Step 3: Update `app/layout.tsx` metadata for identity**

Change the `title.template`, `keywords`, and add Google Search Console verification. Replace lines 9-14:

```ts
  title: {
    default: siteConfig.title,
    template: '%s — Anuragh KP',
  },
  description: siteConfig.description,
  keywords: ["Anuragh KP", "Laravel", "PHP", "Node.js", "Backend Engineering", "Application Security", "Kubernetes", "DevOps", "Technical Lead"],
```

Add inside the metadata object (e.g. after the `robots` block, line ~57), reading a token that stays omitted until set:

```ts
  verification: {
    google: process.env.NEXT_PUBLIC_GSC_VERIFICATION,
  },
```

- [ ] **Step 4: Verify grep + typecheck via build**

Run: `grep -rn "Laravel Developer\|anuragh-k-p" lib/seo-config.ts app/layout.tsx`
Expected: no matches.
Run: `npm run build`
Expected: build completes; `/out/index.html` `<title>` reads `Anuragh KP — Technical Lead, Backend & Security Engineer`.

- [ ] **Step 5: Commit**

```bash
git add lib/seo-config.ts app/layout.tsx
git commit -m "feat(seo): unify real-name identity and current role in site config"
```

---

### Task 2: Enrich Person / Blog schema

**Files:**
- Modify: `lib/schema.ts` (`getPersonSchema`, `getBlogSchema`)

**Interfaces:**
- Consumes: `siteConfig` from Task 1.
- Produces: `getPersonSchema()` returning JSON-LD with `jobTitle`, `worksFor`, `knowsAbout`. Consumed by `app/page.tsx` and `app/about/page.tsx` (Task 4).

- [ ] **Step 1: Replace `getPersonSchema` in `lib/schema.ts`**

```ts
export function getPersonSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: siteConfig.author.name,
    url: siteConfig.author.url,
    image: `${siteConfig.url}/profile.jpg`,
    sameAs: [
      `https://github.com/${siteConfig.social.github}`,
      `https://www.linkedin.com/in/${siteConfig.social.linkedin}`,
      `https://x.com/${siteConfig.social.twitter.replace('@', '')}`,
    ].filter(Boolean),
    jobTitle: 'Technical Lead',
    worksFor: {
      '@type': 'Organization',
      name: 'Cubet Techno Labs',
    },
    knowsAbout: [
      'Laravel', 'PHP', 'Node.js', 'Backend Architecture',
      'Application Security', 'Kubernetes', 'DevOps', 'CI/CD',
    ],
    description: siteConfig.description,
  };
}
```

- [ ] **Step 2: Update `getBlogSchema` description line**

Replace the `description` field in `getBlogSchema()`:

```ts
    description: 'Articles about backend engineering, application security, and DevOps — Laravel, Node.js, and Kubernetes.',
```

- [ ] **Step 3: Verify**

Run: `npm run build`
Expected: build passes. Inspect `/out/index.html` — the Person JSON-LD contains `"jobTitle":"Technical Lead"` and `"worksFor"`.
Run: `grep -o '"jobTitle":"Technical Lead"' out/index.html`
Expected: one match.

- [ ] **Step 4: Commit**

```bash
git add lib/schema.ts
git commit -m "feat(seo): enrich Person schema with role, employer, and expertise"
```

---

### Task 3: Fix homepage hero identity

**Files:**
- Modify: `app/page.tsx:42-47` (hero name + subtitle)

**Interfaces:** none exported.

- [ ] **Step 1: Update hero name and subtitle**

Replace lines 42-47:

```tsx
            <h1 className="text-4xl md:text-6xl font-bold text-terminal-highlight dark:text-gray-100 tracking-tight mb-4">
              Anuragh KP
            </h1>
            <p className="text-lg md:text-xl text-gray-500 dark:text-gray-400 mb-8 max-w-lg">
              Technical Lead @ Cubet &middot; Backend &amp; Security Engineer &middot; Open Source
            </p>
```

- [ ] **Step 2: Verify**

Run: `grep -rn "Anurag KP\|Anuragh K P" app/page.tsx`
Expected: no matches.
Run: `npm run build`
Expected: passes; `/out/index.html` shows `Anuragh KP` in the hero `<h1>`.

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "fix(seo): correct hero name to Anuragh KP and update positioning"
```

---

### Task 4: `/about` hire-me page + nav + sitemap

**Files:**
- Create: `app/about/page.tsx`
- Modify: `components/Header.tsx:16` (About link target)
- Modify: `app/sitemap.ts` (add `/about` to `staticPages`)

**Interfaces:**
- Consumes: `getPersonSchema()` (Task 2), `siteConfig` (Task 1).

- [ ] **Step 1: Create `app/about/page.tsx`**

```tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { siteConfig } from '@/lib/seo-config';
import { getPersonSchema } from '@/lib/schema';

export const metadata: Metadata = {
  title: 'About — Anuragh KP',
  description:
    'Anuragh KP — Technical Lead at Cubet Techno Labs. Backend engineering, application security, and DevOps. Available for consulting and collaboration.',
  alternates: { canonical: '/about' },
  openGraph: {
    type: 'profile',
    url: `${siteConfig.url}/about`,
    title: 'About — Anuragh KP',
    description:
      'Technical Lead at Cubet Techno Labs. Backend, security, and DevOps. Open to consulting and collaboration.',
  },
};

const skills = [
  'Laravel / PHP', 'Node.js', 'Backend Architecture', 'REST & GraphQL APIs',
  'Application Security', 'Kubernetes', 'CI/CD & DevOps', 'PostgreSQL / MySQL',
];

export default function About() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-16">
      <div className="flex items-center gap-5 mb-8">
        <div className="relative w-20 h-20 rounded-full overflow-hidden border-2 border-[#e65100] shrink-0">
          <Image src="/profile.jpg" alt="Anuragh KP" fill className="object-cover" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-terminal-highlight dark:text-gray-100">Anuragh KP</h1>
          <p className="text-gray-500 dark:text-gray-400">Technical Lead @ Cubet Techno Labs</p>
        </div>
      </div>

      <div className="prose max-w-none dark:prose-invert">
        <p>
          I&rsquo;m a Technical Lead at Cubet Techno Labs, where I build and ship
          backend systems and lead engineering teams. My work spans API design,
          application security, and the DevOps that keeps it all running in production.
        </p>
        <p>
          I write here about the practical, hard-won lessons behind that work —
          Laravel and Node.js internals, securing real systems, and running
          containers without the 3am pages. Earlier in my career, at Acodez, I cut
          my teeth on full-stack web development before focusing on backend and security.
        </p>
      </div>

      <h2 className="text-xl font-bold text-terminal-highlight dark:text-gray-100 mt-10 mb-4">What I work with</h2>
      <div className="flex flex-wrap gap-2">
        {skills.map(s => (
          <span key={s} className="tag-pill">{s}</span>
        ))}
      </div>

      <h2 className="text-xl font-bold text-terminal-highlight dark:text-gray-100 mt-10 mb-4">Work with me</h2>
      <p className="text-gray-600 dark:text-gray-400 mb-5">
        Open to consulting, technical advisory, and collaboration on backend and
        security work. The fastest way to reach me:
      </p>
      <div className="flex flex-wrap gap-3">
        <a href={`mailto:${siteConfig.contactEmail}`} className="px-6 py-2.5 text-white text-sm font-semibold rounded-full transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5" style={{ background: 'linear-gradient(135deg, #e65100, #ff6d00)' }}>
          Email me
        </a>
        <a href={`https://www.linkedin.com/in/${siteConfig.social.linkedin}`} target="_blank" rel="noopener noreferrer" className="px-6 py-2.5 bg-white/80 dark:bg-gray-800/80 text-terminal-highlight dark:text-gray-200 text-sm font-semibold rounded-full border border-gray-200 dark:border-gray-700 hover:border-[#e65100] hover:text-[#e65100] transition-all duration-200">
          LinkedIn
        </a>
        <a href={`https://github.com/${siteConfig.social.github}`} target="_blank" rel="noopener noreferrer" className="px-6 py-2.5 bg-white/80 dark:bg-gray-800/80 text-terminal-highlight dark:text-gray-200 text-sm font-semibold rounded-full border border-gray-200 dark:border-gray-700 hover:border-[#e65100] hover:text-[#e65100] transition-all duration-200">
          GitHub
        </a>
      </div>

      <div className="mt-12">
        <Link href="/blog" className="text-[#e65100] font-medium hover:underline">&larr; Read the blog</Link>
      </div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(getPersonSchema()) }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Point Header nav at `/about`**

In `components/Header.tsx`, change line 16 `href="/#about"` to:

```tsx
            <Link href="/about" className="px-3 py-1.5 text-sm font-medium text-terminal-text dark:text-gray-300 hover:text-terminal-accent hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-colors">
```

- [ ] **Step 3: Add `/about` to sitemap**

In `app/sitemap.ts`, add to the `staticPages` array (after the `/blog` entry, before the closing `]`):

```ts
    {
      url: `${baseUrl}/about`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.8,
    },
```

- [ ] **Step 4: Verify**

Run: `npm run build`
Expected: build lists `/about` as a prerendered route; `out/about/index.html` exists.
Run: `grep -c "kpanuragh@gmail.com\|Technical Lead" out/about/index.html`
Expected: ≥1.
Run: `grep -c "/about" out/sitemap.xml`
Expected: ≥1.

- [ ] **Step 5: Commit**

```bash
git add app/about/page.tsx components/Header.tsx app/sitemap.ts
git commit -m "feat(seo): add crawlable /about hire-me page with Person schema"
```

---

### Task 5: Related-posts internal linking

**Files:**
- Modify: `lib/posts.ts` (add `getRelatedPosts`)
- Create: `components/RelatedPosts.tsx`
- Modify: `app/blog/[slug]/page.tsx` (render related posts)

**Interfaces:**
- Produces: `getRelatedPosts(slug: string, limit?: number): PostMetadata[]`.
- Consumes: `BlogCard` (`components/BlogCard.tsx`, existing), `PostMetadata`.

- [ ] **Step 1: Add `getRelatedPosts` to `lib/posts.ts`**

Append after `getPostsByTag`:

```ts
export function getRelatedPosts(slug: string, limit = 3): PostMetadata[] {
  const all = getAllPosts();
  const current = all.find(p => p.slug === slug);
  if (!current) return [];
  const currentTags = new Set(current.tags.map(t => t.toLowerCase()));

  return all
    .filter(p => p.slug !== slug)
    .map(p => ({
      post: p,
      score: p.tags.filter(t => currentTags.has(t.toLowerCase())).length,
    }))
    .filter(x => x.score > 0)
    .sort((a, b) =>
      b.score - a.score ||
      new Date(b.post.date).getTime() - new Date(a.post.date).getTime()
    )
    .slice(0, limit)
    .map(x => x.post);
}
```

- [ ] **Step 2: Create `components/RelatedPosts.tsx`**

```tsx
import type { PostMetadata } from '@/lib/posts';
import BlogCard from './BlogCard';

export default function RelatedPosts({ posts }: { posts: PostMetadata[] }) {
  if (posts.length === 0) return null;
  return (
    <section className="mt-16 pt-10 border-t border-gray-200 dark:border-gray-700/50">
      <h2 className="text-xl font-bold text-terminal-highlight dark:text-gray-100 mb-6 flex items-center gap-3">
        <span className="w-8 h-1 bg-[#e65100] rounded-full inline-block"></span>
        Related reading
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {posts.map(post => (
          <BlogCard key={post.slug} post={post} />
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Render in `app/blog/[slug]/page.tsx`**

Add the import near the other component imports (after line 11):

```tsx
import RelatedPosts from '@/components/RelatedPosts';
import { getRelatedPosts } from '@/lib/posts';
```

In the component body, after `const htmlContent = await markdownToHtml(post.content);` (line 76), add:

```tsx
  const relatedPosts = getRelatedPosts(slug);
```

Then render `<RelatedPosts>` inside the article-body `<div className="max-w-3xl mx-auto px-4 py-12">`, immediately after the closing `</article>` tag (line 136) and before the Footer CTA `<div className="mt-16 ...">`:

```tsx
        <RelatedPosts posts={relatedPosts} />
```

Note: `getRelatedPosts` is added to the existing `@/lib/posts` import list — merge it into the existing import on line 2 rather than duplicating if preferred:
`import { getAllPostSlugs, getPostBySlug, getRelatedPosts } from '@/lib/posts';` (then drop the separate import line above).

- [ ] **Step 4: Verify**

Run: `npm run build`
Expected: passes.
Pick a recent post slug (e.g. `ls content/posts | tail -1`), then:
Run: `grep -c "Related reading" out/blog/<slug>/index.html`
Expected: 1 for posts that have tag-siblings (the daily bot corpus shares tags, so recent posts will).

- [ ] **Step 5: Commit**

```bash
git add lib/posts.ts components/RelatedPosts.tsx app/blog/[slug]/page.tsx
git commit -m "feat(seo): add related-posts internal linking on articles"
```

---

### Task 6: Freshness signal (`updated` frontmatter → schema + sitemap)

**Files:**
- Modify: `lib/posts.ts` (`PostMetadata` interface, `getPostBySlug`)
- Modify: `lib/schema.ts` (`getBlogPostingSchema` `dateModified`)
- Modify: `app/sitemap.ts` (post `lastModified`)

**Interfaces:**
- Produces: `PostMetadata.updated?: string`; `getBlogPostingSchema` uses `updated ?? date`.

- [ ] **Step 1: Add `updated` to `PostMetadata` and parse it**

In `lib/posts.ts`, add to the `PostMetadata` interface (after `date: string;`):

```ts
  updated?: string;
```

In `getPostBySlug`, add to the returned object (after `date: data.date || new Date().toISOString(),`):

```ts
    updated: data.updated || undefined,
```

- [ ] **Step 2: Use it in `getBlogPostingSchema`**

In `lib/schema.ts`, replace the `dateModified` line:

```ts
    dateModified: post.updated || post.date,
```

- [ ] **Step 3: Use it in sitemap**

In `app/sitemap.ts`, in the `blogEntries` map, replace `lastModified`:

```ts
    lastModified: new Date(post.updated || post.date),
```

- [ ] **Step 4: Verify**

Run: `npm run build`
Expected: passes (bot posts without `updated` fall back to `date` — no error).
Optional manual check: add `updated: 2026-07-13` to one post's frontmatter, rebuild, confirm its `BlogPosting` JSON-LD `dateModified` reflects it, then revert.

- [ ] **Step 5: Commit**

```bash
git add lib/posts.ts lib/schema.ts app/sitemap.ts
git commit -m "feat(seo): support optional 'updated' frontmatter for freshness signals"
```

---

### Task 7: Social share buttons

**Files:**
- Create: `components/ShareButtons.tsx` (server component with share-intent anchors)
- Create: `components/CopyLinkButton.tsx` (client component)
- Modify: `app/blog/[slug]/page.tsx` (render `<ShareButtons>`)

**Interfaces:**
- Produces: `<ShareButtons url={string} title={string} />`.
- Consumes: nothing new beyond `siteConfig` (already imported in the page).

- [ ] **Step 1: Create `components/CopyLinkButton.tsx`**

```tsx
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
      className="px-4 py-1.5 text-xs font-medium rounded-full border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-[#e65100] hover:text-[#e65100] transition-colors"
    >
      {copied ? 'Copied!' : 'Copy link'}
    </button>
  );
}
```

- [ ] **Step 2: Create `components/ShareButtons.tsx`**

```tsx
import CopyLinkButton from './CopyLinkButton';

export default function ShareButtons({ url, title }: { url: string; title: string }) {
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(title);
  const links = [
    { label: 'LinkedIn', href: `https://www.linkedin.com/sharing/share-offsite/?url=${u}` },
    { label: 'X', href: `https://x.com/intent/tweet?url=${u}&text=${t}` },
    { label: 'Hacker News', href: `https://news.ycombinator.com/submitlink?u=${u}&t=${t}` },
  ];
  return (
    <div className="mt-12 pt-6 border-t border-gray-200 dark:border-gray-700/50 flex flex-wrap items-center gap-3">
      <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Share:</span>
      {links.map(l => (
        <a
          key={l.label}
          href={l.href}
          target="_blank"
          rel="noopener noreferrer"
          className="px-4 py-1.5 text-xs font-medium rounded-full border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-[#e65100] hover:text-[#e65100] transition-colors"
        >
          {l.label}
        </a>
      ))}
      <CopyLinkButton url={url} />
    </div>
  );
}
```

- [ ] **Step 3: Render in `app/blog/[slug]/page.tsx`**

Add import near the others:

```tsx
import ShareButtons from '@/components/ShareButtons';
```

In the body, `postUrl` is not yet in scope in the component (only in `generateMetadata`). Add after the `relatedPosts` line from Task 5:

```tsx
  const postUrl = `${siteConfig.url}/blog/${slug}`;
```

Render `<ShareButtons>` immediately after the closing `</article>` and before `<RelatedPosts>`:

```tsx
        <ShareButtons url={postUrl} title={post.title} />
```

(`siteConfig` is already imported on line 8.)

- [ ] **Step 4: Verify**

Run: `npm run build`
Expected: passes (client component `CopyLinkButton` is allowed under static export — it hydrates on the client).
Run: `grep -c "share-offsite\|news.ycombinator.com/submitlink" out/blog/<slug>/index.html`
Expected: ≥1, with the absolute post URL inside the `href`.

- [ ] **Step 5: Commit**

```bash
git add components/ShareButtons.tsx components/CopyLinkButton.tsx app/blog/[slug]/page.tsx
git commit -m "feat(seo): add social share buttons to blog posts"
```

---

## Final verification (after all tasks)

- [ ] Run full build: `npm run build` — succeeds, static export in `/out`.
- [ ] `grep -rn "Anurag KP\|Anuragh K P\|Laravel Developer" app/ lib/ components/` — no matches (canonical identity everywhere).
- [ ] `out/about/index.html` exists with Person schema + contact CTA.
- [ ] A recent post's `out/blog/<slug>/index.html` contains: updated `BlogPosting` JSON-LD, `Related reading` section, and social share links with absolute URLs.
- [ ] `out/sitemap.xml` includes `/about`.

## Spec coverage check

- Identity unification → Tasks 1, 2, 3 ✓
- `/about` hire-me page → Task 4 ✓
- Related-posts internal linking → Task 5 ✓
- Social share → Task 7 ✓; freshness (`dateModified`) → Task 6 ✓
- Google Search Console verification hook → Task 1 (env-driven, omitted until token set) ✓
- Testing/verification via build + grep + `/out` inspection → each task + final section ✓
