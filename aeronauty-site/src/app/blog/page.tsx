'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'

export default function BlogIndex() {
  const posts = [
    {
      slug: 'hello-world',
      title: 'Hello World ✈️',
      description: 'First post in Aeronauty - showcasing MDX, Plotly, and interactive content',
      date: '2025-09-25'
    }
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <h1 className="text-5xl font-bold text-gray-900 mb-4">
            Aeronauty Blog
          </h1>
          <p className="text-xl text-gray-600">
            Where data visualization takes flight 🚀
          </p>
        </motion.div>

        <div className="grid gap-8">
          {posts.map((post, index) => (
            <motion.article
              key={post.slug}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: index * 0.1 }}
              className="bg-white rounded-xl shadow-lg p-8 hover:shadow-xl transition-shadow"
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4">
                <h2 className="text-2xl font-bold text-gray-900 mb-2 sm:mb-0">
                  <Link 
                    href={`/blog/${post.slug}`}
                    className="hover:text-blue-600 transition-colors"
                  >
                    {post.title}
                  </Link>
                </h2>
                <time className="text-sm text-gray-500">
                  {new Date(post.date).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </time>
              </div>
              <p className="text-gray-600 mb-4">{post.description}</p>
              <Link 
                href={`/blog/${post.slug}`}
                className="inline-flex items-center text-blue-600 hover:text-blue-800 font-medium transition-colors"
              >
                Read more →
              </Link>
            </motion.article>
          ))}
        </div>
      </div>
    </div>
  )
}
