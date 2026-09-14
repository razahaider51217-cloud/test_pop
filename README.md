# Sarab — Fast Food & Restaurant Website

Production static site for **Sarab Fast Food & Restaurant** (New York flagship + 7 more US
branches), built for Google Ads traffic and local SEO.

## What's in here

| Path | What it is |
| --- | --- |
| `index.html` | One-page home: hero, menu, specials, gallery, history, hours, branches, reservation, reviews, blog, cheap recipes, FAQ, newsletter, contact + map |
| `recipes.html` + `recipes/*.html` | 6 costed cheap recipes (Recipe + Breadcrumb JSON-LD) |
| `locations.html` | 8 US branches with addresses, phones, hours and table booking |
| `checkout.html` | Cart checkout: order type, branch, customer details, payment method, order reference |
| `privacy-policy.html`, `terms.html`, `404.html` | Legal pages + custom 404 |
| `js/cart.js` | Working cart (localStorage), drawer, promo codes, checkout flow, GA4/Ads events |
| `js/booking.js` | Branch-aware table booking with confirmation + email/phone handoff |
| `js/branches.js` | Generated branch data used by the booking form and checkout |
| `js/*.js`, `css/*`, `img/*`, `webfonts/*` | Template assets (Bootstrap 5, Swiper, AOS, Font Awesome) |
| `server.js` | Dependency-free static file server (correct MIME types, gzip, caching, 404 page) |
| `Procfile` | `web: node server.js` — tells Heroku how to start the site |
| `robots.txt`, `sitemap.xml`, `.nojekyll` | SEO + GitHub Pages support |

## Running locally

```bash
npm start            # http://localhost:3000
# or
node server.js
```

No `npm install` needed — the site has **zero runtime dependencies**.

## Deploying

### Heroku

The app is already wired for the Node buildpack:

1. Push this branch (see below) — Heroku's Node buildpack detects `package.json`,
   reads `Procfile` and runs `node server.js`, which listens on `$PORT`.
2. If the app was created with a GitHub connection it redeploys automatically on push.
   Otherwise deploy straight from your machine:

   ```bash
   heroku git:remote -a <your-app-name>
   git push heroku site:main      # or: git subtree split / use the branch Heroku tracks
   heroku logs --tail
   ```

Prefer Heroku to serve the files without Node? Install the static buildpack instead and
delete `server.js` + `Procfile`, keeping `static.json`:

```bash
heroku buildpacks:set heroku/heroku-buildpack-static -a <your-app-name>
```

### GitHub Pages

Enable Pages for the `site` branch (root). `.nojekyll` is already committed so `_`-prefixed
paths keep working.

## Before spending on Google Ads

1. Replace the placeholder analytics IDs — `G-XXXXXXXXXX` (GA4) and `AW-XXXXXXXXXX`
   (Google Ads), plus the `*-LABEL` conversion labels — in `index.html`, `locations.html`,
   `checkout.html`, `privacy-policy.html`, `terms.html` and the footer script of
   `index.html`.
2. Update the canonical/OG URLs, `robots.txt` and `sitemap.xml` with the real domain
   (currently `https://sarabfood.com`).
3. Swap the placeholder branch addresses/phones for the real ones.
4. Connect a form/order backend (e.g. Stripe + an order API) if you want fully automated
   payments — today orders and bookings are handed to the restaurant by email or phone,
   and the confirmation screens say so.

## Notes

`package.json`, `Procfile` and `server.js` exist purely so a Node host (Heroku) can serve
the static files. Removing them makes the repo a pure static site again.
