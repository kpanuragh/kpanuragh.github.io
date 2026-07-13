# SEO Self-Promotion — Design

**Date:** 2026-07-13
**Status:** Approved for planning
**Scope:** Approach B (foundation + authority + internal linking)

## Goal

The blog already has a solid *technical* SEO foundation (sitemap, robots, JSON-LD
schema, per-post OG images, canonical URLs, RSS feed, rich metadata). The gap is
**self-promotion**, mapped to three concrete outcomes the owner wants:

1. **Job / consulting leads** — recruiters and clients who find the site should
   immediately see who Anuragh is, his current role, his expertise, and how to
   contact/hire him.
2. **Traffic / readership growth** — rank for the technical topics and keep
   readers on-site across the daily-growing post corpus.
3. **Social reach** — posts should be easy to share and render well on
   LinkedIn / X / Hacker News.

## Key decisions (locked)

- **Identity:** Foreground the real name **"Anuragh KP"** consistently. Keep
  **"0x55aa"** only as the header logo / stylistic tagline. Eliminate the name
  variants currently in the codebase (`Anurag KP`, `Anuragh K P`).
- **About page:** Add a dedicated, crawlable `/about` (hire-me) route rather than
  relying on the existing homepage `#about` anchor.
- **Positioning:** Current role is **Technical Lead at Cubet Techno Labs**, not
  "Laravel Developer". Earlier role (Acodez) mentioned only with chronology cues,
  per the project's author-voice rules in `CLAUDE.md`.

## Non-goals (deferred)

- Topic-hub landing pages ("All Laravel posts" as ranking pages).
- Visible breadcrumb UI (breadcrumb JSON-LD already exists on posts).
- Newsletter capture (fights the static GitHub Pages export).
- Git-derived modified dates (replaced by a simpler frontmatter field — see below).

## Components / changes

### 1. Identity unification

Single source of truth is `lib/seo-config.ts`; propagate outward.

- `lib/seo-config.ts`
  - `title` → `"Anuragh KP — Technical Lead, Backend & Security Engineer"`.
  - `description` → current-role sentence (drop "Laravel Developer").
  - `social.twitter` / `social.linkedin` → real handles, or drop the Twitter card
    `creator` field if there is no Twitter handle (no placeholders shipped).
- `lib/schema.ts` → `getPersonSchema()`
  - `jobTitle: "Technical Lead"`.
  - add `worksFor: { "@type": "Organization", name: "Cubet Techno Labs" }`.
  - add `knowsAbout: [ ...skills ]` (Laravel/PHP, Node.js, backend, security,
    Kubernetes/DevOps, etc.).
  - keep `sameAs` (GitHub, LinkedIn).
- `app/page.tsx` hero → name `Anuragh KP`, subtitle reflects current positioning.
- `app/layout.tsx` → add Google Search Console verification via
  `metadata.verification.google` (value from a constant or env var) so the sitemap
  can be submitted and impressions tracked.

**Acceptance:** `grep -R "Anurag KP\|Anuragh K P"` returns no user-facing hits;
Person schema shows Technical Lead + Cubet.

### 2. `/about` (hire-me) page → leads

New statically-rendered route `app/about/page.tsx`.

- Own `generateMetadata` with title, description, and canonical `/about`.
- Content: bio, current role (Technical Lead @ Cubet), earlier-role chronology
  (Acodez), skills/expertise list, and a clear **contact / hire CTA**
  (email + LinkedIn + GitHub).
- Embed the enhanced `Person` JSON-LD from `getPersonSchema()`.
- `app/sitemap.ts` → add `/about` (priority ~0.8).
- `components/Header.tsx` → change "About" link from `/#about` to `/about`.

**Acceptance:** `/out/about/index.html` prerenders with Person schema, canonical,
and CTA links; sitemap includes `/about`.

### 3. Related-posts internal linking → traffic

- `lib/posts.ts` → add `getRelatedPosts(slug, limit = 3)`:
  score every other post by shared-tag count, tiebreak by recency (date desc),
  exclude the current slug, return top `limit`.
- New `components/RelatedPosts.tsx` — renders related post cards.
- `app/blog/[slug]/page.tsx` → render `<RelatedPosts>` above the footer CTA when
  results exist.
- Pure build-time; no client JS.

**Acceptance:** a post with shared-tag siblings renders up to 3 related links in
its prerendered HTML; a post with no tag overlap renders nothing (no empty block).

### 4. Social share + freshness → social reach

- New `components/ShareButtons.tsx`:
  - LinkedIn, X/Twitter, Hacker News as plain anchor share-intent links built from
    the post canonical URL + title (no client JS).
  - "Copy link" as a small client component.
  - Rendered on `app/blog/[slug]/page.tsx`.
- Freshness signal:
  - `lib/posts.ts` `PostMetadata` gains optional `updated?: string`;
    `getPostBySlug` reads `data.updated`.
  - `lib/schema.ts` `getBlogPostingSchema` → `dateModified = updated ?? date`.
  - `app/sitemap.ts` → post `lastModified = updated ?? date`.
  - Bot-authored posts omit `updated` (falls back to `date`); **no change to the
    GitHub Actions workflow required.**

**Acceptance:** share links contain the correct absolute post URL + encoded title;
a post with an `updated` field shows `dateModified` = that value in JSON-LD.

## Data flow

Frontmatter → `lib/posts.ts` (parse, reading time, related scoring) →
`lib/schema.ts` (JSON-LD) + page components (About, RelatedPosts, ShareButtons) →
static HTML in `/out`. `lib/seo-config.ts` remains the single source for identity;
`lib/schema.ts` consumes it. No server runtime; everything renders at build time,
consistent with `output: 'export'`.

## Testing / verification

No test suite exists. Verification is behavioral:

1. `npm run build` succeeds (prebuild `fix-yaml` + `generate-og`, then static
   export; all routes including `/about` prerender).
2. Inspect `/out/about/index.html` — Person schema, canonical, CTA links present.
3. Inspect a post's `/out/blog/<slug>/index.html` — updated `BlogPosting` schema,
   related-posts markup, share links with correct absolute URLs.
4. `grep` confirms no lingering name variants in user-facing output.

## Risks / constraints

- **Static export:** every new route must be statically renderable and needs
  `generateStaticParams` only if dynamic. `/about` is static — no params.
- **Daily bot commits** land on `main`; changes must not depend on `main` being
  quiet and must not break the bot's post shape (the `updated` field is optional
  and additive).
- **No placeholders shipped:** if a real Twitter handle does not exist, remove the
  Twitter `creator` rather than shipping `@anuragh_kp` unverified.
