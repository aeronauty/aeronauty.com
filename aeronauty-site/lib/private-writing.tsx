import type { ReactNode } from "react";

export type PrivatePost = {
  slug: string;
  title: string;
  description: string;
  status: string;
  date: string;
  tags: string[];
  body: ReactNode;
};

const bodyClass = "text-gray-300 leading-8";

export const privatePosts: PrivatePost[] = [
  {
    slug: "private-lab-notes",
    title: "Private lab notes",
    description:
      "A placeholder private post proving that gated writing works before real behind-the-scenes material goes here.",
    status: "Draft",
    date: "2026-05-03",
    tags: ["Private", "Lab", "Notes"],
    body: (
      <div className="space-y-6">
        <p className={bodyClass}>
          This is a private Aeronauty post. It is intentionally thin: the point is to prove the
          gated-writing path before using it for real project notes, behind-the-scenes demos, and
          early technical drafts.
        </p>
        <p className={bodyClass}>
          Public writing belongs under <span className="text-white">/writing</span>. Private work
          in progress belongs here, behind the magic-link lab gate.
        </p>
      </div>
    ),
  },
];

export function getPrivatePost(slug: string): PrivatePost | undefined {
  return privatePosts.find((post) => post.slug === slug);
}
