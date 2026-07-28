-- 012_add_user_profile_prefs.sql
-- Adds the three self-service profile preferences Settings.jsx has always
-- had UI for (theme, avatar colour, timezone) but could only ever persist
-- to sessionStorage — both ThemeContext.jsx and Settings.jsx's own header
-- comment said "when a Users API exists, load/save this from the user's
-- profile instead". The Users API now exists (§23); this is that column.
--
-- Run this against Neon like every other migration in this list.
-- Safe to re-run: ADD COLUMN IF NOT EXISTS.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS themePreference VARCHAR(20) NOT NULL DEFAULT 'linen';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS avatarColour    VARCHAR(20) NOT NULL DEFAULT 'grad';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS timezone        VARCHAR(50) NOT NULL DEFAULT 'Africa/Johannesburg';

-- avatarColour and themePreference store the short id (e.g. 'grad', 'linen'),
-- not the rendered CSS/value — matches the existing convention of storing
-- stable identifiers rather than presentation values (compare Portfolio/
-- Product names travelling as names, not raw display strings). The frontend
-- resolves id -> CSS via AVATAR_OPTIONS / THEMES lookups.
