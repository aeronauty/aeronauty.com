import {
  canonicalSegmentCase,
  complexMagnitude,
  complexPhase,
  finiteVortexSegmentVelocity,
  interpolateTheodorsen,
  shedVortexStrength,
  superposeSegments,
  trailingVortexStrengths,
} from '../calibration-core.mjs';
import { THEODORSEN } from '../theodorsen-data.mjs';

const $ = selector => document.querySelector(selector);
const stage = $('#stage');
const controls = $('#controls');
const readout = $('#readout');
const note = $('#note');
const legend = $('#legend');
const colors = { ink:'#18181b', muted:'#64646d', rule:'#e7e5df', accent:'#0f766e', blue:'#2563eb', red:'#c2410c', purple:'#7c3aed', faint:'#aaa9a2' };
const state = {
  segment: { ax:-1, ay:0, bx:1, by:0, px:0, py:1, gamma:1 },
  superposition: { y1:-0.45, y2:0.5, px:0.15, py:1.25, gamma1:1, gamma2:-0.55 },
  trailing: { stations:13, exponent:0.58, gammaMax:1 },
  shed: { frequency:0.48, convection:1.1, amplitude:1, running:true },
  theodorsen: { k:0.2, alpha:4 },
};
const copy = {
  segment:['One finite vortex element','Move A, B and P. The number comes from the same finite-segment primitive the test checks.'],
  superposition:['The seam called superposition','Two sensible elements, one composed answer.'],
  trailing:['From bound circulation to trailing vorticity','The spanwise difference in bound circulation is the wake strength.'],
  shed:['A changing load leaves a wake','Every change in bound circulation creates an equal-and-opposite shed increment.'],
  theodorsen:['A known unsteady answer','Theodorsen compresses harmonic wake memory into a complex multiplier.'],
};
let cleanup = () => {};

function slider(key,label,min,max,step,value,suffix='') {
  const digits = step < 1 ? 2 : 0;
  return `<div class="control"><label><span>${label}</span><span class="value" data-value="${key}">${Number(value).toFixed(digits)}${suffix}</span></label><input data-key="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${value}"></div>`;
}
function bind(target, render, suffixes={}) {
  controls.querySelectorAll('[data-key]').forEach(input => input.addEventListener('input', () => {
    target[input.dataset.key] = Number(input.value);
    const digits = Number(input.step) < 1 ? 2 : 0;
    controls.querySelector(`[data-value="${input.dataset.key}"]`).textContent = `${Number(input.value).toFixed(digits)}${suffixes[input.dataset.key] || ''}`;
    render();
  }));
}
function metric(label,value,good=false) {
  return `<div class="metric${good?' good':''}"><span>${label}</span><strong>${value}</strong></div>`;
}
function mapPoint({x,y},w=900,h=500) {
  return { x:(x+2.2)/4.4*w, y:h-(y+1.6)/3.2*h };
}
function grid() {
  let lines='<rect width="900" height="500" fill="#fff"/>';
  for(let x=50;x<900;x+=50) lines += `<line x1="${x}" y1="0" x2="${x}" y2="500" stroke="${colors.rule}"/>`;
  for(let y=50;y<500;y+=50) lines += `<line x1="0" y1="${y}" x2="900" y2="${y}" stroke="${colors.rule}"/>`;
  return lines;
}
function vortexMark(point,strength,color=colors.accent) {
  const p=mapPoint(point), r=Math.min(30,9+Math.abs(strength)*120);
  return strength >= 0
    ? `<g><circle cx="${p.x}" cy="${p.y}" r="${r}" fill="white" stroke="${color}" stroke-width="3"/><circle cx="${p.x}" cy="${p.y}" r="4" fill="${color}"/></g>`
    : `<g><circle cx="${p.x}" cy="${p.y}" r="${r}" fill="white" stroke="${color}" stroke-width="3"/><path d="M${p.x-r*.45},${p.y-r*.45}L${p.x+r*.45},${p.y+r*.45}M${p.x+r*.45},${p.y-r*.45}L${p.x-r*.45},${p.y+r*.45}" stroke="${color}" stroke-width="3"/></g>`;
}

function renderSegment() {
  const s=state.segment;
  controls.innerHTML=slider('ax','A · x',-1.8,.3,.05,s.ax)+slider('ay','A · y',-1.2,1.2,.05,s.ay)+slider('bx','B · x',-.3,1.8,.05,s.bx)+slider('by','B · y',-1.2,1.2,.05,s.by)+slider('px','P · x',-1.8,1.8,.05,s.px)+slider('py','P · y',-1.4,1.4,.05,s.py)+slider('gamma','Γ',-2,2,.05,s.gamma);
  const draw=()=>{
    const a={x:s.ax,y:s.ay,z:0}, b={x:s.bx,y:s.by,z:0}, p={x:s.px,y:s.py,z:0};
    const v=finiteVortexSegmentVelocity(a,b,p,s.gamma), A=mapPoint(a), B=mapPoint(b), P=mapPoint(p);
    const c=canonicalSegmentCase();
    const canonical=[s.ax,s.ay,s.bx,s.by,s.px,s.py,s.gamma].every((value,index)=>Math.abs(value-[c.a.x,c.a.y,c.b.x,c.b.y,c.p.x,c.p.y,1][index])<1e-9);
    stage.innerHTML=`<svg viewBox="0 0 900 500" role="img" aria-label="Finite vortex segment and interrogation point">${grid()}<line x1="${A.x}" y1="${A.y}" x2="${B.x}" y2="${B.y}" stroke="${colors.ink}" stroke-width="7" stroke-linecap="round"/>${vortexMark(p,v.z)}<circle cx="${A.x}" cy="${A.y}" r="10" fill="${colors.blue}"/><text x="${A.x+14}" y="${A.y-12}" fill="${colors.blue}" font-size="18" font-weight="800">A</text><circle cx="${B.x}" cy="${B.y}" r="10" fill="${colors.red}"/><text x="${B.x+14}" y="${B.y-12}" fill="${colors.red}" font-size="18" font-weight="800">B</text><circle cx="${P.x}" cy="${P.y}" r="7" fill="${colors.accent}"/><text x="${P.x+14}" y="${P.y-12}" fill="${colors.accent}" font-size="18" font-weight="800">P</text><text x="30" y="468" fill="${colors.muted}" font-size="14">⊙ out of page · ⊗ into page</text></svg>`;
    const pass=canonical && Math.abs(v.z-c.expected)<1e-12;
    readout.innerHTML=metric('u',v.singular?'singular':v.x.toExponential(3))+metric('v',v.singular?'singular':v.y.toExponential(3))+metric('w',v.singular?'singular':v.z.toFixed(8))+metric('canonical',canonical?`${pass?'PASS':'FAIL'} · ${c.expected.toFixed(8)}`:'move to default',pass);
  };
  bind(s,draw); draw();
  note.textContent='Default case: A=(-1,0), B=(1,0), P=(0,1), Γ=1. The expected out-of-plane velocity is 1/(2π√2).';
  legend.innerHTML='<span><i style="background:#2563eb"></i>A</span><span><i style="background:#c2410c"></i>B</span><span><i style="background:#0f766e"></i>P / induced velocity</span>';
}

function renderSuperposition() {
  const s=state.superposition;
  controls.innerHTML=slider('gamma1','Γ₁',-2,2,.05,s.gamma1)+slider('y1','element 1 · y',-1.1,.7,.05,s.y1)+slider('gamma2','Γ₂',-2,2,.05,s.gamma2)+slider('y2','element 2 · y',-.7,1.1,.05,s.y2)+slider('px','P · x',-1.7,1.7,.05,s.px)+slider('py','P · y',-.1,1.45,.05,s.py);
  const draw=()=>{
    const p={x:s.px,y:s.py,z:0};
    const one={a:{x:-1.4,y:s.y1,z:0},b:{x:1.4,y:s.y1,z:0},gamma:s.gamma1};
    const two={a:{x:-1.2,y:s.y2,z:0},b:{x:1.2,y:s.y2,z:0},gamma:s.gamma2};
    const v1=finiteVortexSegmentVelocity(one.a,one.b,p,one.gamma),v2=finiteVortexSegmentVelocity(two.a,two.b,p,two.gamma),total=superposeSegments([one,two],p);
    const A1=mapPoint(one.a),B1=mapPoint(one.b),A2=mapPoint(two.a),B2=mapPoint(two.b),P=mapPoint(p);
    stage.innerHTML=`<svg viewBox="0 0 900 500" role="img" aria-label="Two vortex elements superposed at P">${grid()}<line x1="${A1.x}" y1="${A1.y}" x2="${B1.x}" y2="${B1.y}" stroke="${colors.blue}" stroke-width="7"/><line x1="${A2.x}" y1="${A2.y}" x2="${B2.x}" y2="${B2.y}" stroke="${colors.red}" stroke-width="7"/>${vortexMark(p,total.z)}<circle cx="${P.x}" cy="${P.y}" r="7" fill="${colors.accent}"/><text x="32" y="40" fill="${colors.blue}" font-size="16" font-weight="800">w₁=${v1.z.toFixed(5)}</text><text x="32" y="67" fill="${colors.red}" font-size="16" font-weight="800">w₂=${v2.z.toFixed(5)}</text></svg>`;
    readout.innerHTML=metric('w₁',v1.z.toFixed(7))+metric('w₂',v2.z.toFixed(7))+metric('w₁+w₂',(v1.z+v2.z).toFixed(7))+metric('computed',total.z.toFixed(7),Math.abs(total.z-v1.z-v2.z)<1e-13);
  };
  bind(s,draw); draw();
  note.textContent='Each primitive can be right while the useful quantity lives in their composition. Here the seam is vector addition.';
  legend.innerHTML='<span><i style="background:#2563eb"></i>element 1</span><span><i style="background:#c2410c"></i>element 2</span><span><i style="background:#0f766e"></i>combined</span>';
}

function renderTrailing() {
  const s=state.trailing;
  controls.innerHTML=slider('stations','spanwise stations',7,21,2,s.stations)+slider('exponent','loading shape',.25,1.5,.05,s.exponent)+slider('gammaMax','peak Γ',.25,2,.05,s.gammaMax);
  const draw=()=>{
    const n=Math.round(s.stations),ys=Array.from({length:n},(_,i)=>-1+2*i/(n-1));
    const bound=ys.map(y=>s.gammaMax*Math.pow(Math.max(0,1-y*y),s.exponent)),wake=trailingVortexStrengths(bound);
    const x=y=>95+(y+1)/2*735, gy=g=>220-g/s.gammaMax*155, wy=y=>330-y*100;
    const curve=bound.map((g,i)=>`${i?'L':'M'}${x(ys[i])},${gy(g)}`).join(' ');
    const filaments=wake.map((g,i)=>`<line x1="95" y1="${wy((ys[i]+ys[i+1])/2)}" x2="830" y2="${wy((ys[i]+ys[i+1])/2)}" stroke="${g>=0?colors.blue:colors.red}" stroke-width="${1.5+Math.abs(g)*9}" opacity=".72"/>`).join('');
    stage.innerHTML=`<svg viewBox="0 0 900 500" role="img" aria-label="Bound circulation and trailing-vortex differences"><rect width="900" height="500" fill="#fff"/><text x="35" y="38" fill="${colors.muted}" font-size="13">bound Γ(y)</text><path d="${curve}" fill="none" stroke="${colors.accent}" stroke-width="5"/><line x1="95" y1="220" x2="830" y2="220" stroke="${colors.rule}"/><text x="35" y="278" fill="${colors.muted}" font-size="13">wake filaments · Γᵢ−Γᵢ₊₁</text>${filaments}<text x="95" y="475" fill="${colors.muted}" font-size="12">wing</text><text x="770" y="475" fill="${colors.muted}" font-size="12">wake →</text></svg>`;
    const sum=wake.reduce((a,b)=>a+b,0);
    readout.innerHTML=metric('stations',n)+metric('filaments',wake.length)+metric('Σ wake Γ',sum.toExponential(2),Math.abs(sum)<1e-12)+metric('largest |ΔΓ|',Math.max(...wake.map(Math.abs)).toFixed(4));
  };
  bind(s,draw); draw();
  note.textContent='Zero circulation at both tips makes the discrete trailing strengths telescope to zero. The wake is the spanwise derivative made visible.';
  legend.innerHTML='<span><i style="background:#0f766e"></i>bound circulation</span><span><i style="background:#2563eb"></i>positive wake</span><span><i style="background:#c2410c"></i>negative wake</span>';
}

function renderShed() {
  const s=state.shed;
  controls.innerHTML=slider('frequency','frequency',.15,1.2,.01,s.frequency,' Hz')+slider('convection','convection U',.4,2,.05,s.convection)+slider('amplitude','peak Γ',.25,1.8,.05,s.amplitude)+`<div class="button-row"><button id="toggle" class="action primary">${s.running?'Pause':'Run'}</button><button id="clear" class="action">Clear wake</button></div>`;
  stage.innerHTML='<canvas aria-label="Shed vorticity convecting from a sinusoidally changing bound circulation"></canvas>';
  const canvas=stage.querySelector('canvas'),ctx=canvas.getContext('2d');
  let wake=[],last=performance.now(),sample=0,phase=0,previous=0,raf=0;
  const draw=now=>{
    const rect=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);
    canvas.width=Math.max(1,rect.width*dpr);canvas.height=Math.max(1,rect.height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);
    const w=rect.width,h=rect.height,dt=Math.min(.05,(now-last)/1000);last=now;
    if(s.running){phase+=dt*2*Math.PI*s.frequency;sample+=dt;if(sample>.08){const next=s.amplitude*Math.sin(phase);wake.push({x:.15,g:shedVortexStrength(previous,next)});previous=next;sample=0;}wake.forEach(v=>v.x+=s.convection*dt);wake=wake.filter(v=>v.x<8.2);}
    ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);ctx.strokeStyle=colors.rule;for(let x=0;x<9;x++){const px=60+x/8.5*(w-90);ctx.beginPath();ctx.moveTo(px,30);ctx.lineTo(px,h-30);ctx.stroke();}
    const cx=60,cy=h/2;ctx.strokeStyle=colors.ink;ctx.lineWidth=6;ctx.beginPath();ctx.moveTo(cx-28,cy);ctx.lineTo(cx+28,cy);ctx.stroke();
    wake.forEach(v=>{const x=60+v.x/8.5*(w-90),r=Math.min(18,4+Math.abs(v.g)*45);ctx.strokeStyle=v.g>=0?colors.blue:colors.red;ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,cy,r,0,Math.PI*2);ctx.stroke();ctx.fillStyle=ctx.strokeStyle;ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 14px sans-serif';ctx.fillText(v.g>=0?'·':'×',x,cy);});
    const bound=s.amplitude*Math.sin(phase);ctx.fillStyle=bound>=0?colors.blue:colors.red;ctx.fillRect(26,cy-(bound>=0?Math.abs(bound)*70:0),14,Math.abs(bound)*70);
    readout.innerHTML=metric('bound Γ',bound.toFixed(4))+metric('last shed ΔΓ',(wake.at(-1)?.g??0).toFixed(4))+metric('wake elements',wake.length)+metric('balance','Γold−Γnew');
    raf=requestAnimationFrame(draw);
  };
  bind(s,()=>{});$('#toggle').addEventListener('click',event=>{s.running=!s.running;event.currentTarget.textContent=s.running?'Pause':'Run'});$('#clear').addEventListener('click',()=>wake=[]);
  note.textContent='The animation uses the same shed-circulation balance tested in Node: a change in bound circulation is paid for in the wake.';
  legend.innerHTML='<span><i style="background:#2563eb"></i>positive shed circulation</span><span><i style="background:#c2410c"></i>negative shed circulation</span>';
  raf=requestAnimationFrame(draw);cleanup=()=>cancelAnimationFrame(raf);
}

function renderTheodorsen() {
  const s=state.theodorsen;
  controls.innerHTML=slider('k','reduced frequency k',.01,2,.01,s.k)+slider('alpha','pitch amplitude',.5,8,.1,s.alpha,'°');
  const draw=()=>{
    const c=interpolateTheodorsen(s.k,THEODORSEN),mag=complexMagnitude(c),phase=complexPhase(c);
    const top={x:70,y:45,w:760,h:185},bot={x:70,y:295,w:760,h:155};
    const fx=f=>top.x+(f-.48)/.54*top.w,gy=g=>top.y+top.h-(g+.2)/.21*top.h;
    const locus=THEODORSEN.map((r,i)=>`${i?'L':'M'}${fx(r.f).toFixed(2)},${gy(r.g).toFixed(2)}`).join(' ');
    let quasi='',unsteady='';
    for(let i=0;i<=160;i++){const t=i/160*2*Math.PI,x=bot.x+i/160*bot.w;quasi+=`${i?'L':'M'}${x},${bot.y+bot.h/2-Math.sin(t)*bot.h*.38}`;unsteady+=`${i?'L':'M'}${x},${bot.y+bot.h/2-Math.sin(t+phase)*mag*bot.h*.38}`;}
    stage.innerHTML=`<svg viewBox="0 0 900 500" role="img" aria-label="Theodorsen locus and harmonic lift comparison"><rect width="900" height="500" fill="#fff"/><text x="70" y="27" fill="${colors.muted}" font-size="13">C(k)=F+iG</text><rect x="${top.x}" y="${top.y}" width="${top.w}" height="${top.h}" fill="#fbfbf8" stroke="${colors.rule}"/><path d="${locus}" fill="none" stroke="${colors.accent}" stroke-width="4"/><circle cx="${fx(c.f)}" cy="${gy(c.g)}" r="8" fill="${colors.ink}"/><text x="70" y="278" fill="${colors.muted}" font-size="13">2π lift slope · quasi-steady and wake-corrected</text><rect x="${bot.x}" y="${bot.y}" width="${bot.w}" height="${bot.h}" fill="#fbfbf8" stroke="${colors.rule}"/><path d="${quasi}" fill="none" stroke="${colors.faint}" stroke-width="3" stroke-dasharray="8 7"/><path d="${unsteady}" fill="none" stroke="${colors.purple}" stroke-width="4"/></svg>`;
    readout.innerHTML=metric('F(k)',c.f.toFixed(5))+metric('G(k)',c.g.toFixed(5))+metric('|C(k)|',mag.toFixed(5))+metric('phase',`${(phase*180/Math.PI).toFixed(2)}°`);
  };
  bind(s,draw,{alpha:'°'});draw();
  note.textContent='The table comes from the Hankel-function definition of C(k). The solid curve includes wake memory; the dashed curve is quasi-steady.';
  legend.innerHTML='<span><i style="background:#aaa9a2"></i>quasi-steady 2πα</span><span><i style="background:#7c3aed"></i>Theodorsen-corrected</span><span><i style="background:#0f766e"></i>C(k) locus</span>';
}

const renderers={segment:renderSegment,superposition:renderSuperposition,trailing:renderTrailing,shed:renderShed,theodorsen:renderTheodorsen};
function setMode(next) {
  cleanup();cleanup=()=>{};
  if(!renderers[next]) next='segment';
  const [title,dek]=copy[next];$('#title').textContent=title;$('#dek').textContent=dek;
  document.querySelectorAll('.tab').forEach(button=>button.setAttribute('aria-selected',button.dataset.mode===next?'true':'false'));
  renderers[next]();
}
document.querySelectorAll('.tab').forEach(button=>button.addEventListener('click',()=>setMode(button.dataset.mode)));
addEventListener('beforeunload',()=>cleanup());
setMode(new URLSearchParams(location.search).get('mode')||'segment');
