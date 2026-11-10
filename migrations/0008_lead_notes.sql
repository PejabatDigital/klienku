-- V3.5 Notes: a running log of notes for each lead (what was said, when). The leads live in
-- the Google Sheet; a note points at the lead by its hidden ID (the sheet's ID column).
-- A lead's old Notes cell from the sheet is copied in once as its first note (from_sheet = 1).
-- Deleting a note only marks it, so a copied one isn't copied again.
CREATE TABLE lead_notes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT    NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  lead_id    TEXT    NOT NULL,
  at         TEXT    NOT NULL,            -- UTC timestamp; YYYY-MM-DD for notes copied from the sheet
  text       TEXT    NOT NULL,
  from_sheet INTEGER NOT NULL DEFAULT 0,
  deleted    INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL
);
CREATE INDEX lead_notes_user_lead ON lead_notes (user_id, lead_id);
