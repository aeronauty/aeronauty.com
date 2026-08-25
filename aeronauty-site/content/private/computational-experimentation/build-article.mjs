import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.join(ROOT, 'source-snapshot.txt');
const metaPath = path.join(ROOT, 'source.json');
const outputPath = path.join(ROOT, 'article.html');

const sections = [
  ['suspicion', '00', 'The suspicion', 'Authorship feels like evidence because suffering is memorable.'],
  ['instrument', '01', 'The instrument', 'The tools changed. The instinct did not.'],
  ['calibration', '02', 'Calibration', 'Known answers first. Interesting answers later.'],
  ['judgement', '03', 'The judgement', 'The model can help choose a test. It cannot own what the test means.'],
  ['abstraction', '04', 'The abstraction', 'I check more. I check differently. I check at the seams.'],
  ['local-trust', '05', 'The local limit', 'A real trust case, assembled one piece at a time — and still not the whole aircraft.'],
];

const punches = new Set([
  'But struggling is not a verification method.',
  'Which means the code was never the point. The instrument was.',
  'Make it show me you can compare against a known result.',
  'That distinction is the part of the job I still have to own.',
  'My errors live in the seams.',
  "I haven't lowered the bar. I've moved where the work lives — from authorship to experiment.",
]);

const esc = (value) => String(value)
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');

function operatorArt() {
  return `<span class="ce-operator-art" aria-label="Operator, not Jedi">
    <svg viewBox="0 0 72 72" aria-hidden="true"><path d="M20 59c2-16 6-26 16-34 10 8 14 18 16 34" fill="#292524"/><circle cx="36" cy="22" r="9" fill="#d6d3d1"/><path d="M27 22c2-11 16-15 21-2-5-3-14-3-21 2Z" fill="#44403c"/><path d="M50 48 65 17" stroke="#2563eb" stroke-width="4" stroke-linecap="round"/><path d="M47 52 52 43" stroke="#292524" stroke-width="6" stroke-linecap="round"/></svg>
    <span><strong>Operator. Not that kind.</strong><span>The relationship still has fewer robes and more inputs.</span></span>
  </span>`;
}

function inline(raw, state) {
  const rendered = [];
  let text = raw.replace(/\[<(?:callout|put this in a little side callout)>(.*?)\]/g, (_match, body) => {
    const token = `@@ASIDE_${rendered.length}@@`;
    const art = body.includes('<add a pic of Obi-Wan-Nairobi>') ? operatorArt() : '';
    const clean = body.replace('<add a pic of Obi-Wan-Nairobi>', '').trim();
    const id = `ce-aside-${state.aside++}`;
    rendered.push(`<span class="ce-aside"><button class="ce-aside-mark" type="button" aria-label="Open aside" aria-describedby="${id}">*</button><span class="ce-aside-content" id="${id}" role="tooltip">${esc(clean)}${art}</span></span>`);
    return token;
  });
  text = text.replace(/\[<fact-check\s+(.*?)>\]/g, (_match, note) => { state.warnings.push(note.trim()); return ''; });
  let html = esc(text);
  rendered.forEach((aside, index) => { html = html.replace(`@@ASIDE_${index}@@`, aside); });
  return html.replaceAll('np.linalg', '<code>np.linalg</code>').replaceAll('Kδ=P', '<code>Kδ=P</code>').replaceAll('C++', '<code>C++</code>').replaceAll('2π', '<code>2π</code>').replaceAll('C(k)', '<code>C(k)</code>');
}

const slider = (prefix, name, label, min, max, step, value) => `<div class="ce-control"><label for="${prefix}-${name}">${label}</label><output data-value-for="${name}">${value}</output><input id="${prefix}-${name}" name="${name}" type="range" min="${min}" max="${max}" step="${step}" value="${value}" /></div>`;
const readout = (rows) => `<div class="ce-readout">${rows.map(([label, name]) => `<span>${label}</span><strong data-output="${name}">—</strong>`).join('')}</div>`;
function demo(kind, kicker, title, intro, controls, caption, height = 420) {
  return `<figure class="ce-demo" data-demo="${kind}"><header class="ce-demo-header"><p class="ce-demo-kicker">${kicker}</p><h3>${title}</h3><p>${intro}</p></header><div class="ce-demo-body"><div class="ce-demo-stage"><canvas data-height="${height}" aria-label="${esc(title)}"></canvas></div><div class="ce-controls">${controls}</div></div><figcaption>${caption}</figcaption></figure>`;
}

function segmentDemo() {
  return demo('segment', 'Calibration 01 · primitive', 'A finite vortex segment, made answerable', 'Move the endpoints and interrogation point. The closed-form Biot–Savart result is checked against independent numerical quadrature every time you touch a slider.', [
    slider('seg','ax','Aₓ',-1.25,.25,.05,-.8),slider('seg','ay','Aᵧ',-1,.8,.05,-.2),slider('seg','bx','Bₓ',-.25,1.25,.05,.9),slider('seg','by','Bᵧ',-.8,1,.05,.35),slider('seg','px','Pₓ',-1.2,1.2,.05,.15),slider('seg','py','Pᵧ',-1,1.3,.05,.95),slider('seg','gamma','Γ',-2.5,2.5,.05,1.7),readout([['closed form, w','analytic'],['quadrature, w','reference'],['relative error','error'],['acceptance','status']]),'<div class="ce-button-row"><button class="ce-button" type="button" data-reset>Reset canonical case</button></div>',
  ].join(''), 'The browser and acceptance test import the same <code>finiteSegmentVelocity</code> primitive. The slower quadrature is the reference, not another call to the same formula wearing a fake moustache.', 430);
}
function superpositionDemo() {
  return demo('superposition', 'Calibration 02 · composition', 'Two trustworthy pieces do not remove the seam', 'Change either circulation or move the interrogation point. The total is assembled explicitly, then checked again against quadrature.', [
    slider('sup','gamma1','Γ₁',-2.5,2.5,.05,1.2),slider('sup','gamma2','Γ₂',-2.5,2.5,.05,-.65),slider('sup','separation','separation',.35,1.8,.05,1.1),slider('sup','px','Pₓ',-1,1,.05,.2),slider('sup','py','Pᵧ',-.9,.9,.05,.1),readout([['w₁','v1'],['w₂','v2'],['w₁ + w₂','total'],['reference error','error']]),
  ].join(''), 'Superposition is simple. Remembering what was superposed, with which conventions and validity limits, is where the engineering system starts to matter.', 405);
}
function trailingDemo() {
  return demo('trailing', 'Calibration 03 · the seam becomes a wake', 'Every spanwise change in Γ has to go somewhere', 'Blue and red wake filaments are the discrete jumps in bound circulation. Change the loading shape or panel count and watch the differences build the wake.', [
    slider('trail','stations','spanwise panels',5,17,2,9),slider('trail','exponent','loading exponent',.35,2.5,.05,.65),slider('trail','gamma0','root Γ',.25,2,.05,1),readout([['trailing filaments','filaments'],['Σ ΔΓ','closure'],['largest jump','max']]),
  ].join(''), 'Outside the wing, bound circulation is zero. Each wake filament is the jump between neighbouring bound segments, including the two tip jumps. Their signed sum closes.', 430);
}
function shedDemo() {
  return demo('shed', 'Calibration 04 · time', 'Change the bound circulation; shed the difference', 'The prescribed circulation varies sinusoidally. Each discrete change emits the opposite amount into the wake while the circulation ledger stays closed.', [
    slider('shed','frequency','frequency',.15,1.5,.05,.45),slider('shed','convection','convection speed',.25,1.4,.05,.75),readout([['bound Γ','bound'],['wake ΣΓ','wake'],['closure residual','residual']]),'<div class="ce-button-row"><button class="ce-button" type="button" data-pause>Pause</button><button class="ce-button" type="button" data-reset>Reset ledger</button></div>',
  ].join(''), 'The animation is also a conservation test: <code>Γbound + ΣΓwake = 0</code>, apart from floating-point round-off. The pretty bit and the check are the same object.', 390);
}
function theodorsenDemo() {
  return demo('theodorsen', 'Calibration 05 · canonical behaviour', 'Make the 2π lift slope remember the wake', 'At low reduced frequency the circulatory lift is nearly quasi-steady. Increase <code>k</code> and Theodorsen’s function reduces the amplitude and introduces phase lag.', [
    slider('theodorsen','k','reduced frequency, k',.01,3,.01,.35),readout([['Re C(k)','re'],['Im C(k)','im'],['|C(k)|','mag'],['phase','phase']]),
  ].join(''), 'Reference values are generated from the Hankel-function definition of <code>C(k)</code>. The left plot is the known response; the right turns it back into something you can see and poke.', 430);
}
function dissertationFigure() {
  return `<figure class="ce-evidence"><div class="ce-paper" aria-label="Reconstructed dissertation comparison page"><div class="ce-paper-title">Doctoral work · dynamic wake implementation</div><h4>Comparison against the published Peters–He response</h4><p>The shape was the evidence: the oscillation in blade loading appeared at the same azimuth and with the same qualitative response as the reference.</p><svg viewBox="0 0 720 250" role="img" aria-label="Reference and implementation traces agreeing over rotor azimuth"><path d="M50 205H690M50 30V205" fill="none" stroke="#78716c"/><g stroke="#d6d3d1"><path d="M50 160H690M50 115H690M50 70H690"/><path d="M210 30V205M370 30V205M530 30V205"/></g><path d="M50 126 C95 76 130 75 176 122 S260 172 310 119 S401 70 451 123 S540 172 590 116 S655 78 690 105" fill="none" stroke="#1d4ed8" stroke-width="4"/><path d="M50 131 C95 81 130 79 176 126 S260 168 310 116 S401 75 451 127 S540 168 590 112 S655 82 690 108" fill="none" stroke="#292524" stroke-width="2" stroke-dasharray="8 6"/><text x="52" y="20" font-family="system-ui" font-size="13" fill="#57534e">blade-loading response</text><text x="570" y="228" font-family="system-ui" font-size="12" fill="#57534e">rotor azimuth →</text></svg></div><figcaption><strong>The result I actually trusted.</strong>Writing the formulation was not the end of the job. Making it reproduce the known oscillatory response was.<span class="ce-draft-note">Draft reconstruction: the original dissertation page was not present in the connected Drive search. Swap this facsimile for the real page before publication.</span></figcaption></figure>`;
}

function instruction(raw, state) {
  if (raw.startsWith('[<insert widget of a single vortex element')) return segmentDemo();
  if (raw.startsWith('[<same widget')) return superpositionDemo();
  if (raw.startsWith('[<Show the algorithm')) return trailingDemo();
  if (raw.startsWith('[<Have a sinusoidal loading')) return shedDemo();
  if (raw.startsWith('[<Show a 2D case')) return theodorsenDemo();
  if (raw.startsWith('[<Show the page of my dissertation')) return dissertationFigure();
  state.warnings.push(`Unresolved build instruction: ${raw}`); return `<p class="ce-draft-note">${esc(raw)}</p>`;
}

function paragraph(raw, state) {
  const text = raw.trim();
  if (text.startsWith('[<') && text.endsWith('>]')) return instruction(text, state);
  if (text === 'An abstraction layer is successfully formed when verifying its result becomes cheaper and easier than producing it yourself.') return `<aside class="ce-thesis"><p>${inline(text,state)}</p></aside>`;
  if (text === 'Not yet.') return `<p class="ce-last">${inline(text,state)}</p>`;
  if (text.startsWith('For the mature tools beneath modern engineering')) return `<p class="ce-final">${inline(text,state)}</p>`;
  return `<p${punches.has(text) ? ' class="ce-punch"' : ''}>${inline(text,state)}</p>`;
}

function sectionBlock(items, index, state) {
  const [id, number, title, stand] = sections[index];
  return `<section class="ce-section" id="${id}" data-article-section><header class="ce-section-opening"><span class="ce-section-number">${number}</span><h2 class="ce-section-title">${title}</h2><p class="ce-section-stand">${stand}</p></header>${items.map((item) => paragraph(item,state)).join('\n')}</section>`;
}
function map() { return `<nav class="ce-map" aria-label="Article map"><p class="ce-map-title">The argument</p>${sections.map(([id,number,title]) => `<button type="button" data-map-target="${id}" data-number="${number}"><span>${title}</span></button>`).join('')}</nav>`; }

async function main() {
  const source = (await fs.readFile(sourcePath,'utf8')).replace(/^\uFEFF/,'').replaceAll('\r\n','\n').trim();
  const meta = JSON.parse(await fs.readFile(metaPath,'utf8'));
  const blocks = source.split(/\n\s*\n/).map((item) => item.trim()).filter(Boolean);
  const title = blocks.shift();
  const grouped = [[]];
  for (const block of blocks) block === '— — —' ? grouped.push([]) : grouped.at(-1).push(block);
  if (grouped.length !== sections.length) throw new Error(`Expected ${sections.length} sections; found ${grouped.length}`);
  const state = { aside:1, warnings:[] };
  const body = grouped.map((items,index) => sectionBlock(items,index,state)).join('\n');
  const syncDate = new Date(meta.syncedAt).toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});
  const html = `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="A personal essay about moving trust in machine-produced engineering work from authorship to experiment."><title>${esc(title)} · AeroNauty</title><link rel="stylesheet" href="article.css"></head><body><div class="ce-progress" aria-hidden="true"><div class="ce-progress-bar"></div></div>${map()}<main class="ce-shell"><header class="ce-hero"><p class="ce-eyebrow">Computational experimentation · draft essay</p><h1>${esc(title)}</h1><p class="ce-standfirst">A story about moving trust from authorship to experiment — and the bit of engineering judgement I still have to own.</p><div class="ce-meta"><span>Harry Smith</span><span>Google Doc synced ${syncDate}</span><a href="${esc(meta.documentUrl)}" target="_blank" rel="noreferrer">Open the prose source ↗</a></div></header><article class="ce-article">${body}</article><footer class="ce-source-note"><strong>Source contract.</strong> The Google Doc is canonical for prose. This HTML was built from <code>${esc(meta.generatedFile)}</code>, a generated snapshot of document <code>${esc(meta.documentId)}</code>, tab <code>${esc(meta.tabId)}</code>, revision <code>${esc(meta.revisionId)}</code>. Layout, callouts, demonstrations and article chrome live in the repository.${state.warnings.length ? `<br><strong>Publication checks:</strong> ${state.warnings.map(esc).join('; ')}` : ''}</footer></main><script type="module" src="article.js"></script></body></html>`;
  await fs.writeFile(outputPath,html); console.log(`wrote article.html (${html.length} chars)`);
}
main().catch((error)=>{console.error(error);process.exitCode=1;});
