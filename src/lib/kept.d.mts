export const KEEP: Record<'recent' | 'opened' | 'saved', { key: string; max: number }>;
export function readList(text: string | null | undefined, max?: number): string[];
export function putFirst(list: string[], item: string, max?: number): string[];
export function dropFrom(list: string[], item: string): string[];
export function recentKey(search: unknown): string;
export function rememberSearch(list: string[], search: unknown, opts?: { refines?: string; max?: number }): string[];
export function searchLabel(parts: (string | undefined | null)[]): string;
export function listHash(keys: string[]): string;
export function keysFromHash(hash: unknown, max?: number): string[];
