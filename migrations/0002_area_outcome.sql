-- Area (shown on cards: "Kitchen renovation · Shah Alam") and how a closed client ended.
ALTER TABLE clients ADD COLUMN area    TEXT NOT NULL DEFAULT '';
ALTER TABLE clients ADD COLUMN outcome TEXT;  -- won | lost | ended; null while open
