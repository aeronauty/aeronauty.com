import Link from "next/link";
import { notFound } from "next/navigation";
import { getPrivatePost, privatePosts } from "@/lib/private-writing";

export function generateStaticParams() {
  return privatePosts.map((post) => ({ slug: post.slug }));
}

export default function PrivatePostPage({ params }: { params: { slug: string } }) {
  const post = getPrivatePost(params.slug);

  if (!post) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <article className="mx-auto w-full max-w-3xl px-6 py-16">
        <div className="mb-12 flex items-center justify-between">
          <Link href="/lab/writing" className="text-sm font-semibold text-blue-300 hover:text-blue-200">
            Private writing
          </Link>
          <a href="/api/lab/logout" className="text-sm text-gray-400 hover:text-white">
            Sign out
          </a>
        </div>

        <p className="text-sm text-gray-500">{post.date}</p>
        <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">{post.title}</h1>
        <p className="mt-5 text-lg leading-8 text-gray-300">{post.description}</p>

        <div className="mt-6 flex flex-wrap gap-2">
          {post.tags.map((tag) => (
            <span key={tag} className="rounded-full bg-gray-800 px-3 py-1 text-sm text-gray-300">
              {tag}
            </span>
          ))}
        </div>

        <div className="mt-12 border-t border-gray-800 pt-10">{post.body}</div>
      </article>
    </main>
  );
}
