-- Fewer lead sources (decided 1 Nov 2026): WhatsApp, Email, Social media, Other.
UPDATE clients SET source = 'Social media' WHERE source IN ('Facebook', 'Instagram');
UPDATE clients SET source = 'Other' WHERE source IN ('Google', 'Website', 'Referral', 'Walk-in');
