'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';

interface ProjectCardProps {
  title: string;
  description: string;
  link: string;
  icon: string;
  tags: string[];
}

export function ProjectCard({ title, description, link, icon, tags }: ProjectCardProps) {
  return (
    <motion.div
      whileHover={{ scale: 1.05, y: -5 }}
      transition={{ duration: 0.2 }}
    >
      <Link href={link}>
        <div className="bg-white/80 backdrop-blur-lg border border-gray-200 rounded-xl p-8 hover:border-blue-300 hover:shadow-lg transition-all h-full cursor-pointer">
          <div className="text-5xl mb-4">{icon}</div>
          <h3 className="text-2xl font-bold text-gray-900 mb-3">{title}</h3>
          <p className="text-gray-600 mb-6">{description}</p>
          <div className="flex flex-wrap gap-2">
            {tags.map((tag, index) => (
              <span
                key={index}
                className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

