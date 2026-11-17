// Types for index-format.mjs, for the page's TypeScript (src/scripts/index-load.ts).

/** What the home page carries itself: the files' names and the few things that change daily. */
export type IndexExtra = { built?: string; opens?: [number, number][] };

export const FORMAT: number;
export function slug(name: string): string;
export function pack(index: unknown): { recipes: unknown; videos: unknown; extra: Required<IndexExtra> };
export function unpack(recipes: unknown, extra?: IndexExtra, videos?: unknown): unknown;
export function unpackVideos(videos: unknown, ing: unknown[]): unknown[][];
export function sameLists(mine: unknown, other: unknown): boolean;
export function videoRowsFor(index: unknown, ing: unknown[], packed: () => Promise<unknown>, whole: () => Promise<unknown>): Promise<{ rows: unknown[][]; missed: boolean }>;
