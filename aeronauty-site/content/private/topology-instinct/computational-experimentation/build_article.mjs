#!/usr/bin/env node
import { readFile, writeFile, access } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = dirname(fileURLToPath(import.meta.url));
const SOURCE_PATH = join(ROOT, 'source.generated.txt');
const META_PATH = join(ROOT, 'source.json');
const OUTPUT_PATH = join(ROOT, 'article.html');
const CHECK = process.argv.includes('--check');

const SECTION_SPECS = [
  { id: 'fraud', numeral: '00', title: 'The fraud feeling', stand: 'When authorship stops feeling like evidence.' },
  { id: 'instrument', numeral: '01', title: 'The instrument', stand: 'The tools changed. The instinct did not.' },
  { id: 'calibration', numeral: '02', title: 'Calibration', stand: 'Known answers first. Interesting answers later.' },
  { id: 'judgement', numeral: '03', title: 'Judgement', stand: 'The test is the part I still have to own.' },
  { id: 'identity', numeral: '04', title: 'The name', stand: 'Computational describes the medium. Compositional describes the risk.' },
  { id: 'diagnostic', numeral: '05', title: 'The diagnostic', stand: 'Production got cheap before trust did.' },
];

const WIDGETS = [
  { match: 'insert widget of a single vortex element', mode: 'segment', title: 'One finite vortex element', caption: 'The primitive: endpoints A and B, interrogation point P, and the induced velocity.' },
  { match: 'same widget', mode: 'superposition', title: 'Superposition', caption: 'Two individually checked elements. One composed answer.' },
  { match: 'Show the algorithm for how any spanwise change', mode: 'trailing', title: 'Trailing vorticity', caption: 'The spanwise difference in bound circulation is the wake strength.' },
  { match: 'Have a sinusoidal loading', mode: 'shed', title: 'Shed vorticity', caption: 'Change the bound circulation and the wake receives the equal-and-opposite increment.' },
  { match: 'Show a 2D case with a lift-curve slope', mode: 'theodorsen', title: 'Theodorsen calibration', caption: 'A 2π lift slope, harmonic motion, and a known complex wake-memory response.' },
];

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function operatorDoodle() {
  return `<svg class="ce-operator-doodle" viewBox="0 0 120 72" role="img" aria-label="An original hooded mathematical operator doodle">
    <path d="M44 62c1-16 4-28 16-36 12 8 15 20 16 36" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>
    <path d="M49 31c2-14 20-14 22 0-2 8-7 12-11 12s-9-4-11-12Z" fill="none" stroke="currentColor" stroke-width="4"/>
    <path d="M31 61h58" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>
    <text x="60" y="18" text-anchor="middle" font-size="15" font-family="ui-monospace, monospace">∂/∂x</text>
  </svg>`;
}

function renderAside(body, wide = false) {
  let cleaned = body.trim();
  let doodle = '';
  if (cleaned.includes('<add a pic of Obi-Wan-Nairobi>')) {
    cleaned = cleaned.replace('<add a pic of Obi-Wan-Nairobi>', '').trim();
    doodle = operatorDoodle();
  }
  const asideIndex = ++renderAside.counter;
  return `<span class="ce-aside${wide ? ' ce-aside-wide' : ''}">
    <sup class="ce-aside-mark" tabindex="0" role="button" aria-label="Open aside" aria-expanded="false" aria-describedby="ce-aside-${asideIndex}">*</sup>
    <span class="ce-aside-content" id="ce-aside-${asideIndex}" role="tooltip">${escapeHtml(cleaned)}${doodle}</span>
  </span>`;
}
renderAside.counter = 0;

function renderInline(raw) {
  const marker = /\[\<(put this in a little side callout|callout)\>(.*?)\]/gs;
  let cursor = 0;
  let html = '';
  for (const match of raw.matchAll(marker)) {
    html += escapeHtml(raw.slice(cursor, match.index));
    html += renderAside(match[2], match[1].startsWith('put this'));
    cursor = match.index + match[0].length;
  }
  html += escapeHtml(raw.slice(cursor));
  return html
    .replaceAll('np.linalg', '<code>np.linalg</code>')
    .replaceAll('Kδ=P', '<code>Kδ=P</code>')
    .replaceAll('C(k)', '<em>C(k)</em>');
}

function renderWidget(spec) {
  return `<aside class="ce-demo ce-wide" aria-labelledby="ce-demo-${spec.mode}-title">
    <div class="ce-demo-heading">
      <p class="ce-demo-kicker">Interactive calibration case</p>
      <h3 id="ce-demo-${spec.mode}-title">${escapeHtml(spec.title)}</h3>
      <p>${escapeHtml(spec.caption)}</p>
    </div>
    <iframe loading="lazy" src="figures/calibration-bench.html?mode=${spec.mode}" title="${escapeHtml(spec.title)} interactive demonstration"></iframe>
  </aside>`;
}

async function renderDissertationFigure() {
  const imagePath = join(ROOT, 'figures', 'peters-he-dissertation.png');
  try {
    await access(imagePath, fsConstants.R_OK);
    return `<figure class="ce-figure ce-wide">
      <img src="figures/peters-he-dissertation.png" alt="Page from Harry Smith's dissertation comparing the Peters–He dynamic-wake implementation with Chengjian He's reference result" loading="lazy" />
      <figcaption>The code became believable when the reference oscillation appeared in the right place.</figcaption>
    </figure>`;
  } catch {
    return `<aside class="ce-asset-needed ce-wide" aria-label="Editorial asset still required">
      <p class="ce-asset-eyebrow">Private-draft asset gap</p>
      <h3>Dissertation page still needed</h3>
      <p>The source page is not in the repository or connected Drive. Add <code>figures/peters-he-dissertation.png</code> and rebuild; the renderer will replace this notice automatically.</p>
    </aside>`;
  }
}

function paragraphClass(text) {
  if (text === 'But struggling is not a verification method.' ||
      text === 'Which means the code was never the point. The instrument was.' ||
      text === 'That distinction is the part of the job I still have to own.' ||
      text === 'My errors live in the seams.') return 'ce-punch';
  if (text === 'Make it show me you can compare against a known result.') return 'ce-epiquote';
  if (text === 'I haven\'t lowered the bar. I\'ve moved where the work lives — from authorship to experiment.') return 'ce-punch ce-punch-wide';
  if (text === 'An abstraction layer is successfully formed when verifying its result becomes cheaper and easier than producing it yourself.') return 'ce-thesis';
  if (text === 'Not yet.') return 'ce-final';
  return '';
}

function sectionOpen(spec, first = false) {
  return `${first ? '' : '<div class="ce-divider" aria-hidden="true">✦</div>'}
  <section class="ce-section" id="${spec.id}" data-section="${spec.id}">
    ${first ? '' : `<header class="ce-section-head"><span>${spec.numeral}</span><div><p>${escapeHtml(spec.title)}</p><em>${escapeHtml(spec.stand)}</em></div></header>`}`;
}

function articleMap() {
  return `<nav class="ce-map" aria-label="Article map">
    ${SECTION_SPECS.map(spec => `<a href="#${spec.id}" data-map-link="${spec.id}"><span>${spec.numeral}</span>${escapeHtml(spec.title)}</a>`).join('\n')}
  </nav>`;
}

function buildShell(title, body, meta) {
  const revisionShort = String(meta.revisionId || 'unknown').slice(0, 12);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} — Aeronauty</title>
  <meta name="description" content="How a computational aerodynamicist moved trust from authorship to experiment — with working calibration cases for vortex elements, wakes and unsteady lift." />
  <meta name="author" content="Harry Smith" />
  <link rel="stylesheet" href="article.css" />
</head>
<body>
  <div class="ce-progress" aria-hidden="true"></div>
  ${articleMap()}
  <article class="ce-page">
    <header class="ce-hero">
      <div class="ce-narrow">
        <p class="ce-hero-kicker">Computational practice · private draft</p>
        <h1>${escapeHtml(title)}</h1>
        <p class="ce-hero-dek">How I stopped treating authorship as evidence and started treating code as an instrument.</p>
        <div class="ce-hero-meta"><span>Google Doc authoritative</span><span>Interactive essay</span><span>Revision ${escapeHtml(revisionShort)}</span></div>
      </div>
    </header>
    <main class="ce-prose ce-narrow">${body}</main>
    <footer class="ce-source ce-narrow">
      <div class="ce-source-grid"><div><strong>Prose source of truth:</strong> <a href="${escapeHtml(meta.documentUrl)}">Google Doc</a>. This HTML and <code>source.generated.txt</code> are generated derivatives; edit the Doc, then run <code>npm run sync:computational-experimentation</code>.</div><div>Doc revision<br><code>${escapeHtml(meta.revisionId || 'unknown')}</code></div></div>
    </footer>
  </article>
  <script src="article-runtime.js"></script>
</body>
</html>`;
}

async function main() {
  const source = (await readFile(SOURCE_PATH, 'utf8')).replace(/^\uFEFF/, '').trim();
  const meta = JSON.parse(await readFile(META_PATH, 'utf8'));
  const paragraphs = source.split(/\n\s*\n/).map(value => value.trim()).filter(Boolean);
  const title = paragraphs.shift();
  let sectionIndex = 0;
  let body = sectionOpen(SECTION_SPECS[sectionIndex], true);

  for (const paragraph of paragraphs) {
    if (paragraph === '— — —') {
      body += '</section>';
      sectionIndex += 1;
      body += sectionOpen(SECTION_SPECS[Math.min(sectionIndex, SECTION_SPECS.length - 1)]);
      continue;
    }

    const widget = WIDGETS.find(spec => paragraph.includes(spec.match));
    if (widget) {
      body += renderWidget(widget);
      continue;
    }
    if (paragraph.includes('Show the page of my dissertation')) {
      body += await renderDissertationFigure();
      continue;
    }
    if (paragraph.startsWith('[<') && paragraph.endsWith('>]')) {
      body += `<aside class="ce-asset-needed"><p class="ce-asset-eyebrow">Unrecognised editorial instruction</p><p>${escapeHtml(paragraph)}</p></aside>`;
      continue;
    }

    const className = paragraphClass(paragraph);
    body += `<p${className ? ` class="${className}"` : ''}>${renderInline(paragraph)}</p>`;
  }
  body += '</section>';

  const output = buildShell(title, body, meta);
  if (CHECK) {
    const existing = await readFile(OUTPUT_PATH, 'utf8').catch(() => '');
    if (existing !== output) {
      console.error('article.html is stale. Run node build_article.mjs and commit the result.');
      process.exit(1);
    }
    console.log('article.html matches source.generated.txt and source.json');
    return;
  }
  await writeFile(OUTPUT_PATH, output, 'utf8');
  console.log(`Wrote ${OUTPUT_PATH}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
