# Manual steps

## Cloudflare (fixes the https → http → https hop at source)
- [ ] SSL/TLS mode → **Full (strict)**
- [ ] Enable **Always Use HTTPS**
- [ ] Verify: `curl -sIL https://iamanuragh.in/about/ | grep -i location` shows no `http://`

## Google Search Console
- [ ] Verify the domain if not already
- [ ] Submit `https://iamanuragh.in/sitemap.xml`
- [ ] Request indexing for `/` and `/about/`
- [ ] Do **not** use the URL removal tool on deleted posts — 404 is the signal

## GitHub profile
- [ ] Display name `Anuragh K.P` → `Anuragh KP`
- [ ] Location `Vatakara` → `Kochi`
- [ ] Company → `Cubet Techno Labs`
- [ ] Bio → `Technical Lead at Cubet Techno Labs. Backend, application security, DevOps.`
- [ ] `siteConfig.social.instagram` is currently `anuraghkp`, taken from the site's own previous homepage, but a search result suggested `anuragh_p` instead — confirm which account is actually his. Both URLs return HTTP 200 (Instagram serves 200 for missing profiles when logged out), so this cannot be settled by probing and needs a manual check.

## LinkedIn
- [ ] Move Cyberdome into **Honors & Awards** (keep the Experience entry)
- [ ] Write an **About** section; include "Anuragh KP" and "Anuragh K P" naturally
- [ ] Add **Projects** for `zstd-js`, `xdebug-mcp`, `react-zlib-js`, each linking to iamanuragh.in
- [ ] Reconcile headline "Team Lead" with the Experience title "Technical Lead"

## Optional
- [ ] Renew CEH with EC-Council — currently the weakest item on the page
