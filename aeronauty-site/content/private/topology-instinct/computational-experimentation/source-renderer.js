(() => {
  const root = document.getElementById('ce-root');
  if (!root) return;

  const SOURCE_URL = 'article-source.md';
  const META_URL = 'source-metadata.json';
  const sectionDefs = [
    ['00', 'The suspicion', 'Authorship feels like evidence because suffering is memorable.'],
    ['01', 'The instrument', 'The tools changed. The instinct did not.'],
    ['02', 'Calibration', 'A known load, a known answer, and a much cheaper route to trust.'],
    ['03', 'The judgement', 'The machine can help find the case. It cannot own the epistemic debt.'],
    ['04', 'The name', 'Computational describes the medium. Compositional describes the risk.'],
    ['05', 'The bargain', 'Production got cheap before the corresponding practice of trust did.'],
  ];

  const escapeHtml = (value = '') => String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

  function normaliseSource(source) {
    return source
      .replace(/^<!--[^\n]*-->\s*/m, '')
      .replace(/\\\[/g, '[')
      .replace(/\\\]/g, ']')
      .replace(/\\</g, '<')
      .replace(/\\>/g, '>')
      .replace(/\r\n?/g, '\n')
      .trim();
  }

  function operatorAside() {
    return `<span class="ti-aside ce-op-aside"><sup class="ti-aside-mark" tabindex="0" role="button" aria-label="Operator aside">*</sup><span class="ti-aside-content" role="tooltip"><svg viewBox="0 0 320 190" aria-label="A caped operator standing beside an absurdly serious curve"><path d="M28 145 C72 48 128 43 190 130 C225 178 272 90 302 45" fill="none" stroke="currentColor" stroke-width="5"/><circle cx="120" cy="63" r="17" fill="none" stroke="currentColor" stroke-width="4"/><path d="M120 80 L117 129 M117 93 L84 115 M117 95 L153 113 M117 129 L91 164 M117 129 L145 164 M102 84 L74 150 L120 131 Z" fill="none" stroke="currentColor" stroke-width="4"/></svg><strong>Not the cool kind.</strong><br/>Though this one does at least have a cape.</span></span>`;
  }

  function inlineMarkup(raw) {
    let text = escapeHtml(raw);
    text = text.replace(/\[&lt;(?:callout|put this in a little side callout)&gt;([\s\S]*?)\]/g, (_match, body) => {
      const decoded = body.replace(/&lt;add a pic of Obi-Wan-Nairobi&gt;/g, '').trim();
      if (body.includes('add a pic of Obi-Wan-Nairobi')) return operatorAside();
      return `<span class="ti-aside"><sup class="ti-aside-mark" tabindex="0" role="button" aria-label="Aside">*</sup><span class="ti-aside-content" role="tooltip">${decoded}</span></span>`;
    });
    text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
    text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/_([^_]+)_/g, '<em>$1</em>');
    return text;
  }

  function widget(kind) {
    if (kind === 'single') return `<details class="ce-lab" open><summary><span class="ce-lab-title"><span class="ti-eyebrow">Calibration laboratory · 01</span>A single vortex element</span><span class="ce-lab-toggle">drag A, B and P</span></summary><p class="ce-lab-copy">The coloured vector is the closed-form panel kernel. The number beside it is checked against an independent midpoint Biot–Savart quadrature over the same finite segment. The visible toy and the automated acceptance test use the same numerical primitive.</p><div class="ce-lab-stage"><div class="ce-widget-grid"><canvas class="ce-canvas" data-ce-vortex-single></canvas><div class="ce-controls"><label>Vortex-sheet strength Γ′<input data-ce-single-gamma type="range" min="-2" max="2" step="0.02" value="1"></label><pre class="ce-readout" data-ce-single-readout></pre><p class="ce-small">Drag the endpoints or interrogation point. The check gets unpleasant near the singular line because physics remains stubbornly unwilling to become a UI feature.</p></div></div></div></details>`;
    if (kind === 'double') return `<details class="ce-lab"><summary><span class="ce-lab-title"><span class="ti-eyebrow">Calibration laboratory · 02</span>Superposition, made visible</span><span class="ce-lab-toggle">expand</span></summary><p class="ce-lab-copy">Two individually tested primitives should add linearly. Move the interrogation point and change either strength; the resultant is the explicit vector sum, not another hidden solver.</p><div class="ce-lab-stage"><div class="ce-widget-grid"><canvas class="ce-canvas" data-ce-vortex-double></canvas><div class="ce-controls"><label>Γ′₁<input data-ce-double-g1 type="range" min="-2" max="2" step="0.02" value="1.1"></label><label>Γ′₂<input data-ce-double-g2 type="range" min="-2" max="2" step="0.02" value="-0.7"></label><label>Pₓ<input data-ce-double-px type="range" min="0.05" max="0.95" step="0.01" value="0.55"></label><label>Pᵧ<input data-ce-double-py type="range" min="0.05" max="0.95" step="0.01" value="0.58"></label><pre class="ce-readout" data-ce-double-readout></pre></div></div></div></details>`;
    if (kind === 'trailing') return `<details class="ce-lab"><summary><span class="ce-lab-title"><span class="ti-eyebrow">Calibration laboratory · 03</span>Where spanwise Γ changes, vorticity trails</span><span class="ce-lab-toggle">expand</span></summary><p class="ce-lab-copy">A discretised bound-circulation distribution is a ledger of jumps. Each jump leaves a trailing filament. Include the tips and the whole circulation ledger closes to zero.</p><div class="ce-lab-stage"><div class="ce-widget-grid"><canvas class="ce-canvas" data-ce-trailing></canvas><div class="ce-controls"><label>Loading shape<select data-ce-trailing-shape><option value="elliptic">Elliptic</option><option value="bell">Bell-ish</option><option value="notched">Notched centre</option></select></label><label>Spanwise stations<input data-ce-trailing-n type="range" min="7" max="35" step="2" value="17"></label><pre class="ce-readout" data-ce-trailing-readout></pre></div></div></div></details>`;
    if (kind === 'shed') return `<details class="ce-lab"><summary><span class="ce-lab-title"><span class="ti-eyebrow">Calibration laboratory · 04</span>Shed vorticity is memory</span><span class="ce-lab-toggle">expand</span></summary><p class="ce-lab-copy">Change the bound circulation and an equal-and-opposite circulation entry is shed into the wake. The dots downstream are not decoration; they are the past still acting on the present.</p><div class="ce-lab-stage"><div class="ce-widget-grid"><canvas class="ce-canvas" data-ce-shed></canvas><div class="ce-controls"><label>Reduced frequency k<input data-ce-shed-k type="range" min="0.05" max="1.2" step="0.01" value="0.28"></label><label>Phase<input data-ce-shed-phase type="range" min="0" max="6.283" step="0.01" value="0.6"></label><button class="ce-button" type="button" data-ce-shed-play>Pause</button><pre class="ce-readout" data-ce-shed-readout></pre></div></div></div></details>`;
    if (kind === 'theodorsen') return `<details class="ce-lab" open><summary><span class="ce-lab-title"><span class="ti-eyebrow">Calibration laboratory · 05</span>Make the wake answer to Theodorsen</span><span class="ce-lab-toggle">canonical result</span></summary><p class="ce-lab-copy">For harmonic attached-flow motion, the wake-memory operator collapses into the complex function C(k). Matching its magnitude and phase is a much harder test than producing a pretty pressure plot.</p><div class="ce-lab-stage"><div class="ce-widget-grid"><canvas class="ce-canvas" data-ce-theodorsen></canvas><div class="ce-controls"><label>Reduced frequency k<input data-ce-theodorsen-k type="range" min="0.01" max="1.5" step="0.01" value="0.28"></label><pre class="ce-readout" data-ce-theodorsen-readout></pre><p class="ce-small">The plot shows F(k), −G(k) and |C(k)| from the Hankel-function definition. It is a reference case, not a universal certificate for unsteady aerodynamics.</p></div></div></div></details>`;
    if (kind === 'phd') return `<aside class="ce-archive-note"><div><p class="ti-eyebrow">PhD comparison · schematic reconstruction</p><h3>The same oscillation, in the same place</h3><p>The original dissertation page is not in the connected source set, so this is deliberately labelled as a reconstruction rather than passed off as an archival scan. Replace it with the real page when the asset turns up.</p></div><div><canvas class="ce-canvas" data-ce-phd style="height:290px"></canvas><div class="ce-controls" style="border-top:0"><label>What the comparison is asking<select data-ce-phd-mode><option value="match">Known oscillation reproduced</option><option value="limit">Requested phase lag absent</option></select></label><pre class="ce-readout" data-ce-phd-readout></pre></div></div></aside>`;
    return `<aside class="ce-archive-note"><div><p class="ti-eyebrow">Draft instruction</p><h3>Unrecognised article instruction</h3><p>The Google Doc contains an instruction the renderer does not yet understand. It has been surfaced rather than silently dropped.</p></div><div class="ce-archive-placeholder">${escapeHtml(kind)}</div></aside>`;
  }

  function thesis() {
    return `<aside class="ce-thesis"><div class="ce-thesis-grid"><div class="ce-thesis-figure"><svg viewBox="0 0 800 350" role="img" aria-label="A reference trace and a nearly coincident model trace"><path d="M45 175 H755" stroke="var(--ti-border)"/><path id="ce-thesis-ref" fill="none" stroke="var(--ti-fg-faint)" stroke-width="12" opacity=".42"/><path id="ce-thesis-model" fill="none" stroke="var(--ti-accent)" stroke-width="4"/><text x="70" y="44" fill="var(--ti-fg-dim)" font-family="Inter,sans-serif" font-size="20">known behaviour</text><text x="565" y="320" fill="var(--ti-accent)" font-family="Inter,sans-serif" font-size="20">your instrument</text></svg></div><div class="ce-thesis-copy"><p class="ti-eyebrow">The diagnostic</p><blockquote>An abstraction layer is successfully formed when verifying its result becomes cheaper and easier than producing it yourself.</blockquote><p>Not a proof that the layer can never fail. A practical test for whether engineers can stand on it.</p></div></div></aside>`;
  }

  function markerKind(text) {
    const lower = text.toLowerCase();
    if (lower.includes('single vortex element')) return 'single';
    if (lower.includes('same widget')) return 'double';
    if (lower.includes('spanwise change')) return 'trailing';
    if (lower.includes('sinusoidal loading')) return 'shed';
    if (lower.includes('theodorsen')) return 'theodorsen';
    if (lower.includes('page of my dissertation')) return 'phd';
    return text;
  }

  function renderParagraph(text) {
    const trimmed = text.trim();
    const marker = trimmed.match(/^\[<([\s\S]+)>\]$/);
    if (marker) return widget(markerKind(marker[1]));
    if (trimmed === 'But struggling is not a verification method.' || trimmed === 'Which means the code was never the point. The instrument was.') {
      return `<aside class="ti-epiquote"><p>${inlineMarkup(trimmed)}</p></aside>`;
    }
    if (trimmed === 'An abstraction layer is successfully formed when verifying its result becomes cheaper and easier than producing it yourself.') return thesis();
    if (trimmed === 'Not yet.') return `<p class="ti-final">Not yet.</p>`;
    return `<p>${inlineMarkup(trimmed).replaceAll('\n', '<br/>')}</p>`;
  }

  function renderSection(text, index) {
    const paragraphs = text.trim().split(/\n\s*\n/).filter(Boolean);
    const body = paragraphs.map(renderParagraph).join('\n');
    if (index === 0) return body;
    const [number, title, stand] = sectionDefs[index] || [String(index).padStart(2, '0'), `Section ${index}`, ''];
    return `<div class="ti-divider" aria-hidden="true">✦</div><section class="ti-section"><span class="ti-section-numeral">${number}</span><h2>${title}</h2><p class="ti-section-stand">${stand}</p></section>${body}`;
  }

  function articleShell(title, sections, metadata) {
    const sourceTime = metadata?.sourceModifiedTime ? new Date(metadata.sourceModifiedTime).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : 'unknown';
    return `<div class="ti-page"><div class="ti-progress" aria-hidden="true"></div><header class="ti-mast"><a class="ti-mast-brand" href="/lab/writing">Aeronauty · Private writing</a><span>Computational aerodynamics · verification · AI</span></header><section class="ti-hero"><canvas id="ce-hero-canvas" aria-hidden="true"></canvas><div class="ti-hero-copy"><p class="ti-kicker">An essay about moving trust from authorship to experiment</p><h1>${escapeHtml(title)}</h1><p class="ti-hero-dek">What changes when code becomes cheap to produce, but the right experiment remains expensive to design?</p></div></section><main class="ti-prose ti-narrow">${sections.map(renderSection).join('\n')}<footer class="ti-foot"><span>Prose source: Google Doc · synced ${escapeHtml(sourceTime)}</span><a href="https://docs.google.com/document/d/1Kr4WRmlAJeHkxZPBLpQl3Wz2U2rHTvRkh3a8EDhLMEs/edit?tab=t.0">Open source document</a></footer></main></div>`;
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.body.appendChild(script);
    });
  }

  async function start() {
    const [sourceResponse, metadataResponse] = await Promise.all([
      fetch(SOURCE_URL, { cache: 'no-store' }),
      fetch(META_URL, { cache: 'no-store' }).catch(() => null),
    ]);
    if (!sourceResponse.ok) throw new Error(`Could not load ${SOURCE_URL}: ${sourceResponse.status}`);
    const source = normaliseSource(await sourceResponse.text());
    const metadata = metadataResponse?.ok ? await metadataResponse.json() : null;
    const lines = source.split('\n');
    const titleLine = lines.findIndex((line) => line.startsWith('# '));
    const title = titleLine >= 0 ? lines[titleLine].slice(2).trim() : 'Computational Experimentation';
    const body = lines.slice(titleLine + 1).join('\n').trim();
    const sections = body.split(/^— — —$/m);
    root.innerHTML = articleShell(title, sections, metadata);
    await loadScript('vortex-core.js');
    await loadScript('article.js');
  }

  start().catch((error) => {
    root.innerHTML = `<main class="ti-prose ti-narrow"><p class="ti-eyebrow">Article build failed</p><h1>Computational Experimentation</h1><p>${escapeHtml(error.message)}</p></main>`;
    console.error(error);
  });
})();
