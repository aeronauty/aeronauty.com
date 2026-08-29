import { topologyArticles } from "@/lib/topology-articles";

export type PrivateArticle = {
  slug: string;
  title: string;
  description: string;
  date: string;
  status: string;
  tags: string[];
  buildFile: string;
  assetPrefix: string;
};

export const privateArticles: PrivateArticle[] = [
  ...topologyArticles.map((article) => ({
    slug: article.slug,
    title: article.title,
    description: article.description,
    date: article.date,
    status: article.status,
    tags: article.tags,
    buildFile: article.buildFile,
    assetPrefix: article.labAssetPrefix,
  })),
];

export function getPrivateArticle(slug: string): PrivateArticle | undefined {
  return privateArticles.find((article) => article.slug === slug);
}
