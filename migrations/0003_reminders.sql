-- Reminders (Phase 4).
-- How long before a step with a time to notify; 0 = at the time.
ALTER TABLE settings ADD COLUMN remind_before INTEGER NOT NULL DEFAULT 15;
-- The local date (YYYY-MM-DD) the morning summary was last sent, so it goes once a day.
ALTER TABLE settings ADD COLUMN last_summary TEXT;
-- The next_due value a reminder was sent for; a new due date means a new reminder.
ALTER TABLE clients ADD COLUMN notified_due TEXT;
