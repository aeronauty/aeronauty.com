// Re-mounts on every navigation, so the CSS `.page-enter` animation (globals.css)
// re-plays for a page-to-page transition. Pure CSS, so the content is visible
// even without JS and honors prefers-reduced-motion — no SSR opacity:0 blackout.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
