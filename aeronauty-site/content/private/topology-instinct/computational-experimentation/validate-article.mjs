#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const [source, article, metadataText, referenceCasesText, operatorPhoto, theodorsenText] = await Promise.all([
  readFile(join(ROOT, 'article-source.md'), 'utf8'),
  readFile(join(ROOT, 'article.html'), 'utf8'),
  readFile(join(ROOT, 'source-metadata.json'), 'utf8'),
  readFile(join(ROOT, 'kp-reference-cases.json'), 'utf8'),
  readFile(join(ROOT, 'obi-wan-nairobi.jpg')),
  readFile(join(ROOT, 'assets', 'theodorsen-data.json'), 'utf8'),
]);
const metadata = JSON.parse(metadataText);
const referenceCases = JSON.parse(referenceCasesText);
const theodorsenRows = JSON.parse(theodorsenText);

// Provenance is byte-exact: metadata hashes the checked-in snapshot exactly as
// served. Generated comments and a possible UTF-8 BOM are stripped only for
// structural parsing below.
assert.equal(createHash('sha256').update(source, 'utf8').digest('hex'), metadata.sourceSha256);
const parseableSource = source.replace(/^\uFEFF/, '');
const essaySource = parseableSource.replace(
  /^<!-- GENERATED FROM GOOGLE DOC[^\n]*-->\n<!-- EDIT THE GOOGLE DOC[^\n]*-->\n\n/,
  '',
);
const sourceTitle = essaySource
  .split(/\r?\n/)
  .map((line) => line.trim())
  .find(Boolean)
  ?.replace(/^#\s+/, '');
assert.equal(sourceTitle, 'Computational Experimentation');
assert.equal((essaySource.match(/^— — —$/gm) || []).length, 5, 'expected five section boundaries');
assert.ok(essaySource.includes('An abstraction layer is successfully formed when verifying its result becomes cheaper and easier than producing it yourself.'));
assert.ok(essaySource.includes('Chengjian He knew this'));
assert.ok(metadata.revisionId?.startsWith('AIroW37Tx'));
assert.equal(referenceCases.source.title, 'Low-Speed Aerodynamics');
assert.equal(referenceCases.source.edition, 'Second Edition');
assert.deepEqual(referenceCases.cases.chapter9TwoElement.equations, ['9.31', '9.35', '9.39']);
assert.deepEqual(referenceCases.cases.constantStrengthPanel.equations, [
  '10.35',
  '10.36',
  '10.39',
  '10.40',
]);
assert.ok(referenceCases.cases.finiteStraightSegment.equations.includes('2.72'));
assert.equal(theodorsenRows.length, 180);
assert.ok(theodorsenRows[0].k <= 0.005 && theodorsenRows.at(-1).k >= 3);
for (let index = 0; index < theodorsenRows.length; index += 1) {
  const row = theodorsenRows[index];
  assert.ok(Number.isFinite(row.k) && Number.isFinite(row.f) && Number.isFinite(row.g));
  if (index) assert.ok(row.k > theodorsenRows[index - 1].k);
}

const markerParagraphs = essaySource
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
assert.ok(article.includes('<script src="interaction-core.js"></script>'));
assert.ok(article.includes('<script src="vortex-core.js"></script>'));
assert.ok(article.includes('<script src="unsteady-core.js"></script>'));
assert.ok(article.includes('schematic reconstruction'));
assert.ok(article.includes('data-single-mode'));
assert.ok(article.includes('data-double-mode'));
assert.ok(article.includes('data-single role="group"'));
assert.ok(article.includes('data-double role="group"'));
assert.ok(article.includes('>2D panel</button>'));
assert.ok(article.includes('>3D filament</button>'));
assert.ok(article.includes('>Reset view</button>'));
assert.ok(article.includes('K.finiteVortexSegmentVelocity'));
assert.ok(article.includes('K.finiteVortexSegmentQuadrature'));
assert.ok(article.includes('bind3dInteractions'));
assert.ok(article.includes("['A1','B1'],['A2','B2']"));
assert.ok(article.includes("event.key==='Home'"));
assert.ok(article.includes("event.ctrlKey&&!event.metaKey"));
assert.ok(article.includes('src="obi-wan-nairobi.jpg"'));
assert.ok(article.includes('Christian Craighead'));
assert.ok(article.includes('Photograph by Drake Sweet/Bison films'));
assert.ok(article.includes('initUnsteadyExperiment'));
assert.ok(article.includes("new Worker('unsteady-worker.js')"));
assert.ok(article.includes("fetch('assets/theodorsen-data.json')"));
assert.ok(article.includes('data-unsteady-frame="wing"'));
assert.ok(article.includes('data-unsteady-frame="fixed"'));
assert.ok(article.includes('data-unsteady-stage="flat"'));
assert.ok(article.includes('data-unsteady-stage="te"'));
assert.ok(article.includes('data-unsteady-stage="free"'));
assert.ok(article.includes('Lift deficiency and phase lag'));
assert.ok(article.includes('pressure-derived lift'));
assert.ok(!article.includes('function J0('));
assert.ok(!article.includes('function ck('));
assert.deepEqual([...operatorPhoto.subarray(0, 3)], [0xff, 0xd8, 0xff]);

for (const match of article.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) {
  // Parse without running: catches truncated strings, braces and other article-shell breakage.
  new Function(match[1]);
}

console.log('computational-experimentation article package is internally consistent');
