'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';

export default function WritingPage() {
  const pieces = [
    {
      title: 'Why choosing the right fit matters',
      description:
        'A critique of polynomial trendlines in aircraft fuel-efficiency analysis, with an embedded tool for comparing polynomial, spline, and power-law fits.',
      tags: ['Curve Fitting', 'Flight Mechanics', 'Policy', 'Interactive'],
      link: '/apps/graph-fitting',
      status: 'Essay + Tool',
      gradient: 'from-amber-500 to-rose-500',
    },
    {
      title: 'Porting XFOIL to Rust',
      description:
        'A long-form write-up on building FlexCompute Foil, with interactive validation sweeps against XFOIL.',
      tags: ['Rust', 'WebAssembly', 'XFOIL', 'Validation'],
      link: '/projects/flexcompute-foil',
      status: 'Article',
      gradient: 'from-sky-500 to-indigo-500',
    },
    {
      title: 'Porting XFOIL to Rust, Pt II',
      description:
        'The geometry problem: why a solver that matches XFOIL on clean airfoils falls apart with flap deflection, and how porting GDES FLAP fixed it.',
      tags: ['Rust', 'XFOIL', 'Splines', 'Flap Geometry'],
      link: '/projects/flexcompute-foil-pt2',
      status: 'Article',
      gradient: 'from-amber-500 to-orange-500',
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-gray-50">
      <nav className="fixed top-0 w-full bg-white/80 backdrop-blur-lg border-b border-gray-200 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link href="/" className="text-2xl font-bold gradient-text">
              Aeronauty
            </Link>
            <div className="flex space-x-8">
              <Link href="/projects" className="text-gray-300 hover:text-white transition-colors">
                Projects
              </Link>
              <Link href="/writing" className="text-white font-semibold">
                Writing
              </Link>
              <Link href="/snippets" className="text-gray-300 hover:text-white transition-colors">
                Snippets
              </Link>
              <Link href="/about" className="text-gray-300 hover:text-white transition-colors">
                About
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-32 pb-16">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-gray-900 mb-4">Writing</h1>
          <p className="text-xl text-gray-600">
            Technical stories, explainers, and arguments about engineering judgment
          </p>
        </div>

        <div className="space-y-6">
          {pieces.map((piece, index) => (
            <motion.article
              key={piece.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.08 }}
              className="bg-white/80 backdrop-blur-lg border border-gray-200 rounded-xl p-8 hover:border-blue-300 hover:shadow-lg transition-all"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">{piece.title}</h2>
                  <p className="mt-3 text-gray-600 leading-relaxed">{piece.description}</p>
                </div>
                <span className={`shrink-0 px-3 py-1 bg-gradient-to-r ${piece.gradient} rounded-full text-white text-sm font-semibold`}>
                  {piece.status}
                </span>
              </div>

              <div className="flex flex-wrap gap-2 my-6">
                {piece.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium"
                  >
                    {tag}
                  </span>
                ))}
              </div>

              <Link
                href={piece.link}
                className="inline-flex items-center text-blue-600 hover:text-blue-700 font-semibold transition-colors"
              >
                Read →
              </Link>
            </motion.article>
          ))}
        </div>
      </main>
    </div>
  );
}
