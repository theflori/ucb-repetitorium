# UCB Admin — Clean Rebuild

## Architecture

```
admin/                              ← Cloudflare Pages Build Output Directory
├── index.html                      ← LOGIN PAGE (root URL)
├── dashboard.html                  ← Protected dashboard (after login)
├── assets/                         
│   ├── fonts/Pilat_Wide_Bold.otf
│   └── logos/logo-gold.png + others
├── emails/                         ← Branded email templates
└── functions/                      ← Cloudflare Pages Functions
    ├── _middleware.js              ← Auth guard (whitelist-protected paths only)
    └── api/
        ├── auth.js                 ← POST = login, DELETE = logout
        ├── bookings.js             ← GET (protected)
        ├── leads.js                ← GET (protected)
        ├── leads/[id].js           ← PATCH (protected)
        ├── create-checkout.js      ← POST (public, called by site)
        ├── stripe-webhook.js       ← POST (public, called by Stripe)
        ├── submit-lead.js          ← POST (public, called by site)
        └── debug.js                ← GET (public, for troubleshooting)
```

## Key Design Decisions (fixes previous bugs)

1. **Login is `/` (index.html)** — no redirect on page load means no redirect loop possible
2. **Middleware uses WHITELIST** of protected paths instead of blacklist of public paths
3. **Cookie name `ucb_auth`** (was `ucb_admin`, conflict-free naming)
4. **No client-side JS redirects in index.html** — only the form submit redirects to dashboard

## Auth Flow

1. User visits `/` → sees login page
2. Submits password → POST `/api/auth` with body `{password: "..."}`
3. Server compares with `ADMIN_PASSWORD` env var
4. If match → returns cookie `ucb_auth=<signed_token>`, JS redirects to `/dashboard.html`
5. Middleware sees protected path `/dashboard.html`, verifies cookie signature with `AUTH_SECRET`
6. If valid → serves dashboard
7. Dashboard loads `/api/bookings` and `/api/leads` (also protected — same cookie used)

## Required Environment Variables

Set in Cloudflare Pages → Settings → Environment variables → Production:

| Variable | Value |
|---|---|
| `ADMIN_PASSWORD` | Strong password for admin login |
| `AUTH_SECRET` | 64-char random hex (generate with `openssl rand -hex 32`) |
| `AIRTABLE_API_KEY` | Personal access token (pat...) |
| `AIRTABLE_BASE_ID` | appyiQXOvbJNTwPp1 |
| `AIRTABLE_BOOKINGS_TABLE` | Bookings |
| `AIRTABLE_LEADS_TABLE` | Leads |
| `STRIPE_SECRET_KEY` | sk_test_... or sk_live_... |
| `STRIPE_PRICE_KLAUSUREN_AUG26` | price_1TYopEBSTPqP5CHlQWzIaykq |
| `STRIPE_WEBHOOK_SECRET` | whsec_... (or placeholder for now) |
| `RESEND_API_KEY` | re_... |
| `ADMIN_EMAIL` | info@ucb-muc.de |
| `PUBLIC_SITE_URL` | https://ucb-site.pages.dev |

**Important:** After setting/changing env vars, **trigger a new deployment** in Cloudflare Pages — env vars only load on deploy.

## Build Settings (Cloudflare Pages)

| Setting | Value |
|---|---|
| Build command | (empty) |
| Build output directory | `admin` |
| Root directory | (empty) |
| Framework preset | None |

## Testing

After deploy:

1. `https://ucb-admin.pages.dev/` → see login page (NOT a redirect loop!)
2. Enter password → redirected to `/dashboard.html`
3. Dashboard loads → bookings + leads visible from Airtable
4. Click any row → detail modal with all fields
5. Logout button → returns to login

If something doesn't work, visit `/api/debug` (public) to see env var status and raw Airtable response.
