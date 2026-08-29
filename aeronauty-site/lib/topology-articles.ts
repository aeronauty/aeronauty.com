export type TopologyArticle = {
  slug: string;
  title: string;
  description: string;
  date: string;
  status: string;
  tags: string[];
  buildFile: string;
  publicAssetPrefix: string;
  labAssetPrefix: string;
};

export const topologyArticles: TopologyArticle[] = [
  {
    slug: "computational-experimentation",
    title: "Computational Experimentation",
    description:
      "Moving trust in machine-produced engineering work from authorship to experiment, with the panel-code calibration sequence made interactive.",
    date: "2026-08-25",
    status: "Published",
    tags: ["Engineering", "AI", "Verification", "Interactive", "Long read"],
    buildFile: "computational-experimentation/article.html",
    publicAssetPrefix: "/writing/topology-instinct/assets",
    labAssetPrefix: "/lab/articles/topology-instinct/assets",
  },
  {
    slug: "i-dont-like-data-entry",
    title: "I Don't Like Data Entry",
    description:
      "Twenty years of avoiding the human join operation — from PDF figures and PowerPoint refusals through Paradigm and Postgres to Flexcompute Thread.",
    date: "2026-05-03",
    status: "Published",
    tags: ["Topology", "Thread", "Engineering data", "Long read"],
    buildFile: "article-1.html",
    publicAssetPrefix: "/writing/topology-instinct/assets",
    labAssetPrefix: "/lab/articles/topology-instinct/assets",
  },
  {
    slug: "the-brain-that-was-a-tax",
    title: "The Brain That Was a Tax Is Now an Asset",
    description:
      "ADHD, medication, and a swarm of cheap fast specialists arriving roughly at the same time — and what happened to the cross-domain generalist when they did.",
    date: "2026-05-03",
    status: "Published",
    tags: ["ADHD", "AI", "Orchestration", "Long read"],
    buildFile: "article-2.html",
    publicAssetPrefix: "/writing/topology-instinct/assets",
    labAssetPrefix: "/lab/articles/topology-instinct/assets",
  },
];

export function getTopologyArticle(slug: string): TopologyArticle | undefined {
  return topologyArticles.find((article) => article.slug === slug);
}
