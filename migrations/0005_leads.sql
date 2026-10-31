-- Version 2: leads (CLAUDE.md "Version 2 — lead CRM"). The table keeps its name `clients`:
-- `stage` holds the status, `area` the location, `notes` the general notes, and
-- `next_due` / `next_step` the next follow-up date and note (both may now be empty).
-- `need`, `tries` and `outcome` are no longer used; they're left in place, untouched.
ALTER TABLE clients ADD COLUMN project_type TEXT NOT NULL DEFAULT '';  -- from src/lists.js
ALTER TABLE clients ADD COLUMN source       TEXT NOT NULL DEFAULT '';  -- from src/lists.js
ALTER TABLE clients ADD COLUMN budget       INTEGER;                   -- estimated, whole RM

-- General notes start with what they needed, then any notes added with the client.
UPDATE clients SET notes = CASE
  WHEN need <> '' AND notes <> '' THEN need || char(10) || notes
  WHEN need <> '' THEN need
  ELSE notes END;

-- Old stages → new statuses. "Ended by you" becomes Lost, keeping that in the reason.
UPDATE clients SET stage = 'contacted'   WHERE stage = 'contacting';
UPDATE clients SET stage = 'quotation'   WHERE stage = 'quote_sent';
UPDATE clients SET stage = 'negotiation' WHERE stage = 'negotiating';
UPDATE clients SET close_reason = 'Ended by you' || coalesce(': ' || nullif(close_reason, ''), '')
  WHERE stage = 'closed' AND outcome = 'ended';
UPDATE clients SET stage = 'lost' WHERE stage = 'closed';

-- The follow-up rules in Settings are gone; their columns stay, unused.
