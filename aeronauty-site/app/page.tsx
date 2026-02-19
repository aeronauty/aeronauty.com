import Link from 'next/link';
import { Hero } from '@/components/Hero';
import { ProjectCard } from '@/components/ProjectCard';

export default function Home() {
  const projects = [
    {
      title: "Code Snippets",
      description: "Useful snippets for CFD workflows, optimization, and interactive visualization",
      link: "/snippets",
      icon: "💻",
      tags: ["Python", "TypeScript", "GPU", "Viz"],
    },
    {
      title: "About Me",
      description: "Aerodynamicist, systems engineer, and explainer of complex aerospace topics",
      link: "/about",
      icon: "✈️",
      tags: ["Aerospace", "CFD", "Optimization"],
    },
    {
      title: "Projects",
      description: "Tools, explainers, and systems that make complex problems tractable",
      link: "/projects",
      icon: "🚀",
      tags: ["Decision Tools", "Visualization", "Education"],
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
              <Link href="/projects" className="text-gray-300 hover:text-white transition-colors">
                Projects
              </Link>
              <Link href="/about" className="text-gray-300 hover:text-white transition-colors">
                About
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <Hero />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        {/* Projects Grid */}
        <section className="mb-24">
          <h2 className="text-4xl font-bold text-white mb-4 text-center">
            Explore the Collection
          </h2>
          <p className="text-gray-400 text-center mb-12 text-lg">
            For those who appreciate elegant code and interesting projects
          </p>
          <div className="grid md:grid-cols-3 gap-8">
            {projects.map((project, index) => (
              <ProjectCard key={index} {...project} />
            ))}
          </div>
        </section>

        {/* Nerd Pride Section */}
        <section className="text-center py-16 bg-white/60 rounded-2xl border border-gray-200">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            Made by a Nerd, for Nerds 🤓
          </h2>
          <p className="text-gray-600 max-w-2xl mx-auto text-lg">
            If you're the kind of person who gets excited about rotor aerodynamics, 
            reduced-order modeling, discrete optimization, or understanding why 
            aircraft actually work... you're in the right place. 
            Welcome to my corner of the internet.
          </p>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 mt-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center text-gray-600">
            <p>© 2025 Aeronauty. Built with Next.js, React, and ☕</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

