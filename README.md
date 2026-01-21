# 0x55aa - Personal Blog

A modern personal blogging website built with Next.js 16, featuring a terminal-themed design with boot animation.

## Features

- **Next.js 16** with App Router and TypeScript
- **Markdown Blog Posts** - Write posts in Markdown with frontmatter
- **Terminal Theme** - Dark terminal aesthetic with custom boot animation
- **Syntax Highlighting** - Code blocks with syntax highlighting
- **Static Export** - Optimized for GitHub Pages
- **Automatic Deployment** - GitHub Actions workflow for CI/CD
- **SEO Optimized** - Meta tags, Open Graph, structured data
- **Responsive Design** - Mobile-first design with Tailwind CSS

## Tech Stack

- Next.js 16 (React 19)
- TypeScript
- Tailwind CSS v4
- Markdown processing (remark/rehype)
- Syntax highlighting (rehype-highlight)
- GitHub Pages deployment

## Project Structure

```
├── app/                    # Next.js app directory
│   ├── blog/              # Blog pages
│   │   ├── [slug]/        # Dynamic blog post pages
│   │   └── page.tsx       # Blog listing page
│   ├── layout.tsx         # Root layout
│   ├── page.tsx           # Home page
│   └── globals.css        # Global styles
├── components/            # React components
│   ├── BootAnimation.tsx  # Terminal boot animation
│   ├── BlogCard.tsx       # Blog post card
│   ├── Header.tsx         # Navigation header
│   └── Footer.tsx         # Site footer
├── content/               # Content directory
│   └── posts/            # Blog posts (Markdown)
├── lib/                   # Utility functions
│   ├── posts.ts          # Post management utilities
│   └── markdown.ts       # Markdown processing
├── public/               # Static assets
│   └── images/          # Image files
├── .github/
│   └── workflows/
│       └── deploy.yml    # GitHub Actions deployment
├── next.config.ts        # Next.js configuration
├── tailwind.config.ts    # Tailwind configuration
└── tsconfig.json         # TypeScript configuration
```

## Getting Started

### Prerequisites

- Node.js 20 or later
- npm or yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/kpanuragh/kpanuragh.github.io.git
cd kpanuragh.github.io

# Install dependencies
npm install

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Writing Blog Posts

### Create a New Post

1. Create a new Markdown file in `content/posts/`:
   ```bash
   touch content/posts/my-new-post.md
   ```

2. Add frontmatter and content:
   ```markdown
   ---
   title: "My Awesome Post"
   date: "2026-01-21"
   excerpt: "A brief description of your post"
   tags: ["laravel", "php", "tutorial"]
   featured: false
   ---

   # Your Post Title

   Your content here with **markdown** formatting.

   ## Code Examples

   ```php
   echo "Hello, World!";
   ```
   ```

3. The post will automatically appear on your blog!

### Frontmatter Fields

- `title`: Post title (required)
- `date`: Publication date in YYYY-MM-DD format (required)
- `excerpt`: Short description for previews (required)
- `tags`: Array of tags (optional)
- `featured`: Boolean to mark as featured (optional)
- `coverImage`: Path to cover image (optional)

## Development

```bash
# Development server with hot reload
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Lint code
npm run lint
```

## Deployment

The site automatically deploys to GitHub Pages when you push to the `main` branch.

### Manual Deployment

```bash
# Build the site
npm run build

# The static site is in the /out directory
# Commit and push to deploy
```

### GitHub Pages Setup

1. Go to repository Settings > Pages
2. Source: GitHub Actions
3. The workflow will automatically build and deploy

## Customization

### Colors

Edit terminal theme colors in `app/globals.css`:

```css
@theme {
  --color-terminal-bg: #0d1117;
  --color-terminal-accent: #81a1c1;
  /* ... */
}
```

### Boot Animation

Modify boot messages in `components/BootAnimation.tsx`.

### Content

Update your bio in `app/page.tsx`.

## License

ISC

## Author

Anurag
- [LinkedIn](https://www.linkedin.com/in/anuraghkp)
- [GitHub](https://github.com/kpanuragh)
