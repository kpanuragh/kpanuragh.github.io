# Deployment Guide

## GitHub Pages Setup

### One-Time Setup (Required)

1. **Go to your GitHub repository**
   - Visit: https://github.com/kpanuragh/kpanuragh.github.io

2. **Configure GitHub Pages**
   - Go to: Settings → Pages
   - Under "Build and deployment":
     - Source: Select **"GitHub Actions"**
   - Save the settings

3. **Verify the workflow**
   - After pushing, go to Actions tab
   - You should see the "Deploy to GitHub Pages" workflow running

### How It Works

The GitHub Actions workflow (`.github/workflows/deploy.yml`) automatically:

1. **Triggers** on every push to `main` branch
2. **Installs** dependencies with `npm ci`
3. **Builds** the Next.js site with `npm run build`
4. **Deploys** the `/out` directory to GitHub Pages
5. **Makes your site live** at your GitHub Pages URL

## Deploying Your Blog

### Initial Deployment

```bash
# Add all files
git add .

# Commit changes
git commit -m "feat: Initial Next.js blog setup with Markdown support"

# Push to GitHub
git push origin main
```

### Adding New Blog Posts

1. **Create a new Markdown file**
   ```bash
   touch content/posts/my-awesome-post.md
   ```

2. **Write your post**
   ```markdown
   ---
   title: "My Awesome Post"
   date: "2026-01-21"
   excerpt: "A brief description"
   tags: ["tag1", "tag2"]
   featured: false
   ---

   # Your Content Here

   Write your post content in Markdown...
   ```

3. **Commit and push**
   ```bash
   git add content/posts/my-awesome-post.md
   git commit -m "feat: Add blog post about XYZ"
   git push origin main
   ```

4. **Automatic deployment**
   - GitHub Actions will automatically build and deploy
   - Your post will be live in ~2-3 minutes

## Monitoring Deployments

### Check Deployment Status

1. Go to your repository on GitHub
2. Click the "Actions" tab
3. View the latest workflow run
4. Green checkmark = successful deployment
5. Red X = build failed (check logs)

### View Your Live Site

After deployment completes, your site will be available at:
- **GitHub Pages URL**: `https://kpanuragh.github.io/`
- **Custom Domain** (if configured): Check your CNAME file

## Troubleshooting

### Build Fails

If the build fails in GitHub Actions:

1. **Check the workflow logs**
   - Actions tab → Click on failed workflow
   - Review error messages

2. **Test locally first**
   ```bash
   npm run build
   ```
   If it fails locally, fix errors before pushing

3. **Common issues:**
   - Missing dependencies: Run `npm install`
   - Syntax errors in Markdown frontmatter
   - Invalid TypeScript code
   - Missing required frontmatter fields

### Deployment Succeeds but Site Not Updated

1. **Clear browser cache** (Ctrl+F5 or Cmd+Shift+R)
2. **Check GitHub Pages settings** are correct
3. **Wait a few minutes** for CDN propagation
4. **Verify .nojekyll file exists** in public folder

### Custom Domain Not Working

1. **Check CNAME file** exists in repository root
2. **Verify DNS settings** point to GitHub Pages
3. **Wait for DNS propagation** (can take 24-48 hours)
4. **Check GitHub Pages settings** show your custom domain

## Performance Optimization

### Before Pushing

Always run these commands locally:

```bash
# Build and check for errors
npm run build

# Optional: Run linter
npm run lint
```

### Production Checklist

- [ ] All blog posts have required frontmatter
- [ ] No TypeScript errors
- [ ] Build succeeds locally
- [ ] Images are optimized
- [ ] Links are working
- [ ] Code blocks have language specified

## Custom Domain Setup (Optional)

If you want to use a custom domain:

1. **Add CNAME file** (already exists if you had one)
   ```bash
   echo "yourdomain.com" > CNAME
   git add CNAME
   git commit -m "Add custom domain"
   git push
   ```

2. **Configure DNS** with your domain provider:
   - Add A records pointing to GitHub Pages IPs
   - Or add CNAME record pointing to `kpanuragh.github.io`

3. **Update GitHub Pages settings**
   - Settings → Pages
   - Custom domain: Enter your domain
   - Save

## Rollback (If Needed)

To rollback to a previous version:

```bash
# View commit history
git log --oneline

# Revert to specific commit
git revert <commit-hash>
git push origin main
```

## Monitoring

### Analytics (Optional)

To add Google Analytics:

1. Get your GA4 measurement ID
2. Add to `app/layout.tsx`:
   ```typescript
   <Script
     src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
     strategy="afterInteractive"
   />
   ```

### Uptime Monitoring

Use services like:
- UptimeRobot
- Pingdom
- StatusCake

## Support

If you encounter issues:

1. Check GitHub Actions logs
2. Review Next.js build errors
3. Test locally with `npm run build`
4. Check GitHub Pages status: https://www.githubstatus.com/

## Quick Reference

```bash
# Local development
npm run dev          # Start dev server
npm run build        # Build for production
npm run start        # Start production server

# Deployment
git add .
git commit -m "message"
git push origin main  # Automatic deployment!

# New blog post
touch content/posts/slug.md
# Write post
git add content/posts/slug.md
git commit -m "feat: Add new post"
git push
```

---

Your blog is now set up for automatic deployment! Every push to main will trigger a new build and deployment to GitHub Pages.
