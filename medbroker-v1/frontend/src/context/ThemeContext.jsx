/**
 * context/ThemeContext.jsx
 * Provides the active design-system theme to the whole app and persists it.
 *
 * Themes are defined in themes.css as [data-theme="..."] variable blocks; this
 * context only chooses which one is active by setting the data-theme attribute
 * on <html>. Persistence mirrors RoleContext: sessionStorage, scoped to the tab.
 * When a Users API exists, load the saved theme from the user's profile instead
 * (and write it back in setTheme).
 */

import { createContext, useContext, useState, useEffect } from 'react';

export const THEMES = [
  { id: 'linen',    name: 'Linen',    mood: 'Light · cool · minimal',     swatch: ['#2F5D8A', '#3B82A6'] },
  { id: 'terra',    name: 'Terra',    mood: 'Light · earthy · editorial', swatch: ['#5E7A4F', '#C08A3E'] },
  { id: 'midnight', name: 'Midnight', mood: 'Dark · technical · premium', swatch: ['#00AEEF', '#2DD4BF'] },
  { id: 'ember',    name: 'Ember',    mood: 'Dark · warm · confident',    swatch: ['#E8853B', '#E0B23C'] },
];

const THEME_IDS = THEMES.map(t => t.id);
export { THEME_IDS };
const DEFAULT_THEME = 'linen';
const THEME_STORAGE_KEY = 'medbroker.theme';

const ThemeContext = createContext(null);

function getInitialTheme() {
  try {
    const saved = sessionStorage.getItem(THEME_STORAGE_KEY);
    if (saved && THEME_IDS.includes(saved)) return saved;
  } catch {
    // sessionStorage unavailable — fall back to default
  }
  return DEFAULT_THEME;
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      sessionStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // ignore — persistence is best-effort
    }
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, themes: THEMES }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
