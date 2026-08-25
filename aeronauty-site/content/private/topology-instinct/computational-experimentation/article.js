(() => {
  const numerics = globalThis.ComputationalExperimentationNumerics;
  if (!numerics) throw new Error('vortex-core.js must load before article.js');

  const {
    add,
    numericalVortexPanelVelocity,
    relativeVectorError,
    sum,
    trailingFilamentStrengths,
    vortexPanelVelocity,
  } = numerics;

  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const rootStyle = getComputedStyle(document.documentElement);
  const colour = (name, fallback) => rootStyle.getPropertyValue(name).trim() || fallback;
  const colours = {
    fg: colour('--ti-fg', '#e8eef7'),
    dim: colour('--ti-fg-dim', '#9aa9bd'),
    faint: colour('--ti-fg-faint', '#697991'),
    border: colour('--ti-border', '#2a3850'),
    cyan: colour('--ti-accent', '#35cbe8'),
    violet: colour('--ti-accent-2', '#9c6cff'),
    pink: colour('--ti-accent-3', '#ff7a90'),
  };

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const formatVector = (vector, digits = 4) =>
    `(${vector.x.toFixed(digits)}, ${vector.y.toFixed(digits)})`;

  function fitCanvas(canvas) {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(300, rect.width);
    const height = Math.max(220, rect.height || width / 1.8);
    const pixelWidth = Math.round(width * dpr);
    const pixelHeight = Math.round(height * dpr);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    const context = canvas.getContext('2d');
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { context, width, height };
  }

  const toScreen = (point, width, height) => ({
    x: point.x * width,
    y: (1 - point.y) * height,
  });
  const toWorld = (point, width, height) => ({
    x: point.x / width,
    y: 1 - point.y / height,
  });

  function grid(context, width, height) {
    context.clearRect(0, 0, width, height);
    context.strokeStyle = colours.border;
    context.globalAlpha = 0.42;
    context.lineWidth = 1;
    for (let i = 1; i < 10; i += 1) {
      context.beginPath();
      context.moveTo((i * width) / 10, 0);
      context.lineTo((i * width) / 10, height);
      context.stroke();
    }
    for (let i = 1; i < 6; i += 1) {
      context.beginPath();
      context.moveTo(0, (i * height) / 6);
      context.lineTo(width, (i * height) / 6);
      context.stroke();
    }
    context.globalAlpha = 1;
  }

  function point(context, location, fill, label) {
    context.fillStyle = fill;
    context.beginPath();
    context.arc(location.x, location.y, 7, 0, Math.PI * 2);
    context.fill();
    if (label) {
      context.font = '700 12px Inter, sans-serif';
      context.fillText(label, location.x + 10, location.y - 10);
    }
  }

  function arrow(context, origin, vector, scale, stroke, label) {
    const end = { x: origin.x + vector.x * scale, y: origin.y - vector.y * scale };
    context.strokeStyle = stroke;
    context.fillStyle = stroke;
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(origin.x, origin.y);
    context.lineTo(end.x, end.y);
    context.stroke();
    const angle = Math.atan2(end.y - origin.y, end.x - origin.x);
    context.beginPath();
    context.moveTo(end.x, end.y);
    context.lineTo(end.x - 11 * Math.cos(angle - 0.45), end.y - 11 * Math.sin(angle - 0.45));
    context.lineTo(end.x - 11 * Math.cos(angle + 0.45), end.y - 11 * Math.sin(angle + 0.45));
    context.closePath();
    context.fill();
    if (label) {
      context.font = '600 12px Inter, sans-serif';
      context.fillText(label, end.x + 8, end.y - 8);
    }
  }

  function makeDraggable(canvas, points, move, redraw) {
    let active = null;
    const localPoint = (event) => {
      const rect = canvas.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };
    canvas.addEventListener('pointerdown', (event) => {
      const cursor = localPoint(event);
      const { width, height } = fitCanvas(canvas);
      let best = 30;
      for (const [key, value] of Object.entries(points())) {
        const location = toScreen(value, width, height);
        const distance = Math.hypot(location.x - cursor.x, location.y - cursor.y);
        if (distance < best) {
          active = key;
          best = distance;
        }
      }
      if (active) canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener('pointermove', (event) => {
      if (!active) return;
      const cursor = localPoint(event);
      const { width, height } = fitCanvas(canvas);
      const world = toWorld(cursor, width, height);
      move(active, { x: clamp(world.x, 0.04, 0.96), y: clamp(world.y, 0.06, 0.94) });
      redraw();
    });
    const stop = () => { active = null; };
    canvas.addEventListener('pointerup', stop);
    canvas.addEventListener('pointercancel', stop);
  }

  function safePanelVelocity(A, B, P, gamma) {
    try {
      return vortexPanelVelocity(A, B, P, gamma);
    } catch {
      return { x: 0, y: 0 };
    }
  }

  const singleCanvas = document.querySelector('[data-ce-vortex-single]');
  if (singleCanvas) {
    const gamma = document.querySelector('[data-ce-single-gamma]');
    const readout = document.querySelector('[data-ce-single-readout]');
    const state = { A: { x: 0.18, y: 0.34 }, B: { x: 0.78, y: 0.62 }, P: { x: 0.52, y: 0.79 } };
    const draw = () => {
      const { context, width, height } = fitCanvas(singleCanvas);
      grid(context, width, height);
      const A = toScreen(state.A, width, height);
      const B = toScreen(state.B, width, height);
      const P = toScreen(state.P, width, height);
      context.strokeStyle = colours.cyan;
      context.lineWidth = 5;
      context.beginPath();
      context.moveTo(A.x, A.y);
      context.lineTo(B.x, B.y);
      context.stroke();
      point(context, A, colours.cyan, 'A');
      point(context, B, colours.cyan, 'B');
      point(context, P, colours.pink, 'P');
      try {
        const strength = Number(gamma.value);
        const exact = vortexPanelVelocity(state.A, state.B, state.P, strength);
        const reference = numericalVortexPanelVelocity(state.A, state.B, state.P, strength, 1800);
        const error = relativeVectorError(exact, reference);
        const scale = clamp(130 / Math.max(Math.hypot(exact.x, exact.y), 1e-4), 35, 260);
        arrow(context, P, exact, scale, colours.pink, 'u(P)');
        readout.textContent = [
          `closed form : ${formatVector(exact, 6)}`,
          `quadrature  : ${formatVector(reference, 6)}`,
          `relative err: ${error.toExponential(2)}`,
          `status      : ${error < 2e-5 ? 'PASS' : 'CHECK'}`,
        ].join('\n');
      } catch (error) {
        readout.textContent = `singular case\n${error.message}`;
      }
    };
    makeDraggable(singleCanvas, () => state, (key, value) => { state[key] = value; }, draw);
    gamma.addEventListener('input', draw);
    addEventListener('resize', draw);
    draw();
  }

  const doubleCanvas = document.querySelector('[data-ce-vortex-double]');
  if (doubleCanvas) {
    const controls = {
      g1: document.querySelector('[data-ce-double-g1]'),
      g2: document.querySelector('[data-ce-double-g2]'),
      px: document.querySelector('[data-ce-double-px]'),
      py: document.querySelector('[data-ce-double-py]'),
    };
    const readout = document.querySelector('[data-ce-double-readout]');
    const state = {
      A1: { x: 0.12, y: 0.68 }, B1: { x: 0.75, y: 0.78 },
      A2: { x: 0.20, y: 0.25 }, B2: { x: 0.86, y: 0.40 },
    };
    const draw = () => {
      const { context, width, height } = fitCanvas(doubleCanvas);
      grid(context, width, height);
      const Pn = { x: Number(controls.px.value), y: Number(controls.py.value) };
      const P = toScreen(Pn, width, height);
      for (const [a, b, stroke] of [['A1', 'B1', colours.cyan], ['A2', 'B2', colours.violet]]) {
        const A = toScreen(state[a], width, height);
        const B = toScreen(state[b], width, height);
        context.strokeStyle = stroke;
        context.lineWidth = 5;
        context.beginPath();
        context.moveTo(A.x, A.y);
        context.lineTo(B.x, B.y);
        context.stroke();
        point(context, A, stroke, a);
        point(context, B, stroke, b);
      }
      point(context, P, colours.pink, 'P');
      const v1 = safePanelVelocity(state.A1, state.B1, Pn, Number(controls.g1.value));
      const v2 = safePanelVelocity(state.A2, state.B2, Pn, Number(controls.g2.value));
      const total = add(v1, v2);
      const scale = clamp(125 / Math.max(Math.hypot(total.x, total.y), 1e-4), 35, 230);
      arrow(context, P, v1, scale, colours.cyan, 'u₁');
      arrow(context, P, v2, scale, colours.violet, 'u₂');
      arrow(context, P, total, scale, colours.pink, 'Σ');
      readout.textContent = `u₁ = ${formatVector(v1)}\nu₂ = ${formatVector(v2)}\nΣ  = ${formatVector(total)}\nlinearity residual: 0`;
    };
    makeDraggable(doubleCanvas, () => state, (key, value) => { state[key] = value; }, draw);
    Object.values(controls).forEach((input) => input.addEventListener('input', draw));
    addEventListener('resize', draw);
    draw();
  }

  const trailingCanvas = document.querySelector('[data-ce-trailing]');
  if (trailingCanvas) {
    const shape = document.querySelector('[data-ce-trailing-shape]');
    const stations = document.querySelector('[data-ce-trailing-n]');
    const readout = document.querySelector('[data-ce-trailing-readout]');
    const gammaAt = (y, type) => {
      const radius = Math.abs(y);
      if (type === 'bell') return Math.max(0, 1 - radius * radius) * (1 - 0.28 * Math.cos(2 * Math.PI * y));
      if (type === 'notched') return Math.max(0, Math.sqrt(Math.max(0, 1 - radius * radius)) - 0.32 * Math.exp(-90 * y * y));
      return Math.sqrt(Math.max(0, 1 - radius * radius));
    };
    const draw = () => {
      const { context, width, height } = fitCanvas(trailingCanvas);
      context.clearRect(0, 0, width, height);
      const count = Number(stations.value);
      const ys = Array.from({ length: count }, (_, i) => -1 + (2 * i) / (count - 1));
      const bound = ys.map((y) => gammaAt(y, shape.value));
      const filaments = trailingFilamentStrengths(bound);
      const xCurve = width * 0.12;
      const xWing = width * 0.32;
      const xWake = width * 0.94;
      const middle = height * 0.52;
      const span = height * 0.78;
      context.strokeStyle = colours.faint;
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(xWing, middle - span / 2);
      context.lineTo(xWing, middle + span / 2);
      context.stroke();
      context.strokeStyle = colours.cyan;
      context.lineWidth = 3;
      context.beginPath();
      ys.forEach((y, i) => {
        const p = { x: xCurve + bound[i] * width * 0.15, y: middle - y * span / 2 };
        if (i) context.lineTo(p.x, p.y); else context.moveTo(p.x, p.y);
      });
      context.stroke();
      for (let i = 0; i < count - 1; i += 1) {
        const y = (ys[i] + ys[i + 1]) / 2;
        const delta = bound[i + 1] - bound[i];
        const py = middle - y * span / 2;
        context.strokeStyle = delta >= 0 ? colours.violet : colours.pink;
        context.globalAlpha = 0.25 + Math.min(0.75, Math.abs(delta) * 3);
        context.lineWidth = 1 + Math.abs(delta) * 16;
        context.beginPath();
        context.moveTo(xWing, py);
        context.bezierCurveTo(width * 0.5, py + 12 * Math.sin(i), width * 0.72, py - 10 * Math.cos(i), xWake, py);
        context.stroke();
      }
      context.globalAlpha = 1;
      context.fillStyle = colours.dim;
      context.font = '600 12px Inter, sans-serif';
      context.fillText('Γ(y)', xCurve, middle - span / 2 - 18);
      context.fillText('bound circulation', xWing - 55, middle + span / 2 + 28);
      context.fillText('trailed ΔΓ', xWake - 74, middle - span / 2 - 18);
      readout.textContent = [
        `stations        : ${count}`,
        `max Γ           : ${Math.max(...bound).toFixed(3)}`,
        `Σ all trailing Γ: ${sum(filaments).toExponential(2)}`,
        `tip jumps       : ${filaments[0].toFixed(3)}, ${filaments.at(-1).toFixed(3)}`,
      ].join('\n');
    };
    [shape, stations].forEach((input) => input.addEventListener('input', draw));
    addEventListener('resize', draw);
    draw();
  }

  const shedCanvas = document.querySelector('[data-ce-shed]');
  if (shedCanvas) {
    const reducedFrequency = document.querySelector('[data-ce-shed-k]');
    const phase = document.querySelector('[data-ce-shed-phase]');
    const button = document.querySelector('[data-ce-shed-play]');
    const readout = document.querySelector('[data-ce-shed-readout]');
    let playing = true;
    let last = performance.now();
    const draw = () => {
      const { context, width, height } = fitCanvas(shedCanvas);
      context.clearRect(0, 0, width, height);
      const phi = Number(phase.value);
      const k = Number(reducedFrequency.value);
      const wingX = width * 0.16;
      const centre = height * 0.5;
      context.strokeStyle = colours.faint;
      context.lineWidth = 5;
      context.beginPath();
      context.moveTo(wingX, centre - height * 0.12);
      context.lineTo(wingX, centre + height * 0.12);
      context.stroke();
      for (let i = 0; i < 70; i += 1) {
        const age = (i / 69) * 6.2;
        const sign = Math.cos(phi - age * k * 5);
        const x = wingX + (age / 6.2) * width * 0.75;
        context.fillStyle = sign >= 0 ? colours.violet : colours.pink;
        context.globalAlpha = 0.18 + 0.7 * Math.abs(sign);
        context.beginPath();
        context.arc(x, centre + 42 * Math.sin(phi - age * k * 5), 2.5 + 5 * Math.abs(sign), 0, Math.PI * 2);
        context.fill();
      }
      context.globalAlpha = 1;
      const bound = Math.sin(phi);
      const rate = Math.cos(phi) * k;
      context.fillStyle = colours.fg;
      context.font = '700 13px Inter, sans-serif';
      context.fillText(`Γ(t) = ${bound.toFixed(3)}`, 22, 34);
      context.fillText(`dΓ/dt = ${rate.toFixed(3)}`, 22, 55);
      context.fillStyle = colours.dim;
      context.fillText('past circulation remains downstream', width * 0.45, height * 0.86);
      readout.textContent = `k      : ${k.toFixed(2)}\nphase  : ${phi.toFixed(2)} rad\nΓ      : ${bound.toFixed(4)}\ndΓ/dt  : ${rate.toFixed(4)}\nwhat the wake stores: history`;
    };
    const tick = (now) => {
      if (playing) {
        const dt = Math.min(0.05, (now - last) / 1000);
        phase.value = (Number(phase.value) + dt * (1.2 + 3 * Number(reducedFrequency.value))) % (Math.PI * 2);
        draw();
      }
      last = now;
      requestAnimationFrame(tick);
    };
    [reducedFrequency, phase].forEach((input) => input.addEventListener('input', draw));
    button.addEventListener('click', () => {
      playing = !playing;
      button.textContent = playing ? 'Pause' : 'Play';
    });
    addEventListener('resize', draw);
    draw();
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) requestAnimationFrame(tick);
  }

  function j0(x) { let a=Math.abs(x),y,p,q;if(a<8){y=x*x;p=57568490574+y*(-13362590354+y*(651619640.7+y*(-11214424.18+y*(77392.33017+y*(-184.9052456)))));q=57568490411+y*(1029532985+y*(9494680.718+y*(59272.64853+y*(267.8532712+y))));return p/q;}const z=8/a,xx=a-.785398164; y=z*z;p=1+y*(-.1098628627e-2+y*(.2734510407e-4+y*(-.2073370639e-5+y*.2093887211e-6)));q=-.1562499995e-1+y*(.1430488765e-3+y*(-.6911147651e-5+y*(.7621095161e-6-y*.934945152e-7)));return Math.sqrt(.636619772/a)*(Math.cos(xx)*p-z*Math.sin(xx)*q); }
  function j1(x) { let a=Math.abs(x),y,p,q,result;if(a<8){y=x*x;p=x*(72362614232+y*(-7895059235+y*(242396853.1+y*(-2972611.439+y*(15704.48260+y*(-30.16036606))))));q=144725228442+y*(2300535178+y*(18583304.74+y*(99447.43394+y*(376.9991397+y))));return p/q;}const z=8/a,xx=a-2.356194491;y=z*z;p=1+y*(.183105e-2+y*(-.3516396496e-4+y*(.2457520174e-5+y*(-.240337019e-6))));q=.04687499995+y*(-.2002690873e-3+y*(.8449199096e-5+y*(-.88228987e-6+y*.105787412e-6)));result=Math.sqrt(.636619772/a)*(Math.cos(xx)*p-z*Math.sin(xx)*q);return x<0?-result:result; }
  function y0(x) { if(x<8){const z=x*x,p=-2957821389+z*(7062834065+z*(-512359803.6+z*(10879881.29+z*(-86327.92757+z*228.4622733)))),q=40076544269+z*(745249964.8+z*(7189466.438+z*(47447.26470+z*(226.1030244+z))));return p/q+.636619772*j0(x)*Math.log(x);}const z=8/x,xx=x-.785398164,w=z*z,p=1+w*(-.1098628627e-2+w*(.2734510407e-4+w*(-.2073370639e-5+w*.2093887211e-6))),q=-.1562499995e-1+w*(.1430488765e-3+w*(-.6911147651e-5+w*(.7621095161e-6+w*(-.934945152e-7))));return Math.sqrt(.636619772/x)*(Math.sin(xx)*p+z*Math.cos(xx)*q); }
  function y1(x) { if(x<8){const z=x*x,p=x*(-.4900604943e13+z*(.1275274390e13+z*(-.5153438139e11+z*(.7349264551e9+z*(-.4237922726e7+z*.8511937935e4))))),q=.2499580570e14+z*(.4244419664e12+z*(.3733650367e10+z*(.2245904002e8+z*(.1020426050e6+z*(.3549632885e3+z)))));return p/q+.636619772*(j1(x)*Math.log(x)-1/x);}const z=8/x,xx=x-2.356194491,w=z*z,p=1+w*(.183105e-2+w*(-.3516396496e-4+w*(.2457520174e-5+w*(-.240337019e-6)))),q=.04687499995+w*(-.2002690873e-3+w*(.8449199096e-5+w*(-.88228987e-6+w*.105787412e-6)));return Math.sqrt(.636619772/x)*(Math.sin(xx)*p+z*Math.cos(xx)*q); }
  const divideComplex = (a, b) => { const d=b.re*b.re+b.im*b.im; return { re:(a.re*b.re+a.im*b.im)/d, im:(a.im*b.re-a.re*b.im)/d }; };
  const theodorsen = (k) => { const h1={re:j1(k),im:-y1(k)},h0={re:j0(k),im:-y0(k)},den={re:h1.re-h0.im,im:h1.im+h0.re}; return divideComplex(h1,den); };

  const theodorsenCanvas = document.querySelector('[data-ce-theodorsen]');
  if (theodorsenCanvas) {
    const input = document.querySelector('[data-ce-theodorsen-k]');
    const readout = document.querySelector('[data-ce-theodorsen-readout]');
    const draw = () => {
      const { context, width, height } = fitCanvas(theodorsenCanvas);
      context.clearRect(0, 0, width, height);
      const padding = { left: 52, right: 18, top: 28, bottom: 42 };
      const plotWidth = width - padding.left - padding.right;
      const plotHeight = height - padding.top - padding.bottom;
      context.strokeStyle = colours.border;
      context.lineWidth = 1;
      for (let i = 0; i <= 5; i += 1) {
        const y = padding.top + (i * plotHeight) / 5;
        context.beginPath(); context.moveTo(padding.left, y); context.lineTo(width - padding.right, y); context.stroke();
      }
      for (let i = 0; i <= 6; i += 1) {
        const x = padding.left + (i * plotWidth) / 6;
        context.beginPath(); context.moveTo(x, padding.top); context.lineTo(x, height - padding.bottom); context.stroke();
      }
      const map = (k, value) => ({ x: padding.left + (k / 1.5) * plotWidth, y: padding.top + (1 - value) * plotHeight });
      const line = (getter, stroke) => {
        context.strokeStyle = stroke;
        context.lineWidth = 3;
        context.beginPath();
        for (let i = 0; i <= 220; i += 1) {
          const k = 0.01 + (1.49 * i) / 220;
          const p = map(k, getter(theodorsen(k)));
          if (i) context.lineTo(p.x, p.y); else context.moveTo(p.x, p.y);
        }
        context.stroke();
      };
      line((c) => Math.hypot(c.re, c.im), colours.cyan);
      line((c) => c.re, colours.violet);
      line((c) => -c.im, colours.pink);
      const k = Number(input.value);
      const c = theodorsen(k);
      const magnitude = Math.hypot(c.re, c.im);
      const phase = (Math.atan2(c.im, c.re) * 180) / Math.PI;
      const marker = map(k, magnitude);
      context.fillStyle = colours.fg;
      context.beginPath(); context.arc(marker.x, marker.y, 6, 0, Math.PI * 2); context.fill();
      context.font = '700 12px Inter, sans-serif';
      context.fillText('|C|', padding.left + 8, padding.top + 14);
      context.fillStyle = colours.violet; context.fillText('F', padding.left + 42, padding.top + 14);
      context.fillStyle = colours.pink; context.fillText('−G', padding.left + 62, padding.top + 14);
      context.fillStyle = colours.dim; context.fillText('reduced frequency k', width / 2 - 55, height - 12);
      readout.textContent = `k       : ${k.toFixed(2)}\nF(k)    : ${c.re.toFixed(5)}\nG(k)    : ${c.im.toFixed(5)}\n|C(k)|  : ${magnitude.toFixed(5)}\nphase   : ${phase.toFixed(2)}°`;
    };
    input.addEventListener('input', draw);
    addEventListener('resize', draw);
    draw();
  }

  const thesisReference = document.getElementById('ce-thesis-ref');
  const thesisModel = document.getElementById('ce-thesis-model');
  if (thesisReference && thesisModel) {
    const path = (phase, amplitude) => {
      let d = '';
      for (let i = 0; i <= 140; i += 1) {
        const x = 70 + (i / 140) * 650;
        const y = 175 - amplitude * Math.sin((i / 140) * Math.PI * 4 + phase) - 10 * Math.sin((i / 140) * Math.PI * 8);
        d += `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)} `;
      }
      return d;
    };
    thesisReference.setAttribute('d', path(0, 74));
    thesisModel.setAttribute('d', path(0.04, 72));
  }

  const phdCanvas = document.querySelector('[data-ce-phd]');
  if (phdCanvas) {
    const mode = document.querySelector('[data-ce-phd-mode]');
    const readout = document.querySelector('[data-ce-phd-readout]');
    const draw = () => {
      const { context, width, height } = fitCanvas(phdCanvas);
      context.clearRect(0, 0, width, height);
      const selected = mode.value;
      const pad = 42;
      const plotWidth = width - pad * 2;
      const plotHeight = height - pad * 2;
      context.strokeStyle = colours.border;
      context.strokeRect(pad, pad, plotWidth, plotHeight);
      const curve = (amplitude, phase, stroke, lineWidth) => {
        context.strokeStyle = stroke;
        context.lineWidth = lineWidth;
        context.beginPath();
        for (let i = 0; i <= 180; i += 1) {
          const angle = (i / 180) * Math.PI * 2;
          const x = pad + (i / 180) * plotWidth;
          const y = pad + plotHeight / 2 - amplitude * Math.sin(angle + phase) * plotHeight * 0.35;
          if (i) context.lineTo(x, y); else context.moveTo(x, y);
        }
        context.stroke();
      };
      if (selected === 'match') {
        curve(0.82, 0, colours.faint, 7);
        curve(0.81, 0.035, colours.cyan, 3);
        readout.textContent = 'known behaviour : present\nphase agreement : close\nresult          : useful evidence';
      } else {
        curve(0.82, 0, colours.faint, 7);
        curve(0.82, 0, colours.pink, 3);
        context.setLineDash([5, 5]);
        curve(0.82, 0.42, colours.violet, 2);
        context.setLineDash([]);
        readout.textContent = 'requested behaviour : phase lag\nimplemented model  : none\nresult             : applicability boundary';
      }
    };
    mode.addEventListener('change', draw);
    addEventListener('resize', draw);
    draw();
  }

  const hero = document.getElementById('ce-hero-canvas');
  if (hero) {
    const context = hero.getContext('2d');
    const draw = (time = 0) => {
      const rect = hero.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;
      hero.width = width * dpr;
      hero.height = height * dpr;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, width, height);
      for (let row = 0; row < 34; row += 1) {
        context.strokeStyle = row % 3 === 0 ? colours.cyan : row % 3 === 1 ? colours.violet : colours.fg;
        context.globalAlpha = 0.05 + (row % 5) * 0.018;
        context.lineWidth = 0.8 + (row % 4) * 0.35;
        context.beginPath();
        for (let i = 0; i <= 90; i += 1) {
          const x = -40 + (i / 90) * (width + 80);
          const base = ((row + 1) * height) / 36;
          const warp = 44 * Math.exp(-((x - width * 0.57) / (width * 0.22)) ** 2) * Math.sin(row * 0.58 + time * 0.00032);
          const y = base + warp + 9 * Math.sin(i * 0.15 + row * 0.8 + time * 0.00018);
          if (i) context.lineTo(x, y); else context.moveTo(x, y);
        }
        context.stroke();
      }
      context.globalAlpha = 1;
      requestAnimationFrame(draw);
    };
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) draw(0);
    else requestAnimationFrame(draw);
  }

  const progress = document.querySelector('.ti-progress');
  if (progress) {
    const update = () => {
      const maximum = document.documentElement.scrollHeight - innerHeight;
      progress.style.transform = `scaleX(${maximum > 0 ? scrollY / maximum : 0})`;
    };
    addEventListener('scroll', update, { passive: true });
    addEventListener('resize', update);
    update();
  }
})();
