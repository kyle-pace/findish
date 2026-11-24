// Which photo hosts the site may load from: the ones listed in .agents/allowed-hosts.txt.
// A recipe whose photo is on a host not listed yet (a site moved its images to a new CDN)
// keeps its place in the index without the photo, and the host shows as a note in the crawl
// and the build, so a new photo host never fails the third-party check or a run (since
// 2026-11-24, on Kyle's ask). Adding the host to the list, under the principles'
// content-image rule, brings the photos back on the next build.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export function allowedHosts(file = join(root, '.agents/allowed-hosts.txt')) {
  return new Set(
    readFileSync(file, 'utf8')
      .split('\n')
      .map((l) => l.replace(/#.*/, '').trim().toLowerCase())
      .filter(Boolean),
  );
}

// The host a photo loads from, or '' when the address isn't a plain https one.
export function photoHost(img) {
  try {
    const u = new URL(img);
    return u.protocol === 'https:' ? u.hostname.toLowerCase() : '';
  } catch {
    return '';
  }
}

// Photos on hosts not in `allowed`, counted by host: { host: count }.
export function heldBack(imgs, allowed) {
  const out = {};
  for (const img of imgs) {
    // A page's lazy-load stand-in (data:image/svg+xml,...) is no photo at all: left off quietly.
    if (!img || img.startsWith('data:')) continue;
    const host = photoHost(img);
    if (host && allowed.has(host)) continue;
    const key = host || '(not an https address)';
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}

// One line for a run's notes, or '' when every photo's host is listed.
export function heldBackNote(counts) {
  const parts = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([h, n]) => `${h} (${n})`);
  return parts.length ? `Photos held back, their host isn't in .agents/allowed-hosts.txt yet: ${parts.join(', ')}. The recipes show without photos until the host is added.` : '';
}
