#!/usr/bin/env node
// Copies the explorer (vendor/explore/, a word-for-word copy of kyle-pace/world-cuisines
// kept fresh by scripts/sync-explore.mjs) into public/explore/app/ before every build, so
// the Worker serves the globe, the page browser and Dish drop at findish.now/explore/app/.
// The staged copy is generated and not committed.
//
// On the way, every address that pointed at the explorer's old home is pointed here
// (rewrite() below). If the source stops containing one of those addresses, staging fails:
// a rule that matches nothing means the explorer changed and the rule needs a look.
//
// No dependencies; Node 18+.
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// [what the explorer says, what finDish says, where it has to be found at least once]
export const RULES = [
  ['https://kylepace.dev/world-cuisine/', 'https://findish.now/explore/', 'html'],
  ['/world-cuisine/', '/explore/', 'html'],
  ['hostname.endsWith("kylepace.dev")', 'hostname.endsWith("findish.now")', 'html'],
  ['Back to World cuisine', 'Back to Explore', 'html'],
];

/** One file's text with every old address changed; `seen` counts what each rule matched. */
export function rewrite(text, seen = new Map()) {
  for (const [from, to] of RULES) {
    const parts = text.split(from);
    if (parts.length > 1) seen.set(from, (seen.get(from) ?? 0) + parts.length - 1);
    text = parts.join(to);
  }
  return text;
}

const TEXT = /\.(html|js|json)$/;

export function stage(src, dest) {
  const seen = new Map();
  rmSync(dest, { recursive: true, force: true });
  const walk = (from, to) => {
    mkdirSync(to, { recursive: true });
    for (const name of readdirSync(from)) {
      if (name === 'SOURCE.json') continue;
      const a = join(from, name);
      const b = join(to, name);
      if (statSync(a).isDirectory()) walk(a, b);
      // The libraries (globe.gl, force-graph) and fonts are copied as they are
      else if (TEXT.test(name) && !a.includes('/vendor/explore/vendor/')) writeFileSync(b, rewrite(readFileSync(a, 'utf8'), seen));
      else cpSync(a, b);
    }
  };
  walk(src, dest);
  const unused = RULES.filter(([from]) => !seen.get(from)).map(([from]) => from);
  if (unused.length) throw new Error(`The explorer no longer contains: ${unused.join(' | ')}. Check RULES in scripts/stage-explore.mjs.`);
  return seen;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const seen = stage(join(root, 'vendor/explore'), join(root, 'public/explore/app'));
  const total = [...seen.values()].reduce((a, b) => a + b, 0);
  console.log(`Staged the explorer in public/explore/app/ (${total} addresses pointed at /explore/).`);
}
