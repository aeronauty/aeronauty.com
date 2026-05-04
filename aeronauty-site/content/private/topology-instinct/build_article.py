#!/usr/bin/env python3
"""
Integration build for the topology-instinct Aeronauty article.

Reads:
- /tmp/topology-instinct-build/prose.md             (10-beat prose with figure placeholders)
- /tmp/topology-instinct-build/globe-demo.html      (interactive globe + chart)
- .../public/articles/topology-instinct/figures/adhd-flowchart-animated.html
- .../public/articles/topology-instinct/figures/atomic-row.html
- .../public/articles/topology-instinct/figures/data-as-dag.svg

Writes:
- .../public/articles/topology-instinct/index.html  (single self-contained article)
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

import markdown

# All paths are relative to this script's directory so the build runs the
# same whether invoked from the package root or via an absolute path.
ROOT  = Path(__file__).resolve().parent
BUILD = ROOT  # globe-demo.html + fixture-milp_solutions.json now live alongside

# The canonical articles in this package. Build with:
#     python3 build_article.py --article 1   # writes article-1.html
#     python3 build_article.py --article 2   # writes article-2.html
#     python3 build_article.py --all         # builds both
ARTICLES = {
    1: {
        "md":  ROOT / "article-1-i-dont-like-data-entry.md",
        "out": ROOT / "article-1.html",
    },
    2: {
        "md":  ROOT / "article-2-the-brain-that-was-a-tax.md",
        "out": ROOT / "article-2.html",
    },
}

# Default — overwritten by CLI args if --article / --all are passed.
PROSE_MD     = ARTICLES[1]["md"]
OUT          = ARTICLES[1]["out"]

GLOBE_HTML   = BUILD / "globe-demo.html"
FLOW_HTML    = ROOT / "figures" / "adhd-flowchart-animated.html"
ATOMIC_HTML  = ROOT / "figures" / "atomic-row.html"
PV_HTML      = ROOT / "figures" / "plotly-vs-powerpoint.html"
DBM_HTML     = ROOT / "figures" / "data-black-market.html"
ATP_HTML     = ROOT / "figures" / "ask-the-plot.html"
FV_FIG_HTML  = ROOT / "figures" / "flat-view.html"
VA_FIG_HTML  = ROOT / "figures" / "vera-applet.html"
HOMER_GIF    = ROOT / "figures" / "homer-ice-cream.gif"

# Eyebrow text per beat. "" = no eyebrow (use a section break only).
EYEBROWS = {
    1:  "",                              # cold open — drop the reader straight in
    2:  "Aurora · 2021&ndash;2025",
    3:  "The instinct, earlier",
    4:  "Paradigm",
    5:  "Twenty years of migrations",
    6:  "Flexcompute",
    7:  "Thread",
    8:  "ADHD",
    9:  "Orchestrator",
    10: "",                              # closer — continuous with the prior section
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _read(p: Path) -> str:
    return p.read_text()


def _extract_first(html: str, tag: str) -> str:
    m = re.search(fr"<{tag}[^>]*>(.*?)</{tag}>", html, re.DOTALL | re.IGNORECASE)
    return m.group(1) if m else ""


def _strip_html_body_chrome(css: str) -> str:
    """Drop selectors that style page-level chrome (html, body) — the article controls them."""
    out = []
    i = 0
    while i < len(css):
        brace = css.find("{", i)
        if brace == -1:
            out.append(css[i:])
            break
        selector = css[i:brace]
        depth = 0
        j = brace
        while j < len(css):
            c = css[j]
            if c == "{":
                depth += 1
            elif c == "}":
                depth -= 1
                if depth == 0:
                    j += 1
                    break
            j += 1
        block = css[i:j]
        sel_norm = selector.strip()
        is_page_chrome = re.search(r"(^|,|\s)(html|body)(\s|,|\{|$)", sel_norm) is not None
        if not is_page_chrome:
            out.append(block)
        i = j
    return "".join(out)


def _extract_balanced_block(html: str, open_marker: str, open_tag: str, close_tag: str) -> str:
    start = html.index(open_marker)
    i = start
    depth = 0
    n = len(html)
    while i < n:
        if html.startswith(open_tag, i):
            tail = html[i + len(open_tag): i + len(open_tag) + 1]
            if tail in {" ", ">", "\n", "\t"}:
                depth += 1
                i += len(open_tag)
                continue
        if html.startswith(close_tag, i):
            depth -= 1
            i += len(close_tag)
            if depth == 0:
                return html[start:i]
            continue
        i += 1
    raise RuntimeError(f"Unbalanced {open_marker} block")


# ---------------------------------------------------------------------------
# Source extractions
# ---------------------------------------------------------------------------

def _iife_assets(path: Path, iife_token: str, root_marker: str, open_tag: str = "<div") -> tuple[str, str, str]:
    """Common: extract <style>, the IIFE script body, and a structural <div> block."""
    html = _read(path)
    css = _extract_first(html, "style")
    css = _strip_html_body_chrome(css)
    scripts = re.findall(r"<script(?:\s[^>]*)?>([\s\S]*?)</script>", html)
    iife = next((s for s in reversed(scripts) if iife_token in s), "").strip()
    if not iife:
        raise RuntimeError(f"Could not locate {iife_token} in {path.name}")
    structure = _extract_balanced_block(html, root_marker, open_tag, "</div>")
    return css, iife, structure


def globe_assets() -> tuple[str, str, str]:
    css, iife, structure = _iife_assets(GLOBE_HTML, "TopologyGlobe", '<div class="tg-root">')
    iife = iife.replace(
        'dataPath: "fixture-milp_solutions.json",',
        'dataPath: "data/milp_solutions.json",',
    )
    return css, iife, structure


def flowchart_assets() -> tuple[str, str, str]:
    return _iife_assets(FLOW_HTML, "AdhdFlowchart", '<div class="af-figure"')


def atomic_row_assets() -> tuple[str, str, str]:
    return _iife_assets(ATOMIC_HTML, "AtomicRowFigure", '<div class="ar-figure"')


def flat_view_assets() -> tuple[str, str, str]:
    return _iife_assets(FV_FIG_HTML, "FlatView", '<div class="fv-figure"')


def vera_applet_assets() -> tuple[str, str, str]:
    # Stripped-down rotation rig for beat 6; raw canvas, no three.js.
    # The figure-source naming convention matches the others: VeraApplet IIFE
    # token, .va-figure root.
    return _iife_assets(VA_FIG_HTML, "VeraApplet", '<div class="va-figure"')


def plotly_vs_pp_assets() -> tuple[str, str, str]:
    css, iife, structure = _iife_assets(PV_HTML, "PlotlyVsPP", '<div class="pv-figure"')
    # Standalone preview lives in figures/, so the cartoon image is referenced
    # relative to that directory. When integrated into the article at the
    # package root, the same path needs a "figures/" prefix.
    structure = structure.replace(
        'src="plotly-vs-powerpoint-cartoon.png"',
        'src="figures/plotly-vs-powerpoint-cartoon.png"',
    )
    return css, iife, structure


def ask_the_plot_assets() -> tuple[str, str, str]:
    return _iife_assets(ATP_HTML, "AskThePlot", '<div class="atp-figure"')


def data_black_market_assets() -> tuple[str, str, str]:
    css, iife, structure = _iife_assets(DBM_HTML, "DataBlackMarket", '<div class="dbm-figure"')
    # The standalone preview uses image paths relative to figures/ (so the preview
    # works when served from figures/). When integrated into index.html at the
    # article root, the same paths need a "figures/" prefix.
    structure = structure.replace(
        'src="data-black-market/',
        'src="figures/data-black-market/',
    )

    # Two beats are slated to become Runway-generated videos rather than
    # stills (beat 3 — directory hunt, beat 8 — closing zoom-out). When the
    # corresponding .mp4 files exist on disk, swap the still <img> for an
    # autoplaying muted-loop <video> with the still kept as the poster
    # (so the first frame matches the cartoon style we generated). When
    # the .mp4 isn't there yet, the still <img> stays — so the figure
    # always renders cleanly.
    for stem in ("03-folders", "08-archaeology"):
        mp4_path = ROOT / "figures" / "data-black-market" / f"{stem}.mp4"
        if not mp4_path.exists():
            continue
        # Match the <img ... /> for this stem as written in the figure
        # source (with the figures/ prefix already applied above) and
        # swap it for a <video> that posters the still.
        pattern = (
            r'<img\s+src="figures/data-black-market/' + re.escape(stem) + r'\.png"\s+'
            r'alt="([^"]*)"\s*/>'
        )
        replacement = (
            f'<video src="figures/data-black-market/{stem}.mp4" '
            f'poster="figures/data-black-market/{stem}.png" '
            f'autoplay muted loop playsinline preload="metadata" '
            f'aria-label="\\1"></video>'
        )
        structure = re.sub(pattern, replacement, structure, count=1)

    return css, iife, structure


# ---------------------------------------------------------------------------
# Prose conversion + figure substitution + section restructure
# ---------------------------------------------------------------------------

def render_prose() -> tuple[str, str]:
    """Read and render the prose markdown.

    Returns (rendered_html, page_title). The page_title is extracted from the
    leading H1 in the markdown; if absent, falls back to a sensible default.
    """
    md = _read(PROSE_MD)

    # Drop the trailing back-matter (---\n## IP review flags / decisions / etc.)
    cut = md.find("\n---\n")
    if cut > 0:
        md = md[:cut]

    # Extract the H1 (if any) and use it as the page title.
    h1_match = re.match(r"^# ([^\n]+)\n", md)
    title = h1_match.group(1).strip() if h1_match else (
        "Yelling at ice cream vans, data richness, ADHD, and why overlooked connections matter"
    )

    # Drop the H1 line itself.
    md = re.sub(r"^# [^\n]+\n\s*", "", md, count=1)
    # Drop the editor-orientation paragraph if present (legacy prose-source.md).
    md = re.sub(r"^Draft for Harry[^\n]*\n\s*", "", md, count=1)

    html = markdown.markdown(md, extensions=["extra", "smarty"])

    # Replace each <h2>Beat N: ...</h2> with either an eyebrow tag + section
    # divider, or just a section divider, depending on EYEBROWS.
    def _h2_replacer(match: re.Match[str]) -> str:
        n = int(match.group(1))
        eyebrow = EYEBROWS.get(n, "")
        first = (n == 1)
        # Section break: subtle ✦ for second-and-later sections, nothing for the first.
        divider = "" if first else (
            '<div class="ti-divider" aria-hidden="true">✦</div>\n'
        )
        if eyebrow:
            return (
                f'{divider}<p class="ti-eyebrow">{eyebrow}</p>'
            )
        return divider.rstrip()

    html = re.sub(r"<h2>Beat (\d+):[^<]*</h2>", _h2_replacer, html)
    return html, title


def substitute_demo(html: str, globe_structure: str) -> str:
    block = (
        '<aside class="ti-demo" aria-labelledby="ti-demo-title">\n'
        f"{globe_structure}\n"
        "</aside>"
    )
    return re.sub(
        r"<p>\[INTERACTIVE DEMO:[^\]]*\]</p>",
        block,
        html,
        count=1,
        flags=re.DOTALL,
    )


def substitute_flowchart(html: str, flowchart_structure: str) -> str:
    block = (
        '<aside class="ti-flowchart" aria-label="ADHD flowchart, then and now">\n'
        f"{flowchart_structure}\n"
        "</aside>"
    )
    return re.sub(
        r"<p>\[FIGURE:\s*subverted-adhd-flowchart\]</p>",
        block,
        html,
        count=1,
    )


def substitute_atomic_row(html: str, atomic_structure: str) -> str:
    block = (
        '<aside class="ti-atomic-row" aria-label="Five different kinds of work, all the same atomic-row shape">\n'
        f"{atomic_structure}\n"
        "</aside>"
    )
    return re.sub(
        r"<p>\[FIGURE:\s*atomic-row\]</p>",
        block,
        html,
        count=1,
    )


def substitute_flat_view(html: str, fv_structure: str) -> str:
    block = (
        '<aside class="ti-flat-view" aria-label="The flat view doesn\'t invent provenance — hover any cell to see what it connects to">\n'
        f"{fv_structure}\n"
        "</aside>"
    )
    return re.sub(
        r"<p>\[FIGURE:\s*flat-view\]</p>",
        block,
        html,
        count=1,
    )


def substitute_vera_applet(html: str, va_structure: str) -> str:
    # Beat 6 — the public-web rotation explainer Vera saw, stripped of the
    # aircraft model. We render it inside a normal `.ti-figure-vera` aside;
    # it doesn't need the wide breakout the globe and flat-view get because
    # the content is square-ish and reads fine inside the narrow column.
    block = (
        '<aside class="ti-figure-vera" aria-label="Interactive rotation rig — drag to rotate, sliders for roll/pitch/yaw">\n'
        f"{va_structure}\n"
        "</aside>"
    )
    return re.sub(
        r"<p>\[FIGURE:\s*vera-applet\]</p>",
        block,
        html,
        count=1,
    )


def substitute_plotly_vs_pp(html: str, pv_structure: str) -> str:
    block = (
        '<aside class="ti-plotly-vs-pp" aria-label="Same dataset shown as a PowerPoint slide and as an interactive Plotly chart">\n'
        f"{pv_structure}\n"
        "</aside>"
    )
    return re.sub(
        r"<p>\[FIGURE:\s*plotly-vs-powerpoint\]</p>",
        block,
        html,
        count=1,
    )


def substitute_data_black_market(html: str, dbm_structure: str) -> str:
    block = (
        '<aside class="ti-data-black-market" aria-label="A cert engineer asks one question — watch what happens on most teams">\n'
        f"{dbm_structure}\n"
        "</aside>"
    )
    return re.sub(
        r"<p>\[FIGURE:\s*data-black-market\]</p>",
        block,
        html,
        count=1,
    )


def substitute_ask_the_plot(html: str, atp_structure: str) -> str:
    block = (
        '<aside class="ti-ask-the-plot" aria-label="Plots are projections — Thread keeps the rest attached to the dot">\n'
        f"{atp_structure}\n"
        "</aside>"
    )
    return re.sub(
        r"<p>\[FIGURE:\s*ask-the-plot\]</p>",
        block,
        html,
        count=1,
    )




def substitute_runway_video(
    html: str,
    marker: str,
    mp4_filename: str,
    aria_label: str,
    caption: str,
    *,
    poster_filename: str | None = None,
    classes: str = "ti-figure ti-figure-video",
    fullbleed: bool = False,
) -> str:
    """Replace `[VIDEO: marker]` in the prose with a video figure.

    Three rendering paths:

      - mp4 exists on disk → autoplaying muted-loop <video>, with the
        still poster (if given) as the first frame so the article looks
        right while the video preloads.
      - mp4 missing, poster exists → fall back to a static <img> figure
        in the same slot so the article reads cleanly.
      - neither exists → emit a quiet "video pending" placeholder that
        Harry can see in the dev preview while he produces the clip.

    The marker name doubles as the figcap id stem (ti-video-<marker>-figcap).
    """
    fig_id = f"ti-video-{marker}-figcap"
    fb_class = " ti-figure-fullbleed" if fullbleed else ""
    mp4_path = ROOT / "figures" / mp4_filename
    poster_path = (ROOT / "figures" / poster_filename) if poster_filename else None

    if mp4_path.exists():
        poster_attr = (
            f' poster="figures/{poster_filename}"' if poster_filename else ""
        )
        block = (
            f'<figure class="{classes}{fb_class}" aria-labelledby="{fig_id}">\n'
            f'  <div class="ti-video-wrap">\n'
            f'    <video src="figures/{mp4_filename}" '
            f'autoplay muted loop playsinline preload="metadata"'
            f'{poster_attr} '
            f'aria-label="{aria_label}"></video>\n'
            f'  </div>\n'
            f'  <figcaption id="{fig_id}" class="ti-figcap">{caption}</figcaption>\n'
            f'</figure>'
        )
    elif poster_path and poster_path.exists():
        block = (
            f'<figure class="ti-figure ti-figure-cartoon{fb_class}" aria-labelledby="{fig_id}">\n'
            f'  <img src="figures/{poster_filename}" alt="{aria_label}" loading="lazy" />\n'
            f'  <figcaption id="{fig_id}" class="ti-figcap">{caption}</figcaption>\n'
            f'</figure>'
        )
    else:
        block = (
            f'<figure class="ti-figure ti-figure-video-pending{fb_class}" aria-labelledby="{fig_id}">\n'
            f'  <div class="ti-video-pending-box" role="img" aria-label="{aria_label}">\n'
            f'    <span class="ti-video-pending-label">Video pending &middot; {marker}</span>\n'
            f'  </div>\n'
            f'  <figcaption id="{fig_id}" class="ti-figcap">{caption}</figcaption>\n'
            f'</figure>'
        )

    return re.sub(
        rf"<p>\[VIDEO:\s*{re.escape(marker)}\]</p>",
        block,
        html,
        count=1,
    )


def substitute_excel_solari_video(html: str) -> str:
    block = (
        '<figure class="ti-figure ti-figure-video ti-figure-solari" aria-labelledby="ti-solari-figcap">\n'
        '  <div class="ti-video-wrap">\n'
        '    <video src="figures/excel-solari.mp4" '
        'autoplay muted loop playsinline preload="metadata" '
        'aria-label="Excel spreadsheet recalculating in Solari split-flap style after one cell change"></video>\n'
        '  </div>\n'
        '  <figcaption id="ti-solari-figcap" class="ti-figcap">'
        "Yes. <em>Like that.</em>"
        '</figcaption>\n'
        '</figure>'
    )
    return re.sub(
        r"<p>\[VIDEO:\s*excel-solari\]</p>",
        block,
        html,
        count=1,
    )


def substitute_asides(html: str) -> str:
    """Replace `[asterisk: ...]` markers with a small superscript asterisk
    that reveals the aside text as a tooltip on hover or keyboard focus."""
    counter = [0]
    def repl(m: re.Match) -> str:
        counter[0] += 1
        n = counter[0]
        body = m.group(1).strip()
        return (
            f'<span class="ti-aside">'
            f'<sup class="ti-aside-mark" tabindex="0" role="button" '
            f'aria-label="Aside" aria-describedby="ti-aside-{n}">*</sup>'
            f'<span class="ti-aside-content" id="ti-aside-{n}" role="tooltip">{body}</span>'
            f'</span>'
        )
    return re.sub(r"\[asterisk:\s*([^\[\]]+?)\]", repl, html)


def substitute_cartoon_normal_things(html: str) -> str:
    block = (
        '<figure class="ti-figure ti-figure-cartoon" aria-labelledby="ti-cartoon-normal-figcap">\n'
        '  <img src="figures/cartoon-normal-things.png" '
        'alt="Two friends in casual conversation over coffee, while a phone on the table shows AI work happening separately" '
        'loading="lazy" />\n'
        '  <figcaption id="ti-cartoon-normal-figcap" class="ti-figcap">'
        "Talking to humans about human things while the swarm works on the rest. The cyan accent is on the phone screen for a reason."
        "</figcaption>\n"
        "</figure>"
    )
    return re.sub(
        r"<p>\[FIGURE:\s*cartoon-normal-things\]</p>",
        block,
        html,
        count=1,
    )


def substitute_cartoon_ip_printer(html: str) -> str:
    block = (
        '<figure class="ti-figure ti-figure-cartoon" aria-labelledby="ti-cartoon-printer-figcap">\n'
        '  <img src="figures/cartoon-ip-printer.png" '
        'alt="A young person plugging an Ethernet cable directly into the back of a printer at night, while a print server icon idles on a nearby monitor" '
        'loading="lazy" />\n'
        '  <figcaption id="ti-cartoon-printer-figcap" class="ti-figcap">'
        "If I&rsquo;m able to do it, I assume it&rsquo;s allowed."
        "</figcaption>\n"
        "</figure>"
    )
    return re.sub(
        r"<p>\[FIGURE:\s*cartoon-ip-printer\]</p>",
        block,
        html,
        count=1,
    )


def substitute_cartoon_orchestrator(html: str) -> str:
    block = (
        '<figure class="ti-figure ti-figure-cartoon" aria-labelledby="ti-cartoon-orchestrator-figcap">\n'
        '  <img src="figures/cartoon-orchestrator.png" '
        'alt="A person at a desk routing work to several specialist agent figures around them, holding a notebook rather than a tool" '
        'loading="lazy" />\n'
        '  <figcaption id="ti-cartoon-orchestrator-figcap" class="ti-figcap">'
        "Holding the shape of the problem, routing the bounded sub-problems out, integrating the answers back."
        "</figcaption>\n"
        "</figure>"
    )
    return re.sub(
        r"<p>\[FIGURE:\s*cartoon-orchestrator\]</p>",
        block,
        html,
        count=1,
    )


def substitute_cartoon_storage_migrations(html: str) -> str:
    block = (
        '<figure class="ti-figure ti-figure-cartoon" aria-labelledby="ti-cartoon-storage-figcap">\n'
        '  <img src="figures/cartoon-storage-migrations.png" '
        'alt="A row of four containers on a shelf — pickle jar, hierarchical wooden box, filing cabinet, Postgres elephant — each holding the same dataset graph at increasing fidelity" '
        'loading="lazy" />\n'
        '  <figcaption id="ti-cartoon-storage-figcap" class="ti-figcap">'
        "Twenty years of mildly annoyed migration. Each container holds the same data; the last one holds the relationships too."
        "</figcaption>\n"
        "</figure>"
    )
    return re.sub(
        r"<p>\[FIGURE:\s*cartoon-storage-migrations\]</p>",
        block,
        html,
        count=1,
    )


def substitute_harry_plot_video(html: str) -> str:
    # "Where did that plot come from?" — Harry's video version of the same
    # argument. Embedded with the same youtube-nocookie privacy treatment as
    # the Lisa clip in beat 1.
    block = (
        '<figure class="ti-figure ti-figure-video" aria-labelledby="ti-plot-video-figcap">\n'
        '  <div class="ti-video-wrap">\n'
        '    <iframe\n'
        '      src="https://www.youtube-nocookie.com/embed/vVV-SCJEMYk?rel=0&amp;modestbranding=1"\n'
        '      title="Where did that plot come from? — Harry Smith"\n'
        '      loading="lazy"\n'
        '      frameborder="0"\n'
        '      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"\n'
        '      referrerpolicy="strict-origin-when-cross-origin"\n'
        '      allowfullscreen></iframe>\n'
        '  </div>\n'
        '  <figcaption id="ti-plot-video-figcap" class="ti-figcap">'
        '<em>Where did that plot come from?</em> &mdash; the video version of this argument. Same shape, different medium.'
        '</figcaption>\n'
        '</figure>'
    )
    return re.sub(
        r"<p>\[FIGURE:\s*harry-plot-video\]</p>",
        block,
        html,
        count=1,
    )


def substitute_homer(html: str) -> str:
    # Harry-approved opening clip — the canonical Homer-ice-cream-truck moment.
    # YouTube ID sZoIHU9Ln_E. youtube-nocookie embed for privacy.
    block = (
        '<figure class="ti-figure ti-figure-homer" aria-labelledby="ti-homer-figcap">\n'
        '  <div class="ti-video-wrap">\n'
        '    <iframe\n'
        '      src="https://www.youtube-nocookie.com/embed/sZoIHU9Ln_E?rel=0&amp;modestbranding=1"\n'
        '      title="Homer Simpson &mdash; chasing the ice cream truck"\n'
        '      loading="lazy"\n'
        '      frameborder="0"\n'
        '      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"\n'
        '      referrerpolicy="strict-origin-when-cross-origin"\n'
        '      allowfullscreen></iframe>\n'
        '  </div>\n'
        '  <figcaption id="ti-homer-figcap" class="ti-figcap">'
        'For the record.'
        "</figcaption>\n"
        "</figure>"
    )
    return re.sub(
        r"<p>\[FIGURE:\s*homer-ice-cream\]</p>",
        block,
        html,
        count=1,
    )


def substitute_milp_equations(html: str) -> str:
    # The MILP formulation, rendered as a real display equation via KaTeX.
    # The template uses a single `aligned` environment so the constraints and
    # the objective sit in one connected block with consistent vertical
    # alignment. KaTeX's auto-render pass (loaded in HTML_TEMPLATE) picks up
    # the $$...$$ delimiters and replaces them with rendered math.
    #
    # Notation choices:
    #   - \text{CO}_2^{(ij)}  — keeps the chemistry-style "CO2" upright with
    #     the route index as a parenthesised superscript so it doesn't
    #     collide visually with the "2" subscript.
    #   - \text{maximise} / \text{subject to} — upright, English words.
    #   - \forall (i,j)        — explicit universal quantifier on the route
    #     constraints; standard OR style.
    block = (
        '<figure class="ti-figure ti-figure-milp" aria-labelledby="ti-milp-figcap">\n'
        '  <div class="ti-milp-eq">\n'
        '$$\n'
        '\\begin{aligned}\n'
        '\\text{maximise} \\quad   & \\sum_{ij}\\; R_{ij}\\,\\text{CO}_2^{(ij)} \\\\\n'
        '\\text{subject to} \\quad & R_{ij} \\le A_i, \\quad R_{ij} \\le A_j \\quad \\forall\\,(i,j) \\\\\n'
        '                         & \\sum_{i} A_i \\le K \\\\\n'
        '                         & A_i,\\; R_{ij} \\in \\{0,1\\}\n'
        '\\end{aligned}\n'
        '$$\n'
        '  </div>\n'
        '  <figcaption id="ti-milp-figcap" class="ti-figcap">'
        'The core MILP. Each <em>A<sub>i</sub></em> is a binary upgrade decision per airport; '
        'each <em>R<sub>ij</sub></em> is a binary route eligibility, gated by both endpoints being upgraded; '
        '<em>K</em> is the airport budget; the objective is route-weighted CO<sub>2</sub>.'
        '</figcaption>\n'
        '</figure>'
    )
    # Use a lambda so re.sub doesn't try to interpret backslash escapes
    # in the LaTeX replacement string.
    return re.sub(
        r"<p>\[FIGURE:\s*milp-equations\]</p>",
        lambda _m: block,
        html,
        count=1,
    )


# ---------------------------------------------------------------------------
# Master template
# ---------------------------------------------------------------------------

ARTICLE_CSS = r"""
  /* ---- design tokens (article scope) ---- */
  :root {
    color-scheme: dark light;
    --ti-bg:        #0a0e1a;
    --ti-surface:   #121826;
    --ti-surface-2: #1a2233;
    --ti-border:    #2a3447;
    --ti-fg:        #e6edf6;
    --ti-fg-dim:    #93a0b6;
    --ti-fg-faint:  #5c6a82;
    --ti-accent:    #22d3ee;
    --ti-accent-2:  #a855f7;
    --ti-accent-3:  #f472b6;
    --ti-rule:      #2a3447;
    --ti-link:      #67e8f9;
    --ti-link-hover:#a5f3fc;
    --ti-quote:     #93a0b6;
    --ti-code-bg:   #121826;
    --ti-code-fg:   #c8d3e3;
    --ti-font-sans: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    --ti-font-serif: "Source Serif 4", "Source Serif Pro", Georgia, "Times New Roman", serif;
    --ti-font-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
    --ti-content-w: 700px;
    --ti-wide-w:   1200px;
  }

  @media (prefers-color-scheme: light) {
    :root {
      --ti-bg:        #fafbfd;
      --ti-surface:   #ffffff;
      --ti-surface-2: #f3f5f8;
      --ti-border:    #d8dde6;
      --ti-fg:        #1f2328;
      --ti-fg-dim:    #5c6675;
      --ti-fg-faint:  #8a93a3;
      --ti-accent:    #0e7490;
      --ti-accent-2:  #7e22ce;
      --ti-accent-3:  #be185d;
      --ti-rule:      #d8dde6;
      --ti-link:      #0e7490;
      --ti-link-hover:#155e75;
      --ti-quote:     #5c6675;
      --ti-code-bg:   #f3f5f8;
      --ti-code-fg:   #1f2328;
    }
  }

  /* ---- page chrome ---- */
  *, *::before, *::after { box-sizing: border-box; }
  html { scroll-behavior: smooth; }
  html, body {
    background: var(--ti-bg);
    color: var(--ti-fg);
    font-family: var(--ti-font-sans);
    margin: 0;
    padding: 0;
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  /* Scroll progress bar at the very top of the viewport. */
  .ti-progress {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: 2px;
    background: linear-gradient(90deg,
      var(--ti-accent) 0%,
      var(--ti-accent-2) 50%,
      var(--ti-accent-3) 100%);
    transform-origin: left;
    transform: scaleX(0);
    z-index: 100;
    pointer-events: none;
    transition: transform 60ms linear;
  }

  /* ---- structural ---- */
  .ti-page { padding: 28px 20px 96px; }
  /* On phones, ease the side padding so prose has comfortable room
     (16 px each side at iPhone 13 Pro / 390 px viewport). */
  @media (max-width: 480px) {
    .ti-page { padding: 20px 16px 72px; }
  }
  .ti-narrow { max-width: var(--ti-content-w); margin: 0 auto; }
  /* Cinematic figures break out wider than the prose column on desktop.
     The interactive demos (table, plot, scrolly) want room to breathe;
     the prose around them stays at reading width. */
  .ti-prose .ti-flat-view,
  .ti-prose .ti-ask-the-plot,
  .ti-prose .ti-data-black-market {
    margin-left: calc(50% - 50vw + 8px);
    margin-right: calc(50% - 50vw + 8px);
    max-width: 1240px;
    margin-inline: auto;
  }
  @media (min-width: 1100px) {
    .ti-prose .ti-flat-view,
    .ti-prose .ti-ask-the-plot {
      width: min(1180px, calc(100vw - 64px));
      max-width: none;
      margin-left: 50%;
      transform: translateX(-50%);
    }
  }
  @media (max-width: 720px) {
    .ti-prose .ti-flat-view,
    .ti-prose .ti-ask-the-plot,
    .ti-prose .ti-data-black-market {
      margin-left: 0;
      margin-right: 0;
      width: 100%;
    }
  }
  .ti-wide   { max-width: var(--ti-wide-w);   margin: 0 auto; }

  /* ---- masthead ---- */
  .ti-mast {
    border-bottom: 1px solid var(--ti-rule);
    padding-bottom: 12px;
    margin-bottom: 56px;
    font-size: 13px;
    color: var(--ti-fg-dim);
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 12px;
    flex-wrap: wrap;
  }
  .ti-mast a { color: inherit; text-decoration: none; }
  .ti-mast a:hover { color: var(--ti-fg); }
  .ti-mast-brand { font-weight: 600; letter-spacing: -0.01em; }
  .ti-mast-meta { font-variant-numeric: tabular-nums; }

  /* ---- hero ---- */
  .ti-hero {
    margin: 24px 0 80px;
  }
  .ti-hero-eyebrow {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    color: var(--ti-fg-faint);
    margin: 0 0 16px;
    font-weight: 600;
  }
  .ti-hero h1 {
    font-size: clamp(32px, 5vw, 56px);
    font-weight: 800;
    letter-spacing: -0.02em;
    line-height: 1.08;
    margin: 0 0 22px;
    background: linear-gradient(135deg,
      var(--ti-fg) 0%,
      var(--ti-accent-2) 55%,
      var(--ti-accent) 100%);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    color: transparent;
    /* fallback for browsers without -webkit-text-fill-color */
  }
  @supports not ((-webkit-background-clip: text) or (background-clip: text)) {
    .ti-hero h1 { color: var(--ti-fg); background: none; -webkit-text-fill-color: var(--ti-fg); }
  }
  .ti-hero-deck {
    font-size: 19px;
    color: var(--ti-fg-dim);
    margin: 0;
    max-width: 56ch;
    line-height: 1.55;
  }

  /* ---- prose typography ---- */
  .ti-prose {
    font-size: 17px;
    line-height: 1.7;
  }
  /* Prose stays >= 16 px on phones; cap it so it doesn't shrink. */
  @media (max-width: 480px) {
    .ti-prose { font-size: 16.5px; line-height: 1.65; }
    .ti-prose blockquote { font-size: 17px; padding-left: 16px; }
    .ti-hero { margin: 16px 0 56px; }
    .ti-hero-deck { font-size: 17px; }
  }
  /* Drop cap on the first paragraph after the hero (cold open). */
  .ti-prose > p:first-of-type::first-letter,
  .ti-prose > .ti-divider + p:first-of-type::first-letter {
    /* dropcap only on the very first paragraph; subsequent sections handled below */
  }
  .ti-prose > p:first-of-type::first-letter {
    font-family: var(--ti-font-serif);
    font-size: 4em;
    line-height: 0.85;
    float: left;
    padding: 6px 10px 0 0;
    color: var(--ti-accent);
    font-weight: 700;
  }

  .ti-prose h3 {
    font-size: 17px;
    font-weight: 600;
    margin: 32px 0 8px;
    color: var(--ti-fg);
    letter-spacing: -0.005em;
  }
  .ti-prose p {
    margin: 0 0 1.15em;
  }
  .ti-prose p strong {
    font-weight: 600;
    color: var(--ti-fg);
  }
  .ti-prose em { color: var(--ti-fg); }
  .ti-prose blockquote {
    margin: 28px 0;
    padding: 6px 0 6px 22px;
    border-left: 3px solid var(--ti-accent);
    color: var(--ti-quote);
    font-style: italic;
    font-size: 18px;
    line-height: 1.55;
  }
  .ti-prose a {
    color: var(--ti-link);
    text-decoration: underline;
    text-decoration-color: color-mix(in srgb, var(--ti-link) 40%, transparent);
    text-underline-offset: 3px;
  }
  .ti-prose a:hover { color: var(--ti-link-hover); text-decoration-color: currentColor; }

  /* fenced code (used for the MILP formulation) */
  .ti-prose pre {
    background: var(--ti-code-bg);
    color: var(--ti-code-fg);
    border: 1px solid var(--ti-border);
    border-radius: 8px;
    padding: 14px 16px;
    font-family: var(--ti-font-mono);
    font-size: 14px;
    line-height: 1.5;
    overflow-x: auto;
    margin: 22px 0;
  }
  .ti-prose code {
    background: var(--ti-code-bg);
    color: var(--ti-code-fg);
    border: 1px solid var(--ti-border);
    padding: 1px 5px;
    border-radius: 4px;
    font-family: var(--ti-font-mono);
    font-size: 0.92em;
  }
  .ti-prose pre code { background: transparent; border: 0; padding: 0; font-size: inherit; }

  /* ---- asides as hover/focus-revealed tooltips ----
     Source markup: [asterisk: aside text here]
     Renders as a small accent-coloured asterisk; hover or keyboard focus
     reveals the aside text as a popover tooltip. */
  .ti-aside {
    position: relative;
    display: inline;
    white-space: normal;
  }
  .ti-aside-mark {
    cursor: help;
    color: var(--ti-accent);
    font-weight: 700;
    padding: 0 1px;
    border-radius: 3px;
    line-height: 0;
    font-size: 0.85em;
    margin-left: 1px;
    user-select: none;
  }
  .ti-aside-mark:hover,
  .ti-aside-mark:focus-visible {
    background: color-mix(in srgb, var(--ti-accent) 18%, transparent);
    outline: none;
  }
  .ti-aside-content {
    position: absolute;
    bottom: calc(100% + 8px);
    left: 50%;
    transform: translateX(-50%);
    width: max-content;
    max-width: min(380px, 90vw);
    padding: 10px 13px;
    background: var(--ti-surface);
    color: var(--ti-fg);
    border: 1px solid var(--ti-border);
    border-radius: 6px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.30);
    font-size: 13.5px;
    font-style: normal;
    line-height: 1.55;
    text-align: left;
    z-index: 60;
    opacity: 0;
    pointer-events: none;
    transition: opacity 140ms ease;
  }
  .ti-aside:hover .ti-aside-content,
  .ti-aside:focus-within .ti-aside-content {
    opacity: 1;
    pointer-events: auto;
  }
  .ti-aside-content::after {
    content: "";
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    width: 0;
    height: 0;
    border: 6px solid transparent;
    border-top-color: var(--ti-border);
  }
  .ti-aside-content::before {
    content: "";
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%) translateY(-1px);
    width: 0;
    height: 0;
    border: 5px solid transparent;
    border-top-color: var(--ti-surface);
    z-index: 1;
  }
  /* If the asterisk sits near the right edge, anchor the tooltip from the
     right rather than centred. CSS-only — uses a class the JS can toggle if
     needed; for now, default centred positioning is fine for narrow column. */

  /* ---- eyebrow tags between sections ---- */
  .ti-eyebrow {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    color: var(--ti-accent);
    font-weight: 600;
    margin: 64px 0 12px;
    padding-bottom: 6px;
    border-bottom: 1px solid var(--ti-rule);
  }

  /* ---- section divider ---- */
  .ti-divider {
    color: var(--ti-fg-faint);
    text-align: center;
    font-size: 14px;
    margin: 72px 0 12px;
    user-select: none;
    letter-spacing: 1.2em;
    line-height: 1;
    opacity: 0.65;
  }
  /* Hide the divider when an eyebrow follows it (avoid double break). */
  .ti-divider + .ti-eyebrow { margin-top: 0; }
  .ti-divider:has(+ .ti-eyebrow) { display: none; }

  /* ---- figures ---- */
  .ti-figure {
    margin: 36px 0;
    padding: 18px;
    background: var(--ti-surface);
    border: 1px solid var(--ti-border);
    border-radius: 12px;
  }
  @media (max-width: 480px) {
    .ti-figure { padding: 12px; margin: 28px 0; }
  }
  .ti-figure svg { width: 100%; height: auto; display: block; }
  .ti-figure img { display: block; max-width: 100%; height: auto; margin: 0 auto; border-radius: 8px; }
  .ti-figcap {
    margin-top: 12px;
    font-size: 14px;
    color: var(--ti-fg-dim);
    line-height: 1.5;
    text-align: center;
  }

  .ti-figure-dag svg { max-height: 360px; }

  .ti-figure-homer {
    max-width: 560px;
    margin: 28px auto 36px;
  }
  .ti-video-wrap {
    position: relative;
    width: 100%;
    aspect-ratio: 16 / 9;
    background: #000;
    border-radius: 8px;
    overflow: hidden;
    max-width: 100%;
  }
  .ti-video-wrap iframe,
  .ti-video-wrap video {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    border: 0;
    object-fit: contain;     /* show the whole frame; no Runway-output cropping */
    background: #000;
  }

  /* ---- atomic-row figure (Thread visual) ---- */
  .ti-atomic-row {
    margin: 36px 0;
  }
  .ti-atomic-row .ar-figure { max-width: none; }

  /* ---- demo (globe) — break out of the narrow column ---- */
  .ti-demo {
    margin: 56px 0 56px;
  }
  @media (min-width: 1000px) {
    .ti-demo {
      width: min(100vw - 32px, var(--ti-wide-w));
      margin-left: calc(50% - min(50vw - 16px, var(--ti-wide-w) / 2));
      margin-right: calc(50% - min(50vw - 16px, var(--ti-wide-w) / 2));
    }
  }
  .ti-demo .tg-root { padding: 0; }

  /* ---- flat-view + adhd-flowchart asides — also break out wide so the
     scrolly grid has enough room for the table + DAG panel ---- */
  .ti-flat-view, .ti-flowchart {
    margin: 56px 0;
  }
  @media (min-width: 1000px) {
    .ti-flat-view, .ti-flowchart {
      width: min(100vw - 32px, var(--ti-wide-w));
      margin-left: calc(50% - min(50vw - 16px, var(--ti-wide-w) / 2));
      margin-right: calc(50% - min(50vw - 16px, var(--ti-wide-w) / 2));
    }
  }
  /* The flat-view's outer frame doesn't need its own wide bezel since
     it's already inside the wide breakout. Trim the frame padding to
     give the table more horizontal room. */
  .ti-flat-view .fv-frame { padding: 14px 14px 12px; }
  .ti-flowchart  .af-figure, .ti-flowchart .af-frame { padding: 0; }

  /* ---- vera applet (beat 6) — sits inside the narrow column ---- */
  .ti-figure-vera {
    margin: 36px 0;
    display: block;
  }
  .ti-figure-vera .va-figure { max-width: none; }

  /* ---- normal-things cartoon (beat 9) ---- */
  .ti-figure-cartoon {
    max-width: 720px;
    margin: 28px auto 36px;
  }
  .ti-figure-cartoon img {
    border-radius: 8px;
    box-shadow: 0 6px 20px rgba(0,0,0,0.18);
  }
  @media (prefers-color-scheme: light) {
    .ti-figure-cartoon img {
      box-shadow: 0 6px 20px rgba(0,0,0,0.10);
    }
  }

  /* ---- closing video (Where did that plot come from?) ---- */
  .ti-figure-video {
    max-width: 720px;
    margin: 32px auto 28px;
  }

  /* ---- MILP equations (beat 4) — KaTeX-rendered display math ---- */
  .ti-figure-milp {
    max-width: 640px;
    margin: 32px auto;
    padding: 22px 18px 18px;
    text-align: center;
  }
  .ti-milp-eq {
    /* KaTeX itself handles the math typography; we just give it room and
       let it scroll horizontally on narrow viewports rather than overflow. */
    overflow-x: auto;
    overflow-y: hidden;
    padding: 6px 4px;
    -webkit-overflow-scrolling: touch;
    /* KaTeX's display equations carry their own top/bottom margins, so we
       don't add extra here. */
  }
  .ti-milp-eq .katex-display {
    margin: 0.4em 0;
  }
  .ti-milp-eq .katex-display > .katex {
    /* Prevent KaTeX from forcing the math to centre and clip on narrow
       viewports — keep it left-aligned so users can scroll right to see
       the rest. */
    text-align: left;
    white-space: nowrap;
  }
  @media (max-width: 480px) {
    .ti-figure-milp { padding: 14px 10px 12px; }
    .ti-milp-eq { padding: 6px 2px; }
    .ti-milp-eq .katex-display { font-size: 0.95em; }
  }
  .ti-figure-milp .ti-figcap {
    text-align: center;
    max-width: 56ch;
    margin-left: auto;
    margin-right: auto;
  }

  /* ---- flowchart figure ---- */
  .ti-flowchart {
    margin: 36px 0;
    padding: 24px 20px 36px;
    background: var(--ti-surface);
    border: 1px solid var(--ti-border);
    border-radius: 12px;
  }

  /* ---- footer ---- */
  .ti-foot {
    margin-top: 96px;
    padding-top: 22px;
    border-top: 1px solid var(--ti-rule);
    font-size: 13px;
    color: var(--ti-fg-dim);
    line-height: 1.6;
  }
  .ti-foot a { color: inherit; }

  /* ---- print stylesheet ---- */
  @media print {
    :root {
      --ti-bg: #ffffff;
      --ti-fg: #000000;
      --ti-fg-dim: #333333;
      --ti-border: #cccccc;
      --ti-rule: #cccccc;
      --ti-surface: #ffffff;
    }
    .ti-progress { display: none; }
    .ti-demo, .ti-flowchart, .ti-atomic-row { break-inside: avoid; }
    .ti-mast a { color: #000; }
    .ti-prose pre, .ti-prose code { border-color: #cccccc; }
    .ti-hero h1 { background: none; -webkit-text-fill-color: #000; color: #000; }
  }

  /* ---- accessibility ---- */
  :focus-visible {
    outline: 2px solid var(--ti-accent);
    outline-offset: 2px;
  }
  .ti-skip-link {
    position: absolute;
    top: -40px;
    left: 0;
    background: var(--ti-accent);
    color: var(--ti-bg);
    padding: 6px 10px;
    z-index: 100;
    border-radius: 0 0 4px 0;
  }
  .ti-skip-link:focus { top: 0; }
"""


PROGRESS_JS = r"""
(function () {
  // Scroll-progress bar — width tracks how far through the article you are.
  const bar = document.querySelector('.ti-progress');
  if (!bar) return;
  function update() {
    const h = document.documentElement;
    const max = (h.scrollHeight - h.clientHeight) || 1;
    const r = Math.max(0, Math.min(1, h.scrollTop / max));
    bar.style.transform = 'scaleX(' + r + ')';
  }
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
  update();
})();
"""


HTML_TEMPLATE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>{title} &mdash; Aeronauty</title>
<meta name="description" content="An interactive scrollytelling article on network topology as a career through-line, MILP-optimised airport upgrade sequencing, ADHD, and the orchestrator-and-swarm AI configuration that makes the brain that was a tax an asset." />
<meta name="author" content="Harry Smith" />

<!-- Inter font (system fallback if offline) -->
<link rel="preconnect" href="https://rsms.me/" />
<link rel="stylesheet" href="https://rsms.me/inter/inter.css" />

<!-- Visualisation libraries (CDN) -->
<script src="https://unpkg.com/d3@7"></script>
<script src="https://unpkg.com/globe.gl"></script>
<script src="https://unpkg.com/roughjs@4.6.6/bundled/rough.js"></script>
<script src="https://cdn.plot.ly/plotly-basic-2.35.2.min.js" charset="utf-8"></script>

<!-- KaTeX (math typesetting for the MILP block in beat 4) -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css" crossorigin="anonymous" />
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js" crossorigin="anonymous"></script>
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js" crossorigin="anonymous"
  onload="renderMathInElement(document.body, {{delimiters: [{{left: '$$', right: '$$', display: true}}, {{left: '$', right: '$', display: false}}], throwOnError: false}});"></script>

<style>{article_css}</style>
<style>{globe_css}</style>
<style>{flowchart_css}</style>
<style>{atomic_css}</style>
<style>{pv_css}</style>
<style>{dbm_css}</style>
<style>{fv_css}</style>
<style>{va_css}</style>
<style>{atp_css}</style>
</head>
<body>
<a href="#ti-main" class="ti-skip-link">Skip to article</a>
<div class="ti-progress" aria-hidden="true"></div>

<div class="ti-page">

  <header class="ti-mast ti-narrow" role="banner">
    <span class="ti-mast-brand"><a href="/">Aeronauty</a> &middot; <a href="/">Harry Smith</a></span>
    <span class="ti-mast-meta"><time datetime="2026-05">May 2026</time> &middot; ~25 min read</span>
  </header>

  <section class="ti-hero ti-narrow" aria-labelledby="ti-title">
    <p class="ti-hero-eyebrow">Aeronauty &middot; Harry Smith</p>
    <h1 id="ti-title">{title}</h1>
  </section>

  <main id="ti-main" class="ti-prose ti-narrow" role="main">
    {prose}
  </main>

  <footer class="ti-foot ti-narrow" role="contentinfo">
    <p>Posted on <a href="https://aeronauty.com">aeronauty.com</a>, Harry Smith&rsquo;s personal aerospace blog. The interactive globe is built on Globe.gl; the MILP solutions are precomputed from OpenFlights data using a great-circle-distance &times; frequency CO<sub>2</sub> proxy. Methodology and caveats live in <a href="data/README.md">data/README.md</a>.</p>
  </footer>

</div>

<script>{progress_js}</script>
<script>{globe_js}</script>
<script>{flowchart_js}</script>
<script>{atomic_js}</script>
<script>{pv_js}</script>
<script>{dbm_js}</script>
<script>{fv_js}</script>
<script>{va_js}</script>
<script>{atp_js}</script>

</body>
</html>
"""


def main() -> None:
    print("Reading prose...")
    prose_html, page_title = render_prose()

    print("Extracting globe demo assets...")
    globe_css, globe_js, globe_struct = globe_assets()

    print("Extracting flowchart assets...")
    flow_css, flow_js, flow_struct = flowchart_assets()

    print("Extracting atomic-row assets...")
    atomic_css, atomic_js, atomic_struct = atomic_row_assets()

    print("Extracting flat-view assets...")
    fv_css, fv_js, fv_struct = flat_view_assets()

    print("Extracting vera-applet assets...")
    va_css, va_js, va_struct = vera_applet_assets()

    print("Extracting plotly-vs-powerpoint assets...")
    pv_css, pv_js, pv_struct = plotly_vs_pp_assets()

    print("Extracting data-black-market assets...")
    dbm_css, dbm_js, dbm_struct = data_black_market_assets()

    print("Extracting ask-the-plot assets...")
    atp_css, atp_js, atp_struct = ask_the_plot_assets()

    print("Substituting placeholders...")
    prose_html = substitute_asides(prose_html)
    prose_html = substitute_excel_solari_video(prose_html)
    prose_html = substitute_homer(prose_html)
    prose_html = substitute_plotly_vs_pp(prose_html, pv_struct)
    prose_html = substitute_demo(prose_html, globe_struct)
    prose_html = substitute_flowchart(prose_html, flow_struct)
    prose_html = substitute_atomic_row(prose_html, atomic_struct)
    prose_html = substitute_data_black_market(prose_html, dbm_struct)
    prose_html = substitute_flat_view(prose_html, fv_struct)
    prose_html = substitute_ask_the_plot(prose_html, atp_struct)
    prose_html = substitute_vera_applet(prose_html, va_struct)
    prose_html = substitute_cartoon_normal_things(prose_html)
    prose_html = substitute_cartoon_ip_printer(prose_html)
    prose_html = substitute_cartoon_orchestrator(prose_html)
    prose_html = substitute_cartoon_storage_migrations(prose_html)
    prose_html = substitute_harry_plot_video(prose_html)
    prose_html = substitute_milp_equations(prose_html)

    # Runway-generated supplemental videos. Each call no-ops if the
    # placeholder isn't in the prose for the article currently being
    # built; that lets a single chain handle both article-1 and article-2
    # without duplicating the wiring.
    prose_html = substitute_runway_video(
        prose_html,
        marker="paradigm-globe-pan",
        mp4_filename="paradigm-globe-pan.mp4",
        aria_label="Slow cinematic pan over Earth from low orbit, with great-circle arcs drawing in across continents",
        caption="The network the fleet flies on, before the demo lets you play with it.",
    )
    prose_html = substitute_runway_video(
        prose_html,
        marker="plotly-vs-powerpoint-morph",
        mp4_filename="plotly-vs-powerpoint-morph.mp4",
        aria_label="An old-timey photographer with a magnesium flash captures a complex evolving 3D wireframe of meshes, wind-tunnel readings, post-process versions and design revisions; the printed photo lands on a table while the lattice keeps changing behind it",
        caption="A PNG is a snapshot. The data was already moving by the time the flash went off.",
    )
    prose_html = substitute_runway_video(
        prose_html,
        marker="connections-by-hand",
        mp4_filename="connections-by-hand.mp4",
        aria_label="Time-lapse of a hand drawing a flat table on paper, then drawing arcing connecting lines between cells",
        caption="The connections were always meant to be first-class. Engineering data just got there last.",
    )
    prose_html = substitute_runway_video(
        prose_html,
        marker="orchestrator-day",
        mp4_filename="orchestrator-day.mp4",
        aria_label="Time-lapse of a desk from dawn to evening, with cartoon agent-shapes coming and going around a single calm figure who stays focused",
        caption="The brain that was a tax is now an asset.",
    )
    prose_html = substitute_runway_video(
        prose_html,
        marker="post-it-onslaught",
        mp4_filename="post-it-onslaught.mp4",
        aria_label="Top-down stop-motion of a wooden desk being buried under an absurd flurry of yellow Post-it notes, with one cyan-teal note highlighted at the end",
        caption="Twenty years of being the join, one Post-it at a time.",
    )
    prose_html = substitute_runway_video(
        prose_html,
        marker="folder-tabs-cascade",
        mp4_filename="folder-tabs-cascade.mp4",
        aria_label="Slow dolly along a drawer of crammed, illegibly-labelled folder tabs, accelerating into a blur and resolving on a single cyan-teal tab",
        caption="The data black market, viewed from inside the cabinet.",
    )
    prose_html = substitute_runway_video(
        prose_html,
        marker="notebook-flip",
        mp4_filename="notebook-flip.mp4",
        aria_label="Top-down view of a hand flipping through a hardcover engineering notebook, pausing on a page with a small cyan-teal circled note before resuming",
        caption="A good supervisor pauses on the right page.",
    )
    prose_html = substitute_runway_video(
        prose_html,
        marker="coffee-rings",
        mp4_filename="coffee-rings.mp4",
        aria_label="Top-down view of a coffee mug being set down repeatedly on a wooden table, leaving overlapping coffee rings, the last one tinted cyan-teal",
        caption="Normal things, observed at the right pace.",
    )

    print("Rendering article...")
    out = HTML_TEMPLATE.format(
        title=page_title,
        article_css=ARTICLE_CSS,
        globe_css=globe_css,
        flowchart_css=flow_css,
        atomic_css=atomic_css,
        pv_css=pv_css,
        dbm_css=dbm_css,
        fv_css=fv_css,
        va_css=va_css,
        atp_css=atp_css,
        prose=prose_html,
        progress_js=PROGRESS_JS,
        globe_js=globe_js,
        flowchart_js=flow_js,
        atomic_js=atomic_js,
        pv_js=pv_js,
        dbm_js=dbm_js,
        fv_js=fv_js,
        va_js=va_js,
        atp_js=atp_js,
    )

    OUT.write_text(out)
    size_kb = len(out) / 1024

    # Sanity output
    print(f"\nWrote {OUT}  ({size_kb:.1f} KB)")
    print(f"  prose paragraphs:    {prose_html.count('<p>')}")
    print(f"  eyebrows present:    {prose_html.count('ti-eyebrow')}")
    print(f"  section dividers:    {prose_html.count('ti-divider')}")
    print(f"  globe IIFE present:  {'TopologyGlobe' in out}")
    print(f"  flowchart IIFE:      {'AdhdFlowchart' in out}")
    print(f"  atomic-row IIFE:     {'AtomicRowFigure' in out}")
    leftover = re.findall(r"\[FIGURE:[^\]]+\]|\[INTERACTIVE DEMO:[^\]]+\]|<h2>Beat \d+:", out)
    if leftover:
        print(f"  WARNING leftover placeholders: {leftover[:5]}")
    else:
        print("  all placeholders substituted ✓")


def _build_one(article_id: int) -> None:
    global PROSE_MD, OUT
    spec = ARTICLES[article_id]
    PROSE_MD = spec["md"]
    OUT      = spec["out"]
    print(f"\n=== Building article {article_id} → {OUT.name} ===")
    main()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Build the topology-instinct articles")
    parser.add_argument("--article", type=int, choices=list(ARTICLES.keys()),
                        help="Build a specific article by id (1 or 2). Default: 1.")
    parser.add_argument("--all", action="store_true",
                        help="Build all articles.")
    args = parser.parse_args()
    if args.all:
        for aid in sorted(ARTICLES):
            _build_one(aid)
    elif args.article is not None:
        _build_one(args.article)
    else:
        # Backwards compatibility: no flag → build article 1, same as before.
        _build_one(1)
