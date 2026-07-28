/**
 * constants/avatarOptions.js — NEW, 28 Jul 2026 (§55).
 * Previously defined locally inside Settings.jsx only — moved here because
 * the sidebar avatar bubble (App.jsx) needed the same id -> CSS lookup and
 * had no way to reach it. The id (not the CSS value) is what persists to
 * User.avatarColour — matches the existing convention of storing stable
 * identifiers rather than presentation values (Portfolio/Product names
 * travel the same way). Keep in sync with the enum in
 * api-lib/models/user.js's UpdateOwnProfileSchema if this list ever changes.
 */

export const AVATAR_OPTIONS = [
  { id: 'grad',    value: 'linear-gradient(135deg, var(--accent), var(--accent2))' },
  { id: 'violet',  value: '#7c3aed' },
  { id: 'cyan',    value: '#0891b2' },
  { id: 'green',   value: '#15803d' },
  { id: 'amber',   value: '#d97706' },
];

/** id -> CSS value, with a safe fallback to the default gradient for an
 * unset or unrecognised id (e.g. preview-mode personas, which carry no
 * avatarColour at all). */
export function avatarColourValue(id) {
  return AVATAR_OPTIONS.find(o => o.id === id)?.value ?? AVATAR_OPTIONS[0].value;
}
