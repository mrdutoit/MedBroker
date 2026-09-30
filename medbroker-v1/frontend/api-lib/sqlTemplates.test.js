import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 30 Sep 2026 — a JS `//` comment inside a SQL template literal is sent to Postgres and breaks the query.
const ROOT = path.dirname(fileURLToPath(import.meta.url));

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return e.name.endsWith('.js') && !e.name.endsWith('.test.js') ? [p] : [];
  });
}

// Scan source, skipping JS comments and quoted strings, collecting top-level template literals.
function templates(src) {
  const out = [];
  let i = 0, line = 1;
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (c === '\n') { line++; i++; }
    else if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') i++; }
    else if (c === '/' && n === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') line++; i++; } i += 2; }
    else if (c === '"' || c === "'") { i++; while (i < src.length && src[i] !== c && src[i] !== '\n') { if (src[i] === '\\') i++; i++; } i++; }
    else if (c === '`') {
      const startLine = line; let depth = 0; let text = ''; i++;
      while (i < src.length) {
        const d = src[i];
        if (d === '\\') { text += d + src[i + 1]; i += 2; continue; }
        if (d === '\n') line++;
        if (depth === 0 && d === '`') break;
        if (d === '$' && src[i + 1] === '{') { depth++; text += '${'; i += 2; continue; }
        if (depth > 0 && d === '}') depth--;
        text += d; i++;
      }
      i++;
      out.push({ text, startLine });
    } else i++;
  }
  return out;
}

describe('SQL template literals', () => {
  it('contain no // comment lines', () => {
    const offenders = [];
    for (const file of walk(ROOT)) {
      for (const t of templates(fs.readFileSync(file, 'utf8'))) {
        if (!/\b(SELECT|UPDATE|INSERT|DELETE)\b/.test(t.text)) continue;
        t.text.split('\n').forEach((l, k) => {
          if (/^\s*\/\//.test(l)) offenders.push(`${path.relative(ROOT, file)}:${t.startLine + k}`);
        });
      }
    }
    expect(offenders).toEqual([]);
  });
});
