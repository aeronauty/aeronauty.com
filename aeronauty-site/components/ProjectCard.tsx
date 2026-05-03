import Link from "next/link";

interface ProjectCardProps {
  title: string;
  description: string;
  link: string;
  kicker?: string;
  tags: string[];
}

export function ProjectCard({ title, description, link, kicker, tags }: ProjectCardProps) {
  return (
    <Link href={link} className="group block h-full rounded-md border border-stone-200 bg-white p-6 transition hover:-translate-y-0.5 hover:border-stone-400 hover:shadow-[0_18px_50px_rgba(28,25,23,0.08)]">
      {kicker && <p className="eyebrow text-[0.65rem]">{kicker}</p>}
      <h3 className="mt-4 text-2xl font-semibold tracking-tight text-stone-950">{title}</h3>
      <p className="mt-3 leading-7 text-stone-600">{description}</p>
      <div className="mt-6 flex flex-wrap gap-2">
        {tags.map((tag) => (
          <span key={tag} className="rounded-full border border-stone-200 px-3 py-1 text-xs font-medium text-stone-600">
            {tag}
          </span>
        ))}
      </div>
      <span className="mt-7 inline-flex text-sm font-semibold text-[var(--ink)] underline decoration-stone-300 underline-offset-4 group-hover:decoration-[var(--accent)]">
        Open
      </span>
    </Link>
  );
}
