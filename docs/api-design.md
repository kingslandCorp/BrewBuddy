# Brew Buddies — API Design Document

## 1. Competitive teardown: coffee-roulette.com

What they do well: dead-simple onboarding, availability/leave blocking per person, a "never repeat a match" promise, and a usage-based price (99¢ AUD per person per match) that scales naturally with company size.

Where the gaps are — and where your revenue sits:

| Gap in the incumbent | Why it matters | Revenue angle for your API |
|---|---|---|
| **No calendar automation.** Matched people just get an email with a name and email address and have to arrange their own time. | This is the single biggest point of friction in the whole product — half of matches probably never actually happen because nobody follows up. | Auto-generated `.ics` invites are your headline paid feature. You're not competing on matching — you're competing on *matches that actually turn into meetings*. |
| **B2B-gated only.** "Anyone with authority to run a networking program" has to set the org up; individuals can't just start a group. | Locks out the entire friend-group / alumni / community / coworking-space market. | Your `friend_group` org type opens a self-serve B2C or prosumer tier that doesn't exist in this category today — and each new friend group is a viral acquisition loop. |
| **No bulk import mentioned.** Admin appears to add employee emails manually/one list at a time, no document parsing. | Doesn't scale past a few dozen people without real tedium. | Word/Excel bulk import is a natural, well-justified paywall — "add 5 people free, or upload your whole team." |
| **Pairs only, with a bolt-on rule for odd numbers.** | Not a deliberate feature — just a leftover-handling hack. | Deliberate 2/3/4 "table size" logic, especially for large orgs, is a genuine differentiator you can market ("Quad Tables reduce the number of coordination slots your team needs"). |
| **Pure usage-based billing, no cap.** | Great for the vendor, but unpredictable costs make finance teams nervous — a common complaint pattern with metered SaaS. | Offer a **hybrid**: flat monthly fee with an included match allowance + metered overage. Predictable *and* scales — beats both flat-seat SaaS and pure metering. |
| **No video-call automation** ("try Skype"). | Manual coordination for remote/hybrid teams. | Auto-embedded Zoom/Meet/Teams links in the `.ics` = Pro-tier upsell. |
| **No analytics.** | HR/People teams have zero visibility into whether the program is working. | Engagement dashboards (participation rate, cross-team connection graph, no-show rate) are classic enterprise upsell — the kind of feature that turns a $99/mo account into a $999/mo account. |

---

## 2. Product concept

Two entry points into the same core engine:

- **`company`** — an admin (HR, internal comms, social club) sets up the org and invites employees. Mirrors the incumbent's model but removes its worst friction.
- **`friend_group`** — anyone can spin up a group directly, no "authority" required. This is the market the incumbent doesn't serve at all.

Both org types share the same matching engine, `.ics` generation, and tiering — the only difference is who can create the org and the default participant cap.

---

## 3. Tiering & monetization

| | **Free** | **Freemium (Plus)** | **Pro** |
|---|---|---|---|
| Add participants | One at a time, manual form | Bulk upload (.xlsx / .docx / .csv) | Bulk upload + SCIM/HRIS sync |
| Participant cap | 12 | 250 | Unlimited |
| Group sizing | Pairs only (3 if odd remainder) | Auto 2/3/4 based on group size | Auto + admin override per round |
| Match notification | Email with partner's name/email (self-schedule, like the incumbent) | **Auto `.ics` calendar invite**, time set by admin, 30 min default (configurable) | `.ics` + auto video-conference link (Zoom/Meet/Teams) |
| Repeat-avoidance | Current round only | Multi-round cooldown memory | Configurable cooldown, "never repeat" mode |
| Scheduling | Manual trigger only | Recurring rounds (weekly/fortnightly/monthly) | Recurring + blackout calendars (holidays, exam periods, etc.) |
| Reporting | — | Basic: matches made, invites sent | Full dashboard: participation rate, org-wide connection graph, no-show tracking, exportable reports |
| Integrations | — | — | Slack/Teams bot, webhooks, API access |
| Price | $0 | **$0 base** + $0.50/match (or flat $19/mo up to 50 matches) | Seat-based + usage, custom |

The Freemium switch is exactly where the user's own spec draws the line — bulk import and `.ics` invites are gated together, which makes sense: the moment someone is willing to upload a spreadsheet, they've signaled they're running this seriously enough to pay for automation.

---

## 4. Data model

```
Organization
  id, name, type[company|friend_group], plan_tier[free|freemium|pro]
  timezone, match_frequency[weekly|fortnightly|monthly|manual]
  meeting_duration_minutes (default 30), meeting_time (admin-set)
  repeat_cooldown_rounds, created_by, created_at

Participant
  id, organization_id, name, email
  status[invited|active|paused|removed]
  availability_days[], blocked_dates[]
  added_via[manual|bulk_import], joined_at

ImportJob                      # Freemium+
  id, organization_id, file_url, file_type[xlsx|docx|csv]
  status[processing|completed|failed]
  rows_parsed, rows_imported, errors[]

Round
  id, organization_id, scheduled_date
  status[pending|matched|completed|cancelled]
  participant_count_snapshot, group_size_used

Group
  id, round_id, organization_id
  participant_ids[], group_size_reason[standard|odd_remainder|large_group_pod]
  meeting_time, duration_minutes, video_link (Pro)
  ics_generated (bool), ics_url
  status[scheduled|completed|no_show|cancelled]

Webhook
  id, organization_id, url, events[]
```

---

## 5. Matching & grouping algorithm

**Group size** scales *up* with participant count — bigger orgs get bigger tables rather than more parallel pairs, which keeps the number of concurrent meeting slots manageable:

```
function determineGroupSize(participantCount, orgOverride):
    if orgOverride is set: return orgOverride
    if participantCount <= 11: return 2
    if participantCount <= 39: return 3
    return 4
```

**Remainder handling** — never leave a group of 1; fold leftovers into existing groups rather than creating an undersized group:

```
function buildGroups(participants, targetSize, matchHistory):
    pool = weightedShuffle(participants, penalize=matchHistory, cooldown=org.repeat_cooldown_rounds)
    groups = chunk(pool, targetSize)
    if size(last(groups)) == 1:
        mergeInto(groups[-2], groups[-1])   # e.g. a lone leftover joins the prior group as +1
    return groups
```

`weightedShuffle` is where the "never repeat a match" promise lives — track a per-organization pairwise match history and heavily downweight (or hard-exclude, in "never repeat" mode) combinations that have occurred within `repeat_cooldown_rounds`.

---

## 6. API reference

Base URL: `https://api.coffeeroulette.app/v1`
Auth: `Authorization: Bearer <api_key>` (one key per organization, or OAuth for multi-org admin accounts)

### Organizations

```http
POST /organizations
{
  "name": "Acme Corp",
  "type": "company",
  "timezone": "Europe/London",
  "meeting_duration_minutes": 30,
  "meeting_time": "10:00",
  "match_frequency": "fortnightly"
}

201 Created
{
  "id": "org_8f3c1a",
  "plan_tier": "free",
  "created_at": "2026-08-13T09:00:00Z",
  ...
}
```

### Participants — Free tier (manual, one at a time)

```http
POST /organizations/{org_id}/participants
{ "name": "Priya Shah", "email": "priya@acme.com" }

201 Created
{ "id": "p_1029", "status": "active", "added_via": "manual" }
```

### Bulk import — Freemium+ (Word/Excel roster)

```http
POST /organizations/{org_id}/participants/import
Content-Type: multipart/form-data
file: roster.xlsx

202 Accepted
{ "import_job_id": "imp_552a", "status": "processing" }
```

```http
GET /organizations/{org_id}/imports/imp_552a

200 OK
{
  "status": "completed",
  "rows_parsed": 84,
  "rows_imported": 81,
  "errors": [{ "row": 12, "reason": "missing email" }]
}
```

### Rounds (trigger matching)

```http
POST /organizations/{org_id}/rounds
{ "scheduled_date": "2026-08-20" }

201 Created
{
  "id": "round_9931",
  "status": "matched",
  "participant_count": 47,
  "group_size_used": 3,
  "groups": ["grp_101", "grp_102", "grp_103", "..."]
}
```

### Groups & invites

```http
GET /groups/grp_101

200 OK
{
  "id": "grp_101",
  "participants": [{ "name": "Priya Shah" }, { "name": "Tom Lee" }],
  "meeting_time": "2026-08-20T10:00:00+01:00",
  "duration_minutes": 30,
  "ics_generated": false
}
```

```http
POST /groups/grp_101/invite        # Freemium+ only — generates and emails the .ics

200 OK
{
  "sent_to": ["priya@acme.com", "tom@acme.com"],
  "ics_url": "https://cdn.coffeeroulette.app/ics/grp_101.ics"
}
```

`.ics` payload generated per group:

```
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//CoffeeRoulette//EN
BEGIN:VEVENT
UID:grp_101@coffeeroulette.app
DTSTAMP:20260813T090000Z
DTSTART:20260820T090000Z
DTEND:20260820T093000Z
SUMMARY:Coffee Roulette — Meet your match!
DESCRIPTION:You've been matched with Priya Shah and Tom Lee. Grab a coffee.
ATTENDEE;CN=Priya Shah:mailto:priya@acme.com
ATTENDEE;CN=Tom Lee:mailto:tom@acme.com
ORGANIZER;CN=Acme Corp Coffee Roulette:mailto:noreply@coffeeroulette.app
STATUS:CONFIRMED
END:VEVENT
END:VCALENDAR
```

### Webhooks

```http
POST /organizations/{org_id}/webhooks
{ "url": "https://acme.com/hooks/coffee", "events": ["round.matched", "invite.sent", "group.no_show"] }
```

Events fire for: `round.matched`, `group.created`, `invite.sent`, `import.completed`, `participant.joined`.

---

## 7. Build order

1. **MVP (Free tier):** organizations, manual participant add, pair-based matching, email notification — get the core loop working, matches the incumbent's baseline.
2. **Freemium unlock (the actual revenue trigger):** bulk import parser (xlsx/docx), 2/3/4 group-size logic, `.ics` generation + email delivery, recurring rounds.
3. **Pro layer:** video-link auto-generation, Slack/Teams bot, analytics dashboard, webhooks/API access, HRIS sync.
4. **New-market wedge:** `friend_group` self-serve signup with no admin gate — this is the growth lever the incumbent structurally can't copy without cannibalizing its B2B sales motion.
