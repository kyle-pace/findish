import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allowedHosts, heldBack, heldBackNote, photoHost } from './photo-hosts.mjs';

test('photo hosts: the allowed list reads hosts and skips comments', () => {
  const hosts = allowedHosts();
  assert.ok(hosts.has('i0.wp.com'));
  assert.ok(hosts.has('static1.squarespace.com'));
  assert.ok(![...hosts].some((h) => h.includes('#') || h.includes(' ')));
});

test('photo hosts: a new image host is held back with a note, not a failure', () => {
  const allowed = new Set(['i0.wp.com']);
  const counts = heldBack(
    [
      'https://i0.wp.com/a.jpg',
      'https://cdn.newhost.example/b.jpg',
      'https://cdn.newhost.example/c.jpg',
      'http://old.example/d.jpg',
      "data:image/svg+xml,%3Csvg%3E%3C/svg%3E",
      '',
    ],
    allowed,
  );
  assert.deepEqual(counts, { 'cdn.newhost.example': 2, '(not an https address)': 1 });
  assert.match(heldBackNote(counts), /cdn\.newhost\.example \(2\)/);
  assert.equal(heldBackNote({}), '');
  assert.equal(photoHost('https://I0.WP.com/x.jpg?w=1'), 'i0.wp.com');
  assert.equal(photoHost('not a url'), '');
});

test('photo hosts: every photo in the built index loads from an allowed host', async () => {
  const { realIndex } = await import('../src/lib/test-index.mjs');
  const index = realIndex();
  const allowed = allowedHosts();
  const off = index.recipes.filter((r) => r[7] && !allowed.has(photoHost(r[7])));
  assert.deepEqual(off.slice(0, 5).map((r) => r[7]), []);
});
