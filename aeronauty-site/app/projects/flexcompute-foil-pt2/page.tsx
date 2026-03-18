'use client';

import { Playfair_Display, Lora, JetBrains_Mono } from 'next/font/google';
import { motion, useScroll, useTransform } from 'framer-motion';
import { useRef, useState, useEffect, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import FlapDemo from './FlapDemo';

const display = Playfair_Display({ subsets: ['latin'], display: 'swap' });
const serif = Lora({ subsets: ['latin'], display: 'swap' });
const mono = JetBrains_Mono({ subsets: ['latin'], display: 'swap' });

const DARK = 'bg-[#0c1222]';
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

function Prose({ children }: { children: ReactNode }) {
  return <div className={`${serif.className} space-y-5 text-lg leading-[1.85] text-[#3a3a4a]`}>{children}</div>;
}

function DarkProse({ children }: { children: ReactNode }) {
  return <div className={`${serif.className} space-y-6 text-lg leading-[1.85] text-slate-400`}>{children}</div>;
}

const validationEmbeds = [
  {
    title: 'Flap Polars Across Eleven Deflections',
    description:
      'CL vs \u03B1 for the NACA 0012 with flap deflections from \u221225\u00B0 to +25\u00B0 in 5\u00B0 steps, hinge at 75% chord, Re\u2009=\u200910\u2076. XFOIL is dashed, Rustfoil is solid. For moderate deflections (\u00B110\u00B0) the curves lie on top of each other. At the extremes you can see where XFOIL gives up and Rustfoil keeps going \u2014 but also where the two start to diverge near stall.',
    src: '/flexfoil-validation/flap-polars.html',
    height: 720,
  },
  {
    title: 'Drag Polars',
    description:
      'CL vs CD tells you whether the solver is getting the viscous drag right, not just the lift. The drag bucket shape and the drag rise at high CL are both sensitive to boundary layer transition and the pressure recovery aft of the hinge. For \u00B110\u00B0 the agreement is very tight. For larger deflections the drag numbers start to diverge near CL_max, which is where the geometry difference (I skip XFOIL\u2019s arc-fill; it doesn\u2019t) shows up most.',
    src: '/flexfoil-validation/flap-drag-polars.html',
    height: 720,
  },
  {
    title: 'Error Envelopes',
    description:
      'The honest view. \u0394CL and \u0394CD between Rustfoil and XFOIL at every alpha where both converge. For |\u03B4|\u2009\u2264\u200910\u00B0 the errors are in the fourth decimal place \u2014 effectively zero. For |\u03B4|\u2009>\u200915\u00B0 near stall, differences up to \u0394CL\u2009\u2248\u20090.2 appear. These are real and I don\u2019t paper over them. The two solvers are solving slightly different geometries at the hinge, so at the edge of validity they give slightly different answers.',
    src: '/flexfoil-validation/flap-errors.html',
    height: 760,
  },
] as const;

const convergenceRows = [
  { defl: '\u221225\u00B0', xfoil: '7/17', rustfoil: '15/17' },
  { defl: '\u221220\u00B0', xfoil: '14/17', rustfoil: '17/17' },
  { defl: '\u221215\u00B0', xfoil: '6/17', rustfoil: '17/17' },
  { defl: '\u221210\u00B0', xfoil: '16/17', rustfoil: '17/17' },
  { defl: '\u22125\u00B0', xfoil: '17/17', rustfoil: '17/17' },
  { defl: '+5\u00B0', xfoil: '16/17', rustfoil: '17/17' },
  { defl: '+10\u00B0', xfoil: '16/17', rustfoil: '17/17' },
  { defl: '+15\u00B0', xfoil: '16/17', rustfoil: '16/17' },
  { defl: '+20\u00B0', xfoil: '16/17', rustfoil: '17/17' },
  { defl: '+25\u00B0', xfoil: '15/17', rustfoil: '15/17' },
];

export default function FlexComputeFoilPt2Page() {
  const heroRef = useRef(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] });
  const heroY = useTransform(scrollYProgress, [0, 1], [0, 160]);
  const heroFade = useTransform(scrollYProgress, [0, 0.55], [1, 0]);

  const [activeVal, setActiveVal] = useState(0);
  const valRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const idx = valRefs.current.indexOf(entry.target as HTMLDivElement);
            if (idx !== -1) setActiveVal(idx);
          }
        }
      },
      { rootMargin: '-35% 0px -35% 0px' },
    );
    for (const ref of valRefs.current) {
      if (ref) obs.observe(ref);
    }
    return () => obs.disconnect();
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
            Project &middot; Flexcompute Foil &middot; Part&nbsp;II
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.4, ease }}
            className={`${display.className} text-5xl font-bold leading-[1.1] text-[#e8e6e1] sm:text-7xl lg:text-8xl`}
          >
            The Geometry <br className="hidden sm:block" />
            Problem
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.7, ease }}
            className="mx-auto mt-8 max-w-2xl text-lg leading-relaxed text-slate-400 sm:text-xl"
          >
            A solver that matches XFOIL to four decimal places on clean airfoils can completely
            fall apart with a five-degree control surface deflection. The fix wasn&rsquo;t in the solver.
            It was in how I prepared the geometry.
          </motion.p>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 1 }}
            className="mt-6 text-sm text-slate-500"
          >
            Harry Smith &middot;{' '}
            <a
              className="underline underline-offset-4 transition hover:text-slate-400"
              href="/projects/flexcompute-foil"
            >
              Part&nbsp;I
            </a>
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

      {/* ──────── THE SETUP ──────── */}
      <section className={`${PAPER} py-24 sm:py-32`}>
        <div className="mx-auto max-w-3xl px-6">
          <Reveal>
            <p className="text-xl leading-[1.9] text-[#3a3a4a]">
              Part I covered the viscous solver &mdash; the boundary layer coupling, the Newton iteration, the
              eight bugs that kept it from matching XFOIL. I got the solver to four-decimal-place parity on
              clean airfoils. Then I deflected a flap five degrees and the whole thing fell over.
            </p>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="mt-8 text-xl leading-[1.9] text-[#3a3a4a]">
              Zero out of seventeen alpha points converged. Not &ldquo;a few points diverged near stall.&rdquo;
              Zero. Every single operating point. Every flap deflection I tested &mdash; positive, negative,
              five degrees, twenty degrees. The solver was producing garbage.
            </p>
          </Reveal>
          <Reveal delay={0.15}>
            <p className="mt-8 text-xl leading-[1.9] text-[#3a3a4a]">
              The first thing I did was the diagnostic that saved me weeks of looking in the wrong place.
              I took XFOIL&rsquo;s own panelled geometry &mdash; after it had run its own <CodeLight>GDES FLAP</CodeLight> and <CodeLight>PANE</CodeLight> commands
              &mdash; saved those 160 coordinates, loaded them into Rustfoil, and ran the polar. Seventeen out of
              seventeen converged. The solver was fine. The geometry was the problem.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ──────── WHAT GDES FLAP ACTUALLY DOES ──────── */}
      <section className={`${DARK} py-24 sm:py-32`}>
        <div className="mx-auto max-w-3xl px-6">
          <Reveal>
            <h2 className={`${display.className} text-3xl font-bold text-[#e8e6e1] sm:text-4xl`}>
              What GDES&nbsp;FLAP Actually Does
            </h2>
          </Reveal>
          <div className="mt-10">
            <DarkProse>
              <Reveal delay={0.08}>
                <p>
                  If you&rsquo;ve used XFOIL, you know the flap command. Type <Code>GDES</Code>, type <Code>FLAP</Code>,
                  enter a hinge location and a deflection angle, type <Code>X</Code> to execute, go back to the main
                  menu, type <Code>PANE</Code> to repanel. Takes about five seconds. Looks like &ldquo;rotate
                  the points aft of the hinge.&rdquo;
                </p>
              </Reveal>
              <Reveal delay={0.12}>
                <p>
                  It isn&rsquo;t. That&rsquo;s what I tried first, and it&rsquo;s why nothing converged.
                  What XFOIL actually does is roughly four hundred lines of Fortran that I ended up reading
                  three times before I understood it. Here&rsquo;s what the naive &ldquo;split and rotate&rdquo;
                  looks like &mdash; drag the deflection slider and watch what happens at the hinge:
                </p>
              </Reveal>
              <Reveal delay={0.16}>
                <FlapDemo
                  accentColor={ACCENT}
                  monoClassName={mono.className}
                  displayClassName={display.className}
                />
              </Reveal>
              <Reveal delay={0.2}>
                <p>
                  See the problem? One side folds back on itself. The other side opens a gap. Toggle <em className="not-italic text-rose-400">naive spline</em> and
                  zoom to the hinge to see what happens next &mdash; the red curve forces C2 continuity through
                  the corner and oscillates, creating a tiny x-reversal that kills the solver.
                  Toggle <em className="not-italic text-teal-400">GDES fix</em> to see what XFOIL&rsquo;s
                  procedure actually produces: fold trimmed, break points placed, clean geometry. XFOIL handles
                  both of these with a careful procedure:
                </p>
              </Reveal>
              <Reveal delay={0.28}>
                <p>
                  First, <Code>GETXYF</Code> uses Newton inversion on the buffer spline (<Code>SINVRT</Code>) to find
                  the exact arc-length positions where x&thinsp;=&thinsp;hinge on the upper and lower surfaces. Then it
                  determines which surface folds (disappearing segment) and which opens (gap). For a trailing-edge-down
                  deflection with the hinge on the camber line, the bottom surface folds and the top opens.
                </p>
              </Reveal>
              <Reveal delay={0.32}>
                <p>
                  Then <Code>SSS</Code> &mdash; 150 lines of Newton iteration on the spline &mdash; finds the
                  exact break arc-lengths. On the fold side, it finds two arc-length values S1 and S2 that bracket
                  the segment which &ldquo;disappears&rdquo; when the flap rotates (the included angle between the
                  two hinge-to-break vectors equals the deflection angle). On the gap side, it finds the single
                  arc-length where the hinge-to-surface vector is perpendicular to the surface &mdash; the point
                  where the surface has to break to let a gap open.
                </p>
              </Reveal>
              <Reveal delay={0.36}>
                <p>
                  After finding the breaks, XFOIL places explicit corner points with adjacent helper nodes at 33% spacing
                  from the break to the next existing node. It rotates the flap, deletes the disappeared segment on the fold
                  side, adds circular-arc fill points on the gap side, runs <Code>SCHECK</Code> to remove splinter segments
                  (micro-panels that occur when a break lands nearly on top of an existing node), and re-splines the whole
                  buffer.
                </p>
              </Reveal>
              <Reveal delay={0.4}>
                <p>
                  Only then does <Code>PANE</Code> run <Code>PANGEN</Code> to distribute the final 160 panel nodes by
                  curvature. The buffer it operates on has already been cleaned up by the FLAP procedure. This is the
                  step I was skipping entirely.
                </p>
              </Reveal>
            </DarkProse>
          </div>
        </div>
      </section>

      {/* ──────── THE SPLINE PROBLEM ──────── */}
      <section className={`${PAPER} py-24 sm:py-32`}>
        <div className="mx-auto max-w-3xl px-6">
          <Reveal>
            <h2 className={`${display.className} text-3xl font-bold text-[#1a1a2e] sm:text-4xl`}>
              The Spline Problem
            </h2>
          </Reveal>
          <div className="mt-10">
            <Prose>
              <Reveal delay={0.08}>
                <p>
                  Here&rsquo;s what I tried first: split the coordinates at the hinge x-position, rotate the aft
                  points, detect any self-intersection on the fold side and trim it, then repanel through the cubic
                  spline. Seemed reasonable. A flap is just a rotation, right?
                </p>
              </Reveal>
              <Reveal delay={0.12}>
                <p>
                  The problem is that a flap deflection creates a slope discontinuity at the hinge. The surface
                  on the fixed side approaches the break from one direction; the rotated surface leaves in another.
                  A standard cubic spline enforces C2 continuity at every interior knot &mdash; it forces the second
                  derivative to match on both sides of every point, including the break. When the data has a genuine
                  slope discontinuity, the spline can&rsquo;t represent it. It oscillates through the corner
                  (essentially a Gibbs phenomenon for splines).
                </p>
              </Reveal>
              <Reveal delay={0.16}>
                <p>
                  When I dumped the panelled coordinates near the hinge, the x-values were going backwards. Not
                  by a lot &mdash; a reversal of about 0.002 chord &mdash; but enough to create a tiny self-intersecting
                  loop in the surface. The inviscid solver would produce a pressure spike there, and the BL
                  equations would just diverge trying to march through it.
                </p>
              </Reveal>
              <Reveal delay={0.2}>
                <p>
                  I only knew to look for this because I&rsquo;d written my own cubic splining routines before
                  and been bitten by the same issue in a different context. If you&rsquo;ve ever tried to fit a
                  cubic spline through data with a genuine kink and watched the interpolated values overshoot
                  wildly on either side, you know the feeling. The spline is doing exactly what it was told to
                  do &mdash; enforce C2 continuity &mdash; but the data isn&rsquo;t C2, and the resulting
                  oscillation is catastrophic for a boundary layer solver that needs monotonic surface coordinates.
                </p>
              </Reveal>
              <Reveal delay={0.24}>
                <p>
                  The key diagnostic was simple and I wish I had run it first. Feed XFOIL&rsquo;s own geometry to
                  Rustfoil&rsquo;s solver. Seventeen out of seventeen converged for every deflection. The solver
                  was fine. The geometry pipeline was the entire problem.
                </p>
              </Reveal>
            </Prose>
          </div>
        </div>
      </section>

      {/* ──────── THE FIX ──────── */}
      <section className={`${DARK} py-24 sm:py-32`}>
        <div className="mx-auto max-w-3xl px-6">
          <Reveal>
            <h2 className={`${display.className} text-3xl font-bold text-[#e8e6e1] sm:text-4xl`}>
              The Fix, Procedurally
            </h2>
          </Reveal>
          <div className="mt-10">
            <DarkProse>
              <Reveal delay={0.08}>
                <p>
                  I tried several things before I got it right (naturally). First I added explicit break points
                  at the hinge in the input geometry, hoping the spline&rsquo;s curvature-based node bunching would
                  handle the rest. It didn&rsquo;t. Then I implemented corner detection in the spline &mdash;
                  scanning for isolated tangent-angle spikes and breaking the tridiagonal solve there, matching
                  XFOIL&rsquo;s <Code>SEGSPL</Code>. That helped for moderate deflections but failed at small
                  angles (corner below the detection threshold) and at large angles (fold geometry was wrong).
                </p>
              </Reveal>
              <Reveal delay={0.12}>
                <p>
                  What finally worked was what should have been obvious from the start: understand the actual
                  procedure and recreate it. I read XFOIL&rsquo;s <Code>FLAP</Code> subroutine until I understood
                  what every section was doing and why, then rebuilt it in Rust. <Code>SSS</Code> with its Newton
                  iteration. <Code>SINVRT</Code> for spline inversion. The index management for deleting disappeared
                  points and inserting new ones. <Code>SCHECK</Code> for splinter removal. The fold-versus-gap logic
                  with its 33%-spacing helper points.
                </p>
              </Reveal>
              <Reveal delay={0.16}>
                <p>
                  One pragmatic divergence: I skip XFOIL&rsquo;s arc-fill on the gap side. XFOIL adds circular-arc
                  points to smoothly bridge the opening between the fixed and rotated surfaces. These arc-fill
                  points create a temporary x-reversal in the buffer (they trace a circular arc that curves
                  backward), and XFOIL&rsquo;s <Code>SEGSPL</Code> handles this because it allows derivative
                  discontinuities at segment joints. My repaneller uses a standard cubic spline that can&rsquo;t
                  handle the reversal without oscillating. So I leave the gap empty and let the repaneller&rsquo;s
                  curvature-based node placement bridge it naturally. Works fine.
                </p>
              </Reveal>
              <Reveal delay={0.2}>
                <p>
                  The result is a 450-line Rust module (<Code>flap.rs</Code>) that matches XFOIL&rsquo;s FLAP procedure
                  closely enough for the solver to converge at every deflection we tested.
                </p>
              </Reveal>
            </DarkProse>
          </div>
        </div>
      </section>

      {/* ──────── CONVERGENCE TABLE ──────── */}
      <section className={`${PAPER} py-24 sm:py-32`}>
        <div className="mx-auto max-w-3xl px-6">
          <Reveal>
            <h2 className={`${display.className} text-3xl font-bold text-[#1a1a2e] sm:text-4xl`}>
              Convergence
            </h2>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="mt-6 text-lg leading-[1.85] text-[#3a3a4a]">
              NACA 0012, hinge at 75% chord, Re&thinsp;=&thinsp;10<sup>6</sup>, alpha from &minus;4&deg; to 12&deg; in
              1&deg; steps, 17 operating points per deflection.
            </p>
          </Reveal>
          <Reveal delay={0.15}>
            <div className="mt-10 overflow-hidden rounded-xl border border-[#d6cfc0]">
              <table className={`${mono.className} w-full text-sm`}>
                <thead>
                  <tr className="border-b border-[#d6cfc0] bg-[#ede8de]">
                    <th className="px-6 py-3 text-left font-semibold text-[#3a3a4a]">&delta;</th>
                    <th className="px-6 py-3 text-right font-semibold text-[#3a3a4a]">XFOIL&nbsp;6.99</th>
                    <th className="px-6 py-3 text-right font-semibold" style={{ color: ACCENT }}>Rustfoil</th>
                  </tr>
                </thead>
                <tbody>
                  {convergenceRows.map((row, i) => (
                    <tr key={row.defl} className={i % 2 === 0 ? 'bg-white/60' : 'bg-[#f3efe7]/60'}>
                      <td className="px-6 py-2.5 text-[#3a3a4a]">{row.defl}</td>
                      <td className="px-6 py-2.5 text-right text-[#3a3a4a]">{row.xfoil}</td>
                      <td className="px-6 py-2.5 text-right font-semibold" style={{ color: ACCENT }}>{row.rustfoil}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Reveal>
          <Reveal delay={0.2}>
            <p className="mt-8 text-base leading-[1.85] text-[#5a5a6a] italic">
              Before the GDES port, every cell in the Rustfoil column was 0/17.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ──────── VALIDATION — SCROLLYTELLING ──────── */}
      <section className={DARK}>
        <div className="mx-auto max-w-3xl px-6 pb-8 pt-24 sm:pt-32">
          <Reveal>
            <h2 className={`${display.className} text-3xl font-bold text-[#e8e6e1] sm:text-4xl`}>
              The Polars
            </h2>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="mt-6 text-lg leading-[1.85] text-slate-400">
              Eleven flap deflections, &minus;25&deg; to +25&deg; in 5&deg; steps, alpha from &minus;6&deg; to +16&deg;
              in 0.5&deg; steps. XFOIL 6.99 is dashed, Rustfoil is solid. Every comparison uses the same Reynolds
              number, the same N-crit, the same alpha sequence.
            </p>
          </Reveal>
        </div>

        <div className="lg:flex">
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
                  <div className="mt-6 flex items-center gap-2">
                    {validationEmbeds.map((_, j) => (
                      <div
                        key={j}
                        className="h-1 rounded-full transition-all duration-300"
                        style={{ width: j === i ? 24 : 6, background: j === i ? ACCENT : '#1e293b' }}
                      />
                    ))}
                    <span className={`${mono.className} ml-2 text-xs text-slate-600`}>
                      {i + 1}/{validationEmbeds.length}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="hidden lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-[62%] lg:items-center lg:justify-center lg:p-6">
            <div className="w-full overflow-hidden rounded-xl border border-white/10 shadow-2xl">
              {validationEmbeds.map((embed, i) => (
                <iframe
                  key={embed.src}
                  src={embed.src}
                  title={embed.title}
                  scrolling="no"
                  className="w-full"
                  style={{
                    height: embed.height,
                    display: i === activeVal ? 'block' : 'none',
                    overflow: 'hidden',
                  }}
                  loading="lazy"
                />
              ))}
            </div>
          </div>
        </div>

        {/* Mobile: inline iframes */}
        <div className="space-y-8 px-6 pb-16 lg:hidden">
          {validationEmbeds.map((embed) => (
            <div key={embed.src} className="overflow-hidden rounded-xl border border-white/10">
              <iframe
                src={embed.src}
                title={embed.title}
                scrolling="no"
                className="w-full"
                style={{ height: embed.height, overflow: 'hidden' }}
                loading="lazy"
              />
            </div>
          ))}
        </div>
      </section>

      {/* ──────── THE CAVEAT ──────── */}
      <section className={`${PAPER} py-24 sm:py-32`}>
        <div className="mx-auto max-w-3xl px-6">
          <Reveal>
            <h2 className={`${display.className} text-3xl font-bold text-[#1a1a2e] sm:text-4xl`}>
              The &ldquo;Better Than XFOIL&rdquo; Caveat
            </h2>
          </Reveal>
          <div className="mt-10">
            <Prose>
              <Reveal delay={0.08}>
                <p>
                  Let&rsquo;s be honest: the convergence table looks flattering. At &minus;20&deg; I get 17/17 where
                  XFOIL gets 14/17. At &minus;15&deg; I get 17/17 where XFOIL gets 6/17. It&rsquo;d be easy to claim
                  I&rsquo;ve &ldquo;beaten&rdquo; XFOIL. I want to be careful about that.
                </p>
              </Reveal>
              <Reveal delay={0.12}>
                <p>
                  For moderate deflections &mdash; anything up to about &plusmn;10&deg; &mdash; the story is clean.
                  Where both solvers converge, the CL values agree to the fourth decimal place and CD to the fifth.
                  The extra converged points are at the edges of the alpha range where XFOIL&rsquo;s Newton solver
                  gives up a couple of iterations early. That&rsquo;s a genuine win: same answer, slightly wider
                  convergence envelope.
                </p>
              </Reveal>
              <Reveal delay={0.16}>
                <p>
                  For larger deflections, it gets murkier. At &plusmn;15&deg; and beyond, the CL differences at
                  individual alpha points can reach 0.2. CD differences can reach 0.01. These aren&rsquo;t rounding
                  errors. They&rsquo;re real, and they happen because the two solvers are solving slightly different
                  problems.
                </p>
              </Reveal>
              <Reveal delay={0.2}>
                <p>
                  The geometry difference is in the gap side of the hinge. XFOIL fills it with a circular arc;
                  I leave it open and let the repaneller bridge it. For small deflections the arc is tiny and the
                  difference is negligible. For large deflections the arc spans a meaningful fraction of the local
                  panel spacing, and the two solvers are genuinely looking at different surface shapes near the
                  hinge. Near stall &mdash; where the boundary layer is on the edge of separation anyway &mdash;
                  that&rsquo;s enough to tip the balance.
                </p>
              </Reveal>
              <Reveal delay={0.24}>
                <p>
                  The honest summary: matching or exceeding XFOIL&rsquo;s convergence at every tested deflection,
                  with excellent accuracy where both converge for moderate deflections, and a known geometry
                  approximation that introduces measurable differences at extreme conditions. I could close the gap
                  by implementing arc-fill with a segmented spline that supports derivative discontinuities &mdash;
                  XFOIL&rsquo;s <CodeLight>SEGSPL</CodeLight> &mdash; but that&rsquo;s a separate piece of work.
                </p>
              </Reveal>
            </Prose>
          </div>
        </div>
      </section>

      {/* ──────── STATS ──────── */}
      <section className={`${DARK} py-24 sm:py-32`}>
        <div className="mx-auto mt-4 grid max-w-2xl grid-cols-2 gap-10 px-6 sm:grid-cols-4">
          <Stat value="SSS" label="Newton break-finder" delay={0} />
          <Stat value="450" label="lines of Rust" delay={0.1} />
          <Stat value="0/17" label="before" delay={0.2} />
          <Stat value="17/17" label="after" delay={0.3} />
        </div>
      </section>

      {/* ──────── WHY THIS MATTERS ──────── */}
      <section className={`${PAPER} py-24 sm:py-32`}>
        <div className="mx-auto max-w-3xl px-6">
          <Reveal>
            <h2 className={`${display.className} text-3xl font-bold text-[#1a1a2e] sm:text-4xl`}>
              Why This Actually Matters
            </h2>
          </Reveal>
          <div className="mt-10">
            <Prose>
              <Reveal delay={0.08}>
                <p>
                  I have spent months doing on-and-off analyses with XFOIL on aerofoils with hinge deflections.
                  Control surface optimisation, decambering effects, figuring out what a flap schedule looks like
                  across an operating envelope. This is bread-and-butter work if you are designing anything with
                  moveable surfaces &mdash; which is essentially every aeroplane.
                </p>
              </Reveal>
              <Reveal delay={0.12}>
                <p>
                  The XFOIL workflow for this is painful. Load a foil, <CodeLight>GDES</CodeLight>,
                  deflect one flap angle, go back, repanel, <CodeLight>OPER</CodeLight>, set up viscous, run an
                  alpha sweep, save the polar, then do the whole dance again for the next deflection angle.
                  For a matrix sweep &mdash; say, seven deflection angles times twenty alpha points times four
                  Reynolds numbers &mdash; that&rsquo;s 560 operating points and you&rsquo;re either scripting
                  the session file by hand or clicking through the terminal for an hour. I&rsquo;ve done this.
                  Many times. It&rsquo;s not fun.
                </p>
              </Reveal>
              <Reveal delay={0.16}>
                <p>
                  With the GDES port working, the web UI now has a one-click matrix sweep. You pick any two
                  parameters &mdash; alpha and flap deflection, alpha and Reynolds number, flap deflection and
                  hinge position, whatever combination you need &mdash; set the ranges, hit Generate Sweep, and
                  it runs the full matrix. Every combination. The results land in a local database and show up
                  immediately in the Plot Builder, where you can colour by deflection, group by Reynolds number,
                  overlay L/D curves, and actually <em>see</em> what the design space looks like.
                </p>
              </Reveal>
              <Reveal delay={0.2}>
                <p>
                  The Python API is the same story. A flap study that would have been an afternoon of XFOIL
                  terminal scripting is now five lines:
                </p>
              </Reveal>
              <Reveal delay={0.24}>
                <div className="overflow-hidden rounded-xl border border-[#d6cfc0]">
                  <pre className={`${mono.className} bg-[#1a1a2e] px-6 py-5 text-sm leading-relaxed text-[#e8e6e1] overflow-x-auto`}>
{`foil = flexfoil.naca("2412")
for defl in [-10, -5, 0, 5, 10, 15, 20]:
    f = foil.with_flap(hinge_x=0.75, deflection=defl)
    polar = f.polar(alpha=(-4, 14, 1), Re=1e6)
    print(f"δ={defl:+d}°  CL_max={max(polar.cl):.3f}")`}
                  </pre>
                </div>
              </Reveal>
              <Reveal delay={0.28}>
                <p>
                  That runs 119 viscous solves in about two seconds. Each one goes through the full XFOIL FLAP
                  procedure, repanels, runs the coupled inviscid/viscous solver, and stores the result. You can
                  sweep flap deflection against alpha, or against hinge position, or against Reynolds number. You
                  can do it in a Jupyter notebook or in the browser. You can click on any point in the resulting
                  polar plot and see the pressure distribution and flow field for that specific condition.
                </p>
              </Reveal>
              <Reveal delay={0.32}>
                <p>
                  None of this is possible if the flap geometry breaks the solver. That 0/17 convergence wasn&rsquo;t
                  a theoretical problem &mdash; it was the thing standing between &ldquo;XFOIL in a browser&rdquo;
                  and &ldquo;XFOIL in a browser <em>that you can actually use for control surface design</em>.&rdquo;
                </p>
              </Reveal>
            </Prose>
          </div>
        </div>
      </section>

      {/* ──────── CLOSING ──────── */}
      <section className="bg-[#080d17] py-24 sm:py-32">
        <div className="mx-auto max-w-3xl px-6">
          <Reveal>
            <h2 className={`${display.className} text-3xl font-bold text-[#e8e6e1] sm:text-4xl`}>
              The Fix Is Always Understand What XFOIL Is&nbsp;Doing
            </h2>
          </Reveal>
          <div className="mt-10 space-y-6 text-lg leading-[1.85] text-slate-400">
            <Reveal delay={0.08}>
              <p>
                Same lesson as Part I. The solver bugs were fixed by reading the Fortran more carefully. The
                geometry failure was fixed by reading the <Code>FLAP</Code> subroutine, understanding what
                it does and why, and recreating it in Rust. Not translating it &mdash; the line-by-line
                translation is the easy part, and it&rsquo;s what the AI agents are good at. Understanding
                <em className="text-slate-300"> why</em> <Code>SSS</Code> exists, why a simple
                &ldquo;split at hinge x&rdquo; fails, what problem the arc-fill solves &mdash; that&rsquo;s
                what actually fixes things.
              </p>
            </Reveal>
            <Reveal delay={0.12}>
              <p>
                <Code>SSS</Code> is 150 lines of Newton iteration on a spline to find two arc-length break
                points. Doesn&rsquo;t look like much. But when I tried to replace it with something simpler
                and watched the solver diverge on every flap case, I understood why it exists. The break points
                aren&rsquo;t at hinge x. They&rsquo;re at the precise arc-length positions where the geometry
                can be cleanly split, rotated, and reassembled without introducing oscillations that the BL
                solver can&rsquo;t tolerate.
              </p>
            </Reveal>
            <Reveal delay={0.16}>
              <p>
                There&rsquo;s a version of this story where I spent a week being clever with corner-detecting
                splines and spike-ratio thresholds and dense buffers, and none of it worked reliably.
                There&rsquo;s a much shorter version where I read the Fortran, understood it, recreated it,
                and it worked. I did both, in that order.
              </p>
            </Reveal>
            <Reveal delay={0.2}>
              <p className="border-l-2 border-slate-600 pl-5 italic text-slate-500">
                When in doubt, read the Fortran. When not in doubt, also read the Fortran.
              </p>
            </Reveal>
          </div>
          <Reveal delay={0.3}>
            <div className="mt-16 border-t border-slate-800 pt-8 text-sm text-slate-600">
              <em>
                <a
                  className="underline underline-offset-4 transition hover:text-slate-400"
                  href="/projects/flexcompute-foil"
                >
                  Part I: What I Learned Porting XFOIL to Rust
                </a>
                {' '}&middot;{' '}
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
