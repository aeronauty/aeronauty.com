'use client';

import Link from 'next/link';

export default function SnippetsPage() {
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
              <Link href="/snippets" className="text-gray-900 font-semibold">
                Snippets
              </Link>
              <Link href="/projects" className="text-gray-600 hover:text-gray-900 transition-colors">
                Projects
              </Link>
              <Link href="/about" className="text-gray-600 hover:text-gray-900 transition-colors">
                About
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-32 pb-16">
        <div className="text-center">
          <h1 className="text-5xl font-bold text-gray-900 mb-4">Code Snippets</h1>
          <p className="text-xl text-gray-600 mb-12">
            Useful code snippets and examples
          </p>
          
          {/* Coming Soon Card */}
          <div className="max-w-2xl mx-auto">
            <div className="bg-white/80 backdrop-blur-lg border-2 border-gray-200 rounded-2xl p-16 text-center">
              <div className="inline-block p-6 bg-blue-100 rounded-full mb-6">
                <svg className="w-16 h-16 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
              </div>
              <h2 className="text-3xl font-bold text-gray-900 mb-4">
                Coming Soon
              </h2>
              <p className="text-lg text-gray-600 mb-6">
                Code snippets, examples, and utilities will be added here soon.
              </p>
              <p className="text-sm text-gray-500">
                Check back later for aerospace workflows, optimization tools, and more.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

