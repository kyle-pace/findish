#!/usr/bin/env node
// node crawler/merge-status.mjs <this run's status.json> <the saved status.json>
// Rewrites the saved file as both together (see mergeStatus in lib/turns.mjs).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { mergeStatus } from './lib/turns.mjs';

const [oursPath, savedPath] = process.argv.slice(2);
const ours = JSON.parse(readFileSync(oursPath, 'utf8'));
const theirs = existsSync(savedPath) ? JSON.parse(readFileSync(savedPath, 'utf8')) : { sources: {}, alerts: [] };
writeFileSync(savedPath, JSON.stringify(mergeStatus(theirs, ours), null, 1) + '\n');
