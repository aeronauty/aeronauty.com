'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import GraphFittingTool from './GraphFittingTool';

const redactedName = "[name redacted at OP's request]";

const linkedInScreenshots = [
  {
    src: '/graph-fitting/linkedin-exchange/01-original-post-redacted.png',
    alt: 'Original LinkedIn post sharing the DfT reports, with name and profile photo redacted',
  },
  {
    src: '/graph-fitting/linkedin-exchange/02-andrew-first-question-redacted.png',
    alt: "Andrew Smyth's first technical question with the chart",
  },
  {
    src: '/graph-fitting/linkedin-exchange/03-response-defending-quintic-redacted.png',
    alt: 'Response defending the quintic fit, with name and profile photo redacted',
  },
  {
    src: '/graph-fitting/linkedin-exchange/04-andrew-power-function-followup-redacted.png',
    alt: "Andrew Smyth's follow-up explaining why a power function is physically motivated",
  },
  {
    src: '/graph-fitting/linkedin-exchange/05-initial-blunt-reply-redacted.png',
    alt: 'Initial blunt reply, with referenced name redacted',
  },
  {
    src: '/graph-fitting/linkedin-exchange/06-follow-up-apology-redacted.png',
    alt: 'Follow-up apology, with referenced name redacted',
  },
  {
    src: '/graph-fitting/linkedin-exchange/07-link-to-interactive-tool-redacted.png',
    alt: 'Link to the interactive tool, with referenced name redacted',
  },
  {
    src: '/graph-fitting/linkedin-exchange/08-please-dont-swear-redacted.png',
    alt: "Reply asking not to swear on LinkedIn, with name and profile photo redacted",
  },
];

function Tex({ children, display = false }: { children: string; display?: boolean }) {
  const html = katex.renderToString(children, { displayMode: display, throwOnError: false });
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

function RedactedName({ linked = false }: { linked?: boolean }) {
  const className =
    'inline-block bg-gray-950 text-white px-1.5 py-0.5 align-baseline font-mono text-[0.92em] leading-tight line-through decoration-white decoration-2';

  if (linked) {
    return (
      <a
        href="https://lnkd.in/ej5VXA3w"
        target="_blank"
        rel="noopener noreferrer"
        className={`${className} hover:bg-gray-800 transition-colors`}
      >
        {redactedName}
      </a>
    );
  }

  return <span className={className}>{redactedName}</span>;
}

export default function GraphFittingApp() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-gray-50">
      {/* Navigation */}
      <nav className="fixed top-0 w-full bg-white/80 backdrop-blur-lg border-b border-gray-200 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link href="/" className="text-2xl font-bold gradient-text">
              Aeronauty
            </Link>
            <div className="flex space-x-8">
              <Link href="/projects" className="text-gray-600 hover:text-gray-900 transition-colors">
                Projects
              </Link>
              <Link href="/writing" className="text-gray-600 hover:text-gray-900 transition-colors">
                Writing
              </Link>
              <Link href="/snippets" className="text-gray-600 hover:text-gray-900 transition-colors">
                Snippets
              </Link>
              <Link href="/about" className="text-gray-600 hover:text-gray-900 transition-colors">
                About
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-20">
        {/* Back link */}
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-gray-500 hover:text-gray-900 transition-colors mb-8 text-sm font-medium"
        >
          <ArrowLeft size={16} />
          Back to Writing
        </button>

        {/* Article */}
        <article className="prose-article">
          <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 leading-tight mb-6">
            Why choosing the right fit matters
          </h1>

          <aside className="mb-10 rounded-lg border border-gray-300 bg-white/80 p-4 text-sm leading-relaxed text-gray-700 shadow-sm">
            <p>
              <strong className="text-gray-900">Editor{"'"}s note:</strong> This post originally named the report{"'"}s coordinator. He has requested removal of his personal details, and I have complied. Screenshots from the public LinkedIn exchange are included below for context.
            </p>
          </aside>

          <p className="text-lg text-gray-600 mb-10 leading-relaxed">
            I was too mean to a student on LinkedIn this morning, and I owe him an apology. But the thing I was mean about matters - and it matters beyond one chart in one report. So here{"'"}s the apology, the explanation, and an interactive tool you can use to see the problem for yourself.
          </p>

          <hr className="border-gray-200 my-10" />

          {/* What happened */}
          <h2 className="text-2xl font-bold text-gray-900 mt-12 mb-4">What happened</h2>

          <p className="text-gray-700 leading-relaxed mb-4">
            <RedactedName linked />, a master{"'"}s student in Spatial, Transport, and Environmental Economics, shared two reports he{"'"}d coordinated at the UK Department for Transport on future aircraft fuel efficiency. They{"'"}re substantial pieces of work (one with the Aerospace Technology Institute on <a href="https://www.gov.uk/government/publications/revised-fuel-efficiency-assumptions-for-future-aircraft" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 underline decoration-blue-300 hover:decoration-blue-600 transition-colors">fuel efficiency estimates for future aircraft types</a>, the other with the Aviation Impact Accelerator on <a href="https://www.gov.uk/government/publications/analysing-the-impact-of-operational-efficiencies-on-aviation" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 underline decoration-blue-300 hover:decoration-blue-600 transition-colors">operational efficiencies</a>) and both are now published on GOV.UK.
          </p>

          <p className="text-gray-700 leading-relaxed mb-4">
            <a href="https://www.linkedin.com/in/andrew-michael-smyth/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 underline decoration-blue-300 hover:decoration-blue-600 transition-colors">Andrew Smyth</a> - aerospace engineer, Great British Bake Off finalist, and generally someone who knows what he{"'"}s looking at - noticed something odd in the fuel burn plots. The curves fitted to fuel burn per kilometre versus range for widebody aircraft showed telltale undulations: oscillations that don{"'"}t correspond to any physical process, the kind of artefact you get when you fit a high-order polynomial to data that doesn{"'"}t want to be a polynomial.
          </p>

          <p className="text-gray-700 leading-relaxed mb-4">
            Andrew asked (politely) why quintic functions had been chosen over other interpolation methods. <RedactedName /> replied that model validation had found 5th-order polynomials struck the right balance between flexibility and overfit. Andrew pushed back: polynomials are fundamentally the wrong functional form for this kind of data. A power function is physically motivated, extrapolates sensibly, and doesn{"'"}t invent features that aren{"'"}t there. He even attached a comparison plot from his colleague Joaquin Exalto.
          </p>

          <p className="text-gray-700 leading-relaxed mb-4">
            I then jumped in and said something along the lines of: your reply makes it sound like you don{"'"}t know this is wrong, and the back-pedalling is even worse.
          </p>

          <p className="text-gray-700 leading-relaxed mb-4">
            The technical point was fair. The way I made it was too blunt. <RedactedName /> is a student sharing published work he{"'"}s proud of, and I could{"'"}ve made the same point with more care. Sorry, <RedactedName />.
          </p>

          <p className="text-gray-700 leading-relaxed mb-6">
            But the underlying issue is worth unpacking properly, because this isn{"'"}t really about one student or one chart. It{"'"}s about a failure mode that{"'"}s everywhere in engineering, and it{"'"}s sitting in a government report that informs policy.
          </p>

          {/* DfT Figure */}
          <figure className="my-10">
            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <Image
                src="/graph-fitting/dft-figure-11.png"
                alt="Figure 11 from DfT report: Current and Ultra Efficient Widebody Fuelburn showing polynomial trendlines with spurious undulations"
                width={960}
                height={720}
                className="w-full h-auto rounded"
              />
            </div>
            <figcaption className="text-sm text-gray-500 mt-3 text-center">
              Figure 11 from the DfT report. Note the undulations in the fitted curves - these are artefacts of the polynomial fit, not real physical behaviour.
            </figcaption>
          </figure>

          {/* Physics */}
          <h2 className="text-2xl font-bold text-gray-900 mt-12 mb-4">The physics of fuel burn vs range</h2>

          <p className="text-gray-700 leading-relaxed mb-4">
            Aircraft fuel burn per kilometre is not constant with range. On a short flight, you spend a big chunk of the mission climbing and burning fuel at high thrust settings. That fixed cost gets amortised over more kilometres as range increases, so fuel burn per km drops with distance. At very long range, the curve flattens - you{"'"}re spending almost all of the mission in cruise, and the per-km cost approaches an asymptote (set by aerodynamic efficiency and engine SFC, basically).
          </p>

          <p className="text-gray-700 leading-relaxed mb-4">
            This is a physical process with a clear functional form. It decays. It has an asymptote. It{"'"}s monotonically decreasing (or near enough - step climbs and wind effects notwithstanding). The right family of functions to describe it is something like:
          </p>

          <div className="my-6 text-center">
            <Tex display>{String.raw`f(x) = a \cdot x^b + c`}</Tex>
          </div>

          <p className="text-gray-700 leading-relaxed mb-6">
            where <Tex>{String.raw`b < 0`}</Tex>, <Tex>a</Tex> captures the magnitude of the short-range penalty, <Tex>c</Tex> is the long-range asymptote, and <Tex>x</Tex> is range. This is a power law with an offset. It decays, it flattens, it doesn{"'"}t oscillate, and it extrapolates sensibly. It{"'"}s physically motivated.
          </p>

          {/* What a polynomial does */}
          <h2 className="text-2xl font-bold text-gray-900 mt-12 mb-4">What a polynomial does instead</h2>

          <p className="text-gray-700 leading-relaxed mb-4">
            A 5th-order polynomial knows nothing about physics. It has six free parameters and will happily contort itself to minimise residuals within the data range (which is, let{"'"}s be honest, exactly what Excel{"'"}s trendline feature encourages you to do). For fuel burn data, it can produce a fit that looks tolerable on the page - the R-squared will be high, the curve will pass near the points, and if you don{"'"}t look too carefully, you might think the job is done.
          </p>

          <p className="text-gray-700 leading-relaxed mb-4">
            But there are three problems, and they range from subtle to catastrophic.
          </p>

          <p className="text-gray-700 leading-relaxed mb-4">
            <strong className="text-gray-900">1. Spurious undulations in the data range.</strong> A quintic has up to four turning points. Fuel burn vs range should have zero (or at most one, in unusual cases). The polynomial will introduce wiggles that don{"'"}t correspond to any real phenomenon, and these wiggles can distort comparisons between aircraft types. In the DfT data, Andrew pointed out that at around 7,000&nbsp;km, the polynomial fits suggest the A350 and 787 have meaningfully different fuel burn - when the underlying data shows they{"'"}re practically identical. The polynomial is manufacturing a distinction that doesn{"'"}t exist.
          </p>

          <p className="text-gray-700 leading-relaxed mb-4">
            <strong className="text-gray-900">2. Obscured convergence behaviour.</strong> At long range, widebody aircraft of similar technology levels converge to similar cruise efficiency. This is physically meaningful and policy-relevant: it tells you something about the diminishing returns of aerodynamic improvement at very long range. A power function captures this convergence naturally. A polynomial can obscure it entirely, because each aircraft{"'"}s polynomial is independently free to undulate through the convergence region.
          </p>

          <p className="text-gray-700 leading-relaxed mb-6">
            <strong className="text-gray-900">3. Catastrophic extrapolation.</strong> This is the showstopper. Extend a 5th-order polynomial beyond its fitted range and it will, inevitably, diverge. For these fuel burn curves, that means the fitted function will eventually predict zero fuel burn per kilometre, and then negative fuel burn. The aircraft, according to the polynomial, starts generating fuel. (Free energy! Somebody call the patent office.) This isn{"'"}t a theoretical concern about edge cases - it happens within a modest extrapolation beyond the data range. I{"'"}ve built an interactive tool so you can see it for yourself.
          </p>

          {/* Applet */}
          <h2 className="text-2xl font-bold text-gray-900 mt-12 mb-4">See it for yourself</h2>

          <p className="text-gray-700 leading-relaxed mb-6">
            Below is the actual digitised data from the DfT report. Toggle between polynomial fits (orders 3, 4, and 5) and the power function. Pay attention to what happens beyond the dashed line marking the edge of the data range. The power function decays to its asymptote. The polynomial goes off a cliff.
          </p>

          <div className="my-8 -mx-4 sm:-mx-6 lg:-mx-8">
            <GraphFittingTool />
          </div>

          {/* Splines */}
          <h2 className="text-2xl font-bold text-gray-900 mt-12 mb-4">A note on splines</h2>

          <p className="text-gray-700 leading-relaxed mb-4">
            After I posted this, <a href="https://en.wikipedia.org/wiki/Daniel_P._Raymer" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 underline decoration-blue-300 hover:decoration-blue-600 transition-colors">Daniel Raymer</a> - aircraft designer, author of <em>Aircraft Design: A Conceptual Approach</em>, and someone whose textbooks I suspect most of us have on a shelf somewhere - left a comment pointing me to <a href="https://en.wikipedia.org/wiki/Akima_spline" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 underline decoration-blue-300 hover:decoration-blue-600 transition-colors">Akima splines</a>. I hadn{"'"}t come across them before. So I{"'"}ve added both a standard cubic spline and an Akima spline to the tool above.
          </p>

          <p className="text-gray-700 leading-relaxed mb-4">
            Splines are interpolation methods - they pass through every data point exactly, which means R² = 1 by definition. That{"'"}s not a statement about how good they are; it{"'"}s a statement about what they{"'"}re doing. They{"'"}re not fitting a model to data. They{"'"}re drawing a smooth curve through known points.
          </p>

          <p className="text-gray-700 leading-relaxed mb-4">
            This makes them excellent for a specific class of problem: when you have points that you know are exact (or close enough), you absolutely do not need to extrapolate, and you just want a smooth, faithful interpolation between them. Geometry shaping is the classic case - Raymer uses Akima splines in RDSwin for fuselage lofting, where the cross-section control points are design intent and you want the surface to honour them without inventing wiggles between them. The Akima variant is particularly good at this because it uses a weighted slope-averaging scheme that suppresses the overshoot you get with standard cubic splines near sharp changes in the data.
          </p>

          <p className="text-gray-700 leading-relaxed mb-6">
            For the fuel burn problem, though, splines don{"'"}t solve the underlying issue. Toggle them on in the tool and extend beyond the data range - you{"'"}ll see that both splines extrapolate badly (the cubic spline spectacularly so). They also don{"'"}t give you a compact functional form you can hand to someone else, and they can{"'"}t separate signal from noise in data that has measurement uncertainty. For this particular problem, the power function is still the right answer. But it{"'"}s good to have them in the toolbox, and I{"'"}m glad Raymer pointed me to Akima{"'"}s work.
          </p>

          {/* Why this matters */}
          <h2 className="text-2xl font-bold text-gray-900 mt-12 mb-4">Why this matters</h2>

          <p className="text-gray-700 leading-relaxed mb-4">
            You could argue this is pedantic. The report isn{"'"}t asking anyone to extrapolate beyond the data range. The polynomials fit the data adequately where the data exists. So why does the functional form matter?
          </p>

          <p className="text-gray-700 leading-relaxed mb-4">
            Because of what happens downstream.
          </p>

          <p className="text-gray-700 leading-relaxed mb-4">
            These reports feed into policy analysis. Someone - a civil servant, a consultant, a modeller building a fleet emissions tool - will use these curves. They{"'"}ll either:
          </p>

          <p className="text-gray-700 leading-relaxed mb-4">
            <strong className="text-gray-900">(a)</strong> use the fitted curves blindly, plug in range values that fall outside the fitted region, and get nonsensical results; or
          </p>

          <p className="text-gray-700 leading-relaxed mb-4">
            <strong className="text-gray-900">(b)</strong> notice the fits are wrong, and lose trust in the entire body of work.
          </p>

          <p className="text-gray-700 leading-relaxed mb-4">
            Neither is good. Option (a) produces bad analysis. Option (b) discredits good work - and the underlying data and research effort behind these reports is genuinely valuable. A poor choice of curve fit shouldn{"'"}t be enough to undermine it, but in practice, it is. When an experienced engineer sees an Excel default trendline in a published government report, the first thought is not {'"'}I{"'"}m sure the rest of the methodology is rigorous.{'"'} The first thought is {'"'}if they didn{"'"}t catch this, what else did they miss?{'"'}
          </p>

          <p className="text-gray-700 leading-relaxed mb-6">
            That reaction might be unfair. But it{"'"}s real, it{"'"}s predictable, and it{"'"}s avoidable.
          </p>

          {/* The deeper problem */}
          <h2 className="text-2xl font-bold text-gray-900 mt-12 mb-4">The deeper problem</h2>

          <p className="text-gray-700 leading-relaxed mb-4">
            Look, the instinct to fit a polynomial and move on is something most of us have had. It{"'"}s the default in Excel. It{"'"}s the first thing you reach for when you need a smooth curve through noisy data. And for many applications it{"'"}s fine - polynomials are great interpolators within their fitted range, provided the data doesn{"'"}t have strong physical constraints on its functional form.
          </p>

          <p className="text-gray-700 leading-relaxed mb-4">
            But engineering data almost always has physical constraints. Fuel burn has an asymptote. Drag has a minimum. Lift curves have a slope set by geometry. When you know something about the physics, you should encode it in your choice of function. A polynomial doesn{"'"}t encode anything - it{"'"}s a universal approximator with no opinion about what the data is doing or why. (Which is exactly the problem.)
          </p>

          <p className="text-gray-700 leading-relaxed mb-4">
            The fix for the DfT report is simple: refit with a power function. It{"'"}ll take an afternoon. The fit will be better in-sample, the extrapolation will be physically meaningful, and nobody will look at the plots and wonder what went wrong.
          </p>

          <p className="text-gray-700 leading-relaxed mb-4">
            The deeper fix is cultural. Somewhere in the review chain for a government report on aviation emissions, someone should have asked: {'"'}why this function?{'"'} Not as a gotcha - just as a routine quality check, the same way you{"'"}d ask {'"'}what{"'"}s the source of this data?{'"'} or {'"'}what are the uncertainty bounds?{'"'} The choice of functional form is a modelling decision, and modelling decisions should be justified.
          </p>

          <p className="text-gray-900 font-semibold leading-relaxed mt-8 mb-4 text-lg">
            Good engineers don{"'"}t just fit curves. They choose the right tool for the job.
          </p>

          <hr className="border-gray-200 my-10" />

          <p className="text-gray-700 leading-relaxed mb-6 text-sm">
            One last thing. It{"'"}s 2026. We have interactive notebooks, Observable, Plotly, D3, a dozen other tools that let you publish data with the actual data attached. The fact that a government report on aviation emissions is still shipping as a PDF with PNGs of Excel charts - no underlying data, no way to inspect the fits, no way to check the methodology without literally digitising pixels off a screenshot - is its own kind of failure. The interactive tool above took me less than an hour. Imagine if the DfT had published something like it from the start: the fits would have been challenged (and fixed) before the report ever went live. Open data and interactive visualisation aren{"'"}t nice-to-haves. They{"'"}re quality control.
          </p>

          <p className="text-sm text-gray-500 italic">
            Data digitised from DfT aviation fuel efficiency report. Fits computed via least-squares and Levenberg-Marquardt. Interactive tool built with Plotly.js.
          </p>

          <section className="mt-16 border-t border-gray-200 pt-10">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">LinkedIn exchange</h2>
            <p className="text-gray-700 leading-relaxed mb-6">
              Screenshots from the <a href="https://lnkd.in/ej5VXA3w" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 underline decoration-blue-300 hover:decoration-blue-600 transition-colors">public LinkedIn exchange</a>. Names redacted at OP{"'"}s request.
            </p>
            <div className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
              {linkedInScreenshots.map((screenshot, index) => (
                <figure
                  key={screenshot.src}
                  className="w-[min(82vw,360px)] shrink-0 snap-center overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm"
                >
                  <Image
                    src={screenshot.src}
                    alt={screenshot.alt}
                    width={720}
                    height={1536}
                    className="h-auto w-full"
                  />
                  <figcaption className="border-t border-gray-100 px-3 py-2 text-xs text-gray-500">
                    {index + 1} / {linkedInScreenshots.length}
                  </figcaption>
                </figure>
              ))}
            </div>
          </section>
        </article>
      </main>
    </div>
  );
}
