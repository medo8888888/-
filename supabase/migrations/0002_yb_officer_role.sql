-- Yanabee 0002: the competition officer role (masool al-musabaqa).
-- Kept alone in its own migration: a new enum value cannot be used in the same
-- transaction that adds it, and 0003 uses it. Idempotent.
alter type public.user_role add value if not exists 'officer';
