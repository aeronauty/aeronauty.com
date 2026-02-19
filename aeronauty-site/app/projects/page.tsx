'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';

export default function ProjectsPage() {
  const projects = [
    {
      title: 'Panel Code/Kutta Demo',
      description: 'Interactive demonstration of real aerodynamics using 2D panel methods. Debunks the equal-transit-time myth with actual physics and numerical methods.',
      tech: ['TypeScript', 'Next.js', 'Panel Methods', 'Aerodynamics', 'Education'],
      link: '/apps/panel-code',
      status: 'Live',
      gradient: 'from-purple-500 to-pink-500',
    },
    {
      title: 'Wind Turbine Explainer',
      description: 'Interactive 3D wind turbine with real-time physics simulation. Explore blade harmonics, aerodynamic forces, and understand why turbines have three blades.',
      tech: ['Three.js', 'React', 'WebGL', 'Physics Simulation', 'Education'],
      link: '/apps/wind-turbine',
      status: 'Live',
      gradient: 'from-green-500 to-emerald-500',
    },
    {
      title: 'Blade Harmonics',
      description: 'Mathematical visualization showing why equally-spaced turbine blades create perfectly balanced forces through harmonic cancellation.',
      tech: ['React', 'TypeScript', 'Recharts', 'Mathematics', 'Visualization'],
      link: '/apps/blade-harmonics',
      status: 'Live',
      gradient: 'from-cyan-500 to-blue-500',
    },
    {
      title: 'Specific Range Explorer',
      description: 'Interactive analysis of why SR curves bend above the optimum altitude. Fitted to Lufthansa published data with Nelder-Mead optimization.',
      tech: ['React', 'TypeScript', 'Recharts', 'KaTeX', 'Flight Mechanics'],
      link: '/apps/specific-range',
      status: 'Live',
      gradient: 'from-orange-500 to-red-500',
    },
    {
      title: 'PARADIGM',
      description: 'Systems-of-systems optimization platform for future aircraft. Energy/fuel/logistics modeling with reduced-order models. Boeing Innovation Award winner.',
      tech: ['Python', 'React', 'Reduced-Order Models', 'Geospatial', 'Optimization'],
      link: '#',
      status: 'Boeing',
      gradient: 'from-blue-500 to-cyan-500',
    },
    {
      title: 'Deckide',
      description: 'Decision intelligence platform for exploring multi-dimensional trade spaces.',
      tech: ['TypeScript', 'React', 'deck.gl', 'Data Visualization'],
      link: '#',
      status: 'Active',
      gradient: 'from-slate-500 to-slate-600',
    },
  ];

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
              <Link href="/snippets" className="text-gray-300 hover:text-white transition-colors">
                Snippets
              </Link>
              <Link href="/projects" className="text-white font-semibold">
                Projects
              </Link>
              <Link href="/about" className="text-gray-300 hover:text-white transition-colors">
                About
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-32 pb-16">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-gray-900 mb-4">Projects</h1>
          <p className="text-xl text-gray-600">
            Aerospace tools and systems that make complex things tractable
          </p>
        </div>

        {/* Projects Grid */}
        <div className="grid md:grid-cols-2 gap-8">
          {projects.map((project, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              whileHover={{ scale: 1.02 }}
              className="bg-white/80 backdrop-blur-lg border border-gray-200 rounded-xl p-8 hover:border-blue-300 hover:shadow-lg transition-all"
            >
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-2xl font-bold text-gray-900">{project.title}</h3>
                <span className={`px-3 py-1 bg-gradient-to-r ${project.gradient} rounded-full text-white text-sm font-semibold`}>
                  {project.status}
                </span>
              </div>
              
              <p className="text-gray-600 mb-6">{project.description}</p>
              
              <div className="flex flex-wrap gap-2 mb-6">
                {project.tech.map((tech, i) => (
                  <span
                    key={i}
                    className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium"
                  >
                    {tech}
                  </span>
                ))}
              </div>

              {project.link !== '#' ? (
                <Link
                  href={project.link}
                  className="inline-flex items-center text-blue-600 hover:text-blue-700 font-semibold transition-colors"
                >
                  Launch App →
                </Link>
              ) : (
                <span className="text-gray-400 text-sm">Coming soon</span>
              )}
            </motion.div>
          ))}
        </div>

        {/* Call to Action */}
        <div className="mt-16 text-center bg-white/60 rounded-2xl border border-gray-200 p-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            Interested in Collaborating?
          </h2>
          <p className="text-gray-600 text-lg mb-6">
            Working on aerospace problems, optimization challenges, or building tools that make engineering decisions clearer? Let's talk.
          </p>
          <Link
            href="/about"
            className="inline-block px-8 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-lg font-semibold hover:scale-105 transition-transform shadow-md"
          >
            Get in Touch
          </Link>
        </div>
      </main>
    </div>
  );
}

