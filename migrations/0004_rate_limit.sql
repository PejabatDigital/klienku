-- Sign-in limits (Phase 6): Better Auth counts tries per internet address and page here,
-- so repeated password guesses are slowed down (worker/auth.js rateLimit).
CREATE TABLE "rateLimit" (
  "id"          text NOT NULL PRIMARY KEY,
  "key"         text NOT NULL UNIQUE,
  "count"       integer NOT NULL,
  "lastRequest" integer NOT NULL
);
