import {
  add,
  finiteSegmentVelocity,
  numericalSegmentVelocity,
  relativeVectorError,
  shedCirculation,
  sum,
  superposedSegmentVelocity,
  trailingFilamentStrengths,
  vec,
} from './vortex-core.js';
import { THEODORSEN_DATA } from './theodorsen-data.js';

const TAU = 2 * Math.PI;
const DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

function canvasContext(canvas) {
  const width = Math.max(320, Math.round(canvas.getBoundingClientRect().width));
  const height = Number(canvas.dataset.height || 400);
  canvas.width = Math.round(width * DPR);
  canvas.height = Math.round(height * DPR);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#fbfaf7';
  ctx.fillRect(0, 0, width, height);
  return { ctx, width, height };
}

const number = (root, name) => Number(root.querySelector(`[name="${name}"]`).value);
const fmt = (value, digits = 5) => {
  if (!Number.isFinite(value)) return 'singular';
  if (Math.abs(value) > 1e3 || (Math.abs(value) > 0 && Math.abs(value) < 1e-4)) return value.toExponential(3);
  return value.toFixed(digits).replace(/0+$/, '').replace(/\.$/, '');
};

function bindRanges(root, render) {
  root.querySelectorAll('input[type="range"]').forEach((input) => {
    const output = root.querySelector(`[data-value-for="${input.name}"]`);
    const update = () => {
      if (output) output.textContent = fmt(Number(input.value), 2);
      render();
    };
    input.addEventListener('input', update);
    update();
  });
}

function axes(ctx, width, height, xMap, yMap, step = 0.5) {
  ctx.save();
  ctx.strokeStyle = 'rgba(41,37,36,.08)';
  ctx.lineWidth = 1;
  for (let v = -3; v <= 3; v += step) {
    ctx.beginPath(); ctx.moveTo(xMap(v), 0); ctx.lineTo(xMap(v), height); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, yMap(v)); ctx.lineTo(width, yMap(v)); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(41,37,36,.25)';
  ctx.beginPath(); ctx.moveTo(xMap(0), 0); ctx.lineTo(xMap(0), height); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, yMap(0)); ctx.lineTo(width, yMap(0)); ctx.stroke();
  ctx.restore();
}

function arrow(ctx, x1, y1, x2, y2, colour = '#111827', lineWidth = 3) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  ctx.save();
  ctx.strokeStyle = colour; ctx.fillStyle = colour; ctx.lineWidth = lineWidth; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - 9 * Math.cos(angle - Math.PI / 6), y2 - 9 * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(x2 - 9 * Math.cos(angle + Math.PI / 6), y2 - 9 * Math.sin(angle + Math.PI / 6));
  ctx.closePath(); ctx.fill(); ctx.restore();
}

function point(ctx, x, y, label, colour = '#1d4ed8') {
  ctx.save(); ctx.fillStyle = colour;
  ctx.beginPath(); ctx.arc(x, y, 6, 0, TAU); ctx.fill();
  ctx.fillStyle = '#292524'; ctx.font = '600 12px system-ui'; ctx.fillText(label, x + 9, y - 8);
  ctx.restore();
}

function out(root, name, value) {
  const target = root.querySelector(`[data-output="${name}"]`);
  if (target) target.textContent = value;
  return target;
}

function vortexGlyph(ctx, x, y, value) {
  const colour = value >= 0 ? '#1d4ed8' : '#b91c1c';
  ctx.save(); ctx.strokeStyle = colour; ctx.fillStyle = colour; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x, y, 11, 0, TAU); ctx.stroke();
  if (value >= 0) { ctx.beginPath(); ctx.arc(x, y, 3, 0, TAU); ctx.fill(); }
  else { ctx.beginPath(); ctx.moveTo(x - 6, y - 6); ctx.lineTo(x + 6, y + 6); ctx.moveTo(x + 6, y - 6); ctx.lineTo(x - 6, y + 6); ctx.stroke(); }
  ctx.restore();
}

function initSegment(root) {
  const canvas = root.querySelector('canvas');
  const render = () => {
    const { ctx, width, height } = canvasContext(canvas);
    const pad = 40;
    const xMap = (x) => pad + ((x + 1.6) / 3.2) * (width - 2 * pad);
    const yMap = (y) => height - pad - ((y + 1.3) / 2.8) * (height - 2 * pad);
    axes(ctx, width, height, xMap, yMap);
    const a = vec(number(root, 'ax'), number(root, 'ay'), 0);
    const b = vec(number(root, 'bx'), number(root, 'by'), 0);
    const p = vec(number(root, 'px'), number(root, 'py'), 0);
    const gamma = number(root, 'gamma');
    const analytic = finiteSegmentVelocity(a, b, p, gamma);
    const reference = numericalSegmentVelocity(a, b, p, gamma, 5000);
    const error = relativeVectorError(analytic, reference);
    arrow(ctx, xMap(a.x), yMap(a.y), xMap(b.x), yMap(b.y));
    point(ctx, xMap(a.x), yMap(a.y), 'A', '#111827');
    point(ctx, xMap(b.x), yMap(b.y), 'B', '#111827');
    point(ctx, xMap(p.x), yMap(p.y), 'P');
    vortexGlyph(ctx, xMap(p.x) + 30, yMap(p.y) + 30, analytic.z);
    out(root, 'analytic', fmt(analytic.z, 7));
    out(root, 'reference', fmt(reference.z, 7));
    out(root, 'error', Number.isFinite(error) ? error.toExponential(2) : 'singular');
    const status = out(root, 'status', Number.isFinite(error) && error < 5e-6 ? 'PASS' : 'MOVE P');
    if (status) status.dataset.pass = String(Number.isFinite(error) && error < 5e-6);
  };
  bindRanges(root, render);
  root.querySelector('[data-reset]')?.addEventListener('click', () => {
    const defaults = { ax: -0.8, ay: -0.2, bx: 0.9, by: 0.35, px: 0.15, py: 0.95, gamma: 1.7 };
    Object.entries(defaults).forEach(([name, value]) => { root.querySelector(`[name="${name}"]`).value = value; });
    root.querySelectorAll('input[type="range"]').forEach((input) => input.dispatchEvent(new Event('input')));
  });
  new ResizeObserver(render).observe(root);
}

function initSuperposition(root) {
  const canvas = root.querySelector('canvas');
  const render = () => {
    const { ctx, width, height } = canvasContext(canvas);
    const pad = 40;
    const xMap = (x) => pad + ((x + 1.5) / 3) * (width - 2 * pad);
    const yMap = (y) => height - pad - ((y + 1.2) / 2.4) * (height - 2 * pad);
    axes(ctx, width, height, xMap, yMap);
    const sep = number(root, 'separation');
    const p = vec(number(root, 'px'), number(root, 'py'), 0);
    const segments = [
      { a: vec(-1.1, -sep / 2, 0), b: vec(1.1, -sep / 2, 0), gamma: number(root, 'gamma1') },
      { a: vec(-1.1, sep / 2, 0), b: vec(1.1, sep / 2, 0), gamma: number(root, 'gamma2') },
    ];
    const v1 = finiteSegmentVelocity(segments[0].a, segments[0].b, p, segments[0].gamma);
    const v2 = finiteSegmentVelocity(segments[1].a, segments[1].b, p, segments[1].gamma);
    const total = superposedSegmentVelocity(segments, p);
    const reference = add(
      numericalSegmentVelocity(segments[0].a, segments[0].b, p, segments[0].gamma, 3000),
      numericalSegmentVelocity(segments[1].a, segments[1].b, p, segments[1].gamma, 3000),
    );
    arrow(ctx, xMap(-1.1), yMap(-sep / 2), xMap(1.1), yMap(-sep / 2), '#111827', 4);
    arrow(ctx, xMap(-1.1), yMap(sep / 2), xMap(1.1), yMap(sep / 2), '#7c3aed', 4);
    point(ctx, xMap(p.x), yMap(p.y), 'P');
    vortexGlyph(ctx, xMap(p.x) + 30, yMap(p.y) + 30, total.z);
    out(root, 'v1', fmt(v1.z, 6)); out(root, 'v2', fmt(v2.z, 6));
    out(root, 'total', fmt(total.z, 6)); out(root, 'error', relativeVectorError(total, reference).toExponential(2));
  };
  bindRanges(root, render); new ResizeObserver(render).observe(root);
}

function distribution(stations, exponent, gamma0) {
  return Array.from({ length: stations }, (_, i) => {
    const eta = -1 + (2 * (i + 0.5)) / stations;
    return gamma0 * Math.max(0, 1 - eta * eta) ** exponent;
  });
}

function initTrailing(root) {
  const canvas = root.querySelector('canvas');
  const render = () => {
    const { ctx, width, height } = canvasContext(canvas);
    const stations = Math.round(number(root, 'stations'));
    const gamma0 = number(root, 'gamma0');
    const gamma = distribution(stations, number(root, 'exponent'), gamma0);
    const trailing = trailingFilamentStrengths(gamma);
    const x0 = Math.max(110, width * 0.25), x1 = width - 60;
    const yMap = (eta) => 36 + ((eta + 1) / 2) * (height - 72);
    ctx.fillStyle = 'rgba(29,78,216,.08)';
    ctx.beginPath(); ctx.moveTo(x0 - 48, yMap(-1)); ctx.quadraticCurveTo(x0 + 35, height / 2, x0 - 48, yMap(1)); ctx.lineTo(x0 + 25, yMap(1)); ctx.quadraticCurveTo(x0 + 60, height / 2, x0 + 25, yMap(-1)); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#111827'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x0, yMap(-1)); ctx.lineTo(x0, yMap(1)); ctx.stroke();
    gamma.forEach((value, i) => {
      const eta = -1 + (2 * (i + 0.5)) / stations;
      ctx.strokeStyle = '#1d4ed8'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(x0 - 70 * value / gamma0, yMap(eta)); ctx.lineTo(x0, yMap(eta)); ctx.stroke();
    });
    trailing.forEach((strength, boundary) => {
      const eta = -1 + (2 * boundary) / stations;
      ctx.strokeStyle = strength >= 0 ? 'rgba(29,78,216,.75)' : 'rgba(185,28,28,.72)';
      ctx.lineWidth = 1 + 8 * Math.abs(strength) / gamma0;
      ctx.beginPath(); ctx.moveTo(x0, yMap(eta)); ctx.bezierCurveTo(x0 + 80, yMap(eta), x1 - 100, yMap(eta), x1, yMap(eta)); ctx.stroke();
    });
    ctx.fillStyle = '#57534e'; ctx.font = '12px system-ui'; ctx.fillText('bound Γ(y)', 18, 20); ctx.fillText('trailing ΔΓ', x0 + 85, 20);
    out(root, 'filaments', String(trailing.length)); out(root, 'closure', sum(trailing).toExponential(2)); out(root, 'max', fmt(Math.max(...trailing.map(Math.abs)), 4));
  };
  bindRanges(root, render); new ResizeObserver(render).observe(root);
}

function initShed(root) {
  const canvas = root.querySelector('canvas');
  const wake = [];
  let escaped = 0, bound = 0, clock = 0, accumulator = 0, paused = false, last = performance.now();
  const reset = () => { wake.splice(0); escaped = 0; bound = 0; clock = 0; accumulator = 0; };
  const draw = () => {
    const { ctx, width, height } = canvasContext(canvas);
    const te = 90, cy = height * 0.58, end = width - 35;
    ctx.strokeStyle = '#111827'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(25, cy); ctx.quadraticCurveTo(55, cy - 10, te, cy); ctx.stroke();
    ctx.strokeStyle = 'rgba(41,37,36,.15)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(te, cy); ctx.lineTo(end, cy); ctx.stroke();
    wake.forEach((vortex) => { const x = te + vortex.x * (end - te) / 4.8; vortexGlyph(ctx, x, cy, vortex.gamma); });
    ctx.strokeStyle = 'rgba(29,78,216,.25)'; ctx.beginPath();
    for (let i = 0; i <= 120; i += 1) { const t = clock - (1 - i / 120) * 2.5; const x = te + i / 120 * (end - te); const y = 72 - Math.sin(TAU * number(root, 'frequency') * t) * 36; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
    ctx.stroke(); ctx.fillStyle = '#57534e'; ctx.font = '12px system-ui'; ctx.fillText('prescribed bound circulation', te, 18);
    const wakeGamma = sum(wake.map((v) => v.gamma)) + escaped;
    out(root, 'bound', fmt(bound, 4)); out(root, 'wake', fmt(wakeGamma, 4)); out(root, 'residual', Math.abs(bound + wakeGamma).toExponential(2));
  };
  const frame = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!paused) {
      clock += dt; accumulator += dt;
      const next = Math.sin(TAU * number(root, 'frequency') * clock);
      if (accumulator >= 0.055) { wake.push({ x: 0, gamma: shedCirculation(bound, next) }); bound = next; accumulator = 0; }
      wake.forEach((v) => { v.x += number(root, 'convection') * dt; });
      while (wake.length && wake[0].x > 5) escaped += wake.shift().gamma;
    }
    draw(); requestAnimationFrame(frame);
  };
  bindRanges(root, reset);
  root.querySelector('[data-pause]')?.addEventListener('click', (event) => { paused = !paused; event.currentTarget.textContent = paused ? 'Resume' : 'Pause'; });
  root.querySelector('[data-reset]')?.addEventListener('click', reset);
  new ResizeObserver(draw).observe(root); requestAnimationFrame(frame);
}

function interpolateC(k) {
  if (k <= THEODORSEN_DATA[0][0]) return { re: THEODORSEN_DATA[0][1], im: THEODORSEN_DATA[0][2] };
  for (let i = 1; i < THEODORSEN_DATA.length; i += 1) {
    const [k1, re1, im1] = THEODORSEN_DATA[i];
    if (k <= k1) {
      const [k0, re0, im0] = THEODORSEN_DATA[i - 1];
      const t = (Math.log(k) - Math.log(k0)) / (Math.log(k1) - Math.log(k0));
      return { re: re0 + t * (re1 - re0), im: im0 + t * (im1 - im0) };
    }
  }
  const [, re, im] = THEODORSEN_DATA.at(-1); return { re, im };
}

function initTheodorsen(root) {
  const canvas = root.querySelector('canvas');
  const render = () => {
    const { ctx, width, height } = canvasContext(canvas);
    const k = number(root, 'k'), c = interpolateC(k), mag = Math.hypot(c.re, c.im), phase = Math.atan2(c.im, c.re);
    const split = Math.max(350, width * 0.58);
    const left = { x: 50, y: 35, w: split - 80, h: height - 85 }, right = { x: split + 20, y: 35, w: width - split - 50, h: height - 85 };
    ctx.strokeStyle = 'rgba(41,37,36,.18)'; ctx.strokeRect(left.x, left.y, left.w, left.h); ctx.strokeRect(right.x, right.y, right.w, right.h);
    const xMap = (v) => left.x + (Math.log(v / 0.01) / Math.log(300)) * left.w;
    const yMag = (v) => left.y + left.h - ((v - 0.45) / 0.6) * left.h;
    const yPhase = (v) => left.y + left.h - ((v + 0.35) / 0.4) * left.h;
    ctx.strokeStyle = '#1d4ed8'; ctx.lineWidth = 2.5; ctx.beginPath();
    THEODORSEN_DATA.forEach(([x, re, im], i) => { const y = yMag(Math.hypot(re, im)); i ? ctx.lineTo(xMap(x), y) : ctx.moveTo(xMap(x), y); }); ctx.stroke();
    ctx.strokeStyle = '#b91c1c'; ctx.beginPath(); THEODORSEN_DATA.forEach(([x, re, im], i) => { const y = yPhase(Math.atan2(im, re)); i ? ctx.lineTo(xMap(x), y) : ctx.moveTo(xMap(x), y); }); ctx.stroke();
    ctx.setLineDash([4, 4]); ctx.strokeStyle = '#292524'; ctx.beginPath(); ctx.moveTo(xMap(k), left.y); ctx.lineTo(xMap(k), left.y + left.h); ctx.stroke(); ctx.setLineDash([]);
    point(ctx, xMap(k), yMag(mag), '', '#1d4ed8'); point(ctx, xMap(k), yPhase(phase), '', '#b91c1c');
    const centre = right.y + right.h / 2, amp = right.h * 0.34;
    ctx.strokeStyle = '#78716c'; ctx.lineWidth = 2; ctx.beginPath();
    for (let i = 0; i <= 180; i += 1) { const t = i / 180 * TAU * 1.5, x = right.x + i / 180 * right.w, y = centre - Math.sin(t) * amp; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke();
    ctx.strokeStyle = '#1d4ed8'; ctx.lineWidth = 3; ctx.beginPath();
    for (let i = 0; i <= 180; i += 1) { const t = i / 180 * TAU * 1.5, x = right.x + i / 180 * right.w, y = centre - mag * Math.sin(t + phase) * amp; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke();
    ctx.font = '600 12px system-ui'; ctx.fillStyle = '#1d4ed8'; ctx.fillText('|C(k)|', left.x + 8, left.y + 18); ctx.fillStyle = '#b91c1c'; ctx.fillText('phase', left.x + 65, left.y + 18); ctx.fillStyle = '#78716c'; ctx.fillText('2π α quasi-steady', right.x + 8, right.y + 18); ctx.fillStyle = '#1d4ed8'; ctx.fillText('2π C(k) α', right.x + 8, right.y + 38);
    out(root, 're', fmt(c.re, 5)); out(root, 'im', fmt(c.im, 5)); out(root, 'mag', fmt(mag, 5)); out(root, 'phase', `${fmt(phase * 180 / Math.PI, 2)}°`);
  };
  bindRanges(root, render); new ResizeObserver(render).observe(root);
}

function initAsides() {
  document.querySelectorAll('.ce-aside-mark').forEach((mark) => mark.addEventListener('click', (event) => {
    event.preventDefault(); const aside = mark.closest('.ce-aside'); const open = aside.dataset.open === 'true';
    document.querySelectorAll('.ce-aside[data-open="true"]').forEach((item) => { item.dataset.open = 'false'; }); aside.dataset.open = String(!open);
  }));
  document.addEventListener('click', (event) => { if (!event.target.closest('.ce-aside')) document.querySelectorAll('.ce-aside[data-open="true"]').forEach((item) => { item.dataset.open = 'false'; }); });
}

function initMap() {
  const sections = [...document.querySelectorAll('[data-article-section]')], buttons = [...document.querySelectorAll('[data-map-target]')];
  buttons.forEach((button) => button.addEventListener('click', () => document.getElementById(button.dataset.mapTarget)?.scrollIntoView({ behavior: 'smooth' })));
  const observer = new IntersectionObserver((entries) => {
    const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (visible) buttons.forEach((button) => { button.dataset.active = String(button.dataset.mapTarget === visible.target.id); });
  }, { rootMargin: '-18% 0px -62%', threshold: [0.05, 0.3, 0.6] });
  sections.forEach((section) => observer.observe(section));
}

function initProgress() {
  const bar = document.querySelector('.ce-progress-bar');
  const update = () => { const max = document.documentElement.scrollHeight - innerHeight; bar.style.transform = `scaleX(${max > 0 ? scrollY / max : 0})`; };
  addEventListener('scroll', update, { passive: true }); update();
}

document.addEventListener('DOMContentLoaded', () => {
  initAsides(); initMap(); initProgress();
  document.querySelectorAll('[data-demo="segment"]').forEach(initSegment);
  document.querySelectorAll('[data-demo="superposition"]').forEach(initSuperposition);
  document.querySelectorAll('[data-demo="trailing"]').forEach(initTrailing);
  document.querySelectorAll('[data-demo="shed"]').forEach(initShed);
  document.querySelectorAll('[data-demo="theodorsen"]').forEach(initTheodorsen);
});
