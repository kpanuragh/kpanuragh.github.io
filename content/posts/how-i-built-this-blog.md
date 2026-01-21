---
title: "How I Built This Blog (And You Can Too!)"
date: "2026-01-21"
excerpt: "The story of building a blog with a cool terminal boot animation. Spoiler: It was easier than I thought! 🚀"
tags: ["nextjs", "react", "web-dev", "tutorial"]
featured: true
---

# How I Built This Blog (And You Can Too!)

You know that satisfying feeling when you build something from scratch and it actually works? Yeah, that's what this blog is!

Let me tell you the story of how this came to be. Spoiler: No PhD required!

## The Crazy Idea 💡

I wanted a blog that didn't look like every other blog out there. I mean, we're developers - we can do better than generic WordPress themes, right?

So I thought: "What if my blog pretended to be a computer booting up?"

My friends: "That's weird."

Me: "Perfect!"

And here we are! 👾

## What I Used (The Simple Version)

### Next.js - The Brain

Think of Next.js as the magic that turns your React code into a super-fast website. I chose it because:
- It's fast (like, REALLY fast)
- Free hosting on GitHub Pages
- I can write blog posts in Markdown (no more HTML headaches!)

### TypeScript - The Safety Net

It's like JavaScript, but it yells at you BEFORE you break things in production. Trust me, this saves lives.

### Tailwind CSS - The Artist

Making things pretty without writing a million CSS files. It's like having design superpowers.

## The Fun Parts 🎮

### 1. That Boot Animation

Remember the boot sequence when you first visited? That's pure nostalgia! Here's the secret:

```typescript
const bootMessages = [
  "Found 0x55aa...",
  "Loading kernel...",
  "Boot complete!"
];
```

Just an array of messages with random delays. Simple, but everyone loves it! 😄

### 2. Writing in Markdown

Creating a new post is literally this easy:

```markdown
---
title: "My Cool Post"
date: "2026-01-21"
tags: ["awesome"]
---

# Hello World!

That's it. Just write like you're texting a friend.
```

Save the file, push to GitHub, and boom - it's live!

### 3. The Terminal Look

Dark theme because:
1. We're developers (it's literally the law)
2. It's easier on the eyes
3. It looks cool

I used some custom colors to get that retro terminal vibe without making it hard to read.

## The "Oh No!" Moments 😅

Every project has them. Here were mine:

**Problem #1:** Tailwind v4 is SO new, half the tutorials online are outdated.

**Solution:** Read the docs. I know, shocking! Actually read the documentation. It worked!

**Problem #2:** "Why won't it deploy?!"

**Solution:** I forgot a tiny config file. Spent 2 hours debugging. The file was 3 lines long. Classic developer moment.

**Problem #3:** Module format errors everywhere.

**Solution:** Deleted one line from package.json. Sometimes the answer is removing code, not adding more!

## How Auto-Deploy Works ✨

This is the coolest part. Every time I write a post:

1. Write markdown file
2. Push to GitHub
3. Magic happens (GitHub Actions)
4. Blog updates automatically

No servers to manage. No deployment stress. Just pure bliss!

```yaml
# The magic spell (GitHub Actions)
- run: npm run build
- run: deploy to GitHub Pages
```

That's it. Set it once, forget about it forever.

## What I Learned 📚

**Lesson 1:** Start simple, add complexity later. I almost built a custom CMS. Thank god I didn't!

**Lesson 2:** TypeScript is your friend. It's annoying until it saves you from a stupid bug at 2 AM.

**Lesson 3:** Markdown for blog posts = genius. Why did I ever write HTML by hand?

**Lesson 4:** GitHub Pages is free and fast. Use it!

**Lesson 5:** That boot animation? Took 20 minutes. People love it. Sometimes simple features win.

## Want to Build One Too?

Here's the honest truth: If you know basic React, you can build this in a weekend.

The recipe:
1. Install Next.js (`npx create-next-app`)
2. Add markdown processing (a few npm packages)
3. Write some posts
4. Push to GitHub
5. Celebrate 🎉

**Time needed:** A Saturday afternoon (if you don't get distracted by YouTube)

**Difficulty:** If you can build a todo app in React, you can build this.

**Cost:** $0 (GitHub Pages is free!)

## Cool Features I Might Add

- Search (so I can find my own posts 😂)
- Dark/Light theme toggle (even though dark is superior)
- Comments (maybe GitHub Discussions?)
- RSS feed (are RSS readers still a thing?)
- View counter (for my ego)

## The Best Part?

I wrote a blog post ABOUT the blog ON the blog. So meta!

Plus, now when people ask "Do you have a blog?", I can say yes and actually mean it!

## Try It Yourself!

Seriously, build something fun. It doesn't have to be perfect. Mine isn't!

The code is on [GitHub](https://github.com/kpanuragh/kpanuragh.github.io) if you want to poke around or copy it. I won't judge - that's what open source is for!

Got questions? Confused about something? Hit me up on [LinkedIn](https://www.linkedin.com/in/anuraghkp). I promise I don't bite!

---

**TL;DR:** Built a blog with Next.js, added a nerdy boot animation, made it deploy automatically, and now I'm writing about writing. Life is good! 🚀

*Now go build something cool!*
