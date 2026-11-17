// JSON written inside a <script> element can't end it (src/lib/json-script.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { jsonForScript } from './json-script.mjs';

test('a name that tries to close the script element is written with escapes, and reads back the same', () => {
  const ld = { '@type': 'ItemList', name: 'Soup</script><script>alert(1)</script>', note: '<!-- & --> \u2028\u2029 "quoted" é 鸡' };
  const out = jsonForScript(ld);
  assert.ok(!/[<>&\u2028\u2029]/.test(out), out);
  assert.ok(!out.toLowerCase().includes('</script'));
  assert.deepEqual(JSON.parse(out), ld);
  assert.equal(jsonForScript({ a: 'plain' }), '{"a":"plain"}');
});

test('every page that writes JSON into a script element uses it', () => {
  const src = fileURLToPath(new URL('..', import.meta.url));
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name.endsWith('.astro')) files.push(path);
    }
  };
  walk(src);
  const bad = files.filter((f) => /set:html=\{\s*JSON\.stringify/.test(readFileSync(f, 'utf8')));
  assert.deepEqual(bad, [], 'set:html={JSON.stringify(…)} writes a site’s recipe names unescaped');
  assert.ok(files.filter((f) => readFileSync(f, 'utf8').includes('jsonForScript(')).length >= 5);
});
