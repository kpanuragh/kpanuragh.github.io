---
title: "🎲 Build Reproducibility: Same Commit, Different Binary"
date: "2026-08-19"
excerpt: "You checked out the exact same commit hash twice and got two different artifacts. Nobody touched the code. Here's why 'it built fine in CI' doesn't mean 'it built the same way twice' — and what actually fixes it."
tags: ["ci-cd", "devops", "reproducible-builds", "supply-chain", "platform-engineering"]
featured: true
---

Someone on the team files a bug: "prod is running different code than what's tagged v2.4.1." You check it out, diff the source against the release commit — identical, byte for byte. You rebuild it locally. The resulting binary has a different hash than the one running in prod.

Nobody edited anything. The git log is clean. And yet you have two artifacts, same source, same tag, that are provably not the same file.

This is what happens when a build is **deterministic in nobody's mind but not in practice** — it "works," it produces *a* correct-looking output every time, but it doesn't produce the *same* output every time. And that gap is where a surprising number of production incidents, supply-chain scares, and "how do we even audit this" meetings come from.

## Why builds drift even when the source doesn't

A build is a function of way more inputs than just your source tree. The usual suspects:

- **Timestamps.** Compilers and archivers love embedding "build time" into binaries and zip/jar headers. Two builds ten seconds apart produce two different files, guaranteed.
- **Filesystem ordering.** `tar`, `zip`, and plenty of bundlers iterate directories in whatever order the OS hands them back — which isn't guaranteed to be stable across machines or even across runs on ext4 vs overlayfs.
- **Floating dependency ranges.** `^1.2.0` in a `package.json`, an unpinned `apt-get install`, a `FROM node:20` that resolves to whatever `20.x.x` shipped this week — all silently pull in different bits over time.
- **Locale, environment variables, hostnames.** Some tools bake in `$USER`, `$HOSTNAME`, or locale-dependent sort order for things like map key iteration.
- **Parallelism-dependent codegen.** Some compilers order symbols or debug info based on which worker thread finished first.

None of this shows up as a *bug* in the usual sense. The build succeeds, the tests pass, the app runs correctly. It's only reproducibility — "can I regenerate this exact artifact from this exact source" — that silently breaks.

## Why you should care even if nothing's on fire yet

Three concrete reasons this bites teams, roughly in order of how often I've seen them show up:

1. **You can't verify what's actually running.** If you can't rebuild an artifact and get the same hash, you can't prove that what's deployed matches what's in git. That's not a hypothetical — it's exactly the gap SolarWinds-style supply-chain attacks live in: an artifact that *claims* to come from source X but doesn't, and nobody can tell because nobody can regenerate X and compare.
2. **Caching and dedup silently stop working.** Content-addressed caches (Docker layer cache, Bazel's remote cache, Nix store, most CDN-fronted artifact caches) key on the hash of the output. If your build isn't deterministic, every build is a cache miss dressed up as a cache system.
3. **Debugging "works on CI, not here" turns into archaeology.** When two builds of "the same" commit differ, you lose the ability to say "this bug is definitely in the code" — because you can't rule out that it's in the build.

## Getting deterministic, one input at a time

You don't fix this by finding one setting. You fix it by hunting down and pinning every non-source input, one at a time.

**Kill the embedded timestamp.** Most toolchains respect `SOURCE_DATE_EPOCH`, a convention from the Reproducible Builds project:

```bash
export SOURCE_DATE_EPOCH=$(git log -1 --format=%ct)
docker build --build-arg SOURCE_DATE_EPOCH -t myapp:$(git rev-parse --short HEAD) .
```

Tools that honor it (gcc, clang, many Python/Go toolchains, `dpkg-deb`, some `tar` builds) will use that instead of wall-clock time — so the artifact's embedded timestamp is a function of the commit, not of when you happened to run the build.

**Pin everything transitively, not just directly.** A lockfile only helps if CI actually respects it and nothing upstream of it floats:

```dockerfile
# floats — "20" today isn't "20" next month
FROM node:20

# pinned to a digest — this exact image, forever
FROM node@sha256:8f1c8f2b3e0f...
```

Same logic applies to `apt-get install foo` (pin the version, or better, vendor a lockfile like `apt-get install foo=1.2.3-1`), GitHub Actions (`uses: actions/checkout@<sha>`, not `@v4`), and any `curl | bash` installer in your Dockerfile — which honestly should just not exist, but that's a different rant.

**Normalize archive ordering.** If you're building tarballs, zips, or container layers yourself, sort file lists before archiving instead of trusting readdir order:

```bash
# non-deterministic — order depends on the filesystem
tar czf out.tar.gz dist/

# deterministic — explicit sort, and strip mtimes while you're at it
find dist -type f | sort | tar czf out.tar.gz --mtime='@0' --no-recursion -T -
```

**Verify it, don't just hope.** The actual test is: build twice, diff the hashes.

```bash
docker build -t app:build1 . && docker save app:build1 | sha256sum
docker build -t app:build2 . && docker save app:build2 | sha256sum
# these two hashes had better match
```

Wire that as an actual CI check — a rebuild-and-diff job that runs nightly, not just something you eyeball once and forget.

## What I've learned the hard way

At Cubet Techno Labs, we chased one of these down where a Terraform provider plugin — not our code, a *provider* — got fetched fresh on every `terraform init` because the lockfile only pinned the top-level version, not the provider's own dependency graph. Two runs an hour apart on the same commit produced plans with subtly different resource ordering. It wasn't a security incident, just a very confusing afternoon of "why does `plan` disagree with itself" — but it's the same root cause as the scarier supply-chain version of this problem: an unpinned input quietly deciding what actually ships.

You don't need Bazel-level hermetic builds to get real value here. Pinning digests instead of tags, setting `SOURCE_DATE_EPOCH`, and sorting your archive inputs gets you 90% of the way, and it's a few hours of work, not a rewrite.

**This week:** pick your most important artifact — the one thing that, if it silently differed from source, would actually scare you — and build it twice in a row in CI. If the hashes don't match, you've just found your next reliability project.
