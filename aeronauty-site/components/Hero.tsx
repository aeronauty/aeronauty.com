"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";

const cells: [string, string][] = [
  ["Flight physics", "Stability, performance, aero data"],
  ["Interfaces", "Interactive tools over static slides"],
  ["Optimization", "Trade spaces, routing, decisions"],
  ["Writing", "Technical judgment in public"],
];

export function Hero() {
  const reduce = useReducedMotion();
  const container = {
    hidden: {},
    show: { transition: { staggerChildren: reduce ? 0 : 0.08, delayChildren: 0.05 } },
  };
  const item = {
    hidden: reduce ? {} : { opacity: 0, y: 16 },
    show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
  };

  return (
    <section className="border-b border-[var(--rule)] bg-[var(--paper)]">
      <div className="mx-auto grid min-h-[78vh] max-w-container items-end gap-12 px-5 pb-16 pt-24 sm:px-8 lg:grid-cols-[1.08fr_0.92fr] lg:px-10">
        <motion.div className="max-w-3xl" variants={container} initial="hidden" animate="show">
          <motion.p variants={item} className="eyebrow">
            Aeronauty
          </motion.p>
          <motion.h1
            variants={item}
            className="mt-5 font-display text-5xl font-black leading-[0.95] tracking-tight text-[var(--ink)] sm:text-7xl lg:text-8xl"
          >
            Useful tools for awkward engineering questions.
            <span className="cursor" aria-hidden="true" />
          </motion.h1>
          <motion.p variants={item} className="mt-8 max-w-2xl text-lg leading-8 text-[var(--muted)] sm:text-xl">
            A working notebook of aerospace demos, curve-fitting arguments, solver experiments, and
            the occasional story about choosing the right abstraction before the wrong one costs
            everyone a week.
          </motion.p>
          <motion.div variants={item} className="mt-10 flex flex-wrap gap-3">
            <Link href="/projects" className="button-primary">
              Browse projects
            </Link>
            <Link href="/writing" className="button-secondary">
              Read writing
            </Link>
          </motion.div>
        </motion.div>

        <motion.div
          className="grid gap-4 text-sm text-[var(--foreground)]"
          initial={reduce ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="border-y border-[var(--ink)] py-5">
            <p className="data-strip">Current bias</p>
            <p className="mt-3 font-display text-2xl font-bold leading-tight text-[var(--ink)]">
              Make the model visible, then argue with it honestly.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {cells.map(([title, body]) => (
              <div key={title} className="card p-5">
                <h2 className="font-display text-lg font-semibold text-[var(--ink)]">{title}</h2>
                <p className="mt-2 leading-6 text-[var(--muted)]">{body}</p>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
