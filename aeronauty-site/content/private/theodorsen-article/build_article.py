#!/usr/bin/env python3
"""Build the gated Theodorsen scrollytelling article.

This intentionally forks the Topology Instinct article pattern rather than
generalising it. The source of truth remains editable Markdown; widgets remain
standalone editable HTML files.
"""

from __future__ import annotations

import html
import re
from pathlib import Path

import markdown


ROOT = Path(__file__).resolve().parent
ARTICLE_MD = ROOT / "article.md"
OUT = ROOT / "article.html"

WIDGETS = {
    "starting-vortex-memory",
    "lift-history-integral",
    "harmonic-collapse",
    "reduced-frequency",
    "ck-response",
    "pitch-plunge",
    "model-ladder",
}

VIDEOS = {
    "flutter": {
        "title": "Flutter footage",
        "copy": "NASA/Boeing wind-tunnel testing of a long, narrow wing model for aeroelastic response and flutter suppression.",
        "embed": "https://www.youtube.com/embed/TJNJfrkge9o",
    },
    "circulation-starting-vortex": {
        "title": "Starting vortex and circulation",
        "copy": "Placeholder slot for Harry's coffee-cup/spoon circulation clip. The references include NASA Glenn starting-vortex and circulation explainers.",
    },
}


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def render_markdown(src: str) -> str:
    """Render Markdown while preserving inline/display LaTeX delimiters."""

    stash: list[str] = []

    def save(match: re.Match[str]) -> str:
        stash.append(match.group(0))
        return f"@@MATH{len(stash) - 1}@@"

    protected = re.sub(r"\\\[(.*?)\\\]|\\\((.*?)\\\)", save, src, flags=re.DOTALL)
    rendered = markdown.markdown(protected, extensions=["extra"])
    for i, value in enumerate(stash):
        rendered = rendered.replace(f"@@MATH{i}@@", value)
    return rendered


def block(kind: str, inner: str) -> str:
    body = render_markdown(inner.strip())
    return f'\n\n<div class="th-mode-block th-mode-{kind}" data-mode="{kind}">\n{body}\n</div>\n\n'


def expand_mode_blocks(md: str) -> str:
    md = re.sub(r"\[ANALOGY\](.*?)\[/ANALOGY\]", lambda m: block("analogy", m.group(1)), md, flags=re.DOTALL)
    md = re.sub(r"\[MATHS\](.*?)\[/MATHS\]", lambda m: block("maths", m.group(1)), md, flags=re.DOTALL)
    return md


def expand_details(md: str) -> str:
    def repl(match: re.Match[str]) -> str:
      title = html.escape(match.group(1).strip())
      body = render_markdown(match.group(2).strip())
      return (
          f'\n\n<details class="th-details th-mode-maths" data-default-mode="maths">\n'
          f'  <summary>{title}</summary>\n'
          f'  <div class="th-details-body">\n{body}\n  </div>\n'
          f'</details>\n\n'
      )

    return re.sub(r"\[DETAILS:\s*([^\]]+)\](.*?)\[/DETAILS\]", repl, md, flags=re.DOTALL)


def expand_references(md: str) -> str:
    refs = ROOT / "references.md"
    if not refs.exists():
        content = "References file pending."
    else:
        content = read(refs)
    rendered = render_markdown(content)
    return md.replace(
        "[REFERENCES]",
        f'\n\n<section class="th-references" id="references">\n<h2>References</h2>\n{rendered}\n</section>\n\n',
    )


def sectionize(html_text: str) -> str:
    parts = re.split(r"(<h2>.*?</h2>)", html_text, flags=re.DOTALL)
    out: list[str] = []
    section_open = False
    section_index = 0
    for part in parts:
        if not part:
            continue
        if part.startswith("<h2>"):
            if section_open:
                out.append("</section>")
            title = re.sub(r"<.*?>", "", part).strip()
            slug = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-") or f"section-{section_index}"
            out.append(f'<section class="th-section" id="{slug}" data-section-index="{section_index}">')
            out.append(f'<span class="th-section-num">{section_index:02d}</span>')
            out.append(part.replace("<h2>", '<h2 class="th-section-title">'))
            section_open = True
            section_index += 1
        else:
            out.append(part)
    if section_open:
        out.append("</section>")
    return "\n".join(out)


def substitute_widgets(html_text: str) -> str:
    def repl(match: re.Match[str]) -> str:
        name = match.group(1).strip()
        if name not in WIDGETS:
            return match.group(0)
        title = html.escape(name.replace("-", " ").title())
        return (
            f'<aside class="th-widget" data-widget="{name}">\n'
            f'  <iframe title="{title}" src="figures/{name}.html" loading="lazy"></iframe>\n'
            f'</aside>'
        )

    return re.sub(r"<p>\[WIDGET:\s*([^\]]+)\]</p>", repl, html_text)


def substitute_videos(html_text: str) -> str:
    def repl(match: re.Match[str]) -> str:
        name = match.group(1).strip()
        meta = VIDEOS.get(name, {"title": name, "copy": "Video source pending."})
        mp4 = ROOT / "figures" / f"{name}.mp4"
        if "embed" in meta:
            media = (
                f'<iframe title="{html.escape(meta["title"])}" src="{html.escape(meta["embed"])}" '
                'allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" '
                'allowfullscreen loading="lazy"></iframe>'
            )
        elif mp4.exists():
            media = f'<video src="figures/{name}.mp4" controls playsinline preload="metadata"></video>'
        else:
            media = (
                '<div class="th-video-placeholder">'
                '<span>Video source pending</span>'
                '</div>'
            )
        return (
            f'<figure class="th-video" data-video="{name}">\n'
            f'  {media}\n'
            f'  <figcaption><strong>{html.escape(meta["title"])}</strong> {html.escape(meta["copy"])}</figcaption>\n'
            f'</figure>'
        )

    return re.sub(r"<p>\[VIDEO:\s*([^\]]+)\]</p>", repl, html_text)


def render() -> str:
    md = read(ARTICLE_MD)
    title_match = re.search(r"^#\s+(.+)$", md, flags=re.MULTILINE)
    title = title_match.group(1).strip() if title_match else "The Wing Remembers"
    md = expand_mode_blocks(md)
    md = expand_details(md)
    md = expand_references(md)
    prose = render_markdown(md)
    prose = substitute_widgets(prose)
    prose = substitute_videos(prose)
    prose = sectionize(prose)
    return TEMPLATE.format(title=html.escape(title), prose=prose)


TEMPLATE = r"""<!doctype html>
<html lang="en" data-reading-mode="analogy">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{title}</title>
  <script>
    window.MathJax = {{
      tex: {{ inlineMath: [['\\(', '\\)']], displayMath: [['\\[', '\\]']] }},
      svg: {{ fontCache: 'global' }}
    }};
  </script>
  <script defer src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js"></script>
  <style>
    :root {{
      color-scheme: light;
      --bg: #f7f5ef;
      --ink: #1c1917;
      --muted: #6f6860;
      --rule: #ded7cc;
      --panel: #ffffff;
      --teal: #0f766e;
      --amber: #c87916;
      --blue: #2563eb;
      --rose: #be185d;
      --serif: "Source Serif 4", Georgia, "Times New Roman", serif;
      --sans: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }}
    * {{ box-sizing: border-box; }}
    html {{ scroll-behavior: smooth; }}
    body {{ margin: 0; background: var(--bg); color: var(--ink); font-family: var(--sans); overflow-x: clip; }}
    .th-progress {{ position: fixed; inset: 0 auto auto 0; height: 3px; width: 100%; transform: scaleX(0); transform-origin: left; z-index: 40; background: linear-gradient(90deg,var(--teal),var(--blue),var(--rose)); }}
    .th-hero {{ min-height: 100svh; display: grid; grid-template-columns: minmax(0,1fr) minmax(340px,460px); gap: 36px; align-items: center; width: min(1280px, calc(100vw - 48px)); margin: 0 auto; padding: 72px 0; }}
    .th-eyebrow {{ margin: 0 0 16px; color: var(--teal); font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: .18em; }}
    h1 {{ margin: 0; font-family: var(--serif); font-size: clamp(54px, 9vw, 118px); line-height: .94; letter-spacing: 0; }}
    .th-kicker {{ max-width: 720px; margin: 26px 0 0; color: var(--muted); font-size: clamp(18px, 2vw, 23px); line-height: 1.55; }}
    .th-hero-card {{ border: 1px solid var(--rule); border-radius: 8px; background: var(--panel); padding: 22px; box-shadow: 0 24px 70px rgba(28,25,23,.08); }}
    .th-hero-card p {{ margin: 10px 0 0; color: var(--muted); line-height: 1.6; }}
    .th-rail {{ position: fixed; left: max(18px, calc((100vw - 1180px)/2 - 82px)); top: 112px; bottom: 80px; width: 74px; z-index: 12; display: none; }}
    .th-rail svg {{ width: 100%; height: 100%; overflow: visible; }}
    .th-rail-label {{ position: absolute; left: 66px; top: 0; width: 170px; color: var(--muted); font-size: 12px; line-height: 1.3; transform: translateY(-50%); opacity: .9; }}
    @media (min-width: 1400px) {{ .th-rail {{ display: block; }} }}
    .th-mode-switch {{ position: sticky; top: 12px; z-index: 30; width: min(680px, calc(100vw - 32px)); margin: -42px auto 56px; padding: 6px; border: 1px solid var(--rule); border-radius: 999px; background: color-mix(in srgb, var(--panel) 92%, transparent); backdrop-filter: blur(14px); box-shadow: 0 16px 48px rgba(28,25,23,.08); display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }}
    .th-mode-switch button {{ border: 0; border-radius: 999px; padding: 12px 14px; background: transparent; color: var(--muted); font-weight: 800; cursor: pointer; }}
    html[data-reading-mode="analogy"] button[data-set-mode="analogy"],
    html[data-reading-mode="maths"] button[data-set-mode="maths"] {{ background: var(--ink); color: white; }}
    .th-prose {{ width: min(760px, calc(100vw - 38px)); margin: 0 auto 96px; }}
    .th-prose p, .th-prose li {{ font-family: var(--serif); font-size: 21px; line-height: 1.72; }}
    .th-prose h1 {{ display: none; }}
    .th-section {{ margin: 92px 0 72px; scroll-margin-top: 90px; }}
    .th-section-num {{ display: block; margin-bottom: 10px; color: var(--teal); font-family: var(--mono); font-size: 13px; font-weight: 800; letter-spacing: .12em; }}
    .th-section-title {{ margin: 0 0 24px; font-family: var(--serif); font-size: clamp(36px, 4vw, 56px); line-height: 1.03; letter-spacing: 0; }}
    .th-mode-block {{ border-left: 3px solid var(--teal); margin: 28px 0; padding: 3px 0 3px 20px; }}
    .th-mode-block p {{ margin: 0; color: var(--muted); }}
    .th-mode-maths {{ border-color: var(--amber); }}
    html[data-reading-mode="analogy"] .th-mode-maths {{ display: none; }}
    html[data-reading-mode="maths"] .th-mode-analogy {{ display: none; }}
    .th-details {{ margin: 34px 0; border: 1px solid var(--rule); border-radius: 8px; background: var(--panel); padding: 0; overflow: hidden; }}
    .th-details summary {{ cursor: pointer; padding: 18px 20px; font-weight: 800; color: var(--ink); }}
    .th-details-body {{ padding: 0 20px 20px; }}
    .th-details-body p, .th-details-body li {{ font-size: 18px; }}
    .th-widget {{ position: relative; left: 50%; transform: translateX(-50%); width: min(1180px, calc(100vw - 44px)); margin: 62px 0; border: 1px solid var(--rule); border-radius: 10px; overflow: hidden; background: white; box-shadow: 0 24px 70px rgba(28,25,23,.08); }}
    .th-widget iframe {{ display: block; width: 100%; height: min(760px, 82svh); border: 0; }}
    .th-video {{ position: relative; left: 50%; transform: translateX(-50%); width: min(1080px, calc(100vw - 44px)); margin: 54px 0; }}
    .th-video video, .th-video iframe, .th-video-placeholder {{ width: 100%; aspect-ratio: 16/9; border: 1px solid var(--rule); border-radius: 10px; background: #111827; color: white; display: grid; place-items: center; }}
    .th-video iframe {{ display: block; }}
    .th-video figcaption {{ margin-top: 10px; color: var(--muted); font-size: 14px; line-height: 1.5; }}
    .th-references {{ margin-top: 100px; padding-top: 28px; border-top: 1px solid var(--rule); }}
    .th-references h2 {{ font-family: var(--serif); font-size: 38px; }}
    .th-references p, .th-references li {{ font-family: var(--sans); font-size: 15px; line-height: 1.6; }}
    .th-references a {{ overflow-wrap: anywhere; }}
    code {{ font-family: var(--mono); background: #eee8dd; padding: .12em .35em; border-radius: 4px; }}
    a {{ color: var(--teal); text-decoration-thickness: 1px; text-underline-offset: 3px; overflow-wrap: anywhere; }}
    @media (max-width: 720px) {{
      .th-hero {{ grid-template-columns: 1fr; width: calc(100vw - 32px); padding-top: 42px; }}
      .th-mode-switch {{ margin-top: -24px; }}
      .th-prose p, .th-prose li {{ font-size: 19px; }}
      .th-widget iframe {{ height: 720px; }}
    }}
  </style>
</head>
<body>
  <div class="th-progress" aria-hidden="true"></div>
  <aside class="th-rail" aria-hidden="true">
    <svg viewBox="0 0 74 720" preserveAspectRatio="none">
      <path class="rail-wake" d="M37 18 C18 110 58 190 37 280 C16 370 58 470 37 702" fill="none" stroke="#cfc7ba" stroke-width="2" stroke-dasharray="4 8"/>
      <path class="rail-wake-active" d="M37 18 C18 110 58 190 37 280 C16 370 58 470 37 702" fill="none" stroke="#0f766e" stroke-width="3" stroke-linecap="round"/>
      <g class="rail-foil" transform="translate(37 18) rotate(0)">
        <path d="M-28 0 C-15 -8 16 -8 31 0 C15 7 -14 7 -28 0Z" fill="#fff" stroke="#1c1917" stroke-width="2"/>
        <circle cx="-6" cy="0" r="2.5" fill="#c87916"/>
      </g>
    </svg>
    <span class="th-rail-label">The wing remembers.</span>
  </aside>

  <header class="th-hero">
    <div>
      <p class="th-eyebrow">Aeronauty Lab · unsteady aerodynamics</p>
      <h1>{title}</h1>
      <p class="th-kicker">A scrollytelling explanation of Theodorsen, flutter, reduced frequency, and the first-order way a wing's wake remembers what the wing did a moment ago.</p>
    </div>
    <div class="th-hero-card">
      <strong>For two kinds of reader.</strong>
      <p>Start in Analogy Heavy if this is half-remembered classroom material. Switch to Maths Heavy when you want the derivation, notation, and frequency-domain machinery.</p>
    </div>
  </header>

  <nav class="th-mode-switch" aria-label="Reading mode">
    <button type="button" data-set-mode="analogy">Analogy Heavy</button>
    <button type="button" data-set-mode="maths">Maths Heavy</button>
  </nav>

  <main class="th-prose">
    {prose}
  </main>

  <script>
    (function() {{
      const root = document.documentElement;
      const saved = localStorage.getItem('theodorsen-reading-mode') || 'analogy';
      function setMode(mode) {{
        root.dataset.readingMode = mode;
        localStorage.setItem('theodorsen-reading-mode', mode);
        document.querySelectorAll('.th-details[data-default-mode="maths"]').forEach(el => {{
          if (mode === 'maths') el.setAttribute('open', '');
          else el.removeAttribute('open');
        }});
        document.querySelectorAll('iframe').forEach(frame => {{
          try {{ frame.contentWindow && frame.contentWindow.postMessage({{ type: 'theodorsen-mode', mode }}, '*'); }} catch (_) {{}}
        }});
      }}
      document.querySelectorAll('[data-set-mode]').forEach(btn => btn.addEventListener('click', () => setMode(btn.dataset.setMode)));
      setMode(saved === 'maths' ? 'maths' : 'analogy');

      const progress = document.querySelector('.th-progress');
      const activeWake = document.querySelector('.rail-wake-active');
      const foil = document.querySelector('.rail-foil');
      const railPath = document.querySelector('.rail-wake');
      const pathLen = railPath ? railPath.getTotalLength() : 0;
      if (activeWake && pathLen) {{
        activeWake.style.strokeDasharray = pathLen;
        activeWake.style.strokeDashoffset = pathLen;
      }}
      function update() {{
        const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
        const t = Math.min(1, Math.max(0, scrollY / max));
        if (progress) progress.style.transform = `scaleX(${{t}})`;
        if (activeWake && pathLen) activeWake.style.strokeDashoffset = `${{pathLen * (1 - t)}}`;
        if (foil && railPath && pathLen) {{
          const p = railPath.getPointAtLength(pathLen * t);
          const wobble = Math.sin(t * Math.PI * 18) * 9;
          foil.setAttribute('transform', `translate(${{p.x}} ${{p.y}}) rotate(${{wobble}})`);
        }}
      }}
      addEventListener('scroll', update, {{ passive: true }});
      addEventListener('resize', update);
      update();
    }})();
  </script>
</body>
</html>
"""


def main() -> None:
    OUT.write_text(render(), encoding="utf-8")
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
