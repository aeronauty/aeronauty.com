'use client';

import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'framer-motion';

export default function AboutPage() {
  const skills = [
    { category: 'Programming & Environments', items: ['Python (daily driver)', 'SQL (Postgres, SQLite, Supabase)', 'TypeScript/JavaScript', 'C++', 'MATLAB'] },
    { category: 'Optimization & Math', items: ['OR-Tools (CP-SAT)', 'cvxpy', 'PuLP', 'Gurobi/CPLEX', 'Nonlinear solvers', 'Monte Carlo'] },
    { category: 'Data Science & Pipelines', items: ['Polars', 'Pandas', 'NumPy', 'scikit-learn', 'CI/CD', 'HPC batching', 'Time-series'] },
    { category: 'Visualization & Frontend', items: ['Plotly', 'D3.js', 'deck.gl', 'MapLibre/Mapbox', 'Recharts', 'React/Tailwind'] },
    { category: 'Aerospace & Flight Dynamics', items: ['Stability & Control', 'Aero Derivatives', 'MIL-STD-8785C/1797/ADS-33', 'Wind Tunnel DAQ', 'Certification'] },
    { category: 'Theoretical Foundations', items: ['MILP/MINLP/CP', 'Nonlinear Programming', 'Pareto Analysis', 'Uncertainty Quantification', 'Flight Control Theory', 'Systems-of-systems'] },
  ];

  const experience = [
    {
      title: 'Lead Flight Physics & Optimization Engineer',
      company: 'Aurora Flight Sciences (Boeing)',
      period: '2021 – Present',
      location: 'Remote (USA → Germany)',
      description: 'Technical lead across flight dynamics, aerodynamics, and system-of-systems optimization for advanced aircraft programs.',
      achievements: [
        'eVTOL Stability & Control (Wisk Gen 6): Built and maintained aero/derivative databases for handling qualities analysis. Performed hover/transition S&C assessments and uncertainty propagation for certification-oriented analysis pathways.',
        'LTA / Hybrid Airship Studies: Developed conceptual flight dynamics and buoyancy-control modeling to assess envelope sizing and vehicle controllability across loading conditions.',
        'HSVTOL Concept Development: Ran aerodynamic trade studies and S&C envelope screening for tiltrotor-like concepts across low- and high-speed regimes.',
        'De-cambering Method (Boeing): Developed aerodynamic correction workflow enabling 2D→3D lift prediction without full RANS. Adopted across programs and eliminated recurring expensive CFD campaigns.',
        'Wind Tunnel / CFD Integration: Built automated data ingestion and visualization tools to unify NASA, CFD, and proprietary wind tunnel sources for S&C model construction.',
        'PARADIGM Platform: Architected Boeing’s optimization and decision-analysis framework for infrastructure and fleet-level trade studies. Used for billion-dollar planning decisions and recognized internally for economic impact.',
        'System-of-Systems Optimization: Built solver pipelines for routing, logistics capacity analysis, and mission-level trade studies using MILP / CP-SAT frameworks.',
        'Mission Performance Modeling: Built parametric mission simulators and payload-range tools for eVTOL, LTA, and HSVTOL concepts with Monte Carlo uncertainty.',
        'Interactive Engineering Dashboards: Built Python/TypeScript/React/Plotly tooling to make complex trade spaces explorable by non-technical stakeholders.',
        'Certification-Facing Analysis Support: Produced stability, control margin, and worst-case performance assessments feeding into certification evidence chains (FAA/EASA pathways owned by partner team).',
      ],  
    },
    {
      title: 'Industry Assistant Professor',
      company: 'Illinois Institute of Technology',
      period: '2018 – 2021',
      location: 'Chicago, IL',
      description: 'Teaching graduate aerospace courses with emphasis on practical application.',
      achievements: [
        'Taught graduate Flight Mechanics & Experimental Aerodynamics',
        'Received the Provost\'s Teaching Award for excellence in graduate aerospace education',
        'Founded aircraftflightmechanics.com — interactive teaching platform for S&C concepts used worldwide',
      ],
    },
    {
      title: 'Senior Aerodynamics Engineer & Business Development Manager',
      company: 'Aircraft Research Association',
      period: '2014 – 2018',
      location: 'Bedford, UK',
      description: 'Technical authority for rotary- and fixed-wing testing in 30MW transonic tunnel.',
      achievements: [
        'Built high-fidelity DAQ (DynAMoS, 40 MHz) for aero/structural monitoring',
        'Delivered experimental S&C data for Boeing, Northrop, and Raytheon',
        'Blended tunnel and simulation results to support design and certification',
        'Secured £10M+ in contracts through credible execution and customer engagement',
      ],
    },
    {
      title: 'Postgraduate Flight Mechanics Engineer',
      company: 'AgustaWestland',
      period: '2010 – 2011',
      location: 'Yeovil, UK',
      description: 'Supported AW159 Wildcat certification.',
      achievements: [
        'Automated handling-qualities analysis to shorten design loops',
      ],
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
              <Link href="/about" className="text-white font-semibold">
                About
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-32 pb-16">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-16"
        >
          <div className="w-40 h-40 mx-auto mb-6 rounded-full overflow-hidden border-4 border-blue-500 shadow-xl">
            <Image
              src="/harry-photo.jpg"
              alt="Harry Smith"
              width={160}
              height={160}
              className="object-cover w-full h-full"
              priority
            />
          </div>
          <h1 className="text-5xl font-bold text-gray-900 mb-4">Harry Smith</h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto mb-2">
            Aerospace engineer bridging stability & control, wind tunnel testing, and system-of-systems optimization.
          </p>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            15+ years of experience from transonic experimental aerodynamics to eVTOL flight controls to division-wide decision platforms. 
            Creator of intuitive analysis tools and IP-driven software that make S&C, aerodynamic, and mission-level data explorable — 
            enabling rapid iteration, better design decisions, and competitive advantage.
          </p>
        </motion.div>

        {/* Skills Section */}
        <section className="mb-16">
          <h2 className="text-3xl font-bold text-gray-900 mb-8 text-center">Skills & Technologies</h2>
          <div className="grid md:grid-cols-2 gap-6">
            {skills.map((skillGroup, index) => (
              <motion.div
                key={index}
              initial={{ opacity: 0, x: index % 2 === 0 ? -20 : 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              className="bg-white/80 backdrop-blur-lg border border-gray-200 rounded-xl p-6 hover:shadow-lg transition-shadow"
            >
              <h3 className="text-xl font-bold text-blue-600 mb-4">{skillGroup.category}</h3>
              <div className="flex flex-wrap gap-2">
                {skillGroup.items.map((skill, i) => (
                  <span
                    key={i}
                    className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg text-sm font-medium"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </motion.div>
            ))}
          </div>
        </section>

        {/* Experience Section */}
        <section className="mb-16">
          <h2 className="text-3xl font-bold text-gray-900 mb-8 text-center">Experience</h2>
          <div className="space-y-8">
            {experience.map((job, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.2 }}
              className="bg-white/80 backdrop-blur-lg border border-gray-200 rounded-xl p-8 hover:shadow-lg transition-shadow"
            >
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-2xl font-bold text-gray-900">{job.title}</h3>
                  <p className="text-blue-600 text-lg">{job.company}</p>
                  {job.location && <p className="text-gray-500 text-sm">{job.location}</p>}
                </div>
                <span className="text-gray-500">{job.period}</span>
              </div>
              <p className="text-gray-600 mb-4">{job.description}</p>
              <ul className="space-y-2">
                {job.achievements.map((achievement, i) => (
                  <li key={i} className="text-gray-700 flex items-start">
                    <span className="text-blue-600 mr-2">▹</span>
                    {achievement}
                  </li>
                ))}
              </ul>
            </motion.div>
            ))}
          </div>
        </section>

        {/* Education Section */}
        <section className="mb-16">
          <h2 className="text-3xl font-bold text-gray-900 mb-8 text-center">Education</h2>
          <div className="space-y-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white/80 backdrop-blur-lg border border-gray-200 rounded-xl p-6 hover:shadow-lg transition-shadow"
            >
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-xl font-bold text-gray-900">Ph.D. in Aerospace Engineering</h3>
                  <p className="text-blue-600">University of Glasgow</p>
                  <p className="text-gray-600 mt-2">Dissertation: <em>Optimization and Reduced-Order Modeling of Propellers at Incidence</em></p>
                </div>
                <span className="text-gray-500">2011 – 2014</span>
              </div>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-white/80 backdrop-blur-lg border border-gray-200 rounded-xl p-6 hover:shadow-lg transition-shadow"
            >
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-xl font-bold text-gray-900">M.Eng in Aeronautical Engineering</h3>
                  <p className="text-blue-600">University of Glasgow</p>
                  <p className="text-gray-600 mt-2">First Class (top of class)</p>
                </div>
                <span className="text-gray-500">2005 – 2010</span>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Recognition & Achievements */}
        <section className="mb-16">
          <h2 className="text-3xl font-bold text-gray-900 mb-8 text-center">Recognition & Achievements</h2>
          <div className="bg-white/80 backdrop-blur-lg border border-gray-200 rounded-xl p-8">
            <ul className="space-y-3">
              <li className="text-gray-700 flex items-start">
                <span className="text-blue-600 mr-2">▹</span>
                <div>
                  <strong>Boeing Innovation Award (2023)</strong> — PARADIGM system-of-systems optimization platform
                </div>
              </li>
              <li className="text-gray-700 flex items-start">
                <span className="text-blue-600 mr-2">▹</span>
                <div>
                  <strong>Provost's Teaching Award (2020)</strong> — IIT, excellence in graduate aerospace education
                </div>
              </li>
              <li className="text-gray-700 flex items-start">
                <span className="text-blue-600 mr-2">▹</span>
                <div>
                  <strong>Cambridge Science Slam Winner (2013)</strong> — science communication
                </div>
              </li>
              <li className="text-gray-700 flex items-start">
                <span className="text-blue-600 mr-2">▹</span>
                <div>
                  <strong>Media & Talks:</strong> BBC aerospace safety commentary, Airbus keynote, AIAA publications
                </div>
              </li>
            </ul>
          </div>
        </section>

        {/* What I Do Section */}
        <section className="mb-16">
          <h2 className="text-3xl font-bold text-gray-900 mb-8 text-center">What I Actually Do</h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-white/80 border border-gray-200 rounded-xl p-6 hover:shadow-lg transition-shadow">
              <h3 className="text-xl font-bold text-gray-900 mb-3">Rotor & Propeller Aerodynamics</h3>
              <p className="text-gray-600">
                Deep expertise in non-axisymmetric inflow, yawed operation, unsteady loads, and wind tunnel validation. 
                Identifying the physics others oversimplify.
              </p>
            </div>
            <div className="bg-white/80 border border-gray-200 rounded-xl p-6 hover:shadow-lg transition-shadow">
              <h3 className="text-xl font-bold text-gray-900 mb-3">Reduced-Order Modeling</h3>
              <p className="text-gray-600">
                OpenFOAM, SU2, and surrogate modeling techniques. Building reduced-order methods 
                so early design decisions don't need week-long CFD runs.
              </p>
            </div>
            <div className="bg-white/80 border border-gray-200 rounded-xl p-6 hover:shadow-lg transition-shadow">
              <h3 className="text-xl font-bold text-gray-900 mb-3">Systems-Level Optimization</h3>
              <p className="text-gray-600">
                Discrete optimization, geospatial routing, techno-economic modeling. 
                Linking aircraft performance to real-world infrastructure and logistics constraints.
              </p>
            </div>
            <div className="bg-white/80 border border-gray-200 rounded-xl p-6 hover:shadow-lg transition-shadow">
              <h3 className="text-xl font-bold text-gray-900 mb-3">Technical Education</h3>
              <p className="text-gray-600">
                Award-winning YouTube explainers. Interactive 3D demos. 
                Turning "here's the equation" into "here's why the phenomenon exists."
              </p>
            </div>
          </div>
        </section>

        {/* Philosophy Section */}
        <section className="mb-16">
          <div className="bg-white/80 border border-gray-200 rounded-xl p-8 shadow-sm">
            <h2 className="text-3xl font-bold text-gray-900 mb-6 text-center">Philosophy</h2>
            <div className="space-y-4 text-gray-700 text-lg">
              <p>
                <strong className="text-blue-600">Make complexity visual and explorable.</strong> If you can't 
                interact with it and rotate it in 3D, you don't really understand it yet.
              </p>
              <p>
                <strong className="text-blue-600">Build tools, not slide decks.</strong> Research should become 
                software that people actually use, not just papers that cite each other.
              </p>
              <p>
                <strong className="text-blue-600">Bridge the gaps.</strong> Rare combination: aerodynamicist ↔ 
                optimization scientist ↔ product builder. High bandwidth between theory and shipped product.
              </p>
            </div>
          </div>
        </section>

        {/* Entrepreneurship Section */}
        <section className="mb-16">
          <h2 className="text-3xl font-bold text-gray-900 mb-8 text-center">Side Projects & Ventures</h2>
          <div className="grid md:grid-cols-2 gap-6">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-white/80 backdrop-blur-lg border border-gray-200 rounded-xl p-6 hover:shadow-lg transition-shadow"
            >
              <h3 className="text-2xl font-bold text-gray-900 mb-3">Deckide</h3>
              <p className="text-gray-600 mb-4">
                Decision intelligence + data aggregation platform. Interactive trade-space reasoning 
                that helps you understand multi-dimensional design decisions.
              </p>
              <span className="text-blue-600">Decision Board • Data Viz • Trade Analysis</span>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-white/80 backdrop-blur-lg border border-gray-200 rounded-xl p-6 hover:shadow-lg transition-shadow"
            >
              <h3 className="text-2xl font-bold text-gray-900 mb-3">SayVault</h3>
              <p className="text-gray-600 mb-4">
                Personal knowledge graph using NLP to turn scattered notes into structured reasoning. 
                Your second brain, but actually useful.
              </p>
              <span className="text-cyan-600">Knowledge Graph • NLP • Personal Tools</span>
            </motion.div>
          </div>
          <p className="text-center text-gray-600 mt-6 text-lg">
            Philosophy: Turn engineering expertise into tools that feel like consumer software
          </p>
        </section>

        {/* Contact Section */}
        <section className="text-center">
          <div className="bg-white/80 backdrop-blur-lg border border-gray-200 rounded-xl p-12 shadow-sm">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Let's Connect</h2>
            <p className="text-gray-600 mb-8">
              Interested in aerospace, CFD, optimization, or building tools that make complex things obvious? Let's chat.
            </p>
            <div className="flex justify-center gap-6 flex-wrap">
              <a
                href="https://github.com/aeronauty"
                target="_blank"
                rel="noopener noreferrer"
                className="px-6 py-3 bg-gradient-to-r from-slate-600 to-slate-700 text-white rounded-lg font-semibold hover:scale-105 transition-transform shadow-md"
              >
                GitHub
              </a>
              <a
                href="https://youtube.com/@aircraftflightmechanics"
                target="_blank"
                rel="noopener noreferrer"
                className="px-6 py-3 bg-gradient-to-r from-red-600 to-red-700 text-white rounded-lg font-semibold hover:scale-105 transition-transform shadow-md"
              >
                YouTube
              </a>
              <a
                href="https://linkedin.com/in/smithharry"
                target="_blank"
                rel="noopener noreferrer"
                className="px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg font-semibold hover:scale-105 transition-transform shadow-md"
              >
                LinkedIn
              </a>
              <a
                href="mailto:smith.harry@gmail.com"
                className="px-6 py-3 bg-gradient-to-r from-cyan-600 to-cyan-700 text-white rounded-lg font-semibold hover:scale-105 transition-transform shadow-md"
              >
                Email
              </a>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

