import Link from "next/link";

export function Hero() {
  return (
    <section className="border-b border-stone-200 bg-[var(--paper)]">
      <div className="mx-auto grid min-h-[78vh] max-w-7xl items-end gap-12 px-5 pb-16 pt-28 sm:px-8 lg:grid-cols-[1.08fr_0.92fr] lg:px-10">
        <div className="max-w-3xl">
          <p className="eyebrow">Aeronauty</p>
          <h1 className="mt-5 text-5xl font-semibold leading-[0.98] tracking-tight text-stone-950 sm:text-7xl lg:text-8xl">
            Useful tools for awkward engineering questions.
          </h1>
          <p className="mt-8 max-w-2xl text-lg leading-8 text-stone-600 sm:text-xl">
            A working notebook of aerospace demos, curve-fitting arguments, solver experiments, and
            the occasional story about choosing the right abstraction before the wrong one costs
            everyone a week.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link href="/projects" className="button-primary">
              Browse projects
            </Link>
            <Link href="/writing" className="button-secondary">
              Read writing
            </Link>
          </div>
        </div>

        <div className="grid gap-3 text-sm text-stone-700">
          <div className="border-y border-stone-300 py-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
              Current bias
            </p>
            <p className="mt-3 text-2xl font-semibold leading-tight text-stone-950">
              Make the model visible, then argue with it honestly.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-stone-300 bg-stone-300">
            {[
              ["Flight physics", "Stability, performance, aero data"],
              ["Interfaces", "Interactive tools over static slides"],
              ["Optimization", "Trade spaces, routing, decisions"],
              ["Writing", "Technical judgment in public"],
            ].map(([title, body]) => (
              <div key={title} className="bg-white p-5">
                <h2 className="font-semibold text-stone-950">{title}</h2>
                <p className="mt-2 leading-6 text-stone-600">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
