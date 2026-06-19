import { tagLabel } from "@/lib/slop-shared";

export function SlopTagChips({
  tags,
  customTags,
}: {
  tags: string[];
  customTags: string[];
}) {
  const all = [...tags, ...customTags];
  if (all.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {all.map((tag, index) => (
        <span
          key={`${tag}-${index}`}
          className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-stone-600"
        >
          {tagLabel(tag)}
        </span>
      ))}
    </div>
  );
}
