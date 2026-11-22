// The Discover page's shelves for this build, worked out once from the index and shared by
// the page (src/pages/discover.astro) and its feed (src/pages/discover.json.ts, for the app
// and assistants later). The rules are in collections.mjs.
import indexJson from '../../public/index.json';
import catalogJson from '../../vendor/kitchen-catalog/catalog.json';
import { buildCollections } from './collections.mjs';

export type Shelf = {
  id: string;
  title: string;
  blurb: string;
  count: number;
  /** The same shelf as a search on the search page, when it is one. */
  search: string;
  /** The creator of the week, on their shelf. */
  creator?: string;
  rows: { name: string; url: string; key: string; source: string; creator: string; minutes: number; cuisine: string; img: string }[];
};

export const DISCOVER: { week: string; built: string; shelves: Shelf[] } = buildCollections(indexJson as any, catalogJson as any);
export const TOTAL: number = (indexJson as any).recipes.length;
