import type { Hit, Ready } from './search-core.mjs';
export function relatedDishes(ready: Ready, phrases: string[] | undefined, hits: Hit[], q: string[]): string[];
