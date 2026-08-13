# Brew Buddies

Coffee roulette for people who don't have a Slack workspace. Add your friends,
your team, or your whole company — Brew Buddies shuffles everyone into tables
of 2, 3, or 4 and sends a real calendar invite.

This repo has two parts and the design work behind them:

```
BrewBuddy/
├── website/            static marketing site (index.html — no build step)
├── api/                Cloudflare Worker + D1 API
│   ├── schema.sql       database schema
│   ├── wrangler.toml    Worker + D1 binding config
│   └── src/
│       ├── index.ts     router
│       ├── routes/      organizations, participants, rounds, groups
│       └── lib/         matching engine, .ics generator, db helpers
└── docs/
    ├── api-design.md            full API design + tiering rationale
    └── competitive-matrix.md    competitor teardown that shaped this design
```

## Quick start

### 1. Website
`website/index.html` is fully self-contained (fonts load from Google Fonts,
everything else is inline). Open it directly in a browser, or serve the
folder with anything static (Cloudflare Pages, Netlify, GitHub Pages, `python
-m http.server`).

### 2. API
```bash
cd api
npm install
npx wrangler login
npx wrangler d1 create brewbuddy-db        # copy the returned database_id into wrangler.toml
npm run db:migrate                          # applies schema.sql locally
npm run dev                                 # local dev server
```

To ship it for real:
```bash
npm run db:migrate:remote                   # applies schema.sql to the live D1 database
npm run deploy                              # publishes the Worker
```

Once deployed, update `API_BASE` near the bottom of `website/index.html` to
your Worker's URL (e.g. `https://brew-buddies-api.<your-subdomain>.workers.dev/v1`).

## API at a glance

| Endpoint | Auth | Tier | Does |
|---|---|---|---|
| `POST /v1/organizations` | none | — | Create a company or friend group, get back an API key |
| `GET/PATCH /v1/organizations/:id` | — / key | — | Read or update org settings |
| `POST /v1/organizations/:id/participants` | key | Free+ | Add one person by hand (capped at 12 on Free) |
| `POST /v1/organizations/:id/participants/import` | key | Plus+ | Bulk import a roster — CSV, JSON, `.xlsx`, or `.docx` |
| `POST /v1/organizations/:id/rounds` | key | Free+ | Run the matching engine, create this round's tables |
| `GET /v1/groups/:id` | — | — | See who's at a table and when |
| `POST /v1/groups/:id/invite` | — | Plus+ | Generate the `.ics` invite for a table |

Full reasoning for the tiering, the group-size algorithm, and every request/
response shape lives in `docs/api-design.md`.

## What's stubbed vs. real

- **Matching, group sizing, repeat-avoidance, .ics generation** — fully
  implemented and tested logic in `api/src/lib/`.
- **Bulk import** — CSV, JSON, `.xlsx` (via SheetJS) and `.docx` (via
  mammoth, one "Name, email" per line/table row) all work end-to-end,
  parsed in `lib/fileImport.ts` and wired into `importParticipants`.
- **Recurring rounds** (weekly/fortnightly/monthly auto-trigger) — a daily
  Cloudflare Cron Trigger (`[triggers]` in `wrangler.toml`, handler in
  `lib/scheduler.ts`) checks every org on an automatic cadence and runs a
  new round for whichever ones are due.
- **Sending the invite email** — `POST /v1/groups/:id/invite` generates the
  `.ics`, emails it to every participant via Resend (`lib/email.ts`), and
  returns the `.ics` regardless of delivery outcome. Requires a
  `RESEND_API_KEY` secret (`wrangler secret put RESEND_API_KEY`) and a
  verified sending domain in Resend; the response's `X-Email-Status` header
  reports per-participant send results.

## Pushing this to GitHub

These files were built outside of git. To get them into
`kingslandCorp/BrewBuddy`:

```bash
git clone https://github.com/kingslandCorp/BrewBuddy.git
# copy the contents of this folder into that clone, then:
cd BrewBuddy
git add .
git commit -m "Add Brew Buddies website and API"
git push
```
