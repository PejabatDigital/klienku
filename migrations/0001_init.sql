-- KlienKu schema v1. Every app row belongs to one user ("user".id); the API only ever
-- reads or writes the signed-in user's rows.

-- ── Sign-in (Better Auth 1.7, email and password; column names match its SQLite schema) ──

CREATE TABLE "user" (
  "id"            text    NOT NULL PRIMARY KEY,
  "name"          text    NOT NULL,
  "email"         text    NOT NULL UNIQUE,
  "emailVerified" integer NOT NULL,
  "image"         text,
  "createdAt"     date    NOT NULL,
  "updatedAt"     date    NOT NULL
);

CREATE TABLE "session" (
  "id"        text NOT NULL PRIMARY KEY,
  "expiresAt" date NOT NULL,
  "token"     text NOT NULL UNIQUE,
  "createdAt" date NOT NULL,
  "updatedAt" date NOT NULL,
  "ipAddress" text,
  "userAgent" text,
  "userId"    text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE
);
CREATE INDEX "session_userId_idx" ON "session" ("userId");

-- One row per login method linked to a user; "password" holds the scrambled password.
CREATE TABLE "account" (
  "id"                    text NOT NULL PRIMARY KEY,
  "accountId"             text NOT NULL,
  "providerId"            text NOT NULL,
  "userId"                text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  "accessToken"           text,
  "refreshToken"          text,
  "idToken"               text,
  "accessTokenExpiresAt"  date,
  "refreshTokenExpiresAt" date,
  "scope"                 text,
  "password"              text,
  "createdAt"             date NOT NULL,
  "updatedAt"             date NOT NULL
);
CREATE INDEX "account_userId_idx" ON "account" ("userId");

-- Short-lived values: email confirmation and password reset links.
CREATE TABLE "verification" (
  "id"         text NOT NULL PRIMARY KEY,
  "identifier" text NOT NULL,
  "value"      text NOT NULL,
  "expiresAt"  date NOT NULL,
  "createdAt"  date NOT NULL,
  "updatedAt"  date NOT NULL
);
CREATE INDEX "verification_identifier_idx" ON "verification" ("identifier");

-- ── KlienKu ──

-- A client (lead). Open clients always have a next step and a due date.
CREATE TABLE clients (
  id           TEXT    NOT NULL PRIMARY KEY,
  user_id      TEXT    NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  name         TEXT    NOT NULL,
  phone        TEXT    NOT NULL DEFAULT '',
  need         TEXT    NOT NULL DEFAULT '',   -- what they need
  notes        TEXT    NOT NULL DEFAULT '',
  stage        TEXT    NOT NULL DEFAULT 'new', -- new | contacting | site_visit | quote_sent | negotiating | won | closed
  next_step    TEXT,                           -- e.g. "Follow up", "Send quote"; null once won/closed
  next_due     TEXT,                           -- YYYY-MM-DD or YYYY-MM-DDTHH:MM (local time)
  tries        INTEGER NOT NULL DEFAULT 0,     -- follow-ups with no reply in a row
  close_reason TEXT,                           -- why it closed, incl. "I ended it"
  created_at   TEXT    NOT NULL,               -- ISO, UTC
  updated_at   TEXT    NOT NULL,
  closed_at    TEXT
);
CREATE INDEX clients_by_due ON clients (user_id, stage, next_due);

-- What happened with a client, newest last: created, step done, no reply, moved, note, closed…
CREATE TABLE activity (
  id         TEXT NOT NULL PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  client_id  TEXT NOT NULL REFERENCES clients (id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,
  text       TEXT NOT NULL DEFAULT '',
  at         TEXT NOT NULL                     -- ISO, UTC
);
CREATE INDEX activity_by_client ON activity (client_id, at);

-- One row per user; missing values use the defaults in CLAUDE.md.
CREATE TABLE settings (
  user_id                TEXT    NOT NULL PRIMARY KEY REFERENCES "user" ("id") ON DELETE CASCADE,
  follow_up_days         INTEGER NOT NULL DEFAULT 2,  -- no reply → try again after
  max_tries              INTEGER NOT NULL DEFAULT 3,  -- suggest closing after
  quote_after_visit_days INTEGER NOT NULL DEFAULT 2,  -- send quote within, after a site visit
  quote_follow_up_days   INTEGER NOT NULL DEFAULT 3,  -- follow up a quote after
  notify_due             INTEGER NOT NULL DEFAULT 1,  -- notification when a step is due
  morning_summary        INTEGER NOT NULL DEFAULT 1,
  summary_time           TEXT    NOT NULL DEFAULT '08:00',
  timezone               TEXT    NOT NULL DEFAULT 'Asia/Kuala_Lumpur',
  updated_at             TEXT    NOT NULL
);

-- Devices that receive notifications (one per installed app / browser).
CREATE TABLE push_subscriptions (
  endpoint   TEXT NOT NULL PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX push_by_user ON push_subscriptions (user_id);
