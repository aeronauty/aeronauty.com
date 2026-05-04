import { topologyArticles } from "@/lib/topology-articles";

export type PrivateArticle = {
  slug: string;
  title: string;
  description: string;
  date: string;
  status: string;
  tags: string[];
  /** Filename inside the article package's build root, served via the
   *  gated asset route. e.g. "article-1.html" → resolved to
   *  /lab/articles/topology-instinct/assets/article-1.html */
  buildFile: string;
  /** Asset-route prefix (mostly here for forward-compatibility if more
   *  packages are added later). */
  assetPrefix: string;
};

export const privateArticles: PrivateArticle[] = topologyArticles.map((article) => ({
  slug: article.slug,
  title: article.title,
  description: article.description,
  date: article.date,
  status: article.status,
  tags: article.tags,
  buildFile: article.buildFile,
  assetPrefix: article.labAssetPrefix,
}));

export function getPrivateArticle(slug: string): PrivateArticle | undefined {
  return privateArticles.find((a) => a.slug === slug);
}
