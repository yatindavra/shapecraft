# Deploying the docs site to GitHub Pages

Runbook for the VitePress site in `docs/`, published at
**https://aviasoletechnologies.github.io/shapecraft/**.

Maintainer-facing. It lives in `.github/` rather than `docs/` on purpose: everything under
`docs/` is a published page, and repo settings instructions don't belong on the public site.

## TL;DR

Deployment is **already automated** by [`.github/workflows/docs.yml`](workflows/docs.yml).
Merging anything that touches `docs/**` into `main` builds and publishes the site. The only
manual step is a one-time repo setting (below), and it only needs doing once per repo.

## 1. One-time setup

In the repo that actually serves the site (`aviasoletechnologies/shapecraft`, not a fork):

1. **Settings → Pages → Build and deployment → Source: `GitHub Actions`.**
   Not "Deploy from a branch" - the workflow uses `actions/deploy-pages`, which only works
   with the Actions source. This is the single most common reason a green workflow still
   serves a 404.
2. Confirm **Settings → Environments → `github-pages`** exists and its deployment branch rule
   allows `main`. GitHub usually creates this on the first run.
3. Nothing else. No `gh-pages` branch, no `docs/` folder setting, and no `.nojekyll` file -
   artifact-based Pages deploys serve the upload as-is and never run Jekyll, so the
   underscore-prefixed asset dirs VitePress emits are safe.

### Why `base` matters

[`docs/.vitepress/config.ts`](../docs/.vitepress/config.ts) sets:

```ts
base: "/shapecraft/",
```

That is required for a **project** Pages site, because the site is served from a subpath
(`<org>.github.io/shapecraft/`), not the domain root. Every absolute asset path in `head`
must include that prefix too - which is why the existing favicon entries read
`/shapecraft/favicon-light-32.png` and not `/favicon-light-32.png`.

Change `base` to `"/"` **only** if you move to a custom domain or an org-root Pages repo.

## 2. How a deploy happens

The workflow triggers on:

- a push to `main` touching `docs/**` or the workflow file itself, or
- a manual **Run workflow** (`workflow_dispatch`) from the Actions tab.

It then builds in `docs/` and uploads `docs/.vitepress/dist` as the Pages artifact.

Note the path filter: a release that only changes `src/` and `README.md` will **not**
redeploy the site. If you need a rebuild anyway (say you changed something the site reads
from outside `docs/`), use the manual trigger.

## 3. Verify a deploy

```bash
gh run list --workflow=docs.yml --repo aviasoletechnologies/shapecraft --limit 5
gh run watch --repo aviasoletechnologies/shapecraft   # follow the in-flight one
```

Then load the site and hard-refresh (`Ctrl/Cmd+Shift+R`) - Pages caches aggressively.

Build it locally first if you want to catch failures before pushing:

```bash
cd docs
npm install
npm run docs:build     # fails the build on dead internal links
npm run docs:preview   # serves dist/ at the real base path
```

`docs:build` treats dead internal markdown links as errors, so a renamed page that still has
inbound links fails CI rather than shipping a broken site. That is intentional - don't
silence it with `ignoreDeadLinks` unless the link is genuinely external-and-flaky.

## 4. SEO settings

The site currently sets `title`, `description`, `cleanUrls`, and `lastUpdated`, which covers
per-page `<title>` and `<meta name="description">`. Everything below is **not** configured
yet - this is the full list of what to add and why.

### 4.1 Sitemap (highest value, one line)

VitePress generates `sitemap.xml` at build time when given a hostname:

```ts
export default defineConfig({
  // ...
  sitemap: {
    hostname: "https://aviasoletechnologies.github.io/shapecraft/",
  },
});
```

Output lands at `/shapecraft/sitemap.xml`. `lastUpdated: true` is already on, so entries
carry real `<lastmod>` dates from git rather than build timestamps.

### 4.2 Canonical URLs + Open Graph / Twitter cards

Without these, shared links render as bare URLs with no title, blurb, or image, and
near-duplicate pages compete with each other in search results. Add a `transformHead` hook -
it runs per page and has the resolved title/description already:

```ts
const SITE = "https://aviasoletechnologies.github.io/shapecraft/";
const OG_IMAGE = `${SITE}og-image.png`;

export default defineConfig({
  // ...
  transformHead({ pageData, title, description }) {
    const url =
      SITE + pageData.relativePath.replace(/index\.md$/, "").replace(/\.md$/, "");

    return [
      ["link", { rel: "canonical", href: url }],
      ["meta", { property: "og:type", content: "website" }],
      ["meta", { property: "og:url", content: url }],
      ["meta", { property: "og:title", content: title }],
      ["meta", { property: "og:description", content: description }],
      ["meta", { property: "og:image", content: OG_IMAGE }],
      ["meta", { name: "twitter:card", content: "summary_large_image" }],
      ["meta", { name: "twitter:title", content: title }],
      ["meta", { name: "twitter:description", content: description }],
      ["meta", { name: "twitter:image", content: OG_IMAGE }],
    ];
  },
});
```

The `relativePath` rewrite matches `cleanUrls: true`: `guide/backends.md` becomes
`.../guide/backends`, and `index.md` becomes the bare site root. If `cleanUrls` is ever
turned off, append `.html` here or the canonical tags will point at URLs that 404.

Add the static, page-independent tags to the existing `head` array:

```ts
["meta", { property: "og:site_name", content: "shapecraft" }],
["meta", { property: "og:locale", content: "en_US" }],
["meta", { name: "theme-color", content: "#0b0b0c" }],
```

### 4.3 The OG image needs creating

`og:image` above points at an asset that **does not exist yet**. Create it before enabling
those tags, or link previews will show a broken image - worse than no image.

- Size: **1200x630 px**, PNG or JPG, under ~1 MB.
- Location: `docs/public/og-image.png` (files in `public/` are copied to the site root, so it
  resolves at `/shapecraft/og-image.png`).
- Do **not** reuse `docs/public/logo-light.png` - the logos are 256x256 squares. A square
  image in a `summary_large_image` card gets center-cropped into a letterboxed mess. Either
  make a proper landscape card (logo + tagline on a solid background), or drop the
  `twitter:card` value to `summary` and accept a small square thumbnail.

### 4.4 robots.txt - read the caveat

Put this at `docs/public/robots.txt`:

```
User-agent: *
Allow: /

Sitemap: https://aviasoletechnologies.github.io/shapecraft/sitemap.xml
```

**Caveat that matters:** crawlers only read robots.txt from the **domain root**
(`aviasoletechnologies.github.io/robots.txt`). On a project Pages site this file publishes to
`/shapecraft/robots.txt`, where nothing will look for it. It is harmless to add, and becomes
correct the moment the site moves to a custom domain - but until then it does nothing.

So don't rely on it to announce the sitemap. Submit the sitemap URL directly in **Google
Search Console** instead (and Bing Webmaster Tools if you care about Bing).

### 4.5 Search Console verification

Easiest method that survives redeploys: drop the verification HTML file Google gives you into
`docs/public/`, and it publishes at the site root. The meta-tag method works too - add it to
the `head` array. Verify the `https://aviasoletechnologies.github.io/shapecraft/` prefix, not
the bare domain, since you don't control the org root.

### 4.6 Optional: structured data

A JSON-LD block helps search engines classify the project. Add via `head`:

```ts
[
  "script",
  { type: "application/ld+json" },
  JSON.stringify({
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "shapecraft",
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Node.js",
    description: "Structured output generation for LLMs in Node.js",
    url: "https://aviasoletechnologies.github.io/shapecraft/",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  }),
],
```

Low effort, modest payoff. Skip it if you're prioritizing.

### 4.7 What's already correct - leave alone

- **`cleanUrls: true`** - no `.html` suffixes, stable URLs.
- **`lastUpdated: true`** - real freshness dates in the sitemap and page footers.
- **`description`** - VitePress emits it as the meta description; per-page frontmatter
  `description:` overrides it where a page deserves its own.
- **Local search** (`search: { provider: "local" }`) - builds an offline index, no third-party
  script, nothing to configure for SEO.

## 5. Custom domain (when you want one)

1. Add `docs/public/CNAME` containing just the hostname (e.g. `shapecraft.dev`).
2. Change `base` to `"/"` in `config.ts`.
3. Strip the `/shapecraft/` prefix from every absolute path in `head` (favicons, apple-touch
   icon) and from `SITE`/`OG_IMAGE` above.
4. Point DNS at GitHub Pages, then enable **Enforce HTTPS** in Settings → Pages.
5. Re-verify in Search Console - a domain change is a new property, and the old
   `github.io` URLs should be treated as moved.

Steps 2 and 3 are easy to forget and produce a site that loads with no CSS.

## 6. Troubleshooting

| Symptom | Cause |
|---|---|
| Workflow green, site 404s | Pages source not set to **GitHub Actions** (step 1) |
| Site loads, no CSS/JS, console 404s | `base` doesn't match the served subpath |
| Images 404 but pages work | Absolute path in `head` missing the `/shapecraft/` prefix |
| Build fails on a link | A page was renamed/deleted with inbound links still pointing at it |
| Docs change merged, no deploy | Change didn't touch `docs/**` - use the manual trigger |
| Stale content after deploy | Pages CDN cache - hard-refresh before investigating |

## Optional hardening

`docs.yml` runs `npm install`. Since `docs/package-lock.json` is committed, `npm ci` would
give reproducible builds and fail loudly on a lockfile mismatch instead of silently resolving
new versions:

```yaml
- name: Install docs dependencies
  working-directory: docs
  run: npm ci
```

Not urgent - worth doing next time the workflow is touched.
