# kpanuragh.github.io

Personal site for Anuragh KP — Technical Lead, backend and security engineer. Built with
Next.js 16 (App Router, React 19) and Tailwind v4, statically exported and deployed to
GitHub Pages at [iamanuragh.in](https://iamanuragh.in). Dark theme only; there is no light
mode and no `dark:` variants.

## Commands

```bash
npm run dev              # next dev (localhost:3000)
npm run build            # runs prebuild then `next build` → static export in /out
npm start                # next start — unused under `output: 'export'`, no server to run
npm run lint             # next lint — does not work; `next lint` was removed in Next 16
npm test                 # vitest run (single pass, CI-style)
npm run test:watch       # vitest (watch mode)
npm run generate-og      # tsx scripts/generate-og-images.ts (per-slug OG images → public/og/)
npm run fix-yaml         # tsx scripts/fix-yaml-escaping.ts (rewrites frontmatter)
npm run generate-icons   # tsx scripts/generate-icons.ts
```

`prebuild` runs `fix-yaml && generate-og` automatically before every build.

Most of the vitest suite in `tests/` asserts against the built HTML/XML under `out/`, so run
`npm run build` before `npm test` if you've touched anything a page renders. When in doubt,
`npm run build && npm test` covers both.

## Structure

```
app/            Next.js routes — home, /about, /blog, /blog/[slug], /work, /work/[slug],
                /contact, plus sitemap.xml and feed.xml route handlers
components/     React server components (Header, Footer, RoleList, CertGrid, FactsPanel,
                BlogCard, TableOfContents, SecurityLead, ...)
content/posts/  Blog posts as Markdown files, one per file
lib/            cv.ts, projects.ts, posts.ts, markdown.ts, schema.ts, seo-config.ts
scripts/        Build-time tooling (OG image generation, frontmatter fixups, icons)
public/         Static assets
out/            Build output (generated, not committed)
```

Everything is a server component — no client-side interactivity is required to render
content, and the site must work with JavaScript disabled.

## Data modules

`lib/cv.ts` (`roles`, `certifications`, `yearsWorking()`, `CAREER_START`) and
`lib/projects.ts` (`projects`, `getProject()`, `featuredProjects()`) are the single source
of truth for facts about work history, certifications, and open-source projects. Pages
(home, `/about`, `/work`, `/work/[slug]`) and `lib/schema.ts` (the Person/BlogPosting
JSON-LD) all read from these modules — they do not duplicate the data. If you find a fact
hardcoded into a page or into `schema.ts` instead of read from these modules, that's a bug,
not a style choice.

`lib/seo-config.ts` is the single source of truth for site URL, author identity, and
social handles.

## Static export

`next.config.ts` sets `output: 'export'`, `trailingSlash: true`, and
`images.unoptimized: true`:

- There is no server-side runtime; every route must be statically renderable. The dynamic
  routes `app/blog/[slug]/page.tsx` and `app/work/[slug]/page.tsx` export
  `generateStaticParams` listing every slug.
- No Next.js Image optimization — plain `<img>` or unoptimized `next/image` only.
- Build output lives in `/out` and is published by `.github/workflows/nextjs-deploy.yml` to
  GitHub Pages on every push to `main`.
- `CNAME` and `.nojekyll` at the repo root are required for the custom domain.

## Adding a post

1. Create `content/posts/YYYY-MM-DD-slug.md`. The routing slug is the filename minus
   extension, so the date prefix is part of the URL.
2. Add frontmatter: `title`, `date` (YYYY-MM-DD), `excerpt`, `tags` (array). Optional:
   `featured`, `coverImage`.
3. Write the body in Markdown. It's converted to HTML at build time
   (`unified` → `remark-parse` → `remark-gfm` → `remark-rehype` → `rehype-highlight` →
   `rehype-stringify`); syntax highlighting happens at build time, not in the browser.
4. Run `npm run build && npm test` before committing.

Posts are written by hand, one at a time — there is no automation that generates or
publishes them. Nothing reaches `main`, and therefore nothing deploys, without a human
commit.

## License

ISC
