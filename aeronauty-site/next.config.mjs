/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
  experimental: {
    outputFileTracingIncludes: {
      "/*": ["./content/private/topology-instinct/data/README.md"],
    },
  },
  async rewrites() {
    return [
      // Serve the self-contained Subsidy Clock exhibit (public/slop/subsidy-clock.html)
      // at a clean URL that matches its canonical/og:url.
      { source: "/slop/subsidy-clock", destination: "/slop/subsidy-clock.html" },
      // P&F badge design vote (public/pf/badges.html)
      { source: "/pf/badges", destination: "/pf/badges.html" },
    ];
  },
};

export default nextConfig;

