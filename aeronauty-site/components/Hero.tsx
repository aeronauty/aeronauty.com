'use client';

import { motion } from 'framer-motion';

export function Hero() {
  return (
    <div className="relative pt-32 pb-20 px-4">
      <div className="max-w-7xl mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <h1 className="text-6xl md:text-8xl font-bold mb-6">
            <span className="gradient-text">Aeronauty</span>
          </h1>
          <p className="text-2xl md:text-3xl text-gray-700 mb-4">
            Where I host aerospace tools, explainers, and code
          </p>
          <p className="text-lg md:text-xl text-gray-600 max-w-3xl mx-auto">
            Aerodynamicist • Systems Engineer • Reduced-Order Modeling • 
            Builder of tools that make complex problems visual and tractable
          </p>
        </motion.div>

        {/* Floating Elements */}
        <div className="mt-16 flex justify-center space-x-8">
          <motion.div
            animate={{ y: [0, -10, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            className="text-6xl"
          >
            🚀
          </motion.div>
          <motion.div
            animate={{ y: [0, -10, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", delay: 0.3 }}
            className="text-6xl"
          >
            💻
          </motion.div>
          <motion.div
            animate={{ y: [0, -10, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", delay: 0.6 }}
            className="text-6xl"
          >
            ⚡
          </motion.div>
        </div>
      </div>

      {/* Gradient Orbs */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-400 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-pulse"></div>
      <div className="absolute top-20 right-1/4 w-96 h-96 bg-cyan-400 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-pulse" style={{ animationDelay: '1s' }}></div>
    </div>
  );
}

