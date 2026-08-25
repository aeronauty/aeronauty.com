import { add, numericalVortexPanelVelocity, relativeVectorError, sum, trailingFilamentStrengths, vortexPanelVelocity } from './vortex-core.js';

(() => {
  const staticMode = new URLSearchParams(window.location.search).has('static') || navigator.webdriver;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const css = getComputedStyle(document.documentElement);
  const colors = {
    fg: css.getPropertyValue('--ti-fg').trim() || '#e8eef7',
    dim: css.getPropertyValue('--ti-fg-dim').trim() || '#9aa9bd',
    faint: css.getPropertyValue('--ti-fg-faint').trim() || '#697991',
    accent: css.getPropertyValue('--ti-accent').trim() || '#35cbe8',
    accent2: css.getPropertyValue('--ti-accent-2').trim() || '#9c6cff',
    accent3: css.getPropertyValue('--ti-accent-3').trim() || '#ff7a90',
    border: css.getPropertyValue('--ti-border').trim() || '#2a3850',
  };

  const fitCanvas = (canvas) => {
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(320, rect.width);
    const h = Math.max(220, rect.height || rect.width / 1.8);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h };
  };

  const world = (p, w, h) => ({ x: p.x * w, y: (1 - p.y) * h });
  const screen = (p, w, h) => ({ x: p.x / w, y: 1 - p.y / h });
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  function drawGrid(ctx, w, h) {
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = colors.border;
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 1;
    for (let i = 1; i < 10; i++) {
      ctx.beginPath(); ctx.moveTo(i * w / 10, 0); ctx.lineTo(i * w / 10, h); ctx.stroke();
    }
    for (let i = 1; i < 6; i++) {
      ctx.beginPath(); ctx.moveTo(0, i * h / 6); ctx.lineTo(w, i * h / 6); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function arrow(ctx, from, vec, scale, color, label) {
    const to = { x: from.x + vec.x * scale, y: from.y - vec.y * scale };
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke();
    const a = Math.atan2(to.y - from.y, to.x - from.x);
    ctx.beginPath(); ctx.moveTo(to.x, to.y); ctx.lineTo(to.x - 11 * Math.cos(a - 0.45), to.y - 11 * Math.sin(a - 0.45)); ctx.lineTo(to.x - 11 * Math.cos(a + 0.45), to.y - 11 * Math.sin(a + 0.45)); ctx.closePath(); ctx.fill();
    if (label) { ctx.font = '600 12px Inter, sans-serif'; ctx.fillText(label, to.x + 8, to.y - 8); }
  }

  function dot(ctx, p, color, label) {
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, Math.PI * 2); ctx.fill();
    if (label) { ctx.font = '700 12px Inter, sans-serif'; ctx.fillText(label, p.x + 10, p.y - 10); }
  }

  function draggable(canvas, getPoints, onMove) {
    let active = null;
    const locate = (event) => {
      const rect = canvas.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };
    canvas.addEventListener('pointerdown', (event) => {
      const p = locate(event); const { w, h } = fitCanvas(canvas);
      let best = Infinity;
      for (const [key, worldPoint] of Object.entries(getPoints())) {
        const s = world(worldPoint, w, h); const dist = Math.hypot(s.x - p.x, s.y - p.y);
        if (dist < best && dist < 28) { best = dist; active = key; }
      }
      if (active) canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener('pointermove', (event) => {
      if (!active) return;
      const p = locate(event); const { w, h } = fitCanvas(canvas);
      const q = screen(p, w, h);
      onMove(active, { x: clamp(q.x, 0.04, 0.96), y: clamp(q.y, 0.06, 0.94) });
    });
    const stop = () => { active = null; };
    canvas.addEventListener('pointerup', stop); canvas.addEventListener('pointercancel', stop);
  }

  const single = document.querySelector('[data-ce-vortex-single]');
  if (single) {
    const gamma = document.querySelector('[data-ce-single-gamma]');
    const readout = document.querySelector('[data-ce-single-readout]');
    const state = { A:{x:.18,y:.34}, B:{x:.78,y:.62}, P:{x:.52,y:.79} };
    const draw = () => {
      const { ctx,w,h } = fitCanvas(single); drawGrid(ctx,w,h);
      const A=world(state.A,w,h),B=world(state.B,w,h),P=world(state.P,w,h);
      ctx.strokeStyle=colors.accent;ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(A.x,A.y);ctx.lineTo(B.x,B.y);ctx.stroke();
      dot(ctx,A,colors.accent,'A');dot(ctx,B,colors.accent,'B');dot(ctx,P,colors.accent3,'P');
      const g=Number(gamma.value); const exact=vortexPanelVelocity(state.A,state.B,state.P,g); const quad=numericalVortexPanelVelocity(state.A,state.B,state.P,g);
      const mag=Math.hypot(exact.x,exact.y); const scale=clamp(130/(mag||1),35,260); arrow(ctx,P,exact,scale,colors.accent3,'u(P)');
      const err=relativeVectorError(exact,quad);
      readout.textContent=`closed form : (${exact.x.toFixed(6)}, ${exact.y.toFixed(6)})\nquadrature  : (${quad.x.toFixed(6)}, ${quad.y.toFixed(6)})\nrelative error: ${err.toExponential(2)}\nstatus      : ${err < 2e-5 ? 'PASS' : 'CHECK'}`;
    };
    draggable(single,()=>state,(key,p)=>{state[key]=p;draw();}); gamma.addEventListener('input',draw); window.addEventListener('resize',draw); draw();
  }

  const doubleCanvas=document.querySelector('[data-ce-vortex-double]');
  if(doubleCanvas){
    const g1=document.querySelector('[data-ce-double-g1]'),g2=document.querySelector('[data-ce-double-g2]'),px=document.querySelector('[data-ce-double-px]'),py=document.querySelector('[data-ce-double-py]'),out=document.querySelector('[data-ce-double-readout]');
    const s={A1:{x:.12,y:.68},B1:{x:.75,y:.78},A2:{x:.2,y:.25},B2:{x:.86,y:.4}};
    const draw=()=>{const{ctx,w,h}=fitCanvas(doubleCanvas);drawGrid(ctx,w,h); const Pn={x:+px.value,y:+py.value}; const P=world(Pn,w,h);
      for(const [a,b,c] of [['A1','B1',colors.accent],['A2','B2',colors.accent2]]){const A=world(s[a],w,h),B=world(s[b],w,h);ctx.strokeStyle=c;ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(A.x,A.y);ctx.lineTo(B.x,B.y);ctx.stroke();dot(ctx,A,c,a);dot(ctx,B,c,b)} dot(ctx,P,colors.accent3,'P');
      const v1=vortexPanelVelocity(s.A1,s.B1,Pn,+g1.value),v2=vortexPanelVelocity(s.A2,s.B2,Pn,+g2.value),v=add(v1,v2); const scale=clamp(125/(Math.hypot(v.x,v.y)||1),35,230); arrow(ctx,P,v1,scale,colors.accent,'u₁');arrow(ctx,P,v2,scale,colors.accent2,'u₂');arrow(ctx,P,v,scale,colors.accent3,'Σ');
      out.textContent=`u₁ = (${v1.x.toFixed(4)}, ${v1.y.toFixed(4)})\nu₂ = (${v2.x.toFixed(4)}, ${v2.y.toFixed(4)})\nΣ  = (${v.x.toFixed(4)}, ${v.y.toFixed(4)})\nlinearity residual: 0 (by construction)`;};
    draggable(doubleCanvas,()=>s,(k,p)=>{s[k]=p;draw()});[g1,g2,px,py].forEach(x=>x.addEventListener('input',draw));window.addEventListener('resize',draw);draw();
  }

  const trailing=document.querySelector('[data-ce-trailing]');
  if(trailing){const shape=document.querySelector('[data-ce-trailing-shape]'),nIn=document.querySelector('[data-ce-trailing-n]'),out=document.querySelector('[data-ce-trailing-readout]');
    const gammaAt=(y,type)=>{const r=Math.abs(y);if(type==='bell')return Math.max(0,1-r*r)*(1-.28*Math.cos(2*Math.PI*y));if(type==='notched')return Math.max(0,Math.sqrt(Math.max(0,1-r*r))-.32*Math.exp(-90*y*y));return Math.sqrt(Math.max(0,1-r*r));};
    const draw=()=>{const{ctx,w,h}=fitCanvas(trailing);ctx.clearRect(0,0,w,h);const n=+nIn.value,type=shape.value,ys=Array.from({length:n},(_,i)=>-1+2*i/(n-1)),gs=ys.map(y=>gammaAt(y,type));
      const x0=w*.12,xWing=w*.32,xFar=w*.94,yMid=h*.52,span=h*.78;ctx.strokeStyle=colors.faint;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(xWing,yMid-span/2);ctx.lineTo(xWing,yMid+span/2);ctx.stroke();
      ctx.strokeStyle=colors.accent;ctx.lineWidth=3;ctx.beginPath();ys.forEach((y,i)=>{const p={x:x0+gs[i]*w*.15,y:yMid-y*span/2};if(i)ctx.lineTo(p.x,p.y);else ctx.moveTo(p.x,p.y)});ctx.stroke();
      const filaments=trailingFilamentStrengths(gs); for(let i=0;i<filaments.length;i++){const y=i===0?ys[0]:i===filaments.length-1?ys.at(-1):(ys[i-1]+ys[i])/2,delta=filaments[i];const py=yMid-y*span/2;ctx.strokeStyle=delta>=0?colors.accent2:colors.accent3;ctx.globalAlpha=.25+Math.min(.75,Math.abs(delta)*3);ctx.lineWidth=1+Math.abs(delta)*16;ctx.beginPath();ctx.moveTo(xWing,py);ctx.bezierCurveTo(w*.5,py+12*Math.sin(i),w*.72,py-10*Math.cos(i),xFar,py);ctx.stroke();ctx.globalAlpha=1;}
      ctx.fillStyle=colors.dim;ctx.font='600 12px Inter';ctx.fillText('Γ(y)',x0,yMid-span/2-18);ctx.fillText('bound circulation',xWing-55,yMid+span/2+28);ctx.fillText('trailed ΔΓ',xFar-74,yMid-span/2-18);
      out.textContent=`stations       : ${n}\nmax Γ          : ${Math.max(...gs).toFixed(3)}\nΣ all trailing Γ: ${sum(filaments).toExponential(2)}\ntip jumps       : ${filaments[0].toFixed(3)}, ${filaments.at(-1).toFixed(3)}`;};[shape,nIn].forEach(x=>x.addEventListener('input',draw));window.addEventListener('resize',draw);draw();}

  const shed=document.querySelector('[data-ce-shed]');
  if(shed){const k=document.querySelector('[data-ce-shed-k]'),phase=document.querySelector('[data-ce-shed-phase]'),button=document.querySelector('[data-ce-shed-play]'),out=document.querySelector('[data-ce-shed-readout]');let playing=!staticMode,last=performance.now();
    const draw=()=>{const{ctx,w,h}=fitCanvas(shed);ctx.clearRect(0,0,w,h);const ph=+phase.value,kv=+k.value,xWing=w*.16,y0=h*.5;ctx.strokeStyle=colors.faint;ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(xWing,y0-h*.12);ctx.lineTo(xWing,y0+h*.12);ctx.stroke();
      const wakeLen=w*.75,N=70;for(let i=0;i<N;i++){const age=i/(N-1)*6.2;const x=xWing+age/6.2*wakeLen;const sign=Math.cos(ph-age*kv*5);const r=2.5+5*Math.abs(sign);ctx.fillStyle=sign>=0?colors.accent2:colors.accent3;ctx.globalAlpha=.18+.7*Math.abs(sign);ctx.beginPath();ctx.arc(x,y0+42*Math.sin(ph-age*kv*5),r,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;
      const g=Math.sin(ph),dg=Math.cos(ph)*kv,step=.04,previous=Math.sin(ph-step),deltaBound=g-previous,deltaShed=-(g-previous),residual=deltaBound+deltaShed;ctx.fillStyle=colors.fg;ctx.font='700 13px Inter';ctx.fillText(`Γ(t) = ${g.toFixed(3)}`,22,34);ctx.fillText(`dΓ/dt = ${dg.toFixed(3)}`,22,55);ctx.fillStyle=colors.dim;ctx.fillText('past circulation remains downstream',w*.45,h*.86);out.textContent=`k        : ${kv.toFixed(2)}\nphase    : ${ph.toFixed(2)} rad\nΓbound   : ${g.toFixed(4)}\nΔΓbound  : ${deltaBound.toExponential(2)}\nΔΓshed   : ${deltaShed.toExponential(2)}\nresidual : ${residual.toExponential(1)}`;};
    const tick=(now)=>{if(playing){const dt=Math.min(.05,(now-last)/1000);phase.value=(+phase.value+dt*(1.2+3*+k.value))%(Math.PI*2);draw();}last=now;if(!staticMode)requestAnimationFrame(tick)};[k,phase].forEach(x=>x.addEventListener('input',draw));button.addEventListener('click',()=>{playing=!playing;button.textContent=playing?'Pause':'Play'});window.addEventListener('resize',draw);draw();if(!staticMode)requestAnimationFrame(tick);}

  function besselJ0(x){let ax=Math.abs(x),y,ans1,ans2;if(ax<8){y=x*x;ans1=57568490574+y*(-13362590354+y*(651619640.7+y*(-11214424.18+y*(77392.33017+y*(-184.9052456)))));ans2=57568490411+y*(1029532985+y*(9494680.718+y*(59272.64853+y*(267.8532712+y))));return ans1/ans2;}let z=8/ax,xx=ax-.785398164;y=z*z;ans1=1+y*(-.1098628627e-2+y*(.2734510407e-4+y*(-.2073370639e-5+y*.2093887211e-6)));ans2=-.1562499995e-1+y*(.1430488765e-3+y*(-.6911147651e-5+y*(.7621095161e-6-y*.934945152e-7)));return Math.sqrt(.636619772/ax)*(Math.cos(xx)*ans1-z*Math.sin(xx)*ans2)}
  function besselJ1(x){let ax=Math.abs(x),y,ans1,ans2,ans;if(ax<8){y=x*x;ans1=x*(72362614232+y*(-7895059235+y*(242396853.1+y*(-2972611.439+y*(15704.48260+y*(-30.16036606))))));ans2=144725228442+y*(2300535178+y*(18583304.74+y*(99447.43394+y*(376.9991397+y))));return ans1/ans2;}let z=8/ax,xx=ax-2.356194491;y=z*z;ans1=1+y*(.183105e-2+y*(-.3516396496e-4+y*(.2457520174e-5+y*(-.240337019e-6))));ans2=.04687499995+y*(-.2002690873e-3+y*(.8449199096e-5+y*(-.88228987e-6+y*.105787412e-6)));ans=Math.sqrt(.636619772/ax)*(Math.cos(xx)*ans1-z*Math.sin(xx)*ans2);return x<0?-ans:ans}
  function besselY0(x){if(x<8){let y=x*x,ans1=-2957821389+y*(7062834065+y*(-512359803.6+y*(10879881.29+y*(-86327.92757+y*228.4622733)))),ans2=40076544269+y*(745249964.8+y*(7189466.438+y*(47447.26470+y*(226.1030244+y))));return ans1/ans2+.636619772*besselJ0(x)*Math.log(x)}let z=8/x,xx=x-.785398164,y=z*z,ans1=1+y*(-.1098628627e-2+y*(.2734510407e-4+y*(-.2073370639e-5+y*.2093887211e-6))),ans2=-.1562499995e-1+y*(.1430488765e-3+y*(-.6911147651e-5+y*(.7621095161e-6+y*(-.934945152e-7))));return Math.sqrt(.636619772/x)*(Math.sin(xx)*ans1+z*Math.cos(xx)*ans2)}
  function besselY1(x){if(x<8){let y=x*x,ans1=x*(-.4900604943e13+y*(.1275274390e13+y*(-.5153438139e11+y*(.7349264551e9+y*(-.4237922726e7+y*.8511937935e4))))),ans2=.2499580570e14+y*(.4244419664e12+y*(.3733650367e10+y*(.2245904002e8+y*(.1020426050e6+y*(.3549632885e3+y)))));return ans1/ans2+.636619772*(besselJ1(x)*Math.log(x)-1/x)}let z=8/x,xx=x-2.356194491,y=z*z,ans1=1+y*(.183105e-2+y*(-.3516396496e-4+y*(.2457520174e-5+y*(-.240337019e-6)))),ans2=.04687499995+y*(-.2002690873e-3+y*(.8449199096e-5+y*(-.88228987e-6+y*.105787412e-6)));return Math.sqrt(.636619772/x)*(Math.sin(xx)*ans1+z*Math.cos(xx)*ans2)}
  const cdiv=(a,b)=>{const d=b.re*b.re+b.im*b.im;return{re:(a.re*b.re+a.im*b.im)/d,im:(a.im*b.re-a.re*b.im)/d}};
  function theodorsen(k){const h1={re:besselJ1(k),im:-besselY1(k)},h0={re:besselJ0(k),im:-besselY0(k)},den={re:h1.re-h0.im,im:h1.im+h0.re};return cdiv(h1,den)}
  const tc=document.querySelector('[data-ce-theodorsen]');if(tc){const ki=document.querySelector('[data-ce-theodorsen-k]'),out=document.querySelector('[data-ce-theodorsen-readout]');const draw=()=>{const{ctx,w,h}=fitCanvas(tc);ctx.clearRect(0,0,w,h);const pad={l:52,r:18,t:28,b:42},pw=w-pad.l-pad.r,ph=h-pad.t-pad.b;ctx.strokeStyle=colors.border;ctx.lineWidth=1;for(let i=0;i<=5;i++){const y=pad.t+i*ph/5;ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(w-pad.r,y);ctx.stroke()}for(let i=0;i<=6;i++){const x=pad.l+i*pw/6;ctx.beginPath();ctx.moveTo(x,pad.t);ctx.lineTo(x,h-pad.b);ctx.stroke()}
    const map=(k,v)=>({x:pad.l+(k/1.5)*pw,y:pad.t+(1-v)*ph});const drawLine=(getter,color)=>{ctx.strokeStyle=color;ctx.lineWidth=3;ctx.beginPath();for(let i=0;i<=220;i++){const k=.01+(1.49*i/220),c=theodorsen(k),v=getter(c),p=map(k,v);i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y)}ctx.stroke()};drawLine(c=>Math.hypot(c.re,c.im),colors.accent);drawLine(c=>c.re,colors.accent2);drawLine(c=>-c.im,colors.accent3);
    const kv=+ki.value,c=theodorsen(kv),mag=Math.hypot(c.re,c.im),phase=Math.atan2(c.im,c.re)*180/Math.PI,p=map(kv,mag);ctx.fillStyle=colors.fg;ctx.beginPath();ctx.arc(p.x,p.y,6,0,Math.PI*2);ctx.fill();ctx.font='700 12px Inter';ctx.fillText('|C|',pad.l+8,pad.t+14);ctx.fillStyle=colors.accent2;ctx.fillText('F',pad.l+42,pad.t+14);ctx.fillStyle=colors.accent3;ctx.fillText('−G',pad.l+62,pad.t+14);ctx.fillStyle=colors.dim;ctx.fillText('reduced frequency k',w/2-55,h-12);out.textContent=`k       : ${kv.toFixed(2)}\nF(k)    : ${c.re.toFixed(5)}\nG(k)    : ${c.im.toFixed(5)}\n|C(k)|  : ${mag.toFixed(5)}\nphase   : ${phase.toFixed(2)}°`;};ki.addEventListener('input',draw);window.addEventListener('resize',draw);draw();}

  const thesisRef=document.getElementById('ce-thesis-ref'),thesisModel=document.getElementById('ce-thesis-model');if(thesisRef&&thesisModel){const path=(phase,amp)=>{let d='';for(let i=0;i<=140;i++){const x=70+i/140*650,y=175-amp*Math.sin(i/140*Math.PI*4+phase)-10*Math.sin(i/140*Math.PI*8);d+=`${i?'L':'M'}${x.toFixed(1)} ${y.toFixed(1)} `}return d};thesisRef.setAttribute('d',path(0,74));thesisModel.setAttribute('d',path(.04,72));}

  const hero=document.getElementById('ce-hero-canvas');if(hero){const ctx=hero.getContext('2d');let raf;const draw=(t=0)=>{const rect=hero.getBoundingClientRect(),w=rect.width,h=rect.height;hero.width=w*dpr;hero.height=h*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);for(let j=0;j<34;j++){ctx.strokeStyle=j%3===0?colors.accent:j%3===1?colors.accent2:colors.fg;ctx.globalAlpha=.05+(j%5)*.018;ctx.lineWidth=.8+(j%4)*.35;ctx.beginPath();for(let i=0;i<=90;i++){const x=-40+i/90*(w+80),base=(j+1)*h/36,warp=44*Math.exp(-Math.pow((x-w*.57)/(w*.22),2))*Math.sin(j*.58+t*.00032);const y=base+warp+9*Math.sin(i*.15+j*.8+t*.00018);i?ctx.lineTo(x,y):ctx.moveTo(x,y)}ctx.stroke()}ctx.globalAlpha=1;if(!staticMode)raf=requestAnimationFrame(draw)};if(!staticMode && !matchMedia('(prefers-reduced-motion: reduce)').matches)raf=requestAnimationFrame(draw);else draw(0);}

  const progress=document.querySelector('.ti-progress');const updateProgress=()=>{const max=document.documentElement.scrollHeight-innerHeight;progress.style.transform=`scaleX(${max>0?scrollY/max:0})`};addEventListener('scroll',updateProgress,{passive:true});addEventListener('resize',updateProgress);updateProgress();
})();
