#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const [source, article, metadataText] = await Promise.all([
  readFile(join(ROOT, 'article-source.md'), 'utf8'),
  readFile(join(ROOT, 'article.html'), 'utf8'),
  readFile(join(ROOT, 'source-metadata.json'), 'utf8'),
]);
const metadata = JSON.parse(metadataText);

const sourceTitle = source
  .split(/\r?\n/)
  .map((line) => line.trim())
  .find((line) => line && !line.startsWith('<!--'));
assert.equal(sourceTitle, 'Computational Experimentation');
assert.equal((source.match(/^— — —$/gm) || []).length, 5, 'expected five section boundaries');
assert.ok(source.includes('An abstraction layer is successfully formed when verifying its result becomes cheaper and easier than producing it yourself.'));
assert.ok(source.includes('Chengjian He knew this'));
assert.ok(metadata.revisionId?.startsWith('AIroW37Tx'));
assert.equal(createHash('sha256').update(source, 'utf8').digest('hex'), metadata.sourceSha256);

const markerParagraphs = source
  .split(/\n\s*\n/)
  .map((value) => value.trim())
  .filter((value) => /^\[<.*>\]$/s.test(value));
const knownMarkerFragments = [
  'single vortex element',
  'same widget',
  'spanwise change in vorticity',
  'sinusoidal loading',
  'lift-curve slope',
  'page of my dissertation',
];
assert.equal(markerParagraphs.length, knownMarkerFragments.length);
for (const fragment of knownMarkerFragments) {
  assert.ok(markerParagraphs.some((marker) => marker.toLowerCase().includes(fragment)));
}

assert.ok(article.includes("fetch('article-source.md'"), 'runtime must load the generated prose snapshot');
assert.ok(article.includes('<script src="vortex-core.js"></script>'));
assert.ok(article.includes('schematic reconstruction'));
assert.ok(article.includes(metadata.googleDocUrl));

for (const match of article.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) {
  // Parse without running: catches truncated strings, braces and other article-shell breakage.
  new Function(match[1]);
}

console.log('computational-experimentation article package is internally consistent');
