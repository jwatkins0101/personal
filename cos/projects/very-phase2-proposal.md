# VERY Health Phase 2: build-time prerendering (proposal)

_Task #203. Prepared 2026-10-01 for Brandon Johnson's request ("your proposed approach and a time estimate before you build"). Status: PROPOSED. Nothing is built into production. Jermaine sets the final hours._

Scope here is Brandon's Phase 2 (CLAUDE.md sections 2.1 to 2.4): real HTML per route, real 404s and 301s, structured data, and crawl files. Option chosen: **A, prerender at build time**.

---

## 1. Approach (one paragraph)

We keep the site exactly as it is today (React + Vite, edited in Lovable, built by GitHub Actions, served from S3 + CloudFront), and add one step to `npm run build`. After the normal build, a second "server" build renders every page of the site to finished HTML, and a short script writes one file per page (`dist/<route>/index.html`, 122 pages today, plus `dist/404.html`). Each file contains the page's real text, its own `<title>`, meta description, canonical, Open Graph/Twitter tags and JSON-LD. The page tags come from the per-page `SEOHead` component the site already has. When a person opens the page, the same JavaScript app loads and takes over, so visitors see no difference. A small CloudFront Function then serves `/eating-disorders/arfid` from `/eating-disorders/arfid/index.html`. It also returns 301s for legacy URLs, `www`, and trailing slashes, and unknown URLs get the branded 404 page with a real 404 status instead of a 200. This is the same pattern owlthat.com has run in production since 2026-09-17. There is no new vendor and no monthly cost.

## 2. What the spike proved (local only, branch `spike/prerender`, not pushed)

Worktree: `~/Code/wt/veryweb-prerender-spike`, commit `c0e273b` on local branch `spike/prerender` (no upstream).

| Question | Finding (evidence) |
|---|---|
| Does it render at all? | Yes. All 122 routes (115 sitemap URLs plus 7 noindex utility pages) and the 404 page rendered on the first try. There were **no** browser-only API crashes: every `window`/`document` use is inside effects or click handlers. |
| Real text in raw HTML? | Yes. Words visible in raw HTML: home 945, ARFID blog post 974, team page 412, a team bio 235, psychiatry 241. Today's live HTML is the 1.9 KB shell with zero body text (confirmed with curl). |
| Unique title/meta/canonical/og? | Yes, with one title, one description, one canonical and one og:title per page, because the prerender strips the generic tags from `index.html`. Example from the ARFID post: `<title>Understanding ARFID: Symptoms, Causes, and Evidence-Based Treatment</title>`, `<meta name="description" content="ARFID is more than picky eating. Learn the DSM-5 criteria…">`, `<link rel="canonical" href="https://very.health/understanding-arfid-what-it-is-symptoms-and-treatment">`, `og:type=article`, plus 3 JSON-LD blocks (MedicalWebPage, FAQPage, BreadcrumbList). |
| Head tags library | `react-helmet-async` v3.0.0 works server-side with `HelmetProvider context`. One catch: it writes `<title data-rh="true">`, which Brandon's `verify.sh` regex (`<title>[^<]*`) can't read. The spike writes a plain `<title>` instead, which is safe because the browser side sets `document.title`. |
| Data loading | No blocker. Blog posts (31), team members (38) and taxonomy are static TypeScript data in the bundle, with no API calls at render time. |
| Router | React Router v6 `BrowserRouter`. The spike moved the `<Routes>` table into `src/AppRoutes.tsx`, which the browser (`BrowserRouter`) and the prerender (`StaticRouter`) share. The `/:slug` blog catch-all works, and unknown slugs render the NotFound page. |
| Supabase client | No blocker. `src/integrations/supabase/client.ts` is dead code: nothing imports it and `@supabase/supabase-js` isn't installed (it's also the repo's only `tsc` error). It should be deleted. |
| Lovable tagger | No blocker. It only runs in `vite --mode development`. |
| Third-party widgets | The Valant links render unchanged in the static HTML (`valant.io/prospectivepatient/VeryHealthPC`, `valant.io/myio/VeryHealthPC/login`), and the spike diff doesn't touch them. The Typeform screener script, GA4 and Sentry load in the browser only, as before. |
| Browser takeover | In headless Chrome on 7 routes: status 200, 1 title, 1 canonical, 1 description, correct H1, no console errors. In-app navigation still works (home to team updates the title, still 1 canonical). With JavaScript off, ARFID shows its H1 "Avoidant Restrictive Food Intake Disorder (ARFID)". |
| CloudFront routing | A prototype viewer-request function (`infra/cloudfront/route-rewrite.js`) passed a local S3/CloudFront harness. `/x` returns 200 from `/x/index.html`. `/x/` returns 301 to `/x`. `/blog?x=1` returns 301 to `/support-hub/blog?x=1`. `www.` returns 301 to apex. `/nope/deeper` returns 404 with the branded page. `/sitemap.xml` and assets pass through. |
| Brandon's `verify.sh` (run locally against the spike) | **32 passed, 3 failed.** All 404/redirect/body-text/canonical/unique-title/JSON-LD checks pass. The 3 failures are expected and out of the spike's scope: the dead NEDA number and the "WAIS" label (Phase 1.2 copy, waiting on DECISIONS.md) and `/llms.txt` (milestone 4). Against production today: **5 passed, 30 failed**, and 3 of those passes are false (see problem 7). |
| Build time | +2.3 s. The full build went from about 6.9 s to 4.5 to 7 s wall clock. The prerender step itself takes about 190 ms for 122 pages. No new npm dependencies. |

### Problems the spike surfaced (all small, all in the plan)
1. **Two pages have no SEO tags at all:** `/for-referrers/why-very` and `/app` render an empty `<title>` and no canonical. `verify.sh` checks why-very's canonical, so it would fail. The spike adds `SEOHead` with **placeholder wording that needs Brandon's approval**. The prerender now fails the build if any page has no title.
2. **The share image is broken site-wide:** `og:image` points to `https://very.health/images/og-default.png`, which doesn't exist. Today it returns the HTML shell (200 text/html), so link previews show no image. We need a 1200x630 image.
3. **The 404 page's canonical is the requested URL.** It should have no canonical (it is already `noindex`).
4. **Duplicate pages:** `/patient-referral` = `/for-referrers` and `/care-options` = `/for-referrers/model-of-care` (same component, canonical points to the second). Both duplicates are in the sitemap, and `redirects.csv` sends `/refer` and `/care` to the non-canonical versions. Brandon needs to decide which way they go.
5. **Odd title on `/support-hub/financial-support`: "Planning App Header Treatment | VERY Health".** It looks like a Lovable artifact. We need wording.
6. **Routes moved out of `App.tsx`:** the sitemap generator parsed `App.tsx`. The spike points it at `AppRoutes.tsx`, and the sitemap check still passes (115 = 115). Lovable will now add routes in `AppRoutes.tsx`. A page added without `SEOHead` fails the build, on purpose.
7. **`verify.sh` itself:** it needs bash 4+ (`declare -A`). macOS's default `/bin/bash` 3.2 errors on it. Also, three checks pass falsely today. "NEDA removed" and "WAIS removed" pass because the SPA shell has no text to search, and "llms.txt served" passes on the HTML shell because `grep -qv "<html"` matches any line without `<html`.
8. **`www.very.health` serves a duplicate site with 200 today, and `dev.very.health` is indexable** (`Allow: /`, no `X-Robots-Tag`).
9. **Where the AWS config lives:** CloudFront for very.health is defined in CDK in the **app repo** (`veryhealth/very-path-forward`, `cdk/lib/stacks/marketing-site-stack.ts`, stacks `VeryHealth-{dev,prod}-MarketingSite`). It deploys through that repo's CDK workflow. Today it maps 403/404 to `/index.html` with a 200. The CloudFront change is a PR there, not in very-health-hub.

## 3. Milestones and steps

**M0. Decisions and inputs (Brandon), before build.** Approve option A. Send the Search Console "Not found (404)" and "Soft 404" export. Answer the decisions in section 9. Agree on a Lovable freeze window (one editor at a time).

**M1. Prerender pipeline in very-health-hub** (productionize the spike)
- `src/AppRoutes.tsx` (shared route table), `src/entry-server.tsx`, `scripts/prerender.mjs`. Change `npm run build` to `vite build && vite build --ssr … && node scripts/prerender.mjs`.
- Take the route list from the same code that generates the sitemap (one source of truth), not from parsing `sitemap.xml`.
- Build guards that fail CI: each page has exactly 1 non-empty title, description and canonical; titles are unique across indexable pages; no duplicate head tags; every sitemap URL produced a file.
- Fix the 2 pages with no SEO tags, the 404 canonical and the financial-support title (wording from Brandon). Delete the dead Supabase client.
- Vitest coverage for the route list and the guards. Update README/CLAUDE.md with the "add a page" rule for Lovable.

**M2. CloudFront: real 404s, 301s, one canonical host** (PR to `very-path-forward` CDK)
- CloudFront Function (viewer-request, JS 2.0): www → apex 301, legacy 301s generated from `redirects.csv` plus `src/lib/redirects.ts` plus the Search Console export, trailing-slash 301 to the no-slash form, and `/route` → `/route/index.html`.
- Error responses: 403/404 return `/404.html` with status **404** (instead of `/index.html` with 200).
- dev only: `X-Robots-Tag: noindex` response header so dev.very.health stays out of Google.
- Run `cdk diff` and review it. Roll out dev first, then prod, in the order in section 7.

**M3. Structured data (JSON-LD)**
- Sitewide `MedicalOrganization` (VERY Health PC, 1801 California St #2400, Denver CO 80202, 844-988-8379, `sameAs`, `medicalSpecialty: Psychiatric`), emitted once per page.
- 7 condition pages: `MedicalWebPage` + `MedicalCondition`, built from the existing approved page text.
- Blog posts already emit `MedicalWebPage`/`Article`. Add or confirm `reviewedBy`, `datePublished` and `dateModified`, and the visible "Medically reviewed by … on …" line.
- FAQ already has `FAQPage`. Team bios already have `Person`. Use `Physician` where it applies.
- Every template passes Google's Rich Results Test.

**M4. Crawl files and link previews**
- `sitemap.xml`: `<lastmod>` from `lastUpdated`, drop `changefreq`/`priority`, and remove canonicalized-away duplicates.
- `/llms.txt` generated from site data at build time (wording approved by Brandon).
- Default 1200x630 share image (`og:image`).

**M5. Verify and launch**
- Deploy to dev (push to main). Run `verify.sh` against dev, Rich Results Test, and og debuggers.
- Tag for prod. Run `verify.sh` against production. Search Console: resubmit the sitemap and run URL Inspection on the home page, a condition page and a blog post. Watch Pages/Coverage for 2 weeks.

## 4. What changes where

**Repo `veryhealth/very-health-hub`** (this site)
- New: `src/AppRoutes.tsx`, `src/entry-server.tsx`, `scripts/prerender.mjs`, `public/images/og-default.png`, generated `dist/llms.txt` and `dist/404.html`.
- Changed: `src/App.tsx` (renders `<AppRoutes/>`), `package.json` build script, `scripts/generate-sitemap.ts` (routes file, lastmod), `src/lib/seo.ts` and the pages missing SEO, `SEOHead`/layout (sitewide org schema), condition pages (schema), `NotFound.tsx`.
- Removed: `src/integrations/supabase/` (dead).
- Unchanged: Valant links, forms, GA4/Sentry, Lovable editing, `.github/workflows/deploy.yml` (it already runs `npm run build` and `aws s3 sync dist/`, so per-route files upload as-is).

**AWS, through repo `veryhealth/very-path-forward` (CDK `MarketingSiteStack`)**
- Add a CloudFront Function, associated viewer-request on the default behavior (dev distribution E2LTCTX2MEZH5U, prod EMCU7AR1Q66Q0).
- Change the error responses from 403/404 → `/index.html` 200 to 403/404 → `/404.html` 404.
- dev only: a response headers policy that adds `X-Robots-Tag: noindex`.
- No change to S3, OAC, certs, DNS, cache policy or price class.

## 5. Testing and verification plan (proving bots and previews see real HTML)

1. **Build gates (CI):** the prerender guards from M1, `npm run sitemap:check`, `npm test`, `npm run lint`.
2. **Local, before any deploy:** run `scripts/serve-like-cloudfront.mjs` (runs the real CloudFront Function source over `dist/`) and `bash verify.sh http://localhost:4791` with bash 4+. The spike's run was 32/35 passing.
3. **curl as a bot (dev, then prod):** for each key URL, `curl -s -A "Googlebot" URL | grep -c "<needle>"`, plus a check that `<title>` and `rel="canonical"` appear exactly once. Also `curl -sI` on `/this-should-404` (expect 404), `/blog` (expect 301 to `/support-hub/blog`), `/eating-disorders/arfid/` (expect 301 to the no-slash form) and `https://www.very.health/` (expect 301 to apex). Brandon's own acceptance: `curl -s https://very.health/eating-disorders/arfid | grep -c "Avoidant Restrictive"` ≥ 1.
4. **AI crawler view:** fetch with `GPTBot`, `PerplexityBot` and `ClaudeBot` user agents. They should get the same HTML (no cloaking), and `/llms.txt` should return `text/plain`.
5. **`verify.sh` against production:** all checks pass. This also requires Phase 1.2 (NEDA/WAIS copy) to ship first.
6. **Google:** run the Rich Results Test on home, a condition page, the FAQ, a blog post and a team bio (0 errors). In Search Console URL Inspection, Live test → View tested page → HTML/screenshot for home, `/eating-disorders/arfid` and one blog post (Brandon's definition of done). Then resubmit the sitemap.
7. **Link previews:** check home, a condition page and a blog post in the Facebook Sharing Debugger, the LinkedIn Post Inspector and opengraph.xyz. Each should show its own title, description and the share image.
8. **Human check:** click through the main nav, both Valant links, the consultation/referral forms and the self-screener on dev in a real browser. Console stays clean, GA4 page_view still fires (DebugView), and the forms still submit.

## 6. Risks and how each is handled

| Risk | Handling |
|---|---|
| **Wrong deploy order makes every page look like the home page to Google.** If prerendered files ship while CloudFront still rewrites misses to `/index.html`, crawlers get the home page's HTML and canonical on every URL. | Strict order (section 7): function first (harmless with today's build), then the prerendered build, then the 404 switch. Each step is verified with curl before the next. |
| A page renders differently server-side vs in the browser (dates, window size) | The browser app re-renders over the static HTML with `createRoot`, exactly as owlthat.com does, so mismatches can't break the page. Switching to `hydrateRoot` is a later optimization, not part of this work. |
| Lovable adds a page in the old place, or without SEO tags | Routes live in one file. The build fails loudly if a page has no title/canonical or isn't prerendered. Rules go in CLAUDE.md for Lovable. Lovable freeze while M1 merges. |
| A legitimate URL 404s after the switch (old links, campaign URLs) | Search Console 404 export plus `redirects.csv` before launch. Every sitemap URL is checked post-deploy. Watch Search Console Coverage and GA4 `page_not_found` events for 2 weeks and add 301s as found. |
| The CloudFront change ships with an app-repo release | It's a separate PR in `very-path-forward`, deployed on purpose. `cdk diff` is reviewed, and it goes to the dev stack first. Coordinate with whoever releases the app. |
| Clinical wording drift | No clinical copy is rewritten. JSON-LD and `llms.txt` reuse existing approved text, and any new wording (llms.txt, why-very/app/financial-support titles) goes to Brandon first. |
| Patient data | None involved: static pages only, forms and Valant untouched, no new analytics fields. |
| Build time / CI cost | +2 to 3 s, measured. |

## 7. Rollout order and rollback plan

**Rollout (dev fully, then prod):**
1. Deploy the CloudFront Function (rewrite, 301s, www, trailing slash). Keep today's 403/404 → `/index.html` fallback. With today's SPA build this changes nothing for real pages. Verify the 301s.
2. Deploy the prerendered build (push to main for dev, `v*` tag for prod). Verify that each sitemap URL returns its own title and canonical.
3. Switch the error responses to `/404.html` with 404. Run `verify.sh`.

**Rollback (each step undoes on its own):**
- Site code: re-tag the previous version (for example `v1.5.18`). The workflow re-syncs `dist/` with `--delete` and invalidates CloudFront in about 5 minutes. Per-route files disappear, and the old SPA shell serves everything again.
- CloudFront: revert the CDK PR (or, in an emergency, detach the function and restore the old error responses in the console, then reconcile CDK). Do the 404 switch last, because it's the change most likely to need reverting.
- No database, DNS or certificate changes, so nothing is one-way.

## 8. Out of scope

- Phase 1.2 copy changes (waiting on DECISIONS.md). They are required for `verify.sh` to fully pass but are not counted here.
- Phase 3 measurement (GA4 key events, Search Console ↔ GA4 link).
- Option B (Prerender.io) and option C (TanStack Start / Lovable hosting).
- New pages or content (state landing pages, outcomes methodology), and rewriting existing titles/descriptions beyond the 3 broken ones.
- Performance work (bundle splitting, image optimization), `hydrateRoot`.
- Rankings or traffic outcomes. We guarantee crawlable HTML, not positions.
- Any change to the Valant intake or portal, forms, or the app platform.

## 9. Decisions needed from Brandon

1. Approve option A (build-time prerender, no new vendor or monthly cost).
2. The Search Console "Not found (404)" and "Soft 404" export.
3. One URL form: no trailing slash (matches today's canonicals). Also `www.very.health` → `very.health` 301.
4. Duplicate pages: should `/patient-referral` → `/for-referrers` and `/care-options` → `/for-referrers/model-of-care` become 301s, or stay as duplicates with canonicals? And should `redirects.csv`'s `/refer` and `/care` point at the canonical URLs?
5. Wording: titles/descriptions for `/for-referrers/why-very`, `/app` and `/support-hub/financial-support`; the `llms.txt` text; and the `MedicalOrganization` facts (address, phone, `sameAs` social URLs).
6. A 1200x630 share image (or approval for us to make one from the brand assets).
7. A Lovable freeze window during the build.
8. OK to fix `verify.sh`'s bash-version and empty-response issues (small).

## 10. Time estimate (PROPOSED, Jermaine to confirm)

Grounded in the spike: the pipeline already renders all 122 routes, the routing function passes `verify.sh` locally, and no browser-API or data-loading rework is needed. The ranges cover production hardening, the AWS rollout through a second repo, content wiring and verification.

| Milestone | Hours (proposed range) |
|---|---|
| M1. Prerender pipeline (productionize spike, guards, tests, fix 2 untagged pages + 404 canonical, docs) | 4–7 |
| M2. CloudFront Function + 404/redirect config in CDK, Search Console redirect list, dev then prod rollout | 5–9 |
| M3. Structured data (sitewide org, 7 condition pages, blog/team/FAQ checks, Rich Results validation) | 4–6 |
| M4. Sitemap lastmod, llms.txt, share image wiring | 2–4 |
| M5. Verification and launch (dev + prod verify.sh, URL Inspection, og debuggers, 2-week check-in) | 3–5 |
| Coordination: decisions, review rounds, Lovable sync conflicts | 2–3 |
| **Total** | **20–34 hours** |

Calendar: about 1 to 2 weeks, mostly gated by Brandon's decisions (section 9) and the Search Console export, which fits his 1 to 2 week Phase 2 target.
