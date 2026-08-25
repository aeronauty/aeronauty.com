const SECTION_HEADINGS = [
  ['The instrument', 'The tools changed. The instinct did not.'],
  ['Calibration, not authorship', 'Make the computation answer to something already known.'],
  ['The bit I still have to own', 'A model can propose the test. It cannot own the epistemic debt.'],
  ['Standing on the layer', 'A mature abstraction is not magic. It is cheap to check.'],
  ['The shorter loop', 'Hypothesise, build, verify — with less waiting in the middle.'],
];

const escapeHtml = (value) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

function operatorPunSvg() {
  return `<span class="ce-operator-pun" aria-label="An entirely original robed operator beside a Nairobi skyline"><svg viewBox="0 0 220 94" role="img" aria-hidden="true"><defs><linearGradient id="ceSky" x1="0" x2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".07"/><stop offset="1" stop-color="currentColor" stop-opacity=".18"/></linearGradient></defs><rect width="220" height="94" rx="12" fill="url(#ceSky)"/><g fill="currentColor" opacity=".38"><rect x="122" y="49" width="13" height="30"/><rect x="139" y="39" width="15" height="40"/><rect x="159" y="54" width="10" height="25"/><rect x="173" y="31" width="18" height="48"/><rect x="196" y="47" width="12" height="32"/><path d="M181 31l1-15h2l2 15z"/></g><g transform="translate(30 10)" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="32" cy="19" r="9"/><path d="M24 30c-9 10-13 25-13 45h43c0-20-4-35-13-45"/><path d="M18 43l-12 18M46 43l16 15"/><path d="M62 58l20-31"/><path d="M78 29l8-8"/></g><text x="112" y="20" text-anchor="middle" font-family="ui-monospace, monospace" font-size="10" fill="currentColor" opacity=".72">OBI-WAN NAIROBI</text><text x="112" y="89" text-anchor="middle" font-family="ui-monospace, monospace" font-size="9" fill="currentColor" opacity=".62">still not that kind of operator</text></svg></span>`;
}

function renderInline(raw, state) {
  const tokens = [];
  const stash = (html) => {
    const token = `@@CE_TOKEN_${tokens.length}@@`;
    tokens.push([token, html]);
    return token;
  };

  let text = raw.replace(/\[<(?:put this in a little side callout|callout)>([\s\S]*?)\]/gi, (_match, body) => {
    state.aside += 1;
    const id = `ce-aside-${state.aside}`;
    let copy = body.trim();
    let art = '';
    if (/<add a pic of Obi-Wan-Nairobi>/i.test(copy)) {
      copy = copy.replace(/\s*<add a pic of Obi-Wan-Nairobi>\s*/i, ' ').trim();
      art = operatorPunSvg();
    }
    return stash(`<span class="ti-aside"><sup class="ti-aside-mark" tabindex="0" role="button" aria-label="Aside" aria-describedby="${id}">*</sup><span class="ti-aside-content" id="${id}" role="tooltip">${escapeHtml(copy)}${art}</span></span>`);
  });

  text = text.replace(/\[<fact-check([^>]*)>\]/gi, (_match, note) => stash(`<span class="ce-factcheck" title="Editorial fact-check">FACT CHECK · ${escapeHtml(note.trim() || 'Check before publication')}</span>`));

  let html = escapeHtml(text)
    .replace(/\bnp\.linalg\b/g, '<code>np.linalg</code>')
    .replace(/\bKδ=P\b/g, '<code>Kδ=P</code>')
    .replace(/\bC\(k\)\b/g, '<code>C(k)</code>')
    .replace(/\bRAG\b/g, '<abbr title="retrieval-augmented generation">RAG</abbr>');

  for (const [token, replacement] of tokens) html = html.replace(token, replacement);
  return html;
}

const labs = {
  'vortex-primitive': `<details class="ce-lab" open><summary><span class="ce-lab-title"><span class="ti-eyebrow">Calibration case 01</span>A single vortex element</span><span class="ce-lab-toggle">open / fold</span></summary><div class="ce-lab-copy">Drag the two endpoints and the interrogation point. The closed-form panel kernel is checked against direct numerical quadrature every time you move anything.</div><div class="ce-lab-stage"><div class="ce-widget-grid"><canvas class="ce-canvas" data-ce-vortex-single width="900" height="500" aria-label="Interactive single vortex panel"></canvas><div class="ce-controls"><label>Sheet strength γ <input data-ce-single-gamma type="range" min="-3" max="3" value="1" step="0.05"/></label><div class="ce-readout" data-ce-single-readout></div><p class="ce-small">The independent check is deliberately boring: 2,400 point vortices integrated along the element. Closed form versus brute force. Cheap to verify; daft to reproduce by hand.</p></div></div></div></details>`,
  'vortex-superposition': `<details class="ce-lab" open><summary><span class="ce-lab-title"><span class="ti-eyebrow">Calibration case 02</span>Superposition</span><span class="ce-lab-toggle">open / fold</span></summary><div class="ce-lab-copy">Two elements, two strengths, one interrogation point. The total vector should be exactly the sum of the two contributions — a seam simple enough to expose.</div><div class="ce-lab-stage"><div class="ce-widget-grid"><canvas class="ce-canvas" data-ce-vortex-double width="900" height="500" aria-label="Interactive superposition of two vortex panels"></canvas><div class="ce-controls"><label>Upper strength γ₁ <input data-ce-double-g1 type="range" min="-3" max="3" value="1.2" step="0.05"/></label><label>Lower strength γ₂ <input data-ce-double-g2 type="range" min="-3" max="3" value="-0.7" step="0.05"/></label><label>Point x <input data-ce-double-px type="range" min="0.1" max="0.9" value="0.56" step="0.01"/></label><label>Point y <input data-ce-double-py type="range" min="0.15" max="0.85" value="0.52" step="0.01"/></label><div class="ce-readout" data-ce-double-readout></div></div></div></div></details>`,
  'trailing-vorticity': `<details class="ce-lab" open><summary><span class="ce-lab-title"><span class="ti-eyebrow">Calibration case 03</span>A change in bound circulation has to trail</span><span class="ce-lab-toggle">open / fold</span></summary><div class="ce-lab-copy">Change the spanwise loading. The wake strength is the jump in bound circulation between neighbouring stations — the bookkeeping made visible.</div><div class="ce-lab-stage"><div class="ce-widget-grid"><canvas class="ce-canvas" data-ce-trailing width="900" height="520" aria-label="Spanwise loading and trailing vortex sheet"></canvas><div class="ce-controls"><label>Loading shape <select data-ce-trailing-shape><option value="elliptic">Elliptic</option><option value="bell">Bell-ish</option><option value="notched">Notched (bad idea, useful test)</option></select></label><label>Stations <input data-ce-trailing-n type="range" min="7" max="31" value="15" step="2"/></label><div class="ce-readout" data-ce-trailing-readout></div><p class="ce-small">The wake does not care that the loading curve looked smooth in PowerPoint. It cares about the discrete circulation changes the method actually produced.</p></div></div></div></details>`,
  'shed-vorticity': `<details class="ce-lab" open><summary><span class="ce-lab-title"><span class="ti-eyebrow">Calibration case 04</span>Time variation leaves a wake</span><span class="ce-lab-toggle">open / fold</span></summary><div class="ce-lab-copy">A sinusoidal bound circulation sheds signed vorticity into a convecting wake. Pause it, scrub the phase, and watch the past remain downstream.</div><div class="ce-lab-stage"><div class="ce-widget-grid"><canvas class="ce-canvas" data-ce-shed width="900" height="520" aria-label="Sinusoidal loading shedding vorticity into a wake"></canvas><div class="ce-controls"><label>Reduced frequency k <input data-ce-shed-k type="range" min="0.05" max="1.2" value="0.32" step="0.01"/></label><label>Phase <input data-ce-shed-phase type="range" min="0" max="6.283" value="0" step="0.01"/></label><button class="ce-button" type="button" data-ce-shed-play>Pause</button><div class="ce-readout" data-ce-shed-readout></div></div></div></div></details>`,
  'theodorsen-check': `<details class="ce-lab" open><summary><span class="ce-lab-title"><span class="ti-eyebrow">Calibration case 05</span>The 2D harmonic limit</span><span class="ce-lab-toggle">open / fold</span></summary><div class="ce-lab-copy">Theodorsen’s function is the known frequency response for attached, incompressible, two-dimensional harmonic motion. This is the sort of case a new unsteady method has to answer to before it gets anywhere near an aircraft.</div><div class="ce-lab-stage"><div class="ce-widget-grid"><canvas class="ce-canvas" data-ce-theodorsen width="900" height="520" aria-label="Interactive Theodorsen function plot"></canvas><div class="ce-controls"><label>Reduced frequency k <input data-ce-theodorsen-k type="range" min="0.01" max="1.5" value="0.25" step="0.01"/></label><div class="ce-readout" data-ce-theodorsen-readout></div><p class="ce-small">The plot evaluates the classical Hankel-function expression. At k→0, the circulatory response tends to the quasi-steady result. Then the amplitude falls and the phase lags.</p></div></div></div></details>`,
};

function markerName(raw) {
  if (/insert widget of a single vortex element/i.test(raw)) return 'vortex-primitive';
  if (/same widget.*two vortices/i.test(raw)) return 'vortex-superposition';
  if (/spanwise change in vorticity needs to trail/i.test(raw)) return 'trailing-vorticity';
  if (/sinusoidal loading.*shed vorticity/i.test(raw)) return 'shed-vorticity';
  if (/lift-curve slope of 2π.*Theodorsen/i.test(raw)) return 'theodorsen-check';
  if (/Show the page of my dissertation/i.test(raw)) return 'dissertation-page';
  return null;
}

function dissertationFigure() {
  return `<figure class="ce-dissertation" aria-labelledby="ce-dissertation-caption"><div class="ce-dissertation-page"><div class="ce-dissertation-header">PhD verification note · Peters–He dynamic wake</div><svg viewBox="0 0 760 360" role="img" aria-label="Reconstructed comparison of oscillatory blade loading"><defs><linearGradient id="cePaper" x1="0" x2="1"><stop offset="0" stop-color="#f7f4ec"/><stop offset="1" stop-color="#fff"/></linearGradient></defs><rect width="760" height="360" rx="6" fill="url(#cePaper)"/><g stroke="#d4d0c8" stroke-width="1"><path d="M70 45V305H720" fill="none"/><path d="M70 95H720M70 145H720M70 195H720M70 245H720" opacity=".65"/></g><path id="ce-thesis-ref" d="" fill="none" stroke="#22324a" stroke-width="4"/><path id="ce-thesis-model" d="" fill="none" stroke="#d14f3f" stroke-width="2.5" stroke-dasharray="9 7"/><g fill="#303844" font-family="Inter, sans-serif" font-size="13"><text x="395" y="338" text-anchor="middle">azimuth ψ</text><text x="20" y="175" transform="rotate(-90 20 175)" text-anchor="middle">normalised blade loading</text><text x="500" y="34">reference behaviour</text><text x="637" y="34" fill="#d14f3f">my implementation</text></g></svg></div><figcaption id="ce-dissertation-caption">A reconstruction of the comparison described in the prose. The original dissertation page is the one remaining source asset to drop into this slot; the article does not pretend this facsimile is the original.</figcaption></figure>`;
}

export function renderArticleBody(markdown) {
  const state = { aside: 0 };
  const cleaned = markdown.replace(/^<!--[^\n]*-->\s*/gm, '').replace(/^#\s+[^\n]+\n+/, '').trim();
  const paragraphs = cleaned.split(/\n\s*\n/);
  const output = [];
  let sectionIndex = 0;

  for (const paragraph of paragraphs) {
    const raw = paragraph.trim();
    if (!raw) continue;
    if (raw === '— — —') {
      const section = SECTION_HEADINGS[sectionIndex++] ?? [`Section ${sectionIndex}`, ''];
      output.push(`<div class="ti-divider" aria-hidden="true">✦</div><section class="ti-section" id="section-${sectionIndex}"><span class="ti-section-numeral" aria-hidden="true">0${sectionIndex}</span><h2>${section[0]}</h2><p class="ti-section-stand">${section[1]}</p></section>`);
      continue;
    }

    const marker = raw.match(/^\[<([\s\S]+)>\]$/);
    if (marker) {
      const name = markerName(marker[1]);
      if (name === 'dissertation-page') output.push(dissertationFigure());
      else if (name && labs[name]) output.push(labs[name]);
      else output.push(`<div class="ce-unresolved">Unresolved build instruction: ${escapeHtml(marker[1])}</div>`);
      continue;
    }

    const html = renderInline(raw, state);
    if (['But struggling is not a verification method.', 'Which means the code was never the point. The instrument was.', 'Make it show me you can compare against a known result.', 'My errors live in the seams.'].includes(raw)) {
      output.push(`<aside class="ti-epiquote"><p>${html}</p></aside>`);
    } else if (raw === 'An abstraction layer is successfully formed when verifying its result becomes cheaper and easier than producing it yourself.') {
      output.push(`<aside class="ti-thesis"><span class="ti-eyebrow">The diagnostic</span><p>${html}</p></aside>`);
    } else {
      output.push(`<p>${html}</p>`);
    }
  }
  return output.join('\n');
}

export async function renderArticle() {
  const article = document.querySelector('#ce-article');
  if (!article) throw new Error('Missing #ce-article host');
  const [sourceResponse, metadataResponse] = await Promise.all([
    fetch('article-source.md', { cache: 'no-store' }),
    fetch('source-metadata.json', { cache: 'no-store' }),
  ]);
  if (!sourceResponse.ok) throw new Error(`Could not load article source (${sourceResponse.status})`);
  article.innerHTML = renderArticleBody(await sourceResponse.text());
  if (metadataResponse.ok) {
    const metadata = await metadataResponse.json();
    const note = document.querySelector('#ce-source-note');
    if (note) {
      const modified = metadata.sourceModifiedTime?.slice(0, 10) ?? 'unknown date';
      const hash = metadata.sourceSha256?.slice(0, 12) ?? 'unknown snapshot';
      note.textContent = `Google Doc source · ${modified} · snapshot ${hash}`;
    }
  }
}
