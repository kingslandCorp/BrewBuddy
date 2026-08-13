-- Brew Buddies — D1 schema
-- Run with: wrangler d1 execute brewbuddy-db --file=./schema.sql

CREATE TABLE IF NOT EXISTS organizations (
  id                        TEXT PRIMARY KEY,
  name                      TEXT NOT NULL,
  type                      TEXT NOT NULL CHECK (type IN ('company','friend_group')),
  plan_tier                 TEXT NOT NULL DEFAULT 'free' CHECK (plan_tier IN ('free','plus','community','corporate')),
  timezone                  TEXT NOT NULL DEFAULT 'UTC',
  meeting_duration_minutes  INTEGER NOT NULL DEFAULT 30,
  meeting_time              TEXT NOT NULL DEFAULT '10:00',
  match_frequency           TEXT NOT NULL DEFAULT 'manual' CHECK (match_frequency IN ('weekly','fortnightly','monthly','manual')),
  repeat_cooldown_rounds    INTEGER NOT NULL DEFAULT 3,
  api_key                   TEXT NOT NULL UNIQUE,
  owner_name                TEXT,
  owner_email               TEXT,
  stripe_customer_id        TEXT,
  stripe_subscription_id    TEXT,
  created_at                TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS participants (
  id               TEXT PRIMARY KEY,
  organization_id  TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  email            TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('invited','active','paused','removed')),
  added_via        TEXT NOT NULL DEFAULT 'manual' CHECK (added_via IN ('manual','bulk_import')),
  joined_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS import_jobs (
  id               TEXT PRIMARY KEY,
  organization_id  TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  file_name        TEXT,
  status           TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing','completed','failed')),
  rows_parsed      INTEGER NOT NULL DEFAULT 0,
  rows_imported    INTEGER NOT NULL DEFAULT 0,
  errors_json      TEXT NOT NULL DEFAULT '[]',
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS rounds (
  id                          TEXT PRIMARY KEY,
  organization_id             TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  scheduled_date              TEXT NOT NULL,
  status                      TEXT NOT NULL DEFAULT 'matched' CHECK (status IN ('pending','matched','completed','cancelled')),
  participant_count_snapshot  INTEGER NOT NULL,
  group_size_used             INTEGER NOT NULL,
  created_at                  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS groups (
  id                TEXT PRIMARY KEY,
  round_id          TEXT NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  organization_id   TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  group_size_reason TEXT NOT NULL DEFAULT 'standard',
  meeting_time      TEXT NOT NULL,
  duration_minutes  INTEGER NOT NULL,
  ics_generated     INTEGER NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','completed','no_show','cancelled')),
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS group_participants (
  group_id        TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  participant_id  TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, participant_id)
);

-- Every pair of participants who have ever shared a table, used to keep
-- rounds from re-matching the same two people within repeat_cooldown_rounds.
CREATE TABLE IF NOT EXISTS match_history (
  organization_id  TEXT NOT NULL,
  participant_a_id TEXT NOT NULL,
  participant_b_id TEXT NOT NULL,
  round_id         TEXT NOT NULL,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (participant_a_id, participant_b_id, round_id)
);

CREATE INDEX IF NOT EXISTS idx_participants_org ON participants(organization_id);
CREATE INDEX IF NOT EXISTS idx_groups_round ON groups(round_id);
CREATE INDEX IF NOT EXISTS idx_match_history_org ON match_history(organization_id);
