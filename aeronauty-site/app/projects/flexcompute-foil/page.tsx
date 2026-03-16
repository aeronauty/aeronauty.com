'use client';

import { Playfair_Display, Lora, JetBrains_Mono } from 'next/font/google';
import { motion, useScroll, useTransform, AnimatePresence } from 'framer-motion';
import { useRef, useState, useEffect, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

const display = Playfair_Display({ subsets: ['latin'], display: 'swap' });
const serif = Lora({ subsets: ['latin'], display: 'swap' });
const mono = JetBrains_Mono({ subsets: ['latin'], display: 'swap' });

const DARK = 'bg-[#0c1222]';
const DARK_SURFACE = 'bg-[#111a2e]';
const PAPER = 'bg-[#f8f6f1]';
const ACCENT = '#c4841d';

const ease = [0.25, 0.4, 0.25, 1] as const;

function Reveal({ children, delay = 0, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 36 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.75, delay, ease }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function Stat({ value, label, delay = 0 }: { value: string; label: string; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.85 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.7, delay, ease }}
      className="text-center"
    >
      <div className={`${display.className} text-5xl font-bold sm:text-7xl`} style={{ color: ACCENT }}>
        {value}
      </div>
      <div className={`${serif.className} mt-2 text-sm uppercase tracking-widest text-slate-400`}>{label}</div>
    </motion.div>
  );
}

function Code({ children }: { children: ReactNode }) {
  return (
    <code className={`${mono.className} rounded bg-slate-800/90 px-1.5 py-0.5 text-[0.85em] text-amber-200/90`}>
      {children}
    </code>
  );
}

function CodeLight({ children }: { children: ReactNode }) {
  return (
    <code className={`${mono.className} rounded bg-[#e8e3d9] px-1.5 py-0.5 text-[0.85em] text-[#7c4a12]`}>
      {children}
    </code>
  );
}

/* ── Bug story data ── */

const bugs = [
  { stat: '50%', label: 'drag too high', title: 'The Safeguard That Froze the Solver' },
  { stat: '2\u00D7', label: 'velocity at leading edge', title: 'The Factor of Two' },
  { stat: '23\u00D7', label: 'transition too early', title: 'The Cascading Transition Disaster' },
  { stat: '78%\u200A\u2192\u200A18%', label: 'after one function swap', title: 'The Version Nobody Told You About' },
  { stat: '\u00D74', label: 'bugs in one equation', title: 'Four Bugs in One Equation' },
  { stat: '\u00B1', label: 'wrong sign on d\u03B8', title: 'When the Newton Solver Points the Wrong Way' },
  { stat: '10\u00D7', label: 'mass from ghost state', title: 'The Wake Ghost' },
  { stat: '.abs()', label: 'one Newton cycle off', title: 'The Sign in the Stagnation Coupling' },
];

const cascadeSteps = [
  'slightly wrong panelling',
  'slightly wrong edge velocity',
  'wrong boundary layer development',
  'spiked shape factor',
  'rapid N-factor amplification',
  'premature transition',
  'entire upper surface turbulent',
];

const validationEmbeds = [
  {
    title: 'Lift Polars Across Three Foils',
    description:
      'CL vs \u03B1 for NACA 0012, 2412 and 4412 from \u221215\u00B0 to +25\u00B0 in 0.5\u00B0 steps at Re\u2009=\u200910\u2076. This is the quickest way to see that the broad aerodynamic behaviour is lining up across symmetric and cambered sections. It reaches well into and beyond stall, so you can see both the clean linear region and where the nonlinear behaviour starts to separate the curves.',
    src: '/flexfoil-validation/polars.html',
    height: 620,
  },
  {
    title: 'Cp: NACA 0012',
    description:
      'The surface pressure distribution is where you find out whether the solver is reproducing the actual flow physics rather than just landing on roughly the right integrated coefficients. On a symmetric section the Cp must be antisymmetric at zero alpha and the suction peak must track correctly as incidence increases.',
    src: '/flexfoil-validation/cp-naca0012.html',
    height: 740,
  },
  {
    title: 'Cp: NACA 2412',
    description:
      'Mild camber is a good stress test because small changes in loading and stagnation behaviour show up clearly in Cp. The front-loaded pressure distribution on the upper surface and the aft recovery on the lower surface are both sensitive to how the solver handles the leading-edge velocity peak.',
    src: '/flexfoil-validation/cp-naca2412.html',
    height: 740,
  },
  {
    title: 'Cp: NACA 4412',
    description:
      'This more heavily cambered section is where you start to see whether the agreement still holds once the pressure recovery gets less forgiving. The larger adverse gradient on the upper surface pushes the boundary layer harder and the trailing-edge loading differences become more visible.',
    src: '/flexfoil-validation/cp-naca4412.html',
    height: 740,
  },
  {
    title: 'Error Envelopes',
    description:
      'I do not trust eyeballing overlays on its own. This view tracks the maximum Cp and \u03B3 discrepancies across the full cached validation sweep, so you can see directly how the worst-case errors evolve with angle of attack for each foil family rather than cherry-picking a single good-looking comparison.',
    src: '/flexfoil-validation/errors.html',
    height: 520,
  },
] as const;

/* ── Sticky bug panel (desktop) ── */

function BugPanel({ index }: { index: number }) {
  const bug = bugs[index];
  return (
    <div className="flex h-full flex-col items-center justify-center px-10">
      <AnimatePresence mode="wait">
        <motion.div
          key={index}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -14 }}
          transition={{ duration: 0.35, ease }}
          className="flex flex-col items-center text-center"
        >
          <span
            className={`${mono.className} text-6xl font-bold xl:text-7xl`}
            style={{ color: ACCENT }}
            dangerouslySetInnerHTML={{ __html: bug.stat }}
          />
          <span className={`${serif.className} mt-3 text-xs uppercase tracking-[0.2em] text-slate-500`}>
            {bug.label}
          </span>
          <h3
            className={`${display.className} mt-8 max-w-xs text-2xl font-bold leading-snug text-[#e8e6e1] xl:text-3xl`}
          >
            {bug.title}
          </h3>

          {/* Cascade chain for bug 2 */}
          {index === 2 && (
            <div className="mt-10 flex flex-col items-center gap-0">
              {cascadeSteps.map((step, i) => (
                <motion.div
                  key={step}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.35, delay: i * 0.07, ease }}
                  className="flex flex-col items-center"
                >
                  {i > 0 && (
                    <svg width="2" height="14" className="my-0.5" style={{ color: `${ACCENT}40` }}>
                      <line x1="1" y1="0" x2="1" y2="14" stroke="currentColor" strokeWidth="2" />
                    </svg>
                  )}
                  <span
                    className={`${mono.className} rounded-full px-3 py-1 text-xs`}
                    style={{
                      background: `rgba(196,132,29,${0.06 + i * 0.035})`,
                      color: i < 4 ? '#8a7a62' : i < 6 ? '#b45309' : ACCENT,
                      fontWeight: i === cascadeSteps.length - 1 ? 700 : 400,
                    }}
                  >
                    {step}
                  </span>
                </motion.div>
              ))}
            </div>
          )}

          {/* DAMPL2 grid for bug 3 */}
          {index === 3 && (
            <div className="mt-10 grid w-full max-w-xs grid-cols-3 gap-3">
              {[
                { foil: '0012', before: '6.8%', after: '6.8%' },
                { foil: '2412', before: '41%', after: '13%' },
                { foil: '4412', before: '78%', after: '18%' },
              ].map((r) => (
                <motion.div
                  key={r.foil}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, ease }}
                  className="rounded-lg bg-white/5 p-3 text-center"
                >
                  <div className={`${mono.className} text-[10px] text-slate-500`}>NACA {r.foil}</div>
                  <div className="mt-1.5 flex items-center justify-center gap-1.5">
                    <span className={`${mono.className} text-sm text-red-400/70 line-through`}>{r.before}</span>
                    <span className="text-slate-600">&rarr;</span>
                    <span className={`${mono.className} text-sm font-bold`} style={{ color: ACCENT }}>{r.after}</span>
                  </div>
                </motion.div>
              ))}
            </div>
          )}

          {/* Shear-lag four bugs for bug 4 */}
          {index === 4 && (
            <div className="mt-10 grid w-full max-w-xs grid-cols-2 gap-2">
              {['USA', 'CQA', 'CQ', 'DEA'].map((name) => (
                <motion.div
                  key={name}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.4, ease }}
                  className="rounded-lg bg-white/5 px-3 py-2.5 text-center"
                >
                  <span className={`${mono.className} text-sm font-bold`} style={{ color: ACCENT }}>{name}</span>
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Progress dots */}
      <div className="absolute bottom-10 flex gap-2">
        {bugs.map((_, i) => (
          <div
            key={i}
            className="h-1.5 w-1.5 rounded-full transition-colors duration-300"
            style={{ background: i === index ? ACCENT : '#1e293b' }}
          />
        ))}
      </div>
      <div className={`${mono.className} absolute bottom-10 right-8 text-xs text-slate-700`}>
        {index + 1}/{bugs.length}
      </div>
    </div>
  );
}

/* ── Inline mobile stat (shown < lg) ── */

function MobileStat({ bug }: { bug: (typeof bugs)[number] }) {
  return (
    <div className="mb-8 lg:hidden">
      <div className="flex items-baseline gap-3">
        <span
          className={`${mono.className} text-4xl font-bold`}
          style={{ color: ACCENT }}
          dangerouslySetInnerHTML={{ __html: bug.stat }}
        />
        <span className={`${serif.className} text-xs uppercase tracking-widest text-[#8a7a62]`}>{bug.label}</span>
      </div>
      <h3 className={`${display.className} mt-3 text-2xl font-bold text-[#1a1a2e]`}>{bug.title}</h3>
    </div>
  );
}

/* ── Prose wrapper ── */

function Prose({ children }: { children: ReactNode }) {
  return <div className={`${serif.className} space-y-5 text-lg leading-[1.85] text-[#3a3a4a]`}>{children}</div>;
}

/* ── Page ── */

export default function FlexComputeFoilPage() {
  const heroRef = useRef(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] });
  const heroY = useTransform(scrollYProgress, [0, 1], [0, 160]);
  const heroFade = useTransform(scrollYProgress, [0, 0.55], [1, 0]);

  const [activeBug, setActiveBug] = useState(0);
  const bugRefs = useRef<(HTMLDivElement | null)[]>([]);

  const [activeValidation, setActiveValidation] = useState(0);
  const valRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const bugObs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const idx = bugRefs.current.indexOf(entry.target as HTMLDivElement);
            if (idx !== -1) setActiveBug(idx);
          }
        }
      },
      { rootMargin: '-40% 0px -40% 0px' },
    );
    for (const ref of bugRefs.current) {
      if (ref) bugObs.observe(ref);
    }

    const valObs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const idx = valRefs.current.indexOf(entry.target as HTMLDivElement);
            if (idx !== -1) setActiveValidation(idx);
          }
        }
      },
      { rootMargin: '-35% 0px -35% 0px' },
    );
    for (const ref of valRefs.current) {
      if (ref) valObs.observe(ref);
    }

    return () => {
      bugObs.disconnect();
      valObs.disconnect();
    };
  }, []);

  return (
    <main className={`${serif.className} min-h-screen`}>
      {/* ──────── HERO ──────── */}
      <section
        ref={heroRef}
        className={`relative flex min-h-[100svh] items-center justify-center overflow-hidden ${DARK}`}
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_40%,rgba(59,110,165,0.12),transparent)]" />
        <motion.div style={{ y: heroY, opacity: heroFade }} className="relative z-10 mx-auto max-w-4xl px-6 text-center">
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1, delay: 0.2 }}
            className="mb-5 text-xs font-semibold uppercase tracking-[0.35em]"
            style={{ color: ACCENT }}
          >
            Project &middot; Flexcompute Foil
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.4, ease }}
            className={`${display.className} text-5xl font-bold leading-[1.1] text-[#e8e6e1] sm:text-7xl lg:text-8xl`}
          >
            What I Learned <br className="hidden sm:block" />
            Porting XFOIL to&nbsp;Rust
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.7, ease }}
            className="mx-auto mt-8 max-w-2xl text-lg leading-relaxed text-slate-400 sm:text-xl"
          >
            Living inside Drela&rsquo;s code for two months, rebuilding XFOIL in Rust and WebAssembly,
            and then forcing it to justify itself directly against the original.
          </motion.p>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 1 }}
            className="mt-6 text-sm text-slate-500"
          >
            Harry Smith
          </motion.p>
        </motion.div>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 1.5 }}
          className="absolute bottom-10 left-1/2 -translate-x-1/2 text-slate-500"
        >
          <ChevronDown className="h-6 w-6 animate-bounce" />
        </motion.div>
      </section>

      {/* ──────── CONTEXT ──────── */}
      <section className={`${PAPER} py-24 sm:py-32`}>
        <div className="mx-auto max-w-3xl px-6">
          <Reveal>
            <p className="text-xl leading-[1.9] text-[#3a3a4a]">
              I wanted a browser-based airfoil analysis tool with real-time visualisation &mdash; adaptive
              streamlines, surface pressure vectors, smoke particle tracing, GPU-accelerated rendering, the
              whole thing. But the only honest way to get there was to port the real solver. Not a simplified
              panel method. Not an &ldquo;inspired by&rdquo; clone. The actual XFOIL logic, compiled to WASM,
              running in a browser tab.
            </p>
          </Reveal>
          <Reveal delay={0.15}>
            <p className="mt-8 text-xl leading-[1.9] text-[#3a3a4a]">
              The result is <strong className="font-semibold text-[#1a1a2e]">Flexcompute Foil</strong>. Try it
              at{' '}
              <a
                className="font-medium underline decoration-[#c4841d]/40 underline-offset-4 transition hover:decoration-[#c4841d]"
                style={{ color: ACCENT }}
                href="https://foil.flexcompute.com/flexfoil/"
                target="_blank"
                rel="noreferrer"
              >
                foil.flexcompute.com
              </a>
              .
            </p>
          </Reveal>
        </div>
      </section>

      {/* ──────── APPLET ──────── */}
      <section className="bg-white py-16 sm:py-20">
        <Reveal className="mx-auto max-w-5xl px-6">
          <div className="overflow-hidden rounded-2xl border border-slate-200 shadow-lg">
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-6 py-4">
              <div>
                <h2 className={`${display.className} text-xl font-semibold text-slate-900`}>Try the Applet</h2>
                <p className="mt-1 text-sm text-slate-500">
                  NACA 2412 &middot; &alpha;=4&deg; &middot; Re=10<sup>6</sup> &middot; viscous
                </p>
              </div>
              <a
                className="hidden items-center rounded-full px-5 py-2 text-sm font-semibold text-white transition hover:brightness-110 sm:inline-flex"
                style={{ background: ACCENT }}
                href="https://foil.flexcompute.com/flexfoil/canvas?naca=2412&alpha=4&re=1000000&solver=viscous&streamlines=1&cp=1&forces=1&theme=light"
                target="_blank"
                rel="noreferrer"
              >
                Open in New Tab
              </a>
            </div>
            <iframe
              src="https://foil.flexcompute.com/flexfoil/canvas?naca=2412&alpha=4&re=1000000&solver=viscous&streamlines=1&cp=1&forces=1&theme=light"
              title="Interactive Flexcompute Foil example"
              className="h-[640px] w-full"
              loading="lazy"
            />
          </div>
        </Reveal>
      </section>

      {/* ──────── VALIDATION — SCROLLYTELLING ──────── */}
      <section className={DARK}>
        {/* Header */}
        <div className="mx-auto max-w-3xl px-6 pb-8 pt-24 sm:pt-32">
          <Reveal>
            <h2 className={`${display.className} text-3xl font-bold text-[#e8e6e1] sm:text-4xl`}>
              What the Validation Actually Looks Like
            </h2>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="mt-6 text-lg leading-[1.85] text-slate-400">
              Not screenshots, not marketing art &mdash; the actual cached Plotly comparisons from the parity
              sweep against XFOIL. The{' '}
              <a
                className="underline decoration-slate-600 underline-offset-4 transition hover:decoration-slate-400"
                href="/flexfoil-validation/dashboard.html"
                target="_blank"
                rel="noreferrer"
                style={{ color: ACCENT }}
              >
                full dashboard
              </a>{' '}
              has everything in one place.
            </p>
          </Reveal>
        </div>

        {/* Side-by-side: scrolling text (left) ↔ sticky chart (right) */}
        <div className="lg:flex">
          {/* Scrolling descriptions */}
          <div className="lg:w-[38%]">
            {validationEmbeds.map((embed, i) => (
              <div
                key={embed.src}
                ref={(el) => { valRefs.current[i] = el; }}
                className="min-h-[70vh] border-t border-white/5 px-6 py-16 sm:px-10 lg:flex lg:items-center lg:py-[18vh] xl:px-14"
              >
                <div>
                  <Reveal>
                    <h3 className={`${display.className} text-xl font-semibold text-[#e8e6e1] sm:text-2xl`}>
                      {embed.title}
                    </h3>
                  </Reveal>
                  <Reveal delay={0.08}>
                    <p className="mt-4 text-base leading-[1.85] text-slate-400">{embed.description}</p>
                  </Reveal>
                  {/* Progress */}
                  <div className="mt-6 flex items-center gap-2">
                    {validationEmbeds.map((_, j) => (
                      <div
                        key={j}
                        className="h-1 rounded-full transition-all duration-300"
                        style={{
                          width: j === i ? 24 : 6,
                          background: j === i ? ACCENT : '#1e293b',
                        }}
                      />
                    ))}
                    <span className={`${mono.className} ml-2 text-xs text-slate-600`}>
                      {i + 1}/{validationEmbeds.length}
                    </span>
                  </div>
                </div>
              </div>
            ))}
            {/* Mobile fallback: inline charts */}
            <div className="space-y-8 px-6 pb-16 lg:hidden">
              {validationEmbeds.map((embed) => (
                <div key={embed.src} className={`overflow-hidden rounded-2xl ${DARK_SURFACE} ring-1 ring-white/5`}>
                  <iframe
                    src={embed.src}
                    title={embed.title}
                    className="w-full"
                    style={{ height: `${embed.height}px` }}
                    loading="lazy"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Sticky chart panel (desktop) */}
          <div
            className={`hidden lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-[62%] lg:items-center lg:justify-center ${DARK_SURFACE} border-l border-white/5 p-4`}
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={activeValidation}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3, ease }}
                className="h-full w-full overflow-hidden rounded-xl ring-1 ring-white/5"
              >
                <iframe
                  src={validationEmbeds[activeValidation].src}
                  title={validationEmbeds[activeValidation].title}
                  className="h-full w-full"
                  loading="lazy"
                />
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* Bottom padding */}
        <div className="h-12 sm:h-16" />
      </section>

      {/* ──────── INTERSTITIAL ──────── */}
      <section className="flex min-h-[60vh] items-center justify-center bg-[#080d17] px-6 sm:min-h-[70vh]">
        <div className="text-center">
          <Reveal>
            <p className={`${display.className} text-3xl font-bold text-[#e8e6e1] sm:text-5xl`}>
              The validation looks clean.
            </p>
          </Reveal>
          <Reveal delay={0.3}>
            <p className={`${display.className} mt-4 text-3xl font-bold sm:text-5xl`} style={{ color: ACCENT }}>
              Here is what it took to get there.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ──────── BUG STORIES — SCROLLYTELLING ──────── */}
      <section>
        <div className="lg:flex">
          {/* Sticky visual panel (desktop) */}
          <div
            className={`hidden lg:flex lg:sticky lg:top-0 lg:h-screen lg:w-[42%] ${DARK} relative items-center justify-center border-r border-white/5`}
          >
            <BugPanel index={activeBug} />
          </div>

          {/* Scrolling prose */}
          <div className={`${PAPER} lg:w-[58%]`}>
            {/* ── Bug 0: Safeguard ── */}
            <div
              ref={(el) => { bugRefs.current[0] = el; }}
              className="min-h-[70vh] px-6 py-20 sm:px-10 lg:py-[20vh] xl:px-16"
            >
              <MobileStat bug={bugs[0]} />
              <Prose>
                <p>
                  Early on, RustFoil&rsquo;s drag was 50% too high and lift errors ranged from &minus;8% to
                  +14%. It took days. The root cause was an edge velocity update being clamped by a safety
                  limit we had added: a &plusmn;5% cap on how much the edge velocity could change per Newton
                  iteration, relative to the inviscid baseline.
                </p>
                <p>
                  The problem was that the clamp was computed relative to the <em>inviscid</em> value, not
                  the <em>current</em> value. After the first iteration the edge velocity shifted slightly. On
                  iteration two, the correction was computed against the original again, so the clamp
                  effectively prevented any further change. The edge velocity froze after iteration one. XFOIL
                  does not have this safeguard. Drela just lets the Newton solver do its job.
                </p>
                <p className="border-l-2 pl-5 italic text-[#6a6a7a]" style={{ borderColor: ACCENT }}>
                  If your solver needs a clamp to not blow up, the clamp is not the solution &mdash;
                  understanding why it blows up is.
                </p>
              </Prose>
            </div>

            {/* ── Bug 1: Factor of Two ── */}
            <div
              ref={(el) => { bugRefs.current[1] = el; }}
              className="min-h-[70vh] border-t border-[#d6cfc0]/50 px-6 py-20 sm:px-10 lg:py-[20vh] xl:px-16"
            >
              <MobileStat bug={bugs[1]} />
              <Prose>
                <p>
                  Near the leading edge, RustFoil&rsquo;s inviscid edge velocities were consistently about
                  twice XFOIL&rsquo;s. Further downstream, they converged to within a few percent. Too
                  systematic for a random bug. Not constant enough for a simple normalisation error.
                </p>
                <p>
                  The answer: repanelling. XFOIL&rsquo;s <CodeLight>PANE</CodeLight> command distributes panel
                  nodes with specific curvature-based refinement near the leading edge. RustFoil&rsquo;s
                  repanelling was producing slightly different node positions. Near the stagnation point, even
                  tiny differences in panel placement produce large differences in computed velocity. When we
                  fed XFOIL&rsquo;s own panelling into RustFoil&rsquo;s solver, every velocity matched to five
                  significant figures.
                </p>
                <p>
                  This also taught me a painful testing lesson. I had a helper,{' '}
                  <CodeLight>make_naca0012(160)</CodeLight>, that generates a NACA 0012 with 160 points. It
                  produces <em>different geometry</em> from XFOIL&rsquo;s own panelled output. For weeks I was
                  comparing one geometry against another and wondering why the numbers disagreed.
                </p>
              </Prose>
            </div>

            {/* ── Bug 2: Cascade ── */}
            <div
              ref={(el) => { bugRefs.current[2] = el; }}
              className="min-h-[70vh] border-t border-[#d6cfc0]/50 px-6 py-20 sm:px-10 lg:py-[20vh] xl:px-16"
            >
              <MobileStat bug={bugs[2]} />
              {/* Mobile cascade */}
              <div className="mb-8 flex flex-col items-center gap-0 lg:hidden">
                {cascadeSteps.map((step, i) => (
                  <div key={step} className="flex flex-col items-center">
                    {i > 0 && (
                      <svg width="2" height="14" className="my-0.5" style={{ color: `${ACCENT}40` }}>
                        <line x1="1" y1="0" x2="1" y2="14" stroke="currentColor" strokeWidth="2" />
                      </svg>
                    )}
                    <span
                      className={`${mono.className} rounded-full px-3 py-1 text-xs`}
                      style={{
                        background: `rgba(196,132,29,${0.06 + i * 0.035})`,
                        color: i < 4 ? '#8a7a62' : i < 6 ? '#b45309' : ACCENT,
                        fontWeight: i === cascadeSteps.length - 1 ? 700 : 400,
                      }}
                    >
                      {step}
                    </span>
                  </div>
                ))}
              </div>
              <Prose>
                <p>
                  XFOIL predicts laminar-to-turbulent transition using an envelope e<sup>N</sup> method.
                  RustFoil was triggering transition 23&times; earlier than XFOIL. At &alpha;=4&deg;, we were
                  transitioning at 0.65% chord instead of 14.75%. The entire upper surface was turbulent when
                  it should have had 15% laminar flow.
                </p>
                <p>
                  The error chain was brutal. Each step amplified the previous one. A
                  few percent error in panel placement cascaded into a 2,300% error in transition location.
                  This is exactly why aerodynamics is hard.
                </p>
              </Prose>
            </div>

            {/* ── Bug 3: DAMPL2 ── */}
            <div
              ref={(el) => { bugRefs.current[3] = el; }}
              className="min-h-[70vh] border-t border-[#d6cfc0]/50 px-6 py-20 sm:px-10 lg:py-[20vh] xl:px-16"
            >
              <MobileStat bug={bugs[3]} />
              <Prose>
                <p>
                  RustFoil&rsquo;s stall prediction was off in a Reynolds-number-dependent way: too early at
                  low Re, too late at high Re. On a cambered NACA 4412 at Re=1M, the error was 78%.
                </p>
                <p>
                  We had ported XFOIL&rsquo;s 1987 amplification rate function (<CodeLight>DAMPL</CodeLight>)
                  instead of the 1996 update (<CodeLight>DAMPL2</CodeLight>). XFOIL&rsquo;s source contains
                  both. There is no comment explaining that one supersedes the other. The newer version adds an
                  exponential correction for laminar separation bubbles and blends to an Orr-Sommerfeld rate
                  when the kinematic shape factor exceeds 3.5.
                </p>
                {/* Mobile DAMPL2 grid */}
                <div className="grid grid-cols-3 gap-3 lg:hidden">
                  {[
                    { foil: 'NACA 0012', before: '6.8%', after: '6.8%' },
                    { foil: 'NACA 2412', before: '41%', after: '13%' },
                    { foil: 'NACA 4412', before: '78%', after: '18%' },
                  ].map((r) => (
                    <div key={r.foil} className="rounded-xl bg-[#e8e3d9]/60 p-3 text-center">
                      <div className={`${mono.className} text-xs text-[#8a7a62]`}>{r.foil}</div>
                      <div className="mt-1.5 flex items-center justify-center gap-1.5">
                        <span className={`${mono.className} text-sm text-red-700/70 line-through`}>{r.before}</span>
                        <span className="text-[#8a7a62]">&rarr;</span>
                        <span className={`${mono.className} text-sm font-bold`} style={{ color: ACCENT }}>{r.after}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <p>
                  The kind of bug that looks like a physics modelling deficiency until you realise you are
                  running the wrong version of the physics model.
                </p>
              </Prose>
            </div>

            {/* ── Bug 4: Shear-lag ── */}
            <div
              ref={(el) => { bugRefs.current[4] = el; }}
              className="min-h-[70vh] border-t border-[#d6cfc0]/50 px-6 py-20 sm:px-10 lg:py-[20vh] xl:px-16"
            >
              <MobileStat bug={bugs[4]} />
              <Prose>
                <p>
                  After transition, the turbulent boundary layer was blowing up. The kinematic shape factor
                  would collapse from a healthy 2.5 to 1.05, and the shear stress coefficient would hit its
                  maximum clamp within two stations.
                </p>
                <p>
                  The shear-lag equation in <CodeLight>xblsys.f</CodeLight> had four independent bugs in our
                  port: <strong>USA</strong> (averaging H<sub>s</sub> instead of computing U<sub>s</sub>),{' '}
                  <strong>CQA</strong> (using H<sub>k</sub> where XFOIL uses CQ), <strong>CQ itself</strong>{' '}
                  (not computed at all), and <strong>DEA</strong> (recomputed from an approximate formula
                  instead of the stored blvar value).
                </p>
                <p>
                  Finding it required reading the Fortran carefully enough to understand what each variable{' '}
                  <em>is</em>, not just what its name suggests. <CodeLight>USA</CodeLight> is not the country.
                </p>
              </Prose>
            </div>

            {/* ── Bug 5: Newton sign ── */}
            <div
              ref={(el) => { bugRefs.current[5] = el; }}
              className="min-h-[70vh] border-t border-[#d6cfc0]/50 px-6 py-20 sm:px-10 lg:py-[20vh] xl:px-16"
            >
              <MobileStat bug={bugs[5]} />
              <Prose>
                <p>
                  This one was infuriating. The Newton iteration was producing updates with the wrong sign.
                  XFOIL would compute
                  d&theta;&thinsp;&asymp;&thinsp;&minus;5&times;10<sup>&minus;6</sup>, and RustFoil would
                  compute d&theta;&thinsp;&asymp;&thinsp;+15.7&times;10<sup>&minus;6</sup>. The 4&times;4
                  solve was correct. The closures were validated against 60 test vectors. The Jacobian was
                  within 0.1%. And the update still pointed the wrong direction.
                </p>
                <p>
                  I lost a week on this. The debugging plan had five phases &mdash; matrix assembly, sign
                  conventions, XFOIL&rsquo;s formulation of{' '}
                  <CodeLight>J&middot;dx&thinsp;=&thinsp;&minus;r</CodeLight> versus{' '}
                  <CodeLight>J&middot;dx&thinsp;=&thinsp;r</CodeLight>, the lot. The fix turned out to be in
                  the shape equation Jacobian row. Two missing terms. But finding them took running both solvers
                  on the same input, dumping the full 4&times;4 system at each station, and diffing element by
                  element.
                </p>
              </Prose>
            </div>

            {/* ── Bug 6: Wake ghost ── */}
            <div
              ref={(el) => { bugRefs.current[6] = el; }}
              className="min-h-[70vh] border-t border-[#d6cfc0]/50 px-6 py-20 sm:px-10 lg:py-[20vh] xl:px-16"
            >
              <MobileStat bug={bugs[6]} />
              <Prose>
                <p>
                  XFOIL&rsquo;s stagnation point can move during the viscous iteration. When it does, panels
                  get reclassified: wake rows become airfoil rows, or the other way around. We had a bug where
                  a reclassified row retained its wake state &mdash; a wake-gap thickness value
                  (<CodeLight>dw</CodeLight>) that made the last airfoil row roughly 10&times; too heavy in the
                  next mass reconstruction.
                </p>
                <p>
                  A related bug: <CodeLight>store_to_row()</CodeLight> never wrote{' '}
                  <CodeLight>dw</CodeLight> for wake rows and never cleared it for non-wake rows. On a clean
                  attached-flow case, invisible. On a stalled NACA 4412 at 20&deg;, it blew up the entire
                  Newton iteration.
                </p>
                <p>
                  I also found that the transition station index (<CodeLight>itran</CodeLight>) was stored as a
                  0-based Rust index when the rest of the state model expected XFOIL&rsquo;s 1-based numbering.
                  Two lines to fix. A full day to find.
                </p>
              </Prose>
            </div>

            {/* ── Bug 7: Stagnation sign ── */}
            <div
              ref={(el) => { bugRefs.current[7] = el; }}
              className="min-h-[70vh] border-t border-[#d6cfc0]/50 px-6 py-20 sm:px-10 lg:py-[20vh] xl:px-16"
            >
              <MobileStat bug={bugs[7]} />
              <Prose>
                <p>
                  This one I genuinely couldn&rsquo;t believe. The lower-side inviscid velocity was being seeded
                  with <CodeLight>(-q_inv).abs()</CodeLight> instead of the signed velocity component. For
                  attached flow, the magnitudes are close enough that it barely matters. For post-stall flow at
                  20&deg;, where the stagnation point is migrating rapidly and the lower leading-edge velocities
                  change sign? It matters completely.
                </p>
                <p>
                  The wrong sign propagated through the coupled Newton assembly into the cross-surface forcing
                  term (DULE2), which fed the upper-surface momentum equation, which drove the relaxation
                  factor, which determined whether the stagnation point moved on iteration 9 or iteration 10.
                  One <CodeLight>.abs()</CodeLight> call. One Newton cycle off.
                </p>
              </Prose>
            </div>
          </div>
        </div>
      </section>

      {/* ──────── STATS ──────── */}
      <section className={`${DARK} py-24 sm:py-32`}>
        <Reveal className="mx-auto max-w-3xl px-6 text-center">
          <h2 className={`${display.className} text-3xl font-bold text-[#e8e6e1] sm:text-4xl`}>
            How 365 Tests and an Instrumented Fortran Binary Got Us Here
          </h2>
        </Reveal>
        <div className="mx-auto mt-16 grid max-w-3xl grid-cols-2 gap-10 px-6 sm:grid-cols-4">
          <Stat value="365" label="test functions" delay={0} />
          <Stat value="10" label="Rust crates" delay={0.1} />
          <Stat value="57" label="test files" delay={0.2} />
          <Stat value="29" label="coupling tests" delay={0.3} />
        </div>
        <div className="mx-auto mt-20 max-w-3xl space-y-6 px-6 text-lg leading-[1.85] text-slate-400">
          <Reveal>
            <p>
              The bulk of the Fortran-to-Rust translation was done by AI coding agents. They were remarkably
              good at the syntactic conversion: translating array indexing, handling Fortran&rsquo;s implicit
              typing, converting <Code>GOTO</Code>-based control flow into structured Rust. For the boring,
              mechanical parts &mdash; porting a 200-line subroutine line by line &mdash; they saved me weeks.
            </p>
          </Reveal>
          <Reveal delay={0.08}>
            <p>
              What they could not do was understand the <em className="text-slate-300">intent</em>. When a
              subroutine applies a seemingly arbitrary correction factor, the agent faithfully ports the
              arithmetic. But deciding whether that factor is a physical model, a numerical stabilisation trick,
              or a bug that happened to work &mdash; that requires understanding the aerodynamics. Every bug
              above was found by a human reading the Fortran, not by an AI.
            </p>
          </Reveal>
          <Reveal delay={0.12}>
            <p>
              The instrumented Fortran binary is as important as the tests. I forked XFOIL and added JSON debug
              dumps at every major checkpoint: <Code>BLVAR</Code>, <Code>BLDIF</Code>, <Code>MRCHUE</Code>,{' '}
              <Code>SETBL</Code>, <Code>BLSOLV</Code>, <Code>UPDATE</Code>, <Code>QDCALC</Code>,{' '}
              <Code>TRCHEK2</Code>, <Code>UESET</Code>, <Code>STFIND</Code>, <Code>STMOVE</Code>. When a
              parity test fails, I run both solvers on the same geometry and diff element by element.
            </p>
          </Reveal>
          <Reveal delay={0.14}>
            <p>
              Building the instrumentation was one of the few places where the agents were genuinely
              faster than me. XFOIL&rsquo;s Fortran has no debug output to speak of.
              My approach was to add structured JSON dumps at the entry and exit of every major subroutine:
              inputs going in, outputs coming out, key intermediate values along the way. This is exactly the
              kind of work agents are good at and that I find soul-destroying: read a 200-line Fortran
              subroutine, identify every variable that matters, write a <Code>WRITE</Code> statement that
              serialises it to JSON, handle the array indexing, make sure the I/O does not change the execution
              order. I pointed an agent at each subroutine, told it what I needed, and it produced the
              instrumentation. It did in hours what would have taken me days of tedious Fortran editing.
            </p>
          </Reveal>
          <Reveal delay={0.16}>
            <p>
              The real value was not in any single dump &mdash; it was in the comparison pipeline. Once both
              solvers emit the same structured data at the same checkpoints, you can write a harness that runs
              a test case through both, parses both JSON outputs, and diffs them field by field. When the
              NACA 4412 at 20&deg; diverges at iteration 9, you do not have to guess where. You can see
              that <Code>SETBL</Code> row <Code>IV=2</Code> has a Jacobian entry that is 2.3&times; larger
              in Rust, trace that back to a <Code>BLDIF</Code> sensitivity that disagrees, and from there to
              the specific closure derivative that is wrong. You can actually find things instead of
              guessing.
            </p>
          </Reveal>
          <Reveal delay={0.18}>
            <p>
              The instrumentation is also what made the &ldquo;four bugs in one equation&rdquo; discovery
              possible. Without the ability to compare <Code>BLVAR</Code> outputs field by field at each
              station, I would have been staring at a divergent shape factor and guessing which of a dozen
              closure quantities was wrong. With the dumps, I could see that <Code>CQ</Code> was zero in Rust
              and nonzero in XFOIL, that <Code>US</Code> was just an average of H<sub>s</sub> instead of the
              proper formula, and that <Code>DEA</Code> was close but not quite right &mdash; all in the same
              comparison run. Four bugs, found in one sitting, because the data was there to look at.
            </p>
          </Reveal>
          <Reveal delay={0.2}>
            <p>
              There is one thing the validation sweep still does not do automatically, and it should: split the
              polar. XFOIL&rsquo;s viscous solver is path-dependent &mdash; each point uses the previous
              converged solution as its initial guess. The right technique is two legs:
              0&deg;&thinsp;&rarr;&thinsp;&minus;15&deg; and 0&deg;&thinsp;&rarr;&thinsp;+25&deg;, so you
              always approach from a known-good starting point. Some remaining parity misses near stall are
              almost certainly sweep-direction artefacts.
            </p>
          </Reveal>
          <Reveal delay={0.2}>
            <p className="border-l-2 border-slate-600 pl-5 italic text-slate-500">
              The AI did the boring parts. Drela did the brilliant parts forty years ago. I did the bit in the
              middle &mdash; understanding enough of both to connect them, and writing enough tests to prove
              the connection holds.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ──────── CLOSING ──────── */}
      <section className="bg-[#080d17] py-24 sm:py-32">
        <div className="mx-auto max-w-3xl px-6">
          <Reveal>
            <h2 className={`${display.className} text-3xl font-bold text-[#e8e6e1] sm:text-4xl`}>
              Why This Changed My View of XFOIL
            </h2>
          </Reveal>
          <div className="mt-10 space-y-6 text-lg leading-[1.85] text-slate-400">
            <Reveal delay={0.08}>
              <p>
                I should say: I know Mark &mdash; we have been in a few of the same meetings, and I asked his
                permission to do this over beers rather than over email. He said yes, which was gracious.
                I have worked with Guppy extensively, and I have always known he was sharp. But there is a
                difference between <em className="text-slate-300">using</em> someone&rsquo;s work
                and <em className="text-slate-300">living inside it</em> for two months, trying to reproduce
                every numerical decision they made.
              </p>
            </Reveal>
            <Reveal delay={0.1}>
              <p>
                This project gave me a much deeper appreciation for quite how brilliant the work is. The
                cleverness is not where you would expect &mdash; it is not in the headline algorithms that get
                written up in papers. It is in the hundreds of small decisions that keep the whole thing from
                falling apart: the sign convention at the stagnation point, the specific way the wake-to-airfoil
                handoff clears state, the particular relaxation limits that let the Newton solver run free
                without blowing up. Every time I found a bug in RustFoil, the fix was always &ldquo;do what
                Mark did.&rdquo;
              </p>
            </Reveal>
            <Reveal delay={0.14}>
              <p>
                The result is a solver that, forty years later, remains the standard reference. Every comparison
                in every paper uses XFOIL as the benchmark. The e<sup>N</sup> transition model is still the
                practical standard. The global Newton coupling scheme is still the architecture everyone builds on.
              </p>
            </Reveal>
            <Reveal delay={0.18}>
              <p>
                The Rust version is faster in places, dramatically more accessible, and much easier to
                instrument. But the solver &mdash; the part that actually matters &mdash; is Mark&rsquo;s,
                through and through.
              </p>
            </Reveal>
            <Reveal delay={0.2}>
              <p className="text-slate-500">
                The full RustFoil source will be publicly available shortly. I just need to tidy up the codebase
                and rename a few variables that acquired their names during late-night debugging sessions and are
                not suitable for polite company.
              </p>
            </Reveal>
          </div>
          <Reveal delay={0.3}>
            <div className="mt-16 border-t border-slate-800 pt-8 text-sm text-slate-600">
              <em>
                Flexcompute Foil is a free, browser-based airfoil analysis tool. Try it at{' '}
                <a
                  className="underline underline-offset-4 transition hover:text-slate-400"
                  href="https://foil.flexcompute.com/flexfoil/"
                  target="_blank"
                  rel="noreferrer"
                >
                  foil.flexcompute.com
                </a>
                .
              </em>
            </div>
          </Reveal>
        </div>
      </section>
    </main>
  );
}
