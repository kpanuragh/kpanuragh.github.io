# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Static personal blog ("0x55aa") built with Next.js 16 (App Router, React 19) and Tailwind v4, deployed to GitHub Pages at `iamanuragh.in`. Posts are Markdown files in `content/posts/` rendered to static HTML at build time.

## Commands

```bash
npm run dev              # next dev (localhost:3000)
npm run build            # runs prebuild then `next build` → static export in /out
npm run lint             # next lint
npm run generate-og      # tsx scripts/generate-og-images.ts (per-slug OG images → public/og/)
npm run fix-yaml         # tsx scripts/fix-yaml-escaping.ts (rewrites frontmatter)
npm run generate-icons   # tsx scripts/generate-icons.ts
```

`prebuild` runs `fix-yaml && generate-og` automatically before every build. There is no test suite.

The legacy local blog-generation scripts (`generate-blog`, `batch-blog*`, `fetch-trends`, etc.) require `ANTHROPIC_API_KEY` and are mostly superseded by the GitHub Actions workflow — only run them if explicitly asked.

## Static-export constraints

`next.config.ts` sets `output: 'export'`, `trailingSlash: true`, and `images.unoptimized: true`. Consequences when editing:

- No server-side runtime — every route must be statically renderable. The dynamic routes `app/blog/[slug]/page.tsx` and `app/blog/tags/[tag]/page.tsx` both export `generateStaticParams` listing every slug/tag; new dynamic segments must do the same.
- No Next.js Image optimization. Plain `<img>` or unoptimized `next/image` only.
- Build output lives in `/out` and is published by `.github/workflows/nextjs-deploy.yml` to GitHub Pages on every push to `main`.
- `CNAME` and `.nojekyll` at the repo root are required for the custom domain — do not delete.

## Content pipeline

1. Each post is `content/posts/YYYY-MM-DD-slug.md` (the `slug` for routing is the filename minus extension — the date prefix is part of the slug).
2. `lib/posts.ts` reads the directory, parses frontmatter with `gray-matter`, and computes reading time. `getAllPosts()` sorts by `date` descending.
3. `lib/markdown.ts` converts body to HTML via `unified → remark-parse → remark-gfm → remark-rehype → rehype-highlight → rehype-stringify`. Syntax highlighting is applied at build time; do not add a client-side highlighter.
4. Required frontmatter fields: `title`, `date` (YYYY-MM-DD), `excerpt`, `tags` (array). Optional: `featured`, `coverImage`.
5. `lib/seo-config.ts` is the single source of truth for site URL, author, and social handles — update it rather than hardcoding values in metadata.

### Frontmatter YAML quirks

Posts written by the automated workflow have historically produced broken YAML (double-quoted tag entries like `"\"laravel\""`, unescaped backslashes in excerpts like `GuzzleHttp\Client`). `scripts/fix-yaml-escaping.ts` runs in `prebuild` to reconstruct frontmatter so builds don't fail. When manually editing posts, you can leave tags as plain strings — fix-yaml will normalize them, but it's better not to introduce new breakage.

## OG image generation

`scripts/generate-og-images.ts` uses `@vercel/og` to render a 1200×630 PNG per post into `public/og/<slug>.png`, plus a default fallback. The build depends on these files existing (referenced by `generateMetadata` in `app/blog/[slug]/page.tsx`), which is why it runs in `prebuild`. If you add metadata fields that should appear in the OG card, update the React tree in that script.

## Automated blog generation (GitHub Actions)

`.github/workflows/auto-blog-generation.yml` runs daily at 10:00 UTC and on `workflow_dispatch`. It invokes `anthropics/claude-code-action@v1` three times sequentially (security → backend → devops) using `CLAUDE_CODE_OAUTH_TOKEN`. Each job authors a Markdown post in `content/posts/`, then commits and pushes to `main` directly — which then triggers `nextjs-deploy.yml`. The jobs are chained via `needs:` to avoid push races.

Implications:
- Do not assume `main` is quiet — bot commits land daily.
- When changing post structure (frontmatter shape, filename convention, directory), update the prompts in this workflow too or the bot will keep producing the old shape.
- `blog-config.json` lists topic pools used by the older local scripts; the GH Actions workflow has its own inline prompts and does not read this file.

### Topic rotation (anti-repeat)

Each generate-* job has a `Pick today's topic` step that:
1. Maps `date -u +%u` (1=Mon … 7=Sun) to a sub-category — 7 sub-categories per role × 3 roles = 21 sub-categories on rotation.
2. Picks a random topic from that day's pool.
3. Emits the last ~63 post filenames into `$GITHUB_ENV` as `RECENT_POSTS`.

The subsequent Claude prompt receives `BLOG_SUB_CATEGORY`, `BLOG_TOPIC`, and `RECENT_POSTS`, and is instructed to PIVOT to a sibling topic if the suggestion overlaps with anything recent. This is what prevents the bot from re-generating "JWT Security", "Docker multi-stage builds", or "Node.js graceful shutdown" on loop.

To add/rebalance topics, edit the `TOPICS=(…)` arrays in the `Pick today's topic` step of the relevant job. Those arrays are the single source of truth for the topic universe — `blog-config.json` is unused by this workflow.

## Author / company voice in posts

When writing new posts (manually or via the workflow) and adding a personal-experience anecdote:

- **Default to Cubet Techno Labs** (current role — Technical Lead). Present-tense "in production / on my team / at work" anecdotes should reference Cubet (or the short form "Cubet").
- **Acodez is an earlier role.** Mention it only occasionally (~1 in 5 posts) and always with chronology cues — "early in my career at Acodez", "back when I was at Acodez", "before Cubet, at Acodez". Never write Acodez as if it were the current employer.
- When an anecdote would feel forced, drop the company name entirely — generic "in production" is fine.
- Older posts in `content/posts/` over-reference Acodez; that's historical and not a pattern to imitate.

The three prompts in `.github/workflows/auto-blog-generation.yml` already encode this rule under an `AUTHOR CONTEXT` block — keep that block in sync if the framing changes.

## Path alias

`@/*` resolves to the repo root (see `tsconfig.json`). Prefer `@/lib/...` and `@/components/...` over relative paths.
