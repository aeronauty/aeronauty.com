const SOURCE_URL = './source.generated.txt';
const META_URL = './source.json';

const sectionMeta = [
  {
    id: 'the-suspicion',
    numeral: '00',
    label: 'The suspicion',
    stand: 'Why machine-written code felt like cheating, even when the aerodynamics did not.'
  },
  {
    id: 'the-instrument',
    numeral: '01',
    label: 'The instrument',
    stand: 'The tools changed. The instinct to make a relationship tangible did not.'
  },
  {
    id: 'calibration',
    numeral: '02',
    label: 'Calibration',
    stand: 'Make the primitive answer to a result you already know.'
  },
  {
    id: 'the-judgement',
    numeral: '03',
    label: 'The judgement',
    stand: 'The model can propose a test. I still have to own what the test means.'
  },
  {
    id: 'the-name',
    numeral: '04',
    label: 'The name',
    stand: 'Computational describes the medium. Compositional describes the risk.'
  },
  {
    id: 'the-bargain',
    numeral: '05',
    label: 'The bargain',
    stand: 'The loop is shorter. The standard is not.'
  }
];

const esc = value => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

let asideCounter = 0;

function tinyOperatorArt() {
  return `<span class="ce-mini-art" role="img" aria-label="A deliberately terrible Obi-Wan Nairobi operator pun">
    <span class="ce-mini-hood">∂</span><span class="ce-mini-city">NAIROBI</span>
  </span>`;
}

function renderAside(body, wide = false) {
  asideCounter += 1;
  const id = `ce-aside-${asideCounter}`;
  const hasOperatorArt = /<add a pic of Obi-Wan-Nairobi>/i.test(body);
  const cleanBody = body.replace(/<add a pic of Obi-Wan-Nairobi>/gi, '').trim();
  return `<span class="ce-aside${wide ? ' ce-aside-wide' : ''}">
    <button class="ce-aside-mark" type="button" aria-expanded="false" aria-controls="${id}" aria-label="Open aside">*</button>
    <span class="ce-aside-content" id="${id}" role="note">${esc(cleanBody)}${hasOperatorArt ? tinyOperatorArt() : ''}</span>
  </span>`;
}

function renderInline(text) {
  const re = /\[<(put this in a little side callout|callout)>([\s\S]*?)\]/gi;
  let cursor = 0;
  let html = '';
  for (const match of text.matchAll(re)) {
    html += esc(text.slice(cursor, match.index));
    html += renderAside(match[2], match[1].toLowerCase().startsWith('put'));
    cursor = match.index + match[0].length;
  }
  html += esc(text.slice(cursor));

  return html
    .replace(/\bnp\.linalg\b/g, '<code>np.linalg</code>')
    .replace(/\bKδ=P\b/g, '<code>Kδ=P</code>')
    .replace(/\bC\(k\)\b/g, '<code>C(k)</code>')
    .replace(/\b2π\b/g, '<code>2π</code>');
}

function widgetShell({ id, eyebrow, title, copy, canvas, controls, trust }) {
  return `<aside class="ce-widget" id="${id}">
    <header class="ce-widget-head">
      <p>${eyebrow}</p>
      <h3>${title}</h3>
      <div>${copy}</div>
    </header>
    <div class="ce-widget-grid">
      <div class="ce-canvas-wrap">${canvas}</div>
      <div class="ce-widget-controls">${controls}<p class="ce-trust-case"><strong>What this checks.</strong> ${trust}</p></div>
    </div>
  </aside>`;
}

function widgetSingle() {
  return widgetShell({
    id: 'vortex-primitive',
    eyebrow: 'Calibration bench · 01',
    title: 'One vortex segment. Two calculations.',
    copy: 'Drag the two endpoints and the interrogation point. The arrow is the closed-form finite-segment result; the readout checks it independently by quadrature.',
    canvas: '<canvas data-ce-vortex-single aria-label="Draggable finite vortex-segment calibration"></canvas>',
    controls: `<label>Circulation Γ <input data-ce-single-gamma type="range" min="-2" max="2" step="0.05" value="1" /></label>
      <pre data-ce-single-readout>Initialising independent check…</pre>`,
    trust: 'The finite-segment kernel against numerical integration of the same Biot–Savart law. Move the geometry until the check gets uncomfortable.'
  });
}

function widgetDouble() {
  return widgetShell({
    id: 'vortex-superposition',
    eyebrow: 'Calibration bench · 02',
    title: 'Superposition should be boring.',
    copy: 'Two elements, two induced velocities and their vector sum. If this is surprising, the rest of the panel code has no chance.',
    canvas: '<canvas data-ce-vortex-double aria-label="Two draggable vortex segments and their summed induced velocity"></canvas>',
    controls: `<label>Γ₁ <input data-ce-double-g1 type="range" min="-2" max="2" step="0.05" value="1" /></label>
      <label>Γ₂ <input data-ce-double-g2 type="range" min="-2" max="2" step="0.05" value="-0.65" /></label>
      <label>P x <input data-ce-double-px type="range" min="0.08" max="0.92" step="0.01" value="0.56" /></label>
      <label>P y <input data-ce-double-py type="range" min="0.08" max="0.92" step="0.01" value="0.58" /></label>
      <pre data-ce-double-readout>Initialising superposition…</pre>`,
    trust: 'Linearity at the primitive boundary. Each contribution remains visible, rather than disappearing into one plausible-looking answer.'
  });
}

function widgetTrailing() {
  return widgetShell({
    id: 'trailing-vorticity',
    eyebrow: 'Calibration bench · 03',
    title: 'A spanwise change in Γ has to go somewhere.',
    copy: 'Change the bound-circulation distribution. The wake filaments are the discrete changes between stations, including the jumps to zero at the tips.',
    canvas: '<canvas data-ce-trailing aria-label="Trailing-vorticity construction from a spanwise circulation distribution"></canvas>',
    controls: `<label>Loading shape
        <select data-ce-trailing-shape>
          <option value="elliptic">Elliptic</option>
          <option value="bell">Bell-ish</option>
          <option value="notched">Centre notch</option>
        </select>
      </label>
      <label>Spanwise stations <input data-ce-trailing-n type="range" min="7" max="31" step="2" value="15" /></label>
      <pre data-ce-trailing-readout>Building wake bookkeeping…</pre>`,
    trust: 'The discrete Helmholtz bookkeeping: changes in bound circulation become trailed circulation, and the full set closes.'
  });
}

function widgetShed() {
  return widgetShell({
    id: 'shed-vorticity',
    eyebrow: 'Calibration bench · 04',
    title: 'The wake keeps the receipt.',
    copy: 'Oscillate the bound circulation. Each increment shed downstream carries the opposite bookkeeping entry, so the past remains in the flow after the wing has moved on.',
    canvas: '<canvas data-ce-shed aria-label="Animated shed-vorticity wake for sinusoidal bound circulation"></canvas>',
    controls: `<label>Reduced-frequency-like knob <input data-ce-shed-k type="range" min="0.05" max="1" step="0.01" value="0.28" /></label>
      <label>Phase <input data-ce-shed-phase type="range" min="0" max="6.283185" step="0.01" value="0.7" /></label>
      <button class="ce-button" data-ce-shed-play type="button">Pause</button>
      <pre data-ce-shed-readout>Convecting the wake…</pre>`,
    trust: 'The local conservation statement between a change in bound circulation and the circulation shed into the wake. It is not yet a full unsteady-airfoil solution.'
  });
}

function widgetTheodorsen() {
  return widgetShell({
    id: 'theodorsen-check',
    eyebrow: 'Calibration bench · 05',
    title: 'Then make the assembled model answer to Theodorsen.',
    copy: 'The final check is no longer one primitive. It is whether the two-dimensional harmonic model reproduces the known complex wake response across reduced frequency.',
    canvas: '<canvas data-ce-theodorsen data-ce-theodorsen-chart data-ce-theodorsen-plot data-ce-ck aria-label="Theodorsen function magnitude and phase across reduced frequency"></canvas>',
    controls: `<label>Reduced frequency k <input data-ce-theodorsen-k data-ce-ck-k type="range" min="0.01" max="2" step="0.01" value="0.20" /></label>
      <pre data-ce-theodorsen-readout data-ce-ck-readout>Loading exact reference anchors…</pre>`,
    trust: 'The assembled attached-flow, two-dimensional harmonic response against exact values from the Hankel-function definition. Passing it does not certify viscosity, separation or three-dimensional flow.'
  });
}

function dissertationGap() {
  return `<figure class="ce-asset-gap">
    <div class="ce-asset-gap-page" aria-hidden="true"><span>PhD</span><i></i><i></i><i></i><b>figure pending</b></div>
    <figcaption><strong>Source figure not found in the connected files.</strong> The article is wired to use <code>figures/peters-he-dissertation.png</code>; until that page is supplied, the private preview says so rather than inventing one.</figcaption>
  </figure>`;
}

function directive(text) {
  const compact = text.replace(/\s+/g, ' ').trim();
  if (/^\[<insert widget of a single vortex element/i.test(compact)) return widgetSingle();
  if (/^\[<same widget/i.test(compact)) return widgetDouble();
  if (/^\[<Show the algorithm for how any spanwise change/i.test(compact)) return widgetTrailing();
  if (/^\[<Have a sinusoidal loading/i.test(compact)) return widgetShed();
  if (/^\[<Show a 2D case .*Theodorsen/i.test(compact)) return widgetTheodorsen();
  if (/^\[<Show the page of my dissertation/i.test(compact)) return dissertationGap();
  return null;
}

const pullQuotes = new Set([
  'But struggling is not a verification method.',
  'Which means the code was never the point. The instrument was.',
  'Make it show me you can compare against a known result.',
  'My errors live in the seams.',
  "I haven't lowered the bar. I've moved where the work lives — from authorship to experiment."
]);

function renderParagraph(text) {
  const replacement = directive(text);
  if (replacement) return replacement;

  if (text.startsWith('An abstraction layer is successfully formed')) {
    return `<blockquote class="ce-thesis"><span>The diagnostic</span><p>${renderInline(text)}</p></blockquote>`;
  }
  if (text === 'Not yet.') return `<p class="ce-final-beat">Not yet.</p>`;
  if (pullQuotes.has(text)) return `<blockquote class="ce-pull"><p>${renderInline(text)}</p></blockquote>`;
  if (/^I start with the primitives\.?$/.test(text)) return `<p class="ce-lead-line">${renderInline(text)}</p>`;
  return `<p class="ce-paragraph">${renderInline(text)}</p>`;
}

function splitSections(source) {
  const paragraphs = source
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map(value => value.trim())
    .filter(Boolean);

  if (paragraphs[0]?.toLowerCase() === 'computational experimentation') paragraphs.shift();

  const sections = [[]];
  for (const paragraph of paragraphs) {
    if (paragraph === '— — —' || paragraph === '---') sections.push([]);
    else sections.at(-1).push(paragraph);
  }
  return sections;
}

function renderSection(paragraphs, index) {
  const meta = sectionMeta[index] || {
    id: `section-${index + 1}`,
    numeral: String(index).padStart(2, '0'),
    label: `Section ${index + 1}`,
    stand: ''
  };
  return `<section class="ce-section" id="${meta.id}" data-ce-section>
    <header class="ce-section-open">
      <span>${meta.numeral}</span>
      <div><p>${meta.label}</p><h2>${meta.stand}</h2></div>
    </header>
    ${paragraphs.map(renderParagraph).join('\n')}
  </section>`;
}

function wireAsides() {
  for (const button of document.querySelectorAll('.ce-aside-mark')) {
    const content = document.getElementById(button.getAttribute('aria-controls'));
    const close = () => {
      button.setAttribute('aria-expanded', 'false');
      content?.classList.remove('is-open');
    };
    button.addEventListener('click', event => {
      event.stopPropagation();
      const open = button.getAttribute('aria-expanded') === 'true';
      document.querySelectorAll('.ce-aside-mark[aria-expanded="true"]').forEach(other => {
        if (other !== button) other.click();
      });
      button.setAttribute('aria-expanded', String(!open));
      content?.classList.toggle('is-open', !open);
    });
    button.addEventListener('keydown', event => {
      if (event.key === 'Escape') close();
    });
  }
  document.addEventListener('click', event => {
    if (event.target.closest?.('.ce-aside')) return;
    document.querySelectorAll('.ce-aside-mark[aria-expanded="true"]').forEach(button => button.click());
  });
}

function wireMap(sections) {
  const map = document.querySelector('[data-ce-map]');
  map.innerHTML = sections.map((_, index) => {
    const meta = sectionMeta[index];
    return `<li><a href="#${meta.id}" data-ce-map-link="${meta.id}"><span>${meta.numeral}</span>${meta.label}</a></li>`;
  }).join('');

  const links = new Map([...document.querySelectorAll('[data-ce-map-link]')].map(link => [link.dataset.ceMapLink, link]));
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      links.forEach(link => link.classList.remove('is-active'));
      links.get(entry.target.id)?.classList.add('is-active');
    }
  }, { rootMargin: '-22% 0px -66% 0px', threshold: 0 });
  document.querySelectorAll('[data-ce-section]').forEach(section => observer.observe(section));
}

function wireProgress() {
  const bar = document.querySelector('[data-ce-progress]');
  const update = () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    const ratio = max > 0 ? scrollY / max : 0;
    bar.style.transform = `scaleX(${Math.max(0, Math.min(1, ratio))})`;
  };
  addEventListener('scroll', update, { passive: true });
  addEventListener('resize', update);
  update();
}

function normalizeTheodorsen(raw) {
  const candidates = Array.isArray(raw)
    ? raw
    : raw.points || raw.samples || raw.data || raw.values || [];
  return candidates.map(row => ({
    k: Number(row.k ?? row.reducedFrequency ?? row.x),
    real: Number(row.real ?? row.F ?? row.re ?? row.cReal),
    imag: Number(row.imag ?? row.G ?? row.im ?? row.cImag)
  })).filter(row => Number.isFinite(row.k) && Number.isFinite(row.real) && Number.isFinite(row.imag));
}

async function theodorsenFallback() {
  const canvas = document.querySelector('[data-ce-theodorsen]');
  const input = document.querySelector('[data-ce-theodorsen-k]');
  const readout = document.querySelector('[data-ce-theodorsen-readout]');
  if (!canvas || !input || !readout || !/^Loading|^Initialising/.test(readout.textContent.trim())) return;

  const raw = await fetch('./assets/theodorsen-data.json').then(response => response.ok ? response.json() : null).catch(() => null);
  const rows = normalizeTheodorsen(raw || {});
  if (rows.length < 2) {
    readout.textContent = 'Exact reference table unavailable in this preview.';
    return;
  }

  const draw = () => {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(2, devicePixelRatio || 1);
    const width = Math.max(320, rect.width);
    const height = Math.max(250, rect.height || 360);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const pad = { l: 52, r: 24, t: 24, b: 42 };
    const x = k => pad.l + (Math.log10(k) - Math.log10(rows[0].k)) / (Math.log10(rows.at(-1).k) - Math.log10(rows[0].k)) * (width - pad.l - pad.r);
    const y = value => pad.t + (1.05 - value) / 1.15 * (height - pad.t - pad.b);
    const styles = getComputedStyle(document.documentElement);
    const grid = styles.getPropertyValue('--ti-border').trim() || '#2a3850';
    const fg = styles.getPropertyValue('--ti-fg-dim').trim() || '#9aa9bd';
    const a = styles.getPropertyValue('--ti-accent').trim() || '#35cbe8';
    const b = styles.getPropertyValue('--ti-accent-3').trim() || '#ff7a90';

    ctx.strokeStyle = grid;
    ctx.lineWidth = 1;
    for (const value of [0, .25, .5, .75, 1]) {
      ctx.beginPath(); ctx.moveTo(pad.l, y(value)); ctx.lineTo(width - pad.r, y(value)); ctx.stroke();
    }
    const trace = (key, colour) => {
      ctx.strokeStyle = colour; ctx.lineWidth = 3; ctx.beginPath();
      rows.forEach((row, index) => {
        const py = key === 'mag' ? Math.hypot(row.real, row.imag) : row.real;
        if (index) ctx.lineTo(x(row.k), y(py)); else ctx.moveTo(x(row.k), y(py));
      });
      ctx.stroke();
    };
    trace('real', a); trace('mag', b);

    const target = Number(input.value);
    const nearest = rows.reduce((best, row) => Math.abs(row.k - target) < Math.abs(best.k - target) ? row : best, rows[0]);
    const px = x(nearest.k);
    ctx.strokeStyle = '#ffffff'; ctx.globalAlpha = .5; ctx.beginPath(); ctx.moveTo(px, pad.t); ctx.lineTo(px, height - pad.b); ctx.stroke(); ctx.globalAlpha = 1;
    ctx.fillStyle = fg; ctx.font = '600 12px Inter, system-ui';
    ctx.fillText('Re C(k)', pad.l + 8, 18); ctx.fillStyle = a; ctx.fillRect(pad.l - 8, 10, 10, 3);
    ctx.fillStyle = fg; ctx.fillText('|C(k)|', pad.l + 96, 18); ctx.fillStyle = b; ctx.fillRect(pad.l + 80, 10, 10, 3);
    ctx.fillStyle = fg; ctx.fillText('reduced frequency k (log scale)', width / 2 - 90, height - 10);

    const magnitude = Math.hypot(nearest.real, nearest.imag);
    const phase = Math.atan2(nearest.imag, nearest.real) * 180 / Math.PI;
    readout.textContent = `k       : ${nearest.k.toFixed(3)}\nC(k)    : ${nearest.real.toFixed(5)} ${nearest.imag < 0 ? '−' : '+'} ${Math.abs(nearest.imag).toFixed(5)}i\n|C(k)|  : ${magnitude.toFixed(5)}\nphase   : ${phase.toFixed(2)}°\nreference: exact table`;
  };
  input.addEventListener('input', draw);
  addEventListener('resize', draw);
  draw();
}

async function main() {
  const [source, meta] = await Promise.all([
    fetch(SOURCE_URL).then(response => {
      if (!response.ok) throw new Error(`Source fetch failed: ${response.status}`);
      return response.text();
    }),
    fetch(META_URL).then(response => response.ok ? response.json() : null).catch(() => null)
  ]);

  const sections = splitSections(source);
  const root = document.getElementById('article-root');
  root.innerHTML = sections.map(renderSection).join('\n');

  if (meta?.revisionId) {
    const revision = document.querySelector('[data-ce-revision]');
    revision.textContent = `· revision ${String(meta.revisionId).slice(0, 10)}…`;
    revision.title = meta.revisionId;
  }

  wireAsides();
  wireMap(sections);
  wireProgress();

  await import('./article.js');
  setTimeout(theodorsenFallback, 80);
}

main().catch(error => {
  console.error(error);
  document.getElementById('article-root').innerHTML = `<section class="ce-load-error"><p class="ce-kicker">Source error</p><h2>The prose did not load.</h2><p>${esc(error.message)}</p><p>The Google Doc remains the source of truth; this generated preview needs to be re-synchronised.</p></section>`;
});
