// Getting the index into the page, recipes first.
//
// The page doesn't download public/index.json any more. The build packs the same index
// into two smaller files (src/lib/index-format.mjs) named after what's in them, so a
// browser keeps them until a crawl changes them:
//
//   /i/recipes.<hash>.json   what recipe search needs; the page asks for it while it's
//                            still loading (the preload link in src/pages/index.astro)
//   /i/videos.<hash>.json    the video rows, fetched once the recipes are on the page
//
// Their names, with the build date and how often each recipe was opened lately (the only
// things that change daily), are written into the page as #index-files.
//
// Getting the recipes ready to search (search-core's prepare) is the one heavy piece of
// work on the page. It's done a thousand recipes at a time with a pause between, so a slow
// phone still answers taps and typing while it happens.
//
// If either file can't be had (a page left open across a deploy asks for names that are
// gone), /index.json still holds everything, and is used instead.
import { unpack, unpackVideos, type IndexExtra } from '../lib/index-format.mjs';
import { addVideos, prepareSteps, type Ready } from '../lib/search-core.mjs';

type Files = IndexExtra & { recipes?: string; videos?: string };

async function get(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

let whole: Promise<{ videos: { rows: unknown[][] } }> | undefined;
/** The whole index in one file, asked for at most once. */
const everything = () => (whole ??= get('/index.json') as NonNullable<typeof whole>);

/** Lets the browser handle whatever is waiting (a tap, a keystroke, a frame) before carrying on. */
const breathe = () => new Promise<void>((done) => setTimeout(done));

const STEP = 1000; // recipes got ready between pauses: about 30 ms of work on a slow phone

async function prepareGently(index: unknown): Promise<Ready> {
  const steps = prepareSteps(index, STEP);
  let step = steps.next();
  while (!step.done) {
    await breathe();
    step = steps.next();
  }
  return step.value;
}

export type Loaded = {
  /** The index in public/index.json's shape. Its video rows are filled in by `videos` when that is set. */
  index: unknown;
  /** The index, ready to search (recipes; videos too when `videos` is null). */
  ready: Ready;
  /** Fetches the video rows and adds them to `ready` (call it once the recipes are on the page), or null when they're already in. */
  videos: (() => Promise<void>) | null;
};

export async function loadIndex(): Promise<Loaded> {
  let files: Files = {};
  try {
    files = JSON.parse(document.getElementById('index-files')?.textContent || '{}');
  } catch {
    // No names: the whole index, below.
  }
  if (files.recipes && files.videos) {
    try {
      const index = unpack(await get(files.recipes), files);
      await breathe();
      const ready = await prepareGently(index);
      const url = files.videos;
      return {
        index,
        ready,
        videos: async () => {
          let rows: unknown[][];
          try {
            rows = unpackVideos(await get(url), ready.ing);
          } catch {
            rows = (await everything()).videos.rows;
          }
          addVideos(ready, rows);
          await breathe(); // before the page draws its search again with them
        },
      };
    } catch {
      // The whole index, below.
    }
  }
  const index = await everything();
  return { index, ready: await prepareGently(index), videos: null };
}
