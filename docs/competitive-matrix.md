# Brew Buddies — Competitive Matrix

## Products reviewed

| Product | Platform / gate | Audience | Source |
|---|---|---|---|
| **Coffee Roulette** (coffee-roulette.com) | Standalone web, admin-invited | Company only | coffee-roulette.com |
| **Donut** | Slack app | Company (Slack workspace required) | Slack Marketplace, various reviews |
| **RandomCoffee** | Slack / Teams app | Company | buddieshr.com comparison |
| **Alfy / Coffee & Donut Chat** (BuddiesHR) | Slack app | Company | Slack Marketplace |
| **"Coffee & Chat" (Donut & Chats)** | Slack app | Company | Slack Marketplace |
| **CoffeePals** | Microsoft Teams app | Company | coffeepals.com, G2, Capterra |
| **Lead** | Microsoft Teams app | Company | CoffeePals vs Lead comparison |
| **Lunchclub** | Standalone web/mobile, AI-matched | Cross-company strangers (professional networking) | apps.apple.com, G2, press coverage |

## The matrix

| Product | Works without Slack/Teams? | Self-serve for a friend group (no "admin authority" needed)? | Bulk roster import (doc/spreadsheet) | Calendar automation (.ics or native) | Video link auto-generated | Group size flexibility | Pricing floor |
|---|---|---|---|---|---|---|---|
| Coffee Roulette | Yes | No — admin must set up company | Not specified/manual | **No** — email only, self-schedule | No | Pairs, 3 if odd remainder | Free 4wk trial, then $0.99 AUD/person/match |
| Donut | No — Slack only | No | N/A (pulls Slack member list) | Native to Slack scheduling | Varies by plan | Standard | Free (limited) up to ~$400/mo, per-seat/tiered by headcount |
| RandomCoffee | No — Slack/Teams only | No | N/A (workspace member list) | Native | Varies | Standard | ~$1.50/user/month |
| Alfy (BuddiesHR) | No — Slack only | No | N/A (workspace member list) | Native | Not emphasized | Standard | Positioned as cheapest in category (~75% below rivals) |
| "Coffee & Chat" | No — Slack only | No | N/A (workspace member list) | **Yes** — Google Calendar & Outlook integration | **Yes** — Zoom/Meet/Teams links | **Yes** — customizable | Free to 30 users, then $19–$249+/mo tiered by headcount |
| CoffeePals | No — Teams only | No | N/A (workspace member list) | Not clearly native | Video chat built in | Standard | Free under 25 users, Pro from ~$49/mo scaling with active users |
| Lead | No — Teams only | No | N/A (workspace member list) | Not clearly native | Not emphasized | Standard | ~$39/mo |
| Lunchclub | Yes — standalone app | Sort of — but matches you with **strangers**, not your own group | N/A (public cross-company pool) | Books the meeting for you automatically | **Yes** — in-app video | N/A (1:1 only) | Free |

## The actual whitespace

Two patterns hold across every single product on this list, without exception:

**1. Every workplace tool is gated behind a chat platform you already have to be paying for.** Donut, RandomCoffee, Alfy, "Coffee & Chat," CoffeePals, and Lead all pull their member list *from* Slack or Teams — which is exactly why none of them need bulk import via Word/Excel. That feature isn't optional for you; it's the thing that lets you serve everyone who **doesn't** have a company Slack/Teams instance: small businesses, school alumni networks, coworking spaces, conference organizers, running clubs, book clubs. Nobody in this list touches that segment.

**2. Every product assumes a corporate admin with budget authority — or throws you into a pool of strangers.** Coffee Roulette explicitly requires someone "with authority to run a networking/engagement program." The Slack/Teams tools require someone with admin rights on a paid workspace. Lunchclub goes the opposite direction — no admin needed, but you're matched with strangers across companies, not your own chosen circle. There is no product here that lets *any individual* start a private coffee roulette for a group of their own choosing — friends, a running club, a cohort of an online course — without either corporate sign-off or being thrown to the wolves of a stranger network.

**3. Pricing has a hard floor around $19–$49/month minimum the moment you're past a trivial headcount**, even at the "cheapest in category" end (Alfy, RandomCoffee). That's a non-starter for five friends who want to do this for fun. Nobody prices for that use case because nobody is targeting it.

## What this means for your tiering

Your `friend_group` org type combined with a genuinely-free (not trial) Free tier isn't just a nice-to-have — it's the one segment of this entire market with zero direct competition. The design from the previous doc already points the right direction; two adjustments worth making given this matrix:

- **Keep Free permanently free**, not a 4-week trial like Coffee Roulette — the incumbents' trial-then-pay model is precisely what keeps this space closed off to casual/friend use. Permanence is your wedge, not a feature.
- **Price Freemium under the $19/mo floor everyone else enforces** — even $3–5/month for a friend group's `.ics` automation undercuts the entire competitive set, because none of them can go that low without cannibalizing their per-seat corporate pricing.
- **Bulk import via Word/Excel remains your differentiator specifically for the non-Slack/Teams company segment** (small businesses, schools, event organizers) — nobody else needs to build this because nobody else needs to work outside a chat platform's member list.
