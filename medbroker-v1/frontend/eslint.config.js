// Minimal ESLint config — added 21 Aug 2026 after a real production bug
// (LeadDetail.jsx referencing an unimported `colors` variable, crashing
// the whole page with "ReferenceError: colors is not defined" the
// moment a rarely-exercised code path finally rendered). npm run lint
// existed in package.json before this file did, but had no config at
// all — it errored out immediately rather than checking anything,
// which is exactly why this bug went undetected: `npm run build`
// transpiles JSX/JS but doesn't do the scope analysis needed to catch
// an undefined-variable reference; only a linter does.
//
// Deliberately narrow, not a full lint setup: only no-undef (plus
// no-unused-vars, close enough in spirit and equally standard) are
// enabled — not ESLint's full recommended set, and no React-specific
// plugin (eslint-plugin-react, the Hooks rules, etc.), none of which
// are installed as dependencies. Turning on a full ruleset in one step
// risks surfacing a wave of unrelated pre-existing warnings across the
// whole codebase as a surprise side effect of a bug-fix delivery,
// which isn't what was asked for. A fuller lint setup (React Hooks
// rules especially — genuinely worth having) is a separate, bigger
// decision to make deliberately, not bundled in here.
import globals from 'globals';

export default [
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.es2021 },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['warn', { varsIgnorePattern: '^_', argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['api/**/*.js', 'api-lib/**/*.js', 'scripts/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.es2021 },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['warn', { varsIgnorePattern: '^_', argsIgnorePattern: '^_' }],
    },
  },
];
