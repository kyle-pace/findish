export function cleanQ(text: unknown): string;
export function tagOrder(before: string[], now: string[]): string[];
export function titleFor(parts: (string | undefined)[], home: string, name?: string): string;
export function dishName(text: unknown): string;
export function ignoredSentence(ignored: string[], quote?: (w: string) => string): string;
export function linkOnlyTyped<T extends { name: string }>(text: string, sites: T[] | undefined): { site: T; rest: string } | null;
export function goesToAsk(o: { on: boolean; how?: 'enter' | 'ask' | 'plain'; text?: string; fromAsk?: boolean; question?: boolean; chosen?: boolean }): boolean;
export function askKey(search: unknown): string;
export type Turn = { role: 'user'; content: string } | { role: 'assistant'; showed: string };
export function askMessages(turns: Turn[]): ({ role: 'user'; content: string } | { role: 'assistant'; showed: string })[];
export function soleQuery(search: unknown): string;
export function sortHits<T extends { r: { min: number | null; added: string } }>(hits: T[], order: string): T[];
export function coverLabel(used: number, total: number): string;
export type Facet = { kind: 'cuisine' | 'time' | 'diet'; value: string; label: string; n: number };
export function narrowFacets(
  rows: { cuisine: string; min: number | null }[],
  opts?: { set?: { cuisine?: unknown; time?: unknown; diet?: unknown }; vegetarian?: number; least?: number },
): Facet[];
export function completions(phrases: string[] | undefined, text: string, max?: number): { phrase: string; at: number; length: number }[];
