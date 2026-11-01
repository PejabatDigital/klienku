-- Account page (Settings → Account): the owner's phone number, next to the name Better Auth
-- already keeps. Optional; nothing else uses it yet.
ALTER TABLE "user" ADD COLUMN phone TEXT;
