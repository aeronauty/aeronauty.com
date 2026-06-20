import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Renders trusted (owner-authored) markdown. No raw HTML is allowed through. */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="post-body">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
