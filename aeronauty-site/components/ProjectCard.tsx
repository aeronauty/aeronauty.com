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
    <Link href={link} className="card group block h-full p-6">
      {kicker && <p className="eyebrow text-[0.65rem]">{kicker}</p>}
      <h3 className="mt-4 font-display text-2xl font-semibold tracking-tight text-[var(--ink)]">{title}</h3>
      <p className="mt-3 leading-7 text-[var(--muted)]">{description}</p>
      <div className="mt-6 flex flex-wrap gap-x-4 gap-y-2">
        {tags.map((tag) => (
          <span
            key={tag}
            className="border-b border-[var(--rule)] pb-0.5 font-mono text-[0.7rem] uppercase tracking-[0.06em] text-[var(--muted)]"
          >
            {tag}
          </span>
        ))}
      </div>
      <span className="an-link mt-7 inline-flex font-mono text-xs uppercase tracking-[0.08em] text-[var(--ink)]">
        Open →
      </span>
    </Link>
  );
}
