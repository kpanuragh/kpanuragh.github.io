# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Personal site for Anuragh KP, built with Next.js 16 (App Router, React 19) and Tailwind v4, deployed to GitHub Pages at `iamanuragh.in`. Dark theme only. Content comes from Markdown in `content/posts/` plus two hand-authored data modules, `lib/cv.ts` and `lib/projects.ts`.

`0x55aa` survives only as a small secondary wordmark next to the name in the header (`components/Header.tsx`) — it is not the site's identity.

## Commands

```bash
npm run dev              # next dev (localhost:3000)
npm run build            # runs prebuild then `next build` → static export in /out
npm start                # next start — unused under `output: 'export'`, no server to run
npm run lint             # next lint — DOES NOT WORK: `next lint` was removed in Next 16, this just errors
npm test                 # vitest run (single pass, CI-style)
npm run test:watch       # vitest (watch mode)
npm run generate-og      # tsx scripts/generate-og-images.ts (per-slug OG images → public/og/)
npm run fix-yaml         # tsx scripts/fix-yaml-escaping.ts (rewrites frontmatter)
npm run generate-icons   # tsx scripts/generate-icons.ts
```

`prebuild` runs `fix-yaml && generate-og` automatically before every build.

There is a vitest suite in `tests/`. Some specs are pure unit tests over `lib/` (e.g. `cv.test.ts`, `projects.test.ts`) and can run standalone. Others (`homepage.test.ts`, `about.test.ts`, `work.test.ts`, `blog.test.ts`, `sitemap.test.ts`, `schema.test.ts`, `og.test.ts`, and more) assert against the built HTML/XML under `out/`, so run `npm run build` before `npm test` if you've touched anything those pages render. When in doubt, `npm run build && npm test` covers both.

## Static-export constraints

`next.config.ts` sets `output: 'export'`, `trailingSlash: true`, and `images.unoptimized: true`. Consequences when editing:

- No server-side runtime — every route must be statically renderable. The dynamic routes `app/blog/[slug]/page.tsx` and `app/work/[slug]/page.tsx` export `generateStaticParams` listing every slug; new dynamic segments must do the same.
- No Next.js Image optimization. Plain `<img>` or unoptimized `next/image` only.
- Build output lives in `/out` and is published by `.github/workflows/nextjs-deploy.yml` to GitHub Pages on every push to `main`.
- `CNAME` and `.nojekyll` at the repo root are required for the custom domain — do not delete.
- `app/blog/[slug]/page.tsx`'s `generateStaticParams()` emits a `{ slug: '__placeholder__' }` fallback when `getAllPostSlugs()` returns zero slugs, because Next 16 rejects a dynamic route under `output: 'export'` whose `generateStaticParams()` resolves to zero params — even though the function is present. The page calls `notFound()` for that placeholder since no post file matches it. It self-disarms the moment at least one real post exists (the normal case today, with one post in `content/posts/`). Do not "clean up" this fallback — removing it breaks the build the next time `content/posts/` is ever emptied.

## Content pipeline

1. Each post is `content/posts/YYYY-MM-DD-slug.md` (the `slug` for routing is the filename minus extension — the date prefix is part of the slug).
2. `lib/posts.ts` reads the directory, parses frontmatter with `gray-matter`, and computes reading time. `getAllPosts()` sorts by `date` descending.
3. `lib/markdown.ts` converts body to HTML via `unified → remark-parse → remark-gfm → remark-rehype → rehype-highlight → rehype-stringify`. Syntax highlighting is applied at build time; do not add a client-side highlighter.
4. Required frontmatter fields: `title`, `date` (YYYY-MM-DD), `excerpt`, `tags` (array). Optional: `featured`, `coverImage`.
5. `lib/seo-config.ts` is the single source of truth for site URL, author, and social handles — update it rather than hardcoding values in metadata.

Posts are now written by hand, one at a time. There is no automation that generates or publishes them — nothing reaches `main` (and therefore nothing deploys) without a human commit. `content/posts/` currently holds exactly one post.

### Frontmatter YAML quirks

Some older posts (from a since-removed generation workflow) produced broken YAML — double-quoted tag entries like `"\"laravel\""`, unescaped backslashes in excerpts like `GuzzleHttp\Client`. `scripts/fix-yaml-escaping.ts` runs in `prebuild` to reconstruct frontmatter so builds don't fail. When manually writing new posts, plain unquoted tags are fine — fix-yaml will normalize them, but it's better not to introduce new breakage.

## OG image generation

`scripts/generate-og-images.ts` uses `@vercel/og` to render a 1200×630 PNG per post into `public/og/<slug>.png`, plus a default fallback. The build depends on these files existing (referenced by `generateMetadata` in `app/blog/[slug]/page.tsx`), which is why it runs in `prebuild`. The card uses the dark palette: `#0b0d12` ground, `#d6dae2` body text, and an `Anuragh KP` mark in `#c8965a`. If you add metadata fields that should appear in the OG card, update the React tree in that script and keep it on this palette.

## Facts and claim discipline

These rules bind all future content work — pages, posts, schema, and copy alike:

- Canonical name is `Anuragh KP`. Variants `Anuragh K P`, `Anuragh K.P`, `Anuragh K. P.`, `K P Anuragh` appear only in schema `alternateName`.
- Location is `Kochi, Kerala`. Never Vatakara.
- **Never state or imply a CVE was assigned for the Laravel work.** No `CVE-NNNN-NNNNN` strings. The only approved claim: "Reported and patched an SQL injection vector in Laravel's query builder; shipped in v12.48.0." Supporting facts: commit `1dcf0b38`, advisory `GHSA-9p82-4j4w-5hw8` (draft, no CVE).
- The CEH certification is always shown dated `2021 – 2024` and marked lapsed.
- No langchain CVE claim anywhere — unverified.
- Banned copy: quality claims about the author, star counts, `★`, sales CTAs. Consulting availability is a subordinate clause, never a button.

## Data modules

`lib/cv.ts` (`roles`, `certifications`, `yearsWorking()`, `CAREER_START`) and `lib/projects.ts` (`projects`, `getProject()`, `featuredProjects()`) are the single source of truth for facts about work history, certifications, and open-source projects. Pages (home, `/about/`, `/work/`, `/work/[slug]/`) and `lib/schema.ts` (`getPersonSchema()`'s `hasCredential`, etc.) both read from these modules — they do not duplicate the data. Hardcoding a fact into a page instead of reading it from these modules is a defect; treat any such hardcoding you find as a bug to fix, not a style choice.

## Author / company voice in posts

When writing new posts and adding a personal-experience anecdote:

- **Default to Cubet Techno Labs** (current role — Technical Lead). Present-tense "in production / on my team / at work" anecdotes should reference Cubet (or the short form "Cubet").
- **Acodez is an earlier role.** Mention it only occasionally (~1 in 5 posts) and always with chronology cues — "early in my career at Acodez", "back when I was at Acodez", "before Cubet, at Acodez". Never write Acodez as if it were the current employer.
- When an anecdote would feel forced, drop the company name entirely — generic "in production" is fine.

## Path alias

`@/*` resolves to the repo root (see `tsconfig.json`). Prefer `@/lib/...` and `@/components/...` over relative paths.
