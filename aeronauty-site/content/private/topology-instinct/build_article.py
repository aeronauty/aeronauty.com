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
WC_HTML      = ROOT / "figures" / "what-changed.html"
TY_HTML      = ROOT / "figures" / "twenty-years.html"
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
# Article-map sidebar configuration
# ---------------------------------------------------------------------------
# Each article has a list of section nodes (in scroll order, top-to-bottom)
# and a list of *thematic* edges (non-sequential connections that argue the
# same point). Sequential edges are drawn implicitly down the spine.
#
# Node fields:
#   id      — slug used as the in-DOM anchor target (also the SVG node id)
#   title   — short label for the hover tooltip (~ 5 words)
#   summary — one-sentence summary for the hover tooltip
#   numeral — the small numeral printed in the section-opener moment
#   stand   — italic stand-first line printed under the heading at section open
#
# Edges are ordered pairs of node ids. The renderer routes them as curves
# off the right side of the spine.

ARTICLE_MAPS: dict[int, dict] = {
    1: {
        "nodes": [
            {"id": "intro",      "title": "Ice cream van",
             "summary": "Cold open: the personal trigger for noticing the through-line.",
             "numeral": "00", "stand": "A doctor, a phone call, an ice cream van, and a diagnosis that re-read twenty years."},
            {"id": "plot-form",  "title": "The instinct in plot form",
             "summary": "Refusing PowerPoint: a flat projection loses what makes data rich.",
             "numeral": "01", "stand": "Why I sent the dashboard, not the deck."},
            {"id": "paradigm",   "title": "Paradigm",
             "summary": "Coupling the fleet and the network it flies on, jointly, as one MILP.",
             "numeral": "02", "stand": "Two coupled systems, one model — and a prize that didn’t move the system."},
            {"id": "join",       "title": "Twenty years of migrations",
             "summary": "Pickles → HDF5 → SQL → Postgres: refusing to be the human join operation.",
             "numeral": "03", "stand": "Trying, mildly annoyed, to put graph-shaped data somewhere a bit less wrong."},
            {"id": "vera",       "title": "Vera",
             "summary": "Two organisations with different filters, looking at the same instinct.",
             "numeral": "04", "stand": "One filter graded the work; the other graded the thinking."},
            {"id": "thread",     "title": "Thread",
             "summary": "Thread: store the topology, project the flat view, keep the connections live.",
             "numeral": "05", "stand": "The view is a projection. The connections are the truth."},
            {"id": "thread-close","title": "The thread",
             "summary": "Closer: it’s one thing, really. I don’t like data entry.",
             "numeral": "06", "stand": "One thing, twenty years, one sentence."},
        ],
        # Curated thematic edges — read the article and decide which sections
        # argue the same point. Sequential edges (i → i+1) are drawn implicitly
        # down the spine, so we only declare the cross-cutting ones here.
        "edges": [
            ("plot-form",  "thread"),       # projection-vs-truth: PNG snapshot ↔ Thread flat-view
            ("plot-form",  "thread-close"), # the original "drop the structure" complaint, restated
            ("paradigm",   "join"),         # two coupled systems, a human as the join
            ("paradigm",   "thread"),       # coupling-as-model: the same move scaled
            ("join",       "thread"),       # storage caught up to instinct
            ("vera",       "thread"),       # two filters; one of them named Thread
            ("vera",       "paradigm"),     # external valuation of the same work
            ("intro",      "thread-close"), # personal bookend
            ("intro",      "join"),         # avoiding boring work = avoiding being the join
        ],
    },
    2: {
        "nodes": [
            {"id": "intro",      "title": "Up front",
             "summary": "Cold open: this is about the person who kept noticing.",
             "numeral": "00", "stand": "ADHD, medication, agents — and what changes when they arrive together."},
            {"id": "meds",       "title": "What the meds changed",
             "summary": "The unfinished loop became visible; the through-line became legible.",
             "numeral": "01", "stand": "The brain doesn’t get fixed. It gets supplemented."},
            {"id": "configuration","title": "The configuration",
             "summary": "One generalist orchestrator routing a swarm of fast cheap specialists.",
             "numeral": "02", "stand": "Hold the shape; route the bounded sub-problems out; integrate the answers back."},
            {"id": "problem-class","title": "The problem class",
             "summary": "Aeroelasticity clicked because coupled problems reward the refusal to decouple.",
             "numeral": "03", "stand": "The question isn’t tax or superpower; it’s whether the work fits the architecture."},
            {"id": "why-now",    "title": "Why this didn’t exist before",
             "summary": "Meds + agents arrived at roughly the same time — the pair is what works.",
             "numeral": "04", "stand": "Neither alone would have done it."},
            {"id": "swarm-cant", "title": "The thing the swarm can’t do",
             "summary": "Cross-domain taste: noticing two communities are arguing the same shape.",
             "numeral": "05", "stand": "The bridges live in the heads of generalists."},
            {"id": "how-made",   "title": "How this article got made",
             "summary": "Form follows content: the configuration produced the article you’re reading.",
             "numeral": "06", "stand": "The shape decision was the human bit. The grind around it wasn’t."},
            {"id": "thread-close","title": "The thread",
             "summary": "Closer: the brain that was a tax is now an asset.",
             "numeral": "07", "stand": "Maybe AI compresses the role later. In 2026, it is real."},
        ],
        "edges": [
            ("meds",          "why-now"),     # meds-as-half-the-pair
            ("meds",          "thread-close"),# brain-tax-asset bookend
            ("configuration", "problem-class"),# taste as fit-for-coupled-problems
            ("configuration", "swarm-cant"),  # orchestrator role + bridge
            ("configuration", "how-made"),    # the article *is* the configuration
            ("configuration", "why-now"),     # configuration ↔ why-it-couldn't-exist
            ("problem-class", "swarm-cant"),  # coupled taste ↔ cross-domain bridges
            ("problem-class", "thread-close"),# asset/tax depends on problem class
            ("swarm-cant",    "thread-close"),# what remains for the human
            ("intro",         "swarm-cant"),  # cross-domain generalist thesis
            ("why-now",       "how-made"),    # demonstrated, not asserted
        ],
    },
}


def _slugify_heading(text: str) -> str:
    """Lower-case, hyphen-separated slug used for h2 anchors.

    Smarty's typographic substitutions (curly quotes, em-dashes) arrive
    here as named HTML entities; strip both tags and entities before
    flattening to ascii so the slugs match the H2_TO_NODE_ID keys.
    """
    s = text or ""
    s = re.sub(r"<[^>]+>", "", s)
    s = re.sub(r"&[a-zA-Z]+;|&#[0-9]+;|&#x[0-9a-fA-F]+;", "", s)
    s = s.strip().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s


# Hand-curated map from rendered h2 text → article-map node id.
# Keep it as plain ASCII so the typographer (smarty) doesn't break the keys.
H2_TO_NODE_ID: dict[int, dict[str, str]] = {
    1: {
        "the-instinct-in-plot-form":              "plot-form",
        "paradigm":                                "paradigm",
        "twenty-years-of-trying-not-to-be-the-human-join-operation": "join",
        "vera":                                    "vera",
        "thread":                                  "thread",
        "the-thread":                              "thread-close",
    },
    2: {
        "what-the-meds-actually-changed":            "meds",
        "the-configuration":                         "configuration",
        "the-problem-class":                          "problem-class",
        "why-this-configuration-didnt-exist-before": "why-now",
        "the-thing-the-swarm-cant-do":               "swarm-cant",
        "how-this-article-got-made":                 "how-made",
        "the-thread":                                "thread-close",
    },
}

# The article id of the build currently in progress — module-level so helpers
# can pick the right map without threading the value through every call.
CURRENT_ARTICLE_ID: int = 1


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _read(p: Path) -> str:
    return p.read_text()


def _expand_epiquotes(md: str) -> str:
    """Replace `[EPIQUOTE] ... [/EPIQUOTE]` blocks in raw markdown with
    rendered <aside class="ti-epiquote"> HTML *before* the markdown
    library runs.

    Inside a block, the last line that begins with an em-dash (—) or
    a double hyphen (--) is treated as the attribution; everything
    else is the quote body. Lines are joined with a single space.

    Example:
        [EPIQUOTE]
        Stop optimising the fleet in isolation. Optimise the network
        the fleet flies on, and the fleet that network can support,
        jointly.
        — The Paradigm reframe
        [/EPIQUOTE]

    The aside is emitted as a literal HTML block (markdown leaves
    raw block-level HTML alone with `extensions=["extra"]`).
    """
    def repl(m: re.Match) -> str:
        inner = m.group(1).strip()
        lines = [l.strip() for l in inner.splitlines() if l.strip()]
        attr = ""
        body_lines: list[str] = []
        for line in lines:
            if line.startswith("— "):
                attr = line[2:].strip()
            elif line.startswith("-- "):
                attr = line[3:].strip()
            else:
                body_lines.append(line)
        body = " ".join(body_lines)
        attr_html = f'\n  <p class="ti-epiquote-attr">{attr}</p>' if attr else ''
        # Emit with surrounding blank lines so markdown's HTML-block
        # heuristic recognises it as a block element.
        return (
            f'\n\n<aside class="ti-epiquote" role="doc-epigraph">\n'
            f'  <p class="ti-epiquote-text">{body}</p>'
            f'{attr_html}\n'
            f'</aside>\n\n'
        )
    return re.sub(r'\[EPIQUOTE\](.*?)\[/EPIQUOTE\]', repl, md, flags=re.DOTALL)


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


def twenty_years_assets() -> tuple[str, str, str]:
    css, iife, structure = _iife_assets(TY_HTML, "TwentyYears", '<div class="ty-figure"')
    # Standalone preview references the per-scene mp4s relative to figures/
    # (so the preview works when served from figures/). When integrated into
    # index.html at the article root, the same paths need a "figures/" prefix.
    structure = structure.replace(
        'src="twenty-years/',
        'src="figures/twenty-years/',
    )
    return css, iife, structure


def what_changed_assets() -> tuple[str, str, str]:
    css, iife, structure = _iife_assets(WC_HTML, "WhatChanged", '<div class="wc-figure"')
    css = css.replace(
        'url("short-period-design-review-slide.png")',
        'url("figures/short-period-design-review-slide.png")',
    )
    structure = structure.replace(
        'src="old-timey-photographer-deck.png"',
        'src="figures/old-timey-photographer-deck.png"',
    )
    return css, iife, structure


def data_black_market_assets() -> tuple[str, str, str]:
    css, iife, structure = _iife_assets(DBM_HTML, "DataBlackMarket", '<div class="dbm-figure"')
    # The standalone preview uses image paths relative to figures/ (so the preview
    # works when served from figures/). When integrated into index.html at the
    # article root, the same paths need a "figures/" prefix.
    structure = structure.replace(
        'src="data-black-market/',
        'src="figures/data-black-market/',
    )

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

    # Pre-process [EPIQUOTE] ... [/EPIQUOTE] blocks before markdown sees
    # them, so the markdown library doesn't paragraph-wrap their inner
    # text. The block becomes an <aside> at this stage.
    md = _expand_epiquotes(md)

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

    # ------------------------------------------------------------------
    # Section anchors + opener typographic moments.
    #
    # Each <h2> is rewritten into an anchored block carrying:
    #   - id="<node-id>"   — the article-map sidebar IO target
    #   - a thin rule + breath above (Guardian-style section break)
    #   - a small numeral and an italic stand-first under the heading
    #     (one consistent move per section per article)
    # ------------------------------------------------------------------
    nodes_by_id = {n["id"]: n for n in ARTICLE_MAPS[CURRENT_ARTICLE_ID]["nodes"]}
    h2_to_node = H2_TO_NODE_ID[CURRENT_ARTICLE_ID]

    def _h2_anchor(match: re.Match[str]) -> str:
        text = match.group(1)
        slug = _slugify_heading(text)
        node_id = h2_to_node.get(slug, slug)
        node = nodes_by_id.get(node_id)
        numeral = node["numeral"] if node else ""
        stand = node["stand"] if node else ""
        bits: list[str] = []
        bits.append('<div class="ti-divider" aria-hidden="true">✦</div>')
        bits.append(f'<section class="ti-section" id="{node_id}" data-node-id="{node_id}">')
        if numeral:
            bits.append(f'<span class="ti-section-numeral" aria-hidden="true">{numeral}</span>')
        # Special-case: article 1 section 5 ("Thread") gets a cinematic SVG
        # logotype that draws itself in (a thin black thread crosses the page,
        # spawning each letter as it passes, then settles into a hairline rule
        # under the word). The H2 still exists for the article-map / sidebar /
        # accessibility tree — it's just visually replaced by the logo block.
        if CURRENT_ARTICLE_ID == 1 and text.strip() == "Thread":
            bits.append(
                f'<h2 class="ti-section-h2 ti-visually-hidden">{text}</h2>'
            )
            bits.append(
                '<div class="ti-thread-logo" id="ti-thread-logo" '
                'data-thread-logo aria-hidden="true"></div>'
            )
        else:
            bits.append(f'<h2 class="ti-section-h2">{text}</h2>')
        if stand:
            bits.append(f'<p class="ti-section-stand">{stand}</p>')
        bits.append('</section>')
        return "\n".join(bits)

    html = re.sub(r"<h2>([^<]+)</h2>", _h2_anchor, html)

    # Inject an anchor wrapper for the cold-open ("intro") so the sidebar
    # has somewhere to scroll to and the IO has a target for the first node.
    # We wrap nothing visible — just an anchor ahead of the first paragraph.
    html = '<span id="intro" class="ti-anchor" data-node-id="intro" aria-hidden="true"></span>\n' + html

    # Promote the closing paragraph of article 1 to a held final beat. The
    # second article already wraps its closer in <p class="ti-final"> in the
    # markdown, so this is a no-op there.
    html = html.replace(
        "<p>That is the thread. It was there the whole time.</p>",
        '<p class="ti-final">That is the thread. It was there the whole time.</p>',
    )

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
    """Wrap the ADHD flowchart figure in a scroll-driven sticky stage.

    Eight prose beats sit on the left; the flowchart is sticky on the right.
    Each beat carries a `data-af-step` index. An IntersectionObserver in the
    article's bottom JS calls AdhdFlowchart.goToStep(n) when each beat enters
    the reading band — replacing the figure's old auto-advance loop.
    """
    beats = [
        "Phase one of the meme everyone with an ADHD diagnosis has seen forty times. <strong>Get a new idea.</strong> The bit my brain is good at — it ran on its own for two decades.",
        "<strong>Start a new project.</strong> Intensely, immediately, and at a tempo nobody asked for. The interesting bit is the only bit that exists.",
        "<strong>Tell everyone.</strong> The loop closes here. Saying the thing out loud is, briefly, indistinguishable from doing it.",
        "And then, faded off to the side: <strong>finish project.</strong> Not failed. Not abandoned, exactly. Just never connected back to the loop in the first place.",
        "What the meds turned down was the chaos around the loop, not the loop. Now: <strong>recognise it’s connected to three previous ideas.</strong> The through-line becomes legible in real time.",
        "<strong>Hand the boring bits to a swarm of agents.</strong> Tests, docstrings, edge cases, the literature sweep. The 80%-to-100% used to be the bit that killed the project; now it isn’t.",
        "<strong>Stay at the connection level.</strong> The job is to hold the shape. Routing the bounded sub-problems out, integrating the answers back. Cross-domain taste, in operation.",
        "<strong>Actually finish.</strong> Same brain, same loop — the difference is the route through the swarm now closes back into a green node instead of an orphan.",
    ]
    captions = [
        "the meme",
        "the meme",
        "the meme · loop closes",
        "the orphan",
        "the subversion",
        "the subversion",
        "the subversion",
        "the subversion · finish",
    ]

    beats_html = "\n".join(
        f'      <div class="af-scroll-beat" data-af-step="{i+1}">'
        f'<span class="af-scroll-beat-eyebrow">step {i+1:02d} &middot; {captions[i]}</span>'
        f'<p>{text}</p></div>'
        for i, text in enumerate(beats)
    )

    # New layout: 3-column grid — graph rail (left) | prose (middle) | cartoon rail (right).
    # The figure ships its own .af-svg-pane and .af-cartoon-pane; the scroll-driver JS
    # moves them into the rails at startup (see whenReady() in PROGRESS_JS or the
    # .ti-flowchart-scrolly block below).
    block = (
        '<aside class="ti-flowchart-scrolly" aria-label="ADHD flowchart, then and now — scroll to advance">\n'
        '  <div class="af-scroll">\n'
        '    <div class="af-graph-rail" id="af-graph-rail" aria-hidden="true"></div>\n'
        '    <div class="af-scroll-prose">\n'
        f'{beats_html}\n'
        '    </div>\n'
        '    <div class="af-cartoon-rail" id="af-cartoon-rail" aria-hidden="true"></div>\n'
        '    <div class="af-scroll-stage" hidden>\n'
        '      <aside class="ti-flowchart" aria-label="ADHD flowchart, then and now">\n'
        f'{flowchart_structure}\n'
        '      </aside>\n'
        '    </div>\n'
        '  </div>\n'
        '</aside>'
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


def substitute_what_changed(html: str, wc_structure: str) -> str:
    block = (
        '<aside class="ti-what-changed" aria-label="Walk through a real change cascade — a CG shift triggers stale flags on three downstream artefacts and pings the plot owners">\n'
        f"{wc_structure}\n"
        "</aside>"
    )
    return re.sub(
        r"<p>\[FIGURE:\s*what-changed\]</p>",
        block,
        html,
        count=1,
    )


def substitute_twenty_years(html: str, ty_structure: str) -> str:
    # Five short videos cross-fading on a sticky stage as the prose beats
    # scroll past — same scrolly pattern as data-black-market and
    # what-changed. Replaces the older single-video [VIDEO: post-it-onslaught]
    # placeholder at the "Twenty years of being the join" beat.
    block = (
        '<aside class="ti-twenty-years" aria-label="Twenty years of being the join — five short scenes of the same loop, blending across as you scroll">\n'
        f"{ty_structure}\n"
        "</aside>"
    )
    return re.sub(
        r"<p>\[FIGURE:\s*twenty-years\]</p>",
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


def substitute_callouts(html: str) -> str:
    """Replace paragraph-level callout markers with anchored inline asides."""
    milp_body = (
        'I originally wrote the endpoint constraint as '
        '<code>R_ij ≤ (A_i + A_j)/2</code>, the averaged form. Both are correct '
        'for binary variables; the paired form gives a tighter LP relaxation '
        'and the solver prunes faster. An LLM pointed that out while I was '
        'drafting this article. Standard OR practice I picked up incompletely, '
        'because I came at MILP from engineering rather than optimisation. '
        'Hub location with phasing is a standard OR formulation, decades old; '
        'DLR, MIT and NASA have published on hydrogen infrastructure rollout. '
        'Paradigm sat in a gap — coupling aircraft to network with '
        'engineering-derived costs — without inventing the technique.'
    )
    block = (
        '<aside class="ti-callout ti-callout-asterisk" aria-label="MILP formulation aside">\n'
        '  <div class="ti-callout-mark" aria-hidden="true">*</div>\n'
        '  <div class="ti-callout-body">\n'
        '    <p><strong>Formulation note.</strong> '
        f'{milp_body}</p>\n'
        '  </div>\n'
        '</aside>'
    )
    return re.sub(
        r"<p>\[CALLOUT:\s*milp-relaxation\]</p>",
        block,
        html,
        count=1,
    )


def substitute_cartoon_normal_things(html: str) -> str:
    block = (
        '<figure class="ti-figure ti-figure-cartoon" aria-labelledby="ti-cartoon-normal-figcap">\n'
        '  <img src="figures/cartoon-normal-things.png" '
        'alt="A cartoon of Harry by an alpine river with his small son sitting on his shoulders, both smiling. Mountains in the distance. A phone clipped to his belt shows a charge indicator at the end of the day." '
        'loading="lazy" />\n'
        '  <figcaption id="ti-cartoon-normal-figcap" class="ti-figcap">'
        "Present with people. Phone with charge at the end of the day &mdash; hitherto unknown. The cyan accent is on the battery indicator for a reason."
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
    """In article 2, promote the orchestrator panel to a sticky-stage scrolly.

    The cartoon sticks on one side; three short paragraphs (cross-domain
    taste, swarm-can't-do-this, PhD-supervisor analogy) flow past on the
    other. Article 1 is unaffected — its orchestrator slot, if present,
    keeps the inline figure rendering.
    """
    figure_block = (
        '<figure class="ti-figure ti-figure-cartoon ti-orch-figure" aria-labelledby="ti-cartoon-orchestrator-figcap">\n'
        '  <img src="figures/cartoon-orchestrator.png" '
        'alt="A person at a desk routing work to several specialist agent figures around them, holding a notebook rather than a tool" '
        'loading="lazy" />\n'
        '  <figcaption id="ti-cartoon-orchestrator-figcap" class="ti-figcap">'
        "Holding the shape of the problem, routing the bounded sub-problems out, integrating the answers back."
        "</figcaption>\n"
        "</figure>"
    )

    if CURRENT_ARTICLE_ID != 2:
        return re.sub(
            r"<p>\[FIGURE:\s*cartoon-orchestrator\]</p>",
            figure_block,
            html,
            count=1,
        )

    # Article 2 only: pull the next three paragraphs after the placeholder
    # into a sticky-stage scrolly with the figure. The paragraphs are the
    # ones that argue (a) what specialists are good at, (b) cross-domain
    # taste / mediocre-specialist, (c) the PhD supervisor analogy.
    placeholder_re = re.compile(
        r"<p>\[FIGURE:\s*cartoon-orchestrator\]</p>\s*"
        r"(<p>(?:(?!</p>).)*</p>)\s*"  # p1: what specialists are good at
        r"(<p>(?:(?!</p>).)*</p>)\s*"  # p2: orchestrator role
        r"(<p>(?:(?!</p>).)*</p>)\s*"  # p3: cross-domain taste
        r"(<p>(?:(?!</p>).)*</p>)",    # p4: that's what the swarm can't do
        re.DOTALL,
    )
    def _wrap(m: re.Match[str]) -> str:
        beats = [m.group(1), m.group(2), m.group(3), m.group(4)]
        beats_html = "\n".join(
            f'      <div class="ti-orch-beat">{p}</div>' for p in beats
        )
        return (
            '<aside class="ti-orch-scrolly" aria-label="The orchestrator and the swarm">\n'
            '  <div class="ti-orch-grid">\n'
            '    <div class="ti-orch-stage">\n'
            f'      {figure_block}\n'
            '    </div>\n'
            '    <div class="ti-orch-prose">\n'
            f'{beats_html}\n'
            '    </div>\n'
            '  </div>\n'
            '</aside>'
        )
    new_html, n = placeholder_re.subn(_wrap, html, count=1)
    if n == 0:
        # Fallback: at least render the figure inline if the surrounding
        # prose changed shape.
        return re.sub(
            r"<p>\[FIGURE:\s*cartoon-orchestrator\]</p>",
            figure_block,
            html,
            count=1,
        )
    return new_html


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


def substitute_jeppesen_award_cartoon(html: str) -> str:
    block = (
        '<figure class="ti-figure ti-figure-cartoon" aria-labelledby="ti-jeppesen-award-figcap">\n'
        '  <img src="figures/jeppesen-no-bull-award-cartoon.png" '
        'alt="Editorial cartoon of two workshop attendees shaking hands while one presents a blue No-Bull Prize package at a Jeppesen Crew and Fleet Optimisation Workshop" '
        'loading="lazy" />\n'
        '  <figcaption id="ti-jeppesen-award-figcap" class="ti-figcap">'
        "The No-Bull Prize: funny name, real signal. The work made economic sense to the people who understood the network."
        "</figcaption>\n"
        "</figure>"
    )
    return re.sub(
        r"<p>\[FIGURE:\s*jeppesen-no-bull-award\]</p>",
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
# Article-map sidebar renderer
# ---------------------------------------------------------------------------

def render_article_map(article_id: int) -> str:
    """Build the per-article sidebar map: nodes flow top-to-bottom on a
    vertical spine; thematic edges arc off to the right side.

    The SVG sits inside an <aside class="ti-map">. The IO + click handlers
    are wired by MAP_JS at the bottom of the page.
    """
    cfg = ARTICLE_MAPS[article_id]
    nodes = cfg["nodes"]
    edges = cfg["edges"]

    n = len(nodes)
    # Layout — narrow column SVG, vertical spine on the left, thematic
    # edges curve into the right gutter.
    width = 110
    top_pad = 30
    bot_pad = 30
    spacing = 60                          # vertical px between nodes
    height = top_pad + bot_pad + spacing * (n - 1)
    spine_x = 28                          # x-coord of the spine
    gutter_x = 88                         # outer x for thematic edge arcs

    pos: dict[str, tuple[float, float]] = {}
    for i, node in enumerate(nodes):
        pos[node["id"]] = (spine_x, top_pad + spacing * i)

    parts: list[str] = []
    parts.append(
        f'<aside class="ti-map" aria-label="Article map" data-article-id="{article_id}">'
    )
    parts.append(
        f'  <svg class="ti-map-svg" viewBox="0 0 {width} {height}" '
        f'preserveAspectRatio="xMidYMid meet" role="img" '
        f'aria-label="A map of the article — sections as nodes, thematic edges as curves">'
    )

    # Spine — sequential edges between consecutive nodes.
    spine_d_parts = []
    for i in range(n - 1):
        ax, ay = pos[nodes[i]["id"]]
        bx, by = pos[nodes[i + 1]["id"]]
        spine_d_parts.append(f"M{ax},{ay+5} L{bx},{by-5}")
    spine_d = " ".join(spine_d_parts)
    parts.append(
        f'    <path class="ti-map-spine" d="{spine_d}" fill="none" '
        f'stroke="currentColor" stroke-width="1" stroke-opacity="0.32" />'
    )

    # Thematic (non-sequential) edges — quadratic curves arcing off the
    # right side of the spine. Curve depth scales gently with the vertical
    # span so longer arcs bow further out.
    for src_id, dst_id in edges:
        if src_id not in pos or dst_id not in pos:
            continue
        ax, ay = pos[src_id]
        bx, by = pos[dst_id]
        if ay == by:
            continue
        span = abs(by - ay)
        bow = min(40.0, 12.0 + span * 0.18)
        cx = spine_x + bow
        cy = (ay + by) / 2.0
        # Slight stagger by hashing the pair so overlapping arcs separate.
        stagger = ((hash((src_id, dst_id)) >> 3) & 7) - 3
        cx += stagger * 1.4
        d = f"M{ax+3},{ay} Q{cx},{cy} {bx+3},{by}"
        parts.append(
            f'    <path class="ti-map-edge" d="{d}" fill="none" '
            f'stroke="currentColor" stroke-width="0.85" stroke-opacity="0.30" '
            f'data-edge-from="{src_id}" data-edge-to="{dst_id}" />'
        )

    # Nodes — small circle + invisible touch target. Each is also a link
    # for keyboard navigation.
    for node in nodes:
        nid = node["id"]
        cx, cy = pos[nid]
        title = node["title"].replace('"', "&quot;")
        summary = node["summary"].replace('"', "&quot;")
        parts.append(
            f'    <g class="ti-map-node" data-node-id="{nid}" '
            f'tabindex="0" role="link" aria-label="{title}: {summary}">'
        )
        # Big invisible touch target so the click radius is generous.
        parts.append(
            f'      <circle cx="{cx}" cy="{cy}" r="14" fill="transparent" '
            f'class="ti-map-hit" />'
        )
        parts.append(
            f'      <circle cx="{cx}" cy="{cy}" r="3.6" '
            f'class="ti-map-dot" stroke="currentColor" stroke-width="1" '
            f'fill="var(--ti-bg)" />'
        )
        # Hover/focus halo (rendered, but only visible via CSS on hover).
        parts.append(
            f'      <circle cx="{cx}" cy="{cy}" r="9" class="ti-map-halo" '
            f'fill="none" stroke="currentColor" stroke-width="0.8" '
            f'stroke-opacity="0.0" />'
        )
        parts.append('    </g>')

    parts.append('  </svg>')

    # Hover tooltip (single shared element, populated by JS).
    parts.append(
        '  <div class="ti-map-tooltip" role="tooltip" aria-hidden="true">'
        '<span class="ti-map-tooltip-title"></span>'
        '<span class="ti-map-tooltip-summary"></span>'
        '</div>'
    )

    # Hidden node-data table that the JS reads (so we don't need to
    # restate the strings in the JS).
    parts.append('  <script type="application/json" class="ti-map-data">{')
    json_nodes = ",".join(
        '"%s":{"title":%s,"summary":%s}' % (
            node["id"],
            _json_str(node["title"]),
            _json_str(node["summary"]),
        )
        for node in nodes
    )
    parts.append(json_nodes)
    parts.append('  }</script>')

    parts.append('</aside>')
    return "\n".join(parts)


def _json_str(s: str) -> str:
    """Minimal JSON string escape (no third-party json module needed for our content)."""
    out = ['"']
    for ch in s:
        if ch == '"':
            out.append('\\"')
        elif ch == "\\":
            out.append("\\\\")
        elif ch == "\n":
            out.append("\\n")
        elif ch == "\r":
            out.append("\\r")
        elif ch == "\t":
            out.append("\\t")
        elif ord(ch) < 0x20:
            out.append("\\u%04x" % ord(ch))
        else:
            out.append(ch)
    out.append('"')
    return "".join(out)


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
    --ti-content-w: 760px;       /* bumped from 700 — prose still in the readable range, more presence on wide screens */
    --ti-wide-w:   1480px;       /* bumped from 1200 — figures get more horizontal room when they break out */
    --ti-side-w:   320px;        /* right-margin column on >=1280 viewports — homes for pull-quotes and side asides */
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
  .ti-prose .ti-data-black-market,
  .ti-prose .ti-what-changed,
  .ti-prose .ti-twenty-years,
  .ti-prose .ti-flowchart-scrolly,
  .ti-prose .ti-orch-scrolly {
    margin-left: calc(50% - 50vw + 8px);
    margin-right: calc(50% - 50vw + 8px);
    max-width: clamp(1240px, 92vw, 1520px);   /* fluid cap — uses available width on big monitors */
    margin-inline: auto;
  }
  .ti-prose .ti-what-changed {
    position: relative;
    left: 50%;
    width: min(1180px, calc(100vw - 40px));
    max-width: none;
    margin: 64px 0;
    transform: translateX(-50%);
  }
  .ti-prose .ti-what-changed .wc-scroll {
    width: 100%;
    max-width: none;
    margin-left: 0;
    margin-right: 0;
    transform: none;
  }
  @media (min-width: 1100px) {
    .ti-prose .ti-flat-view,
    .ti-prose .ti-ask-the-plot {
      width: min(1180px, calc(100vw - 64px));
      max-width: none;
      margin-left: 50%;
      transform: translateX(-50%);
    }
    .ti-prose .ti-what-changed {
      width: min(1180px, calc(100vw - 64px));
    }
  }
  @media (min-width: 760px) and (max-width: 1099px) {
    .ti-prose .ti-what-changed {
      width: calc(100vw - 32px);
    }
    .ti-prose .ti-what-changed .wc-scroll {
      grid-template-columns: minmax(220px, 0.32fr) minmax(0, 0.68fr);
      gap: 16px;
    }
  }
  @media (max-width: 720px) {
    .ti-prose .ti-flat-view,
    .ti-prose .ti-ask-the-plot,
    .ti-prose .ti-data-black-market,
    .ti-prose .ti-what-changed,
    .ti-prose .ti-twenty-years {
      left: auto;
      margin-left: 0;
      margin-right: 0;
      width: 100%;
      transform: none;
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
  .ti-mast-brand { font-weight: 600; letter-spacing: 0; }
  .ti-mast-meta { font-variant-numeric: tabular-nums; }

  /* ---- hero ---- */
  .ti-hero {
    margin: 24px 0 80px;
  }
  .ti-hero-cinematic {
    position: relative;
    width: calc(100vw - 40px);
    max-width: 1440px;
    min-height: min(820px, calc(100vh - 116px));
    margin: 0 auto 88px;
    display: grid;
    align-items: end;
    overflow: hidden;
    border-radius: 18px;
    background: #050914;
    isolation: isolate;
    box-shadow: 0 28px 80px rgba(0,0,0,0.26);
  }
  .ti-hero-media,
  .ti-hero-media video,
  .ti-hero-shade {
    position: absolute;
    inset: 0;
  }
  .ti-hero-media video {
    width: 100%;
    height: 100%;
    object-fit: cover;
    opacity: 0.82;
    filter: saturate(0.88) contrast(1.08);
  }
  .ti-hero-shade {
    z-index: 1;
    background:
      linear-gradient(180deg, rgba(5,9,20,0.08) 0%, rgba(5,9,20,0.36) 43%, rgba(5,9,20,0.88) 100%),
      radial-gradient(circle at 22% 28%, rgba(34,211,238,0.20), transparent 34%),
      radial-gradient(circle at 82% 16%, rgba(168,85,247,0.20), transparent 30%);
  }
  .ti-hero-copy {
    position: relative;
    z-index: 2;
    width: min(760px, calc(100% - 48px));
    margin: 0;
    padding: clamp(28px, 6vw, 74px);
    color: #f8fafc;
  }
  .ti-hero-cinematic .ti-hero-eyebrow {
    color: rgba(226,232,240,0.76);
    margin-bottom: 18px;
  }
  .ti-hero-cinematic h1 {
    max-width: 11ch;
    color: #ffffff;
    background: none;
    -webkit-text-fill-color: currentColor;
    text-shadow: 0 4px 32px rgba(0,0,0,0.45);
    font-size: clamp(42px, 8.6vw, 112px);
    letter-spacing: 0;
    line-height: 0.88;
    margin-bottom: 24px;
  }
  .ti-hero-kicker {
    max-width: 54ch;
    margin: 0;
    color: rgba(226,232,240,0.88);
    font-family: var(--ti-font-serif);
    font-size: clamp(18px, 2vw, 25px);
    line-height: 1.42;
  }
  .ti-scroll-cue {
    position: absolute;
    right: 28px;
    bottom: 22px;
    z-index: 2;
    color: rgba(226,232,240,0.70);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.16em;
  }
  .ti-scroll-cue::after {
    content: "";
    display: block;
    width: 1px;
    height: 46px;
    margin: 9px auto 0;
    background: linear-gradient(rgba(226,232,240,0.75), transparent);
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
    letter-spacing: 0;
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
  .ti-hero-cinematic h1 {
    color: #ffffff;
    background: none;
    -webkit-text-fill-color: #ffffff;
    text-shadow: 0 4px 32px rgba(0,0,0,0.45);
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
  @media (max-width: 720px) {
    .ti-hero-cinematic {
      width: calc(100vw - 20px);
      min-height: 76vh;
      border-radius: 14px;
      margin-bottom: 56px;
    }
    .ti-hero-copy {
      width: 100%;
      padding: 28px 22px 54px;
    }
    .ti-hero-cinematic h1 { max-width: 8.5ch; }
    .ti-scroll-cue { display: none; }
  }

  /* ---- prose typography ---- */
  .ti-prose {
    font-family: var(--ti-font-serif);
    font-size: 18px;
    line-height: 1.7;
  }
  .ti-prose h2,
  .ti-prose h3,
  .ti-prose .ti-eyebrow,
  .ti-prose .ti-figcap,
  .ti-prose .ti-caption,
  .ti-prose .ti-demo,
  .ti-prose .ti-figure-milp,
  .ti-prose pre,
  .ti-prose code {
    font-family: var(--ti-font-sans);
  }
  /* Prose stays >= 16 px on phones; cap it so it doesn't shrink. */
  @media (max-width: 480px) {
    .ti-prose { font-size: 17px; line-height: 1.65; }
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
    letter-spacing: 0;
  }
  .ti-prose p {
    margin: 0 0 1.15em;
  }
  .ti-prose > p {
    text-wrap: pretty;
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

  /* ---- pull-quote (Guardian/NYT-style breakout) ----
     A single-sentence emphasis lifted out of the prose. Generous
     vertical whitespace, larger type, hairline rules above and below.
     Wired in via inline <aside class="ti-pullquote"> in the markdown. */
  .ti-prose .ti-pullquote {
    display: block;
    margin: 56px auto;
    padding: 22px 0 24px;
    max-width: 30ch;
    border-top: 1px solid var(--ti-rule);
    border-bottom: 1px solid var(--ti-rule);
    text-align: center;
    font-family: var(--ti-font-serif);
    font-style: italic;
    font-size: clamp(22px, 2.6vw, 28px);
    line-height: 1.32;
    color: var(--ti-fg);
    letter-spacing: -0.005em;
    text-wrap: balance;
  }
  @media (max-width: 480px) {
    .ti-prose .ti-pullquote {
      margin: 36px auto;
      padding: 16px 0 18px;
      font-size: 21px;
      max-width: 24ch;
    }
  }
  /* On wide screens (>=1280 px), pull-quotes break OUT into the
     right margin instead of sitting centred — Guardian-style margin
     pull. Prose flows on the left at reading width; the quote sits
     beside it, smaller, italicised, in the empty side gutter. */
  @media (min-width: 1280px) {
    .ti-prose .ti-pullquote {
      float: right;
      margin: 8px -300px 12px 24px;   /* negative right margin pulls into the side gutter */
      padding: 18px 0 18px;
      width: 280px;
      max-width: 280px;
      font-size: 19px;
      line-height: 1.36;
      text-align: left;
      border-top: 2px solid var(--ti-accent);
      border-bottom: 1px solid var(--ti-rule);
    }
    /* Clear floats so following content doesn't wrap underneath. */
    .ti-prose h2, .ti-prose .ti-divider, .ti-prose .ti-eyebrow,
    .ti-prose figure, .ti-prose .ti-final, .ti-prose .ti-epiquote,
    .ti-prose aside { clear: both; }
  }

  /* ---- epigraph / epiquote ----
     A quoted passage that opens (or punctuates) a section, set in
     display type with attribution. Wired via the [EPIQUOTE] ...
     [/EPIQUOTE] markdown block, which the build expands into:
       <aside class="ti-epiquote">
         <p class="ti-epiquote-text">...</p>
         <p class="ti-epiquote-attr">...</p>
       </aside>
  */
  .ti-prose .ti-epiquote {
    position: relative;
    margin: 112px auto 96px;
    padding: 56px 36px 28px;
    max-width: 880px;
    text-align: center;
    transition: opacity 180ms ease, transform 180ms ease;
  }
  /* Big decorative opening quotation mark, NYT/Guardian style — sits
     behind the body, in the accent colour, oversized. */
  .ti-prose .ti-epiquote::before {
    content: "\201C";          /* left double curly quote */
    position: absolute;
    top: -12px;
    left: 50%;
    transform: translateX(-50%);
    font-family: var(--ti-font-serif);
    font-style: normal;
    font-weight: 700;
    font-size: clamp(96px, 11vw, 152px);
    line-height: 0.85;
    color: var(--ti-accent);
    opacity: 0.88;
    pointer-events: none;
  }
  .ti-prose .ti-epiquote-text {
    margin: 0;
    font-family: var(--ti-font-serif);
    font-size: clamp(26px, 3vw, 40px);
    line-height: 1.24;
    font-style: italic;
    color: var(--ti-fg);
    letter-spacing: 0;
    font-weight: 400;
    text-wrap: balance;
  }
  /* Hairline rule between body and attribution. */
  .ti-prose .ti-epiquote-attr {
    margin: 30px auto 0;
    padding-top: 18px;
    position: relative;
    font-family: var(--ti-font-sans);
    font-size: 11px;
    letter-spacing: 0.24em;
    text-transform: uppercase;
    font-weight: 700;
    color: var(--ti-fg-dim);
    font-style: normal;
  }
  .ti-prose .ti-epiquote-attr::before {
    content: "";
    position: absolute;
    top: 0;
    left: 50%;
    transform: translateX(-50%);
    width: 36px;
    height: 1px;
    background: var(--ti-accent);
    opacity: 0.78;
  }
  @media (max-width: 720px) {
    .ti-prose .ti-epiquote {
      margin: 72px auto 56px;
      padding: 44px 16px 22px;
    }
    .ti-prose .ti-epiquote::before {
      top: -8px;
      font-size: 84px;
    }
    .ti-prose .ti-epiquote-text { font-size: 22px; }
    .ti-prose .ti-epiquote-attr { margin-top: 22px; padding-top: 14px; font-size: 10.5px; }
  }
  @media (min-width: 1320px) {
    .ti-prose .ti-epiquote {
      position: sticky;
      top: 112px;
      float: right;
      clear: right;
      width: min(300px, var(--ti-side-w));
      max-width: none;
      margin: 10px calc(-1 * (var(--ti-side-w) + 6px)) 30px 34px;
      padding: 36px 0 18px 18px;
      text-align: left;
      border-left: 2px solid color-mix(in srgb, var(--ti-accent) 70%, transparent);
      z-index: 3;
    }
    .ti-prose .ti-epiquote::before {
      top: -16px;
      left: 0;
      transform: none;
      font-size: 72px;
      line-height: 0.8;
      opacity: 0.72;
    }
    .ti-prose .ti-epiquote-text {
      font-size: 23px;
      line-height: 1.25;
      text-wrap: pretty;
    }
    .ti-prose .ti-epiquote-attr {
      margin: 22px 0 0;
      padding-top: 14px;
      font-size: 10px;
      letter-spacing: 0.16em;
    }
    .ti-prose .ti-epiquote-attr::before {
      left: 0;
      transform: none;
      width: 28px;
    }
    .ti-js .ti-prose .ti-epiquote.ti-epiquote-suppressed {
      opacity: 0;
      transform: translateY(-10px);
      pointer-events: none;
    }
  }

  /* ---- companion-piece sister link ----
     Cross-article handoff at the bottom of each article — the other
     piece in the pair. Sits below the held closer line, set restrained:
     a small eyebrow, the title as link, a one-sentence blurb. */
  .ti-prose .ti-sister-link {
    display: block;
    margin: 64px auto 12px;
    max-width: 540px;
    padding: 22px 26px 24px;
    border: 1px solid var(--ti-rule);
    border-radius: 10px;
    background: var(--ti-surface);
    text-align: center;
  }
  .ti-prose .ti-sister-eyebrow {
    margin: 0 0 6px;
    font-size: 11px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--ti-accent);
    font-weight: 700;
  }
  .ti-prose .ti-sister-title {
    margin: 0 0 8px;
    font-family: var(--ti-font-serif);
    font-size: clamp(20px, 2.2vw, 24px);
    font-weight: 700;
    line-height: 1.18;
    letter-spacing: -0.005em;
  }
  .ti-prose .ti-sister-title a {
    color: var(--ti-fg);
    text-decoration: none;
    border-bottom: 2px solid var(--ti-accent);
    padding-bottom: 1px;
  }
  .ti-prose .ti-sister-title a:hover {
    color: var(--ti-accent);
  }
  .ti-prose .ti-sister-blurb {
    margin: 0;
    font-size: 14px;
    line-height: 1.55;
    color: var(--ti-fg-dim);
  }
  @media (max-width: 480px) {
    .ti-prose .ti-sister-link {
      margin: 48px auto 8px;
      padding: 18px 18px 20px;
    }
  }

  /* ---- in-flow bridge link ----
     A lighter cross-article bridge placed next to the exact argument it
     continues, not just at the end of the piece. */
  .ti-prose .ti-bridge-link {
    display: block;
    margin: 34px auto 38px;
    max-width: 580px;
    padding: 18px 22px 20px;
    border-left: 3px solid var(--ti-accent);
    background: color-mix(in srgb, var(--ti-surface) 76%, transparent);
  }
  .ti-prose .ti-bridge-eyebrow {
    margin: 0 0 6px;
    font-size: 10.5px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--ti-accent);
    font-weight: 800;
  }
  .ti-prose .ti-bridge-copy {
    margin: 0;
    font-size: 15px;
    line-height: 1.55;
    color: var(--ti-fg-dim);
  }
  .ti-prose .ti-bridge-action {
    margin: 10px 0 0;
    font-size: 14px;
    line-height: 1.4;
    font-weight: 700;
  }
  .ti-prose .ti-bridge-action a {
    color: var(--ti-fg);
    text-decoration: none;
    border-bottom: 2px solid var(--ti-accent);
    padding-bottom: 1px;
  }
  .ti-prose .ti-bridge-action a:hover {
    color: var(--ti-accent);
  }
  @media (max-width: 480px) {
    .ti-prose .ti-bridge-link {
      margin: 28px auto 32px;
      padding: 16px 18px 18px;
    }
  }

  /* ---- final line (closing emphasis) ----
     The last line of the essay: larger, italic, generous whitespace
     above. Wired via <p class="ti-final"> in the markdown. */
  .ti-prose .ti-final {
    margin: 72px 0 16px;
    font-family: var(--ti-font-serif);
    font-style: italic;
    font-size: clamp(22px, 2.4vw, 27px);
    line-height: 1.3;
    text-align: center;
    color: var(--ti-fg);
    letter-spacing: -0.005em;
    text-wrap: balance;
  }
  @media (max-width: 480px) {
    .ti-prose .ti-final {
      margin: 48px 0 8px;
      font-size: 21px;
    }
  }
  /* Ensure drop-cap stays visible on mobile (some browsers shrink it). */
  @media (max-width: 480px) {
    .ti-prose > p:first-of-type::first-letter {
      font-size: 3.6em;
      padding: 4px 8px 0 0;
    }
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
    display: none;
    opacity: 0;
    pointer-events: none;
    transition: opacity 140ms ease;
  }
  .ti-aside:hover .ti-aside-content,
  .ti-aside:focus-within .ti-aside-content {
    display: block;
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
  @media (max-width: 640px) {
    .ti-aside {
      position: static;
    }
    .ti-aside-content {
      position: fixed;
      left: 16px;
      right: 16px;
      bottom: 18px;
      width: auto;
      max-width: none;
      transform: none;
      z-index: 100;
    }
    .ti-aside-content::before,
    .ti-aside-content::after {
      display: none;
    }
  }

  /* ---- paragraph-level callouts ---- */
  .ti-callout {
    display: grid;
    grid-template-columns: 28px minmax(0, 1fr);
    gap: 12px;
    margin: 22px 0 28px;
    padding: 15px 17px 15px 14px;
    border: 1px solid var(--ti-border);
    border-left: 3px solid var(--ti-accent);
    border-radius: 8px;
    background:
      linear-gradient(90deg, color-mix(in srgb, var(--ti-accent) 9%, transparent), transparent 48%),
      var(--ti-surface);
    box-shadow: 0 14px 36px rgba(0, 0, 0, 0.14);
  }
  .ti-callout-mark {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border: 1px solid color-mix(in srgb, var(--ti-accent) 54%, var(--ti-border));
    border-radius: 999px;
    color: var(--ti-accent);
    background: color-mix(in srgb, var(--ti-accent) 12%, transparent);
    font-size: 20px;
    font-weight: 800;
    line-height: 1;
  }
  .ti-callout-body {
    min-width: 0;
    color: var(--ti-fg-dim);
    font-size: 15px;
    line-height: 1.62;
  }
  .ti-callout-body p {
    margin: 0;
  }
  .ti-callout-body strong {
    color: var(--ti-fg);
    font-weight: 650;
  }
  .ti-callout-body code {
    font-size: 0.9em;
  }

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
    margin: 52px 0;
    padding: 18px;
    background: var(--ti-surface);
    border: 1px solid var(--ti-border);
    border-radius: 12px;
  }
  .ti-figure,
  .ti-demo,
  .ti-flat-view,
  .ti-ask-the-plot,
  .ti-data-black-market,
  .ti-what-changed {
    transition: opacity 520ms ease, transform 700ms cubic-bezier(.2,.8,.2,1), filter 700ms ease;
  }
  html.ti-js .ti-reveal {
    opacity: 0.66;
    transform: translateY(28px) scale(0.992);
    filter: saturate(0.86);
  }
  html.ti-js .ti-reveal.ti-inview {
    opacity: 1;
    transform: translateY(0) scale(1);
    filter: saturate(1);
  }
  html.ti-js .ti-reveal.ti-dimmed {
    opacity: 0.72;
    transform: translateY(-10px) scale(0.996);
  }
  html.ti-js .ti-figure-fullbleed.ti-reveal {
    transform: translateX(-50%) translateY(28px) scale(0.992);
  }
  html.ti-js .ti-figure-fullbleed.ti-reveal.ti-inview {
    transform: translateX(-50%) translateY(0) scale(1);
  }
  html.ti-js .ti-figure-fullbleed.ti-reveal.ti-dimmed {
    transform: translateX(-50%) translateY(-10px) scale(0.996);
  }
  html.ti-js .ti-figure-milp.ti-reveal {
    opacity: 1;
    transform: none;
    filter: none;
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
    margin: 72px 0 72px;
  }
  @media (min-width: 1000px) {
    .ti-demo {
      width: min(100vw - 32px, 1320px);
      margin-left: calc(50% - min(50vw - 16px, 660px));
      margin-right: calc(50% - min(50vw - 16px, 660px));
    }
  }
  .ti-demo .tg-root { padding: 0; }

  /* ---- flat-view + adhd-flowchart asides — also break out wide so the
     scrolly grid has enough room for the table + DAG panel ---- */
  .ti-flat-view, .ti-flowchart {
    margin: 72px 0;
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
  .ti-figure-fullbleed {
    position: relative;
    width: 100vw;
    min-height: 100svh;
    max-width: none;
    margin: clamp(72px, 12vh, 132px) 50%;
    transform: translateX(-50%);
    padding: 0;
    border: 0;
    background: transparent;
    border-radius: 0;
    overflow: clip;
    display: grid;
    place-items: center;
  }
  .ti-figure-fullbleed .ti-video-wrap {
    width: 100%;
    height: 100svh;
    min-height: 560px;
    aspect-ratio: auto;
    border-radius: 0;
    background: var(--ti-bg);
  }
  .ti-figure-fullbleed .ti-video-wrap video,
  .ti-figure-fullbleed .ti-video-wrap iframe {
    object-fit: cover;
  }
  .ti-figure-fullbleed img {
    width: 100%;
    height: 100svh;
    min-height: 560px;
    object-fit: cover;
    border-radius: 0;
    box-shadow: 0 30px 80px rgba(0,0,0,0.28);
  }
  .ti-figure-fullbleed .ti-figcap {
    position: absolute;
    left: 50%;
    bottom: clamp(18px, 5vh, 56px);
    width: min(760px, calc(100% - 40px));
    margin: 0;
    padding: 10px 18px;
    transform: translateX(-50%) translateY(18px);
    border-radius: 999px;
    background: rgba(248, 250, 252, 0.82);
    color: #475569;
    box-shadow: 0 14px 42px rgba(15, 23, 42, 0.14);
    opacity: 0;
    transition: opacity 520ms ease 240ms, transform 640ms cubic-bezier(.2,.8,.2,1) 240ms;
    backdrop-filter: blur(12px);
  }
  html.ti-js .ti-figure-fullbleed.ti-inview .ti-figcap,
  html:not(.ti-js) .ti-figure-fullbleed .ti-figcap {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
  @media (max-width: 720px) {
    .ti-figure-fullbleed {
      width: 100%;
      min-height: auto;
      margin: 42px 0;
      transform: none;
      border-radius: 12px;
      display: block;
    }
    .ti-figure-fullbleed .ti-video-wrap,
    .ti-figure-fullbleed img {
      height: auto;
      min-height: 0;
      aspect-ratio: 16 / 9;
      object-fit: contain;
    }
    html.ti-js .ti-figure-fullbleed.ti-reveal {
      transform: translateY(24px) scale(0.992);
    }
    html.ti-js .ti-figure-fullbleed.ti-reveal.ti-inview {
      transform: translateY(0) scale(1);
    }
    html.ti-js .ti-figure-fullbleed.ti-reveal.ti-dimmed {
      transform: translateY(-8px) scale(0.996);
    }
    .ti-figure-fullbleed .ti-video-wrap,
    .ti-figure-fullbleed img { border-radius: 12px; }
    .ti-figure-fullbleed .ti-figcap {
      position: static;
      width: min(680px, calc(100% - 32px));
      margin: 12px auto 0;
      transform: translateY(12px);
      border-radius: 12px;
      background: transparent;
      box-shadow: none;
      backdrop-filter: none;
      padding: 0;
    }
    html.ti-js .ti-figure-fullbleed.ti-inview .ti-figcap,
    html:not(.ti-js) .ti-figure-fullbleed .ti-figcap {
      transform: translateY(0);
    }
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

  /* ---- section anchors + opener typographic moments ---- */
  .ti-prose .ti-section {
    /* Each section opens with a thin rule + generous breathing room. The
       <section> itself is a logical wrapper; the visual break is on the
       divider that precedes it. */
    margin: 88px 0 36px;
    padding: 0;
  }
  .ti-prose .ti-section-numeral {
    display: block;
    font-family: var(--ti-font-sans);
    font-feature-settings: "tnum" 1;
    font-variant-numeric: tabular-nums;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.22em;
    color: var(--ti-accent);
    text-transform: uppercase;
    margin: 0 0 10px;
  }
  .ti-prose .ti-section-h2 {
    font-family: var(--ti-font-sans);
    font-size: clamp(26px, 3.4vw, 34px);
    font-weight: 700;
    line-height: 1.12;
    letter-spacing: -0.005em;
    margin: 0 0 14px;
    color: var(--ti-fg);
    text-wrap: balance;
  }
  .ti-prose .ti-section-stand {
    font-family: var(--ti-font-serif);
    font-style: italic;
    font-size: 19px;
    line-height: 1.42;
    color: var(--ti-fg-dim);
    margin: 0 0 28px;
    max-width: 38ch;
    text-wrap: balance;
    border-left: 2px solid color-mix(in srgb, var(--ti-accent) 70%, transparent);
    padding-left: 14px;
  }
  @media (max-width: 480px) {
    .ti-prose .ti-section { margin: 56px 0 24px; }
    .ti-prose .ti-section-stand { font-size: 17px; padding-left: 11px; }
  }

  /* ---- visually-hidden helper (preserves a11y H2 for the section
     anchor / article map while the visual element is the logo) ---- */
  .ti-visually-hidden {
    position: absolute !important;
    width: 1px; height: 1px;
    padding: 0; margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  /* ---- cinematic "Thread" logotype (article 1, section 5) ----
     A thin line draws across the page from left to right, spawning each
     letter as it passes; the line then loops down and settles as a
     hairline rule beneath the word. End state is a clean black-on-white
     wordmark. */
  .ti-thread-logo {
    display: block;
    margin: 4px 0 22px;
    color: var(--ti-fg);   /* drives currentColor for the SVG strokes */
    line-height: 0;        /* no extra baseline gap below the SVG */
  }
  .ti-thread-logo svg {
    display: block;
    width: 100%;
    max-width: 420px;
    height: auto;
    overflow: visible;
  }
  /* Letter glyphs: drawn-on stroke that fills in once the thread has
     passed. Idle state (off-viewport) hides them; the .play class
     animates them in. */
  .ti-thread-logo .ti-thread-letter {
    fill: transparent;
    stroke: currentColor;
    stroke-width: 1.4;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-dasharray: var(--len, 600);
    stroke-dashoffset: var(--len, 600);
    opacity: 0;
  }
  .ti-thread-logo .ti-thread-line {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.4;
    stroke-linecap: round;
    stroke-dasharray: var(--line-len, 1200);
    stroke-dashoffset: var(--line-len, 1200);
  }
  .ti-thread-logo .ti-thread-rule {
    fill: none;
    stroke: currentColor;
    stroke-width: 1;
    stroke-linecap: round;
    stroke-dasharray: var(--rule-len, 360);
    stroke-dashoffset: var(--rule-len, 360);
    opacity: 0;
  }

  /* The thread sweeps across (0 -> ~70% of duration); each letter starts
     drawing as the thread crosses its centre, then fills to solid; the
     thread continues, loops down, and the underline rule settles last. */
  .ti-thread-logo.ti-thread-logo-play .ti-thread-line {
    animation: ti-thread-draw 1500ms cubic-bezier(.65,.05,.36,1) forwards;
  }
  .ti-thread-logo.ti-thread-logo-play .ti-thread-letter {
    animation:
      ti-thread-letter-draw 700ms cubic-bezier(.55,.08,.32,1) forwards,
      ti-thread-letter-fill 320ms ease-out forwards;
    /* per-letter delays are set inline by JS via --d-draw / --d-fill */
    animation-delay: var(--d-draw, 0ms), var(--d-fill, 700ms);
  }
  .ti-thread-logo.ti-thread-logo-play .ti-thread-rule {
    animation: ti-thread-rule-draw 520ms cubic-bezier(.45,.05,.2,1) 1480ms forwards;
  }

  /* End state — once the play class has run, the styles above leave the
     animations in their forwards state. We also set this when reduced
     motion or post-replay so the wordmark renders intact even if the
     element re-mounts mid-paint. */
  .ti-thread-logo.ti-thread-logo-rest .ti-thread-letter {
    fill: currentColor;
    stroke-width: 0;
    stroke-dashoffset: 0;
    opacity: 1;
    animation: none;
  }
  .ti-thread-logo.ti-thread-logo-rest .ti-thread-line {
    opacity: 0;
    animation: none;
  }
  .ti-thread-logo.ti-thread-logo-rest .ti-thread-rule {
    stroke-dashoffset: 0;
    opacity: 1;
    animation: none;
  }

  @keyframes ti-thread-draw {
    0%   { stroke-dashoffset: var(--line-len, 1200); opacity: 1; }
    72%  { stroke-dashoffset: 0; opacity: 1; }
    100% { stroke-dashoffset: 0; opacity: 0; }
  }
  @keyframes ti-thread-letter-draw {
    0%   { opacity: 1; stroke-dashoffset: var(--len, 600); fill: transparent; }
    100% { opacity: 1; stroke-dashoffset: 0; fill: transparent; }
  }
  @keyframes ti-thread-letter-fill {
    0%   { fill: transparent; }
    100% { fill: currentColor; stroke-width: 0; }
  }
  @keyframes ti-thread-rule-draw {
    0%   { stroke-dashoffset: var(--rule-len, 360); opacity: 1; }
    100% { stroke-dashoffset: 0; opacity: 1; }
  }

  @media (max-width: 520px) {
    .ti-thread-logo svg { max-width: 300px; }
  }
  @media (prefers-reduced-motion: reduce) {
    .ti-thread-logo .ti-thread-letter,
    .ti-thread-logo .ti-thread-rule {
      animation: none !important;
      opacity: 1 !important;
      stroke-dashoffset: 0 !important;
    }
    .ti-thread-logo .ti-thread-letter { fill: currentColor !important; stroke-width: 0 !important; }
    .ti-thread-logo .ti-thread-line { display: none; }
  }

  .ti-section-pin {
    display: none;
  }
  .ti-section-linkline {
    display: none;
  }
  @media (min-width: 1180px) {
    .ti-section-pin {
      position: fixed;
      left: 98px;
      top: 104px;
      z-index: 39;
      display: block;
      width: 112px;
      padding: 0 0 0 12px;
      border-left: 2px solid color-mix(in srgb, var(--ti-accent) 58%, transparent);
      color: var(--ti-fg);
      opacity: 0;
      transform: translateY(10px);
      pointer-events: none;
      transition: opacity 180ms ease, transform 180ms ease;
    }
    .ti-section-pin[data-visible="true"] {
      opacity: 1;
      transform: translateY(0);
    }
    .ti-section-pin-numeral {
      display: block;
      margin: 0 0 8px;
      font-family: var(--ti-font-sans);
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.28em;
      color: var(--ti-accent);
    }
    .ti-section-pin-title {
      margin: 0 0 10px;
      font-family: var(--ti-font-sans);
      font-size: 20px;
      font-weight: 760;
      line-height: 1.03;
      letter-spacing: 0;
      text-wrap: balance;
    }
    .ti-section-pin-stand {
      margin: 0;
      font-family: var(--ti-font-serif);
      font-size: 13px;
      font-style: italic;
      line-height: 1.32;
      color: var(--ti-fg-dim);
      text-wrap: balance;
    }
    .ti-section-linkline {
      position: fixed;
      inset: 0;
      z-index: 38;
      display: block;
      width: 100vw;
      height: 100vh;
      pointer-events: none;
      overflow: visible;
      opacity: 0;
      transition: opacity 160ms ease;
    }
    .ti-section-linkline[data-visible="true"] {
      opacity: 1;
    }
    .ti-section-linkline path {
      fill: none;
      stroke: var(--ti-accent);
      stroke-width: 1;
      stroke-opacity: 0.54;
      stroke-dasharray: 3 5;
    }
  }
  @media (min-width: 1320px) {
    .ti-section-pin {
      left: 124px;
      width: 190px;
      padding-left: 16px;
    }
    .ti-section-pin-title {
      font-size: 25px;
    }
    .ti-section-pin-stand {
      font-size: 16px;
    }
  }
  /* ---- FLIP morph: floating clone that animates from inline header
     position to the .ti-section-pin rail target. Created on the fly
     by SECTION_FLIP_JS; lives only for the duration of the animation. ---- */
  .ti-section-morph {
    position: fixed;
    top: 0;
    left: 0;
    z-index: 41;
    pointer-events: none;
    margin: 0;
    padding: 0;
    transform-origin: top left;
    will-change: transform, opacity;
    transition: transform 640ms cubic-bezier(0.65, 0, 0.32, 1),
                opacity 320ms ease;
  }
  .ti-section-morph .ti-section-numeral,
  .ti-section-morph .ti-section-h2,
  .ti-section-morph .ti-section-stand {
    margin: 0;
  }
  .ti-section-morph .ti-section-numeral { margin-bottom: 10px; }
  .ti-section-morph .ti-section-h2 { margin-bottom: 14px; }
  /* While a morph is in flight, mask the pin's snap-update by hiding
     its contents — the clone is the visible thing during the flight. */
  .ti-section-pin[data-flipping="true"] {
    opacity: 0 !important;
    transition: none;
  }
  @media (prefers-reduced-motion: reduce) {
    .ti-section-morph { transition: opacity 160ms ease; }
  }
  /* Bigger, breathier section break. Replaces the old tight ✦ rule with
     a long thin horizontal rule with the bullet centred, plus more
     vertical space. Magazine-length, not wiki-tight. */
  .ti-prose .ti-divider {
    color: var(--ti-fg-faint);
    text-align: center;
    font-size: 13px;
    margin: 96px auto 0;
    letter-spacing: 0;
    line-height: 1;
    opacity: 0.5;
    position: relative;
  }
  .ti-prose .ti-divider::before,
  .ti-prose .ti-divider::after {
    content: "";
    position: absolute;
    top: 50%;
    width: 32%;
    height: 1px;
    background: var(--ti-rule);
  }
  .ti-prose .ti-divider::before { left: 6%; }
  .ti-prose .ti-divider::after  { right: 6%; }
  /* The new ti-section block already supplies the post-heading whitespace,
     so we don't need a divider+eyebrow pair anymore. Hide the legacy
     eyebrow paragraph if a ti-section follows it. */
  .ti-prose .ti-eyebrow + .ti-section { margin-top: 32px; }

  /* ---- closing held beat ----
     ti-final is now a section-tall, centred, alone presentation. The
     reader scrolls into it and nothing competes. */
  .ti-prose .ti-final {
    display: grid;
    place-items: center;
    min-height: 60vh;
    margin: 96px 0 24px;
    padding: 24px;
    font-family: var(--ti-font-serif);
    font-style: italic;
    font-size: clamp(28px, 4vw, 44px);
    line-height: 1.18;
    text-align: center;
    color: var(--ti-fg);
    letter-spacing: -0.005em;
    text-wrap: balance;
    border-top: 1px solid var(--ti-rule);
  }
  @media (max-width: 480px) {
    .ti-prose .ti-final {
      min-height: 50vh;
      font-size: 24px;
      margin: 56px 0 16px;
      padding: 18px;
    }
  }

  /* ---- ADHD flowchart sticky scrolly ---- */
  .ti-flowchart-scrolly {
    display: block;
    margin: 72px auto;
    padding: 0 16px;
  }
  .af-scroll {
    display: grid;
    /* Three-column layout: graph rail (left) | prose (middle) | cartoon rail (right).
       Both rails are sticky and host the figure's panes after JS re-parents them.
       The figure itself is hidden in-place — only the panes are visible, in the rails. */
    grid-template-columns: minmax(280px, 0.32fr) minmax(0, 0.4fr) minmax(280px, 0.32fr);
    gap: 32px;
    align-items: start;
    max-width: 100%;
  }
  @media (min-width: 1200px) {
    .af-scroll {
      grid-template-columns: minmax(320px, 0.34fr) minmax(0, 0.36fr) minmax(320px, 0.34fr);
      gap: 48px;
    }
  }
  .af-graph-rail,
  .af-cartoon-rail {
    position: sticky;
    top: 8vh;
    height: 84vh;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 0;
    /* Naked rails — no border, padding, or background. */
    border: 0;
    padding: 0;
    background: transparent;
  }
  /* Re-parented panes fill the rail edge-to-edge. */
  .af-graph-rail > .af-svg-pane,
  .af-cartoon-rail > .af-cartoon-pane {
    width: 100%;
    height: 100%;
    min-height: 0;
    border: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
    padding: 0;
    margin: 0;
    border-radius: 0;
  }
  .af-graph-rail .af-svg-wrap,
  .af-graph-rail svg#af-svg {
    width: 100%;
    height: 100%;
    max-width: 100%;
  }
  .af-cartoon-rail .af-cartoon-stack,
  .af-cartoon-rail .af-cartoon-frame,
  .af-cartoon-rail .af-cartoon-frame img {
    width: 100%;
    height: 100%;
  }
  .af-cartoon-rail .af-cartoon-frame img {
    object-fit: contain;
  }
  /* Hide the figure's auto-advance hint, replay button, caption — scroll drives state. */
  .ti-flowchart-scrolly .af-controls { display: none; }
  .af-graph-rail .af-controls,
  .af-cartoon-rail .af-caption { display: none; }
  .af-scroll-prose {
    display: flex;
    flex-direction: column;
    gap: 0;
    min-width: 0;
  }
  .af-scroll-beat {
    min-height: 80vh;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 24px 0;
    opacity: 0.36;
    transition: opacity 280ms ease;
  }
  .af-scroll-beat.af-scroll-active {
    opacity: 1;
  }
  .af-scroll-beat-eyebrow {
    display: block;
    font-family: var(--ti-font-sans);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    color: var(--ti-accent);
    margin-bottom: 12px;
    font-weight: 600;
  }
  .af-scroll-beat p {
    margin: 0;
    font-family: var(--ti-font-serif);
    font-style: italic;
    font-size: 19px;
    line-height: 1.55;
    color: var(--ti-fg);
    max-width: 36ch;
  }
  /* The figure's own .af-stage container is kept in the DOM (so the IIFE
     keeps working) but rendered invisibly — its child panes have been moved
     out into the rails. */
  .af-scroll-stage {
    display: none;
  }
  /* Strip the bordered-card chrome from the figure when it's inside the scrolly. */
  .ti-flowchart-scrolly .af-frame {
    border: 0;
    padding: 0;
    background: transparent;
    box-shadow: none;
  }
  .ti-flowchart-scrolly .af-stepbar { display: none; }
  .ti-flowchart-scrolly .af-figure { padding: 0; margin: 0; }
  @media (max-width: 880px) {
    .af-scroll {
      grid-template-columns: 1fr;
      gap: 0;
    }
    .af-graph-rail,
    .af-cartoon-rail {
      position: relative;
      top: auto;
      height: 60vh;
      margin: 16px 0;
    }
    .af-scroll-beat { min-height: 0; padding: 16px 0; opacity: 1; }
  }

  /* ---- Orchestrator sticky scrolly (article 2) ---- */
  .ti-orch-scrolly {
    display: block;
    margin: 72px 0;
  }
  .ti-orch-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr);
    gap: 40px;
    align-items: start;
  }
  .ti-orch-stage {
    position: sticky;
    top: 10vh;
    height: 80vh;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .ti-orch-stage .ti-orch-figure {
    margin: 0;
    max-width: 520px;
    width: 100%;
  }
  .ti-orch-prose {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .ti-orch-beat {
    min-height: 70vh;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 16px 0;
    opacity: 0.5;
    transition: opacity 320ms ease;
  }
  .ti-orch-beat.af-scroll-active { opacity: 1; }
  .ti-orch-beat p {
    margin: 0;
    font-size: 19px;
    line-height: 1.6;
    max-width: 38ch;
  }
  @media (max-width: 880px) {
    .ti-orch-grid {
      grid-template-columns: 1fr;
      gap: 8px;
    }
    .ti-orch-stage {
      position: relative;
      top: auto;
      height: auto;
      margin: 24px 0;
    }
    .ti-orch-beat { min-height: 0; padding: 12px 0; opacity: 1; }
  }

  /* ---- Article-map sidebar ----
     Pen-and-ink, monochrome with a single cyan-teal active accent. Sticky
     to the left edge of the viewport, hidden on narrow screens. */
  .ti-map {
    position: fixed;
    top: 0;
    left: 0;
    width: 110px;
    height: 100vh;
    z-index: 40;
    pointer-events: none;          /* enable on children */
    color: var(--ti-fg-faint);
    user-select: none;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 12px 6px;
  }
  .ti-map[data-pin-active="true"] .ti-map-tooltip {
    opacity: 0;
  }
  .ti-map-svg {
    max-height: calc(100vh - 24px);
    max-width: 100%;
    height: auto;
    width: 100%;
    overflow: visible;
    pointer-events: auto;
    filter: drop-shadow(0 1px 2px rgba(0,0,0,0.18));
  }
  .ti-map-spine,
  .ti-map-edge {
    transition: stroke-opacity 180ms ease, stroke 180ms ease;
  }
  .ti-map-edge.ti-map-edge-active {
    stroke: var(--ti-accent);
    stroke-opacity: 0.75;
  }
  .ti-map-node {
    cursor: pointer;
    pointer-events: auto;
    outline: none;
  }
  .ti-map-dot {
    transition: r 180ms ease, fill 180ms ease, stroke 180ms ease, stroke-width 180ms ease;
    color: var(--ti-fg-faint);
  }
  .ti-map-node[data-state="visited"] .ti-map-dot {
    color: var(--ti-accent);
    stroke: var(--ti-accent);
    stroke-width: 1.2;
    r: 4.2;
    fill: var(--ti-bg);
  }
  .ti-map-node[data-state="active"] .ti-map-dot {
    color: var(--ti-accent);
    stroke: var(--ti-accent);
    stroke-width: 1.4;
    r: 5.6;
    fill: var(--ti-accent);
  }
  .ti-map-node:hover .ti-map-halo,
  .ti-map-node:focus-visible .ti-map-halo {
    stroke-opacity: 0.75;
    color: var(--ti-accent);
  }
  .ti-map-node[data-state="active"] .ti-map-halo {
    stroke-opacity: 0.55;
    color: var(--ti-accent);
  }
  .ti-map-tooltip {
    position: absolute;
    left: calc(100% + 8px);
    top: 0;
    transform: translateY(-50%);
    pointer-events: none;
    background: var(--ti-surface);
    color: var(--ti-fg);
    border: 1px solid var(--ti-border);
    border-radius: 6px;
    padding: 8px 11px;
    width: 230px;
    font-family: var(--ti-font-sans);
    font-size: 12.5px;
    line-height: 1.42;
    opacity: 0;
    transition: opacity 140ms ease;
    box-shadow: 0 10px 28px rgba(0,0,0,0.22);
    z-index: 41;
  }
  .ti-map-tooltip.ti-map-tooltip-on { opacity: 1; }
  .ti-map-tooltip-title {
    display: block;
    font-weight: 650;
    color: var(--ti-fg);
    margin-bottom: 3px;
    letter-spacing: 0;
  }
  .ti-map-tooltip-summary {
    display: block;
    color: var(--ti-fg-dim);
  }
  /* Hide on phones — reading on a phone you don't need a sidebar. */
  @media (max-width: 880px) {
    .ti-map { display: none; }
  }
  /* Slightly inset on smaller desktop screens so the map doesn't crowd the
     prose column. The body padding above already gives enough room. */
  @media (min-width: 881px) and (max-width: 1280px) {
    .ti-map { width: 88px; }
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


MAP_JS = r"""
(function () {
  // Article-map sidebar: IO-driven active node, click-to-scroll, hover tooltip.
  const map = document.querySelector('.ti-map');
  if (!map) return;

  const dataNode = map.querySelector('script.ti-map-data');
  const NODE_DATA = dataNode ? (function () {
    try { return JSON.parse(dataNode.textContent || '{}'); }
    catch (e) { return {}; }
  })() : {};

  const nodes  = Array.from(map.querySelectorAll('.ti-map-node'));
  const edges  = Array.from(map.querySelectorAll('.ti-map-edge'));
  const tooltip = map.querySelector('.ti-map-tooltip');
  const tipTitle = tooltip ? tooltip.querySelector('.ti-map-tooltip-title') : null;
  const tipSummary = tooltip ? tooltip.querySelector('.ti-map-tooltip-summary') : null;
  const sectionPin = document.querySelector('.ti-section-pin');
  const sectionPinNumeral = sectionPin ? sectionPin.querySelector('.ti-section-pin-numeral') : null;
  const sectionPinTitle = sectionPin ? sectionPin.querySelector('.ti-section-pin-title') : null;
  const sectionPinStand = sectionPin ? sectionPin.querySelector('.ti-section-pin-stand') : null;
  const linkLine = document.querySelector('.ti-section-linkline');
  const linkPath = linkLine ? linkLine.querySelector('path') : null;

  // Article-map node ids in scroll order — populated by document order of
  // section anchors with [data-node-id]. Lets us mark visited ids when
  // scrolling past.
  const SECTION_TARGETS = Array.from(
    document.querySelectorAll('.ti-anchor[data-node-id], .ti-section[data-node-id]')
  );

  // Click any node → smooth-scroll its target into view.
  nodes.forEach(g => {
    const id = g.getAttribute('data-node-id');
    g.addEventListener('click', () => {
      const target = document.getElementById(id);
      if (!target) return;
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    g.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        g.dispatchEvent(new Event('click'));
      }
    });
    // Hover tooltip
    g.addEventListener('mouseenter', () => showTooltip(id, g));
    g.addEventListener('focus',      () => showTooltip(id, g));
    g.addEventListener('mouseleave', hideTooltip);
    g.addEventListener('blur',       hideTooltip);
  });

  function showTooltip(id, anchorEl) {
    if (!tooltip || !tipTitle || !tipSummary) return;
    const data = NODE_DATA[id];
    if (!data) return;
    tipTitle.textContent = data.title || '';
    tipSummary.textContent = data.summary || '';
    // Position vertically aligned with the node on the spine.
    const dot = anchorEl.querySelector('.ti-map-dot');
    if (dot) {
      const mapBox = map.getBoundingClientRect();
      const dotBox = dot.getBoundingClientRect();
      const top = dotBox.top + dotBox.height / 2 - mapBox.top;
      tooltip.style.top = top + 'px';
    }
    tooltip.classList.add('ti-map-tooltip-on');
    tooltip.setAttribute('aria-hidden', 'false');
  }
  function hideTooltip() {
    if (!tooltip) return;
    tooltip.classList.remove('ti-map-tooltip-on');
    tooltip.setAttribute('aria-hidden', 'true');
  }

  // Track the active section. Nodes that have *been* active stay 'visited'
  // even after the reader scrolls past them.
  const visited = new Set();
  let activeId = null;

  function isWideLocator() {
    return window.matchMedia('(min-width: 1180px)').matches;
  }

  function pageTop(el) {
    return el.getBoundingClientRect().top + (window.scrollY || document.documentElement.scrollTop || 0);
  }

  function getSectionInfo(id) {
    const target = id ? document.getElementById(id) : null;
    if (!target || !target.classList.contains('ti-section')) return null;
    return {
      target,
      numeral: (target.querySelector('.ti-section-numeral') || {}).textContent || '',
      title: (target.querySelector('.ti-section-h2') || {}).textContent || '',
      stand: (target.querySelector('.ti-section-stand') || {}).textContent || '',
    };
  }

  function getNextSectionTarget(target) {
    const sections = SECTION_TARGETS.filter(el => el.classList && el.classList.contains('ti-section'));
    const idx = sections.indexOf(target);
    return idx >= 0 ? sections[idx + 1] || null : null;
  }

  function updateSectionLocator() {
    if (!sectionPin || !linkLine || !linkPath) return;
    // NOTE: FLIP module (SECTION_FLIP_JS) owns pin content + data-visible.
    // Here we only mirror the linkline visibility off the pin's state and
    // recompute the curve geometry. Don't touch sectionPin.dataset.visible
    // or its text — that races with the FLIP morph.
    const wide = isWideLocator();
    const info = getSectionInfo(activeId);
    const visible = wide && info && sectionPin.dataset.visible === 'true';
    linkLine.dataset.visible = visible ? 'true' : 'false';
    map.dataset.pinActive = visible ? 'true' : 'false';
    if (!visible) return;

    const activeNode = nodes.find(g => g.getAttribute('data-node-id') === activeId);
    const dot = activeNode ? activeNode.querySelector('.ti-map-dot') : null;
    if (!dot) return;
    const dotBox = dot.getBoundingClientRect();
    const pinBox = sectionPin.getBoundingClientRect();
    const x1 = dotBox.left + dotBox.width / 2;
    const y1 = dotBox.top + dotBox.height / 2;
    const x2 = pinBox.left;
    const y2 = pinBox.top + Math.min(84, pinBox.height * 0.36);
    linkLine.setAttribute('viewBox', `0 0 ${window.innerWidth} ${window.innerHeight}`);
    linkPath.setAttribute('d', `M ${x1} ${y1} C ${x1 + 34} ${y1}, ${x2 - 42} ${y2}, ${x2} ${y2}`);
  }

  function setActive(id) {
    if (id === activeId) return;
    activeId = id;
    if (id) visited.add(id);
    nodes.forEach(g => {
      const nid = g.getAttribute('data-node-id');
      if (nid === id) {
        g.setAttribute('data-state', 'active');
      } else if (visited.has(nid)) {
        g.setAttribute('data-state', 'visited');
      } else {
        g.removeAttribute('data-state');
      }
    });
    // Light up edges that touch the active node.
    edges.forEach(e => {
      const a = e.getAttribute('data-edge-from');
      const b = e.getAttribute('data-edge-to');
      e.classList.toggle('ti-map-edge-active', a === id || b === id);
    });
    updateSectionLocator();
  }

  function updateActiveFromScroll() {
    const y = (window.scrollY || document.documentElement.scrollTop || 0) + 140;
    let best = SECTION_TARGETS[0] || null;
    SECTION_TARGETS.forEach(t => {
      if (pageTop(t) <= y) best = t;
    });
    if (best) setActive(best.getAttribute('data-node-id'));
    updateSectionLocator();
  }

  // IO: pick the section whose top is currently nearest the viewport's
  // upper third. We observe each anchor and recompute on intersect; cheap
  // and stable.
  if ('IntersectionObserver' in window) {
    const seen = new Map();
    const io = new IntersectionObserver(entries => {
      entries.forEach(en => {
        seen.set(en.target, en.isIntersecting ? en.intersectionRatio : 0);
      });
      // Pick the most-intersecting target.
      let best = null;
      let bestRatio = 0;
      seen.forEach((ratio, el) => {
        if (ratio > bestRatio) { best = el; bestRatio = ratio; }
      });
      if (best) {
        const id = best.getAttribute('data-node-id');
        if (id) setActive(id);
      }
    }, { rootMargin: '-30% 0px -50% 0px', threshold: [0, 0.05, 0.25, 0.5, 1] });
    SECTION_TARGETS.forEach(t => io.observe(t));
  } else {
    // Fallback: pick the anchor closest to the top of the viewport on scroll.
    const onScroll = () => {
      let best = null;
      let bestDist = Infinity;
      SECTION_TARGETS.forEach(t => {
        const r = t.getBoundingClientRect();
        const d = Math.abs(r.top - 80);
        if (r.top < window.innerHeight && d < bestDist) {
          best = t; bestDist = d;
        }
      });
      if (best) setActive(best.getAttribute('data-node-id'));
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  let sectionRaf = 0;
  window.addEventListener('scroll', () => {
    if (sectionRaf) return;
    sectionRaf = requestAnimationFrame(() => {
      sectionRaf = 0;
      updateActiveFromScroll();
    });
  }, { passive: true });
  window.addEventListener('resize', updateSectionLocator);
  updateActiveFromScroll();
})();
"""


SECTION_FLIP_JS = r"""
(function () {
  // Guardian/NYT-style FLIP morph: when an inline section header scrolls
  // off the top of the viewport, spawn a position:fixed clone of the
  // numeral + h2 + stand-first triple and animate it (transform-only)
  // from the inline source rect to the left-rail .ti-section-pin
  // target rect. The pin itself is the source of truth for the settled
  // rail content — the clone just masks the snap.
  const sections = Array.from(document.querySelectorAll('.ti-section'));
  const pin = document.querySelector('.ti-section-pin');
  if (!sections.length || !pin) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const wideMQ = window.matchMedia('(min-width: 1180px)');

  let pinnedSection = null;
  let lastClone = null;

  function isWide() { return wideMQ.matches; }

  function pickSourceParts(section) {
    // Defensive: if Agent B has replaced the H2 with .ti-thread-logo,
    // the H2 may be empty — bail out gracefully.
    const numeral = section.querySelector('.ti-section-numeral');
    const h2      = section.querySelector('.ti-section-h2');
    const stand   = section.querySelector('.ti-section-stand');
    if (!h2) return null;
    const h2Text = (h2.textContent || '').trim();
    if (!h2Text) return null; // empty H2 — let other systems own it
    return { numeral, h2, stand };
  }

  function unionRect(els) {
    let top = Infinity, left = Infinity, right = -Infinity, bottom = -Infinity;
    let any = false;
    els.forEach(el => {
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return;
      top = Math.min(top, r.top);
      left = Math.min(left, r.left);
      right = Math.max(right, r.right);
      bottom = Math.max(bottom, r.bottom);
      any = true;
    });
    if (!any) return null;
    return { top, left, width: right - left, height: bottom - top };
  }

  function applyPinContent(section) {
    const numeralEl = pin.querySelector('.ti-section-pin-numeral');
    const titleEl   = pin.querySelector('.ti-section-pin-title');
    const standEl   = pin.querySelector('.ti-section-pin-stand');
    const num   = section.querySelector('.ti-section-numeral');
    const h2    = section.querySelector('.ti-section-h2');
    const stand = section.querySelector('.ti-section-stand');
    if (numeralEl) numeralEl.textContent = num   ? num.textContent   : '';
    if (titleEl)   titleEl.textContent   = h2    ? h2.textContent    : '';
    if (standEl)   standEl.textContent   = stand ? stand.textContent : '';
  }

  function buildClone(parts) {
    // Clone text content into a fresh wrapper so we can FLIP all three
    // elements as a single transform target. Inherits styling from
    // .ti-prose so the inline-state typography matches the source.
    const wrap = document.createElement('div');
    wrap.className = 'ti-section-morph ti-prose';
    if (parts.numeral) {
      const n = document.createElement('span');
      n.className = 'ti-section-numeral';
      n.textContent = parts.numeral.textContent || '';
      wrap.appendChild(n);
    }
    const h = document.createElement('h2');
    h.className = 'ti-section-h2';
    h.textContent = parts.h2.textContent || '';
    wrap.appendChild(h);
    if (parts.stand) {
      const s = document.createElement('p');
      s.className = 'ti-section-stand';
      s.textContent = parts.stand.textContent || '';
      wrap.appendChild(s);
    }
    return wrap;
  }

  function morph(section) {
    if (!isWide()) {
      applyPinContent(section);
      return;
    }
    const parts = pickSourceParts(section);
    if (!parts) return; // Agent B's logo section: gracefully no-op.

    pin.removeAttribute('data-flipping');
    applyPinContent(section);
    pin.dataset.visible = 'true';
    const sourceRect = unionRect([parts.numeral, parts.h2, parts.stand]);
    const targetRect = pin.getBoundingClientRect();
    if (!sourceRect || targetRect.width === 0) return;

    if (reduceMotion) {
      pin.dataset.visible = 'true';
      return;
    }

    // Canonical FLIP: paint the clone at the *target* rect, transform
    // it back to the *source* rect, then animate transform → identity.
    const dx = sourceRect.left - targetRect.left;
    const dy = sourceRect.top  - targetRect.top;
    const scale = sourceRect.width / Math.max(1, targetRect.width);

    pin.dataset.flipping = 'true';

    const clone = buildClone(parts);
    clone.style.left   = targetRect.left + 'px';
    clone.style.top    = targetRect.top  + 'px';
    clone.style.width  = targetRect.width + 'px';
    clone.style.opacity = '1';
    clone.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;
    document.body.appendChild(clone);

    if (lastClone && lastClone !== clone && lastClone.parentNode) {
      lastClone.parentNode.removeChild(lastClone);
    }
    lastClone = clone;

    void clone.offsetWidth;
    requestAnimationFrame(() => {
      clone.style.transform = 'translate(0, 0) scale(1)';
    });

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      pin.removeAttribute('data-flipping');
      pin.dataset.visible = 'true';
      if (clone.parentNode) clone.parentNode.removeChild(clone);
      if (lastClone === clone) lastClone = null;
    };
    clone.addEventListener('transitionend', finish, { once: true });
    setTimeout(finish, 900);
  }

  function setPinnedSection(section) {
    if (section === pinnedSection) return;
    pinnedSection = section;
    if (!section) {
      pin.removeAttribute('data-flipping');
      pin.dataset.visible = 'false';
      if (lastClone && lastClone.parentNode) {
        lastClone.parentNode.removeChild(lastClone);
        lastClone = null;
      }
      return;
    }
    morph(section);
  }

  function currentPinnedFromScroll() {
    // The "pinned" section is the last .ti-section whose top has crossed
    // the viewport top. If none have, no rail.
    let candidate = null;
    for (let i = 0; i < sections.length; i++) {
      const r = sections[i].getBoundingClientRect();
      if (r.top <= 4) candidate = sections[i];
      else break;
    }
    return candidate;
  }

  // IntersectionObserver: rootMargin -100% bottom => fires the moment a
  // section's top crosses the viewport top, in either direction.
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(() => {
      const next = currentPinnedFromScroll();
      if (next !== pinnedSection) setPinnedSection(next);
    }, { rootMargin: '0px 0px -100% 0px', threshold: [0, 1] });
    sections.forEach(s => io.observe(s));
  }

  window.addEventListener('resize', () => {
    const next = currentPinnedFromScroll();
    if (next === pinnedSection) return;
    pinnedSection = next;
    if (next) applyPinContent(next);
    pin.dataset.visible = (isWide() && next) ? 'true' : 'false';
  });

  // First paint: if the user lands mid-article, settle the pin without
  // animating.
  const initial = currentPinnedFromScroll();
  if (initial) {
    pinnedSection = initial;
    applyPinContent(initial);
    if (isWide()) pin.dataset.visible = 'true';
  }
})();
"""


FLOWCHART_SCROLLY_JS = r"""
(function () {
  // Replace the ADHD flowchart's auto-advance loop with scroll-driven
  // state: the figure becomes a sticky stage; eight prose beats sit
  // beside it; whichever beat is in the reader's band drives goToStep.
  const wrap = document.querySelector('.ti-flowchart-scrolly');
  if (!wrap) return;

  // Wait until AdhdFlowchart has booted (it's loaded after this script in
  // the document, so we poll briefly).
  function whenReady(cb, tries) {
    if (window.AdhdFlowchart && typeof window.AdhdFlowchart.goToStep === 'function') {
      cb(window.AdhdFlowchart);
      return;
    }
    if ((tries || 0) > 80) return;
    setTimeout(() => whenReady(cb, (tries || 0) + 1), 60);
  }

  // The figure now exposes disableAutoAdvance() — call it the moment
  // the API is ready so the internal timer is killed before the
  // article scroll-driver takes over.
  whenReady(api => {
    if (typeof api.disableAutoAdvance === 'function') {
      api.disableAutoAdvance();
    }
    const HINT = wrap.querySelector('#af-hint');
    if (HINT) HINT.textContent = 'scroll to advance';

    // Re-parent the figure's panes into the left/right rails so the
    // layout is graph | prose | cartoon. The figure's own .af-stage
    // stays in the DOM (hidden via CSS) so the IIFE's references to
    // these nodes still resolve — we're just moving the same DOM nodes,
    // so api.goToStep(n) class mutations still target the visible ones.
    const graphRail   = wrap.querySelector('#af-graph-rail');
    const cartoonRail = wrap.querySelector('#af-cartoon-rail');
    const svgPane     = wrap.querySelector('.af-svg-pane');
    const cartoonPane = wrap.querySelector('.af-cartoon-pane');
    if (graphRail && svgPane && svgPane.parentNode !== graphRail) {
      graphRail.appendChild(svgPane);
    }
    if (cartoonRail && cartoonPane && cartoonPane.parentNode !== cartoonRail) {
      cartoonRail.appendChild(cartoonPane);
    }

    const beats = Array.from(wrap.querySelectorAll('.af-scroll-beat'));
    if (!beats.length) return;

    function setActive(idx) {
      beats.forEach((b, i) => {
        b.classList.toggle('af-scroll-active', i === idx);
      });
      const step = parseInt(beats[idx].dataset.afStep, 10) || (idx + 1);
      try { api.goToStep(step, true); } catch (e) {}
    }

    if ('IntersectionObserver' in window) {
      const visible = new Map();
      const io = new IntersectionObserver(entries => {
        entries.forEach(en => {
          visible.set(en.target, en.isIntersecting ? en.intersectionRatio : 0);
        });
        let bestIdx = -1;
        let bestRatio = 0;
        beats.forEach((b, i) => {
          const r = visible.get(b) || 0;
          if (r > bestRatio) { bestIdx = i; bestRatio = r; }
        });
        if (bestIdx >= 0) setActive(bestIdx);
      }, { rootMargin: '-40% 0px -40% 0px', threshold: [0, 0.25, 0.5, 0.75, 1] });
      beats.forEach(b => io.observe(b));
    } else {
      // Fallback: first beat.
      setActive(0);
    }
  });
})();
"""


ORCH_SCROLLY_JS = r"""
(function () {
  // Mark the active orchestrator-scrolly beat as the reader scrolls.
  // Visual only — the figure itself is plain HTML.
  const wrap = document.querySelector('.ti-orch-scrolly');
  if (!wrap) return;
  const beats = Array.from(wrap.querySelectorAll('.ti-orch-beat'));
  if (!beats.length) return;

  if ('IntersectionObserver' in window) {
    const visible = new Map();
    const io = new IntersectionObserver(entries => {
      entries.forEach(en => {
        visible.set(en.target, en.isIntersecting ? en.intersectionRatio : 0);
      });
      let bestIdx = -1;
      let bestRatio = 0;
      beats.forEach((b, i) => {
        const r = visible.get(b) || 0;
        if (r > bestRatio) { bestIdx = i; bestRatio = r; }
      });
      beats.forEach((b, i) => b.classList.toggle('af-scroll-active', i === bestIdx));
    }, { rootMargin: '-35% 0px -45% 0px', threshold: [0, 0.25, 0.5, 0.75, 1] });
    beats.forEach(b => io.observe(b));
  } else {
    beats.forEach(b => b.classList.add('af-scroll-active'));
  }
})();
"""


PROGRESS_JS = r"""
(function () {
  // Scroll-progress bar — width tracks how far through the article you are.
  document.documentElement.classList.add('ti-js');
  const bar = document.querySelector('.ti-progress');
  function update() {
    if (!bar) return;
    const h = document.documentElement;
    const max = (h.scrollHeight - h.clientHeight) || 1;
    const r = Math.max(0, Math.min(1, h.scrollTop / max));
    bar.style.transform = 'scaleX(' + r + ')';
  }
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
  update();

  const revealTargets = [
    ...document.querySelectorAll('.ti-figure:not(.ti-figure-milp), .ti-demo, .ti-flat-view, .ti-ask-the-plot, .ti-data-black-market, .ti-twenty-years')
  ];
  revealTargets.forEach(el => el.classList.add('ti-reveal'));

  if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const seen = new WeakSet();
    const io = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        const el = entry.target;
        if (entry.isIntersecting) {
          el.classList.add('ti-inview');
          el.classList.remove('ti-dimmed');
          seen.add(el);
        } else if (seen.has(el)) {
          el.classList.remove('ti-inview');
          el.classList.add('ti-dimmed');
        }
      });
    }, { threshold: [0.18, 0.56], rootMargin: '-8% 0px -12% 0px' });
    revealTargets.forEach(el => io.observe(el));
  } else {
    revealTargets.forEach(el => el.classList.add('ti-inview'));
  }

  const epiquotes = Array.from(document.querySelectorAll('.ti-epiquote'));
  if (epiquotes.length) {
    const visualSelector = [
      '.ti-figure',
      '.ti-demo',
      '.ti-flat-view',
      '.ti-ask-the-plot',
      '.ti-data-black-market',
      '.ti-twenty-years',
      '.ti-what-changed',
      '.ti-figure-vera'
    ].join(', ');

    const getNext = (el, selector) => {
      let node = el.nextElementSibling;
      while (node) {
        if (node.matches && node.matches(selector)) return node;
        node = node.nextElementSibling;
      }
      return null;
    };

    const updateEpiquotes = () => {
      const wide = window.matchMedia('(min-width: 1320px)').matches;
      epiquotes.forEach(quote => {
        if (!wide) {
          quote.classList.remove('ti-epiquote-suppressed');
          return;
        }
        const nextVisual = getNext(quote, visualSelector);
        const nextDivider = getNext(quote, '.ti-divider');
        const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
        const quoteStart = quote.offsetTop - 126;
        const visualLead = Math.min(480, Math.max(340, window.innerHeight * 0.52));
        const visualStop = nextVisual ? nextVisual.offsetTop - visualLead : Infinity;
        const sectionStop = nextDivider ? nextDivider.offsetTop - 220 : Infinity;
        const stop = Math.min(visualStop, sectionStop);
        quote.classList.toggle('ti-epiquote-suppressed', scrollY > stop && scrollY > quoteStart);
      });
    };
    window.addEventListener('scroll', updateEpiquotes, { passive: true });
    window.addEventListener('resize', updateEpiquotes);
    updateEpiquotes();
  }
})();

// ---------------------------------------------------------------------------
// Cinematic "Thread" logotype (article 1, section 5).
//
// Builds an inline SVG inside #ti-thread-logo that draws the word "Thread"
// letter-by-letter as a thin black thread sweeps across the page from left
// to right. After the letters fill in, the thread loops down and settles as
// a hairline rule under the word — the final state is a clean black-on-white
// wordmark that persists.
//
// Triggered ONCE per viewport-entry via IntersectionObserver (threshold 0.4).
// prefers-reduced-motion users get the final state directly, no animation.
// ---------------------------------------------------------------------------
(function () {
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const WORD = 'Thread';

  function buildLogo(host) {
    if (!host || host.dataset.threadLogoBuilt === '1') return;
    host.dataset.threadLogoBuilt = '1';

    // Reduced-motion: skip the build animation, paint the rest state.
    const reduced = window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // viewBox is wide so the thread has room to enter from the left and
    // loop under the word on exit. Y baseline at 105 leaves headroom for
    // the swept-line preamble and a comfortable underline below.
    const VB_W = 600;
    const VB_H = 200;
    const BASELINE = 122;
    const FONT_SIZE = 96; // px in viewBox space — display weight

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + VB_W + ' ' + VB_H);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Thread');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    // Hidden measuring text — we use getComputedTextLength on a single full
    // word render to find each letter's x-position. We then create one
    // <text> element per letter for independent dash/delay animation.
    const probe = document.createElementNS(SVG_NS, 'text');
    probe.setAttribute('x', '0');
    probe.setAttribute('y', BASELINE);
    probe.setAttribute('font-family', 'Source Serif 4, Source Serif Pro, Georgia, "Times New Roman", serif');
    probe.setAttribute('font-size', FONT_SIZE);
    probe.setAttribute('font-weight', '600');
    probe.setAttribute('letter-spacing', '0');
    probe.setAttribute('fill', 'transparent');
    probe.setAttribute('visibility', 'hidden');
    probe.textContent = WORD;
    svg.appendChild(probe);

    // Append SVG to host so getComputedTextLength works (needs layout).
    host.appendChild(svg);

    // Measure cumulative widths of each prefix to find letter centres.
    const prefixWidths = [0];
    for (let i = 1; i <= WORD.length; i++) {
      const p = document.createElementNS(SVG_NS, 'text');
      p.setAttribute('x', '0');
      p.setAttribute('y', BASELINE);
      p.setAttribute('font-family', 'Source Serif 4, Source Serif Pro, Georgia, "Times New Roman", serif');
      p.setAttribute('font-size', FONT_SIZE);
      p.setAttribute('font-weight', '600');
      p.setAttribute('fill', 'transparent');
      p.setAttribute('visibility', 'hidden');
      p.textContent = WORD.substring(0, i);
      svg.appendChild(p);
      prefixWidths.push(p.getComputedTextLength());
      svg.removeChild(p);
    }
    const totalW = prefixWidths[prefixWidths.length - 1];

    // Centre the word in the viewBox.
    const xStart = (VB_W - totalW) / 2;

    // The sweeping thread path: enters left, gentle dip down, climbs to the
    // baseline midline, exits right, then a second segment that loops down
    // and becomes the underline rule. We separate them for control: one
    // <path> for the sweep, one <line> for the persistent rule.
    const lineY = BASELINE - FONT_SIZE * 0.42; // approx mid-x-height
    const sweep = document.createElementNS(SVG_NS, 'path');
    const dipY = lineY + 6;
    const sweepD = [
      'M', -20, dipY,
      'C', xStart * 0.4, dipY - 4, xStart * 0.7, lineY, xStart - 8, lineY,
      'L', xStart + totalW + 8, lineY,
      'C', VB_W - xStart * 0.5, lineY, VB_W - xStart * 0.3, dipY - 6, VB_W + 20, dipY
    ].join(' ');
    sweep.setAttribute('d', sweepD);
    sweep.setAttribute('class', 'ti-thread-line');
    svg.appendChild(sweep);
    const sweepLen = Math.ceil(sweep.getTotalLength());
    sweep.style.setProperty('--line-len', sweepLen);

    // Per-letter <text> elements. Each starts as a stroked outline (drawn
    // via dashoffset) then fills to currentColor.
    const ruleY = BASELINE + 18;
    const totalSweepMs = 1500;
    const letterEls = [];
    for (let i = 0; i < WORD.length; i++) {
      const t = document.createElementNS(SVG_NS, 'text');
      t.setAttribute('x', xStart + prefixWidths[i]);
      t.setAttribute('y', BASELINE);
      t.setAttribute('font-family', 'Source Serif 4, Source Serif Pro, Georgia, "Times New Roman", serif');
      t.setAttribute('font-size', FONT_SIZE);
      t.setAttribute('font-weight', '600');
      t.setAttribute('class', 'ti-thread-letter');
      t.textContent = WORD[i];
      svg.appendChild(t);
      // Heuristic dash length; serif glyphs at 96px settle around 320-520.
      const dashLen = Math.max(320, Math.ceil(FONT_SIZE * 4.2));
      t.style.setProperty('--len', dashLen);
      // Per-letter delay synced to where the thread crosses each letter's
      // centre. The sweep goes 0 -> 72% over totalSweepMs, then fades.
      const letterCentre = xStart + (prefixWidths[i] + prefixWidths[i + 1]) / 2;
      const sweepProgress = Math.min(1, Math.max(0, (letterCentre + 20) / (VB_W + 40)));
      const drawDelay = Math.round(sweepProgress * totalSweepMs * 0.72);
      const fillDelay = drawDelay + 580; // letter starts to fill ~near end of its draw
      t.style.setProperty('--d-draw', drawDelay + 'ms');
      t.style.setProperty('--d-fill', fillDelay + 'ms');
      letterEls.push(t);
    }

    // Persistent underline rule (a thin hairline that draws last and stays).
    const rule = document.createElementNS(SVG_NS, 'line');
    rule.setAttribute('x1', xStart - 4);
    rule.setAttribute('y1', ruleY);
    rule.setAttribute('x2', xStart + totalW + 4);
    rule.setAttribute('y2', ruleY);
    rule.setAttribute('class', 'ti-thread-rule');
    const ruleLen = Math.ceil(totalW + 8);
    rule.style.setProperty('--rule-len', ruleLen);
    svg.appendChild(rule);

    // Remove probe — done with it.
    if (probe.parentNode) probe.parentNode.removeChild(probe);

    if (reduced) {
      host.classList.add('ti-thread-logo-rest');
      return host;
    }

    return host;
  }

  function play(host) {
    if (!host) return;
    host.classList.remove('ti-thread-logo-rest');
    // Reset animations by force-reflow.
    host.classList.remove('ti-thread-logo-play');
    void host.offsetWidth;
    host.classList.add('ti-thread-logo-play');
    // After the full cycle, lock to rest state so it persists cleanly even
    // if styles re-evaluate.
    const totalMs = 2050;
    window.setTimeout(function () {
      host.classList.add('ti-thread-logo-rest');
    }, totalMs);
  }

  function init() {
    const host = document.getElementById('ti-thread-logo');
    if (!host) return;
    buildLogo(host);

    const reduced = window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || !('IntersectionObserver' in window)) {
      host.classList.add('ti-thread-logo-rest');
      return;
    }

    let inView = false;
    const io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.4) {
          if (!inView) {
            inView = true;
            play(host);
          }
        } else if (entry.intersectionRatio < 0.05) {
          // Once the section is fully out of view, arm for replay.
          inView = false;
        }
      });
    }, { threshold: [0, 0.05, 0.4, 0.6] });
    io.observe(host);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
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

{library_tags}

<style>{article_css}</style>
<style>{globe_css}</style>
<style>{flowchart_css}</style>
<style>{atomic_css}</style>
<style>{pv_css}</style>
<style>{dbm_css}</style>
<style>{fv_css}</style>
<style>{va_css}</style>
<style>{atp_css}</style>
<style>{wc_css}</style>
<style>{ty_css}</style>
</head>
<body>
<a href="#ti-main" class="ti-skip-link">Skip to article</a>
<div class="ti-progress" aria-hidden="true"></div>

{article_map}
<aside class="ti-section-pin" aria-hidden="true">
  <span class="ti-section-pin-numeral"></span>
  <p class="ti-section-pin-title"></p>
  <p class="ti-section-pin-stand"></p>
</aside>
<svg class="ti-section-linkline" aria-hidden="true">
  <path></path>
</svg>

<div class="ti-page">

  <header class="ti-mast ti-narrow" role="banner">
    <span class="ti-mast-brand"><a href="/">Aeronauty</a> &middot; <a href="/">Harry Smith</a></span>
    <span class="ti-mast-meta"><time datetime="2026-05">May 2026</time> &middot; ~25 min read</span>
  </header>

  <section class="ti-hero ti-hero-cinematic" aria-labelledby="ti-title">
    <div class="ti-hero-media" aria-hidden="true">
      <video src="figures/paradigm-globe-pan.mp4" autoplay muted loop playsinline preload="metadata"></video>
    </div>
    <div class="ti-hero-shade" aria-hidden="true"></div>
    <div class="ti-hero-copy">
      <p class="ti-hero-eyebrow">Aeronauty &middot; Harry Smith</p>
      <h1 id="ti-title">{title}</h1>
      <p class="ti-hero-kicker">A story about refusing to flatten engineering work into screenshots, spreadsheets, and human memory.</p>
    </div>
    <div class="ti-scroll-cue" aria-hidden="true">Scroll</div>
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
<script>{wc_js}</script>
<script>{ty_js}</script>
<script>{flowchart_scrolly_js}</script>
<script>{orch_scrolly_js}</script>
<script>{map_js}</script>
<script>{section_flip_js}</script>

</body>
</html>
"""


def marker_present(html: str, kind: str, name: str | None = None) -> bool:
    if kind == "demo":
        return "[INTERACTIVE DEMO:" in html
    if name is None:
        return False
    return f"[{kind}: {name}]" in html or f"[{kind}:{name}]" in html


def required_library_tags(needs: dict[str, bool]) -> str:
    tags: list[str] = []
    if needs["globe"]:
        tags.extend([
            '<!-- Globe + chart libraries for the airport-upgrade demo -->',
            '<script src="https://unpkg.com/d3@7"></script>',
            '<script src="https://unpkg.com/topojson-client@3"></script>',
            '<script src="https://unpkg.com/globe.gl"></script>',
        ])
    if needs["flowchart"]:
        tags.extend([
            '<!-- rough.js for the hand-drawn ADHD flowchart -->',
            '<script src="https://unpkg.com/roughjs@4.6.6/bundled/rough.js"></script>',
        ])
    if needs["milp"]:
        tags.extend([
            '<!-- KaTeX (math typesetting for the MILP block) -->',
            '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css" crossorigin="anonymous" />',
            '<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js" crossorigin="anonymous"></script>',
            '<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js" crossorigin="anonymous"',
            '  onload="renderMathInElement(document.body, {delimiters: [{left: \'$$\', right: \'$$\', display: true}, {left: \'$\', right: \'$\', display: false}], throwOnError: false});"></script>',
        ])
    return "\n".join(tags)


def main() -> None:
    print("Reading prose...")
    prose_html, page_title = render_prose()

    needs = {
        "globe": marker_present(prose_html, "demo"),
        "flowchart": marker_present(prose_html, "FIGURE", "subverted-adhd-flowchart"),
        "atomic": marker_present(prose_html, "FIGURE", "atomic-row"),
        "flat_view": marker_present(prose_html, "FIGURE", "flat-view"),
        "vera": marker_present(prose_html, "FIGURE", "vera-applet"),
        "plotly_vs_pp": marker_present(prose_html, "FIGURE", "plotly-vs-powerpoint"),
        "data_black_market": marker_present(prose_html, "FIGURE", "data-black-market"),
        "ask_the_plot": marker_present(prose_html, "FIGURE", "ask-the-plot"),
        "what_changed": marker_present(prose_html, "FIGURE", "what-changed"),
        "twenty_years": marker_present(prose_html, "FIGURE", "twenty-years"),
        "milp": marker_present(prose_html, "FIGURE", "milp-equations"),
    }

    globe_css = globe_js = globe_struct = ""
    flow_css = flow_js = flow_struct = ""
    atomic_css = atomic_js = atomic_struct = ""
    fv_css = fv_js = fv_struct = ""
    va_css = va_js = va_struct = ""
    pv_css = pv_js = pv_struct = ""
    dbm_css = dbm_js = dbm_struct = ""
    atp_css = atp_js = atp_struct = ""
    wc_css  = wc_js  = wc_struct  = ""
    ty_css  = ty_js  = ty_struct  = ""

    if needs["globe"]:
        print("Extracting globe demo assets...")
        globe_css, globe_js, globe_struct = globe_assets()

    if needs["flowchart"]:
        print("Extracting flowchart assets...")
        flow_css, flow_js, flow_struct = flowchart_assets()

    if needs["atomic"]:
        print("Extracting atomic-row assets...")
        atomic_css, atomic_js, atomic_struct = atomic_row_assets()

    if needs["flat_view"]:
        print("Extracting flat-view assets...")
        fv_css, fv_js, fv_struct = flat_view_assets()

    if needs["vera"]:
        print("Extracting vera-applet assets...")
        va_css, va_js, va_struct = vera_applet_assets()

    if needs["plotly_vs_pp"]:
        print("Extracting plotly-vs-powerpoint assets...")
        pv_css, pv_js, pv_struct = plotly_vs_pp_assets()

    if needs["data_black_market"]:
        print("Extracting data-black-market assets...")
        dbm_css, dbm_js, dbm_struct = data_black_market_assets()

    if needs["ask_the_plot"]:
        print("Extracting ask-the-plot assets...")
        atp_css, atp_js, atp_struct = ask_the_plot_assets()

    if needs["what_changed"]:
        print("Extracting what-changed assets...")
        wc_css, wc_js, wc_struct = what_changed_assets()

    if needs["twenty_years"]:
        print("Extracting twenty-years assets...")
        ty_css, ty_js, ty_struct = twenty_years_assets()

    print("Substituting placeholders...")
    prose_html = substitute_asides(prose_html)
    prose_html = substitute_callouts(prose_html)
    prose_html = substitute_excel_solari_video(prose_html)
    prose_html = substitute_homer(prose_html)
    if needs["plotly_vs_pp"]:
        prose_html = substitute_plotly_vs_pp(prose_html, pv_struct)
    if needs["globe"]:
        prose_html = substitute_demo(prose_html, globe_struct)
    if needs["flowchart"]:
        prose_html = substitute_flowchart(prose_html, flow_struct)
    if needs["atomic"]:
        prose_html = substitute_atomic_row(prose_html, atomic_struct)
    if needs["data_black_market"]:
        prose_html = substitute_data_black_market(prose_html, dbm_struct)
    if needs["flat_view"]:
        prose_html = substitute_flat_view(prose_html, fv_struct)
    if needs["ask_the_plot"]:
        prose_html = substitute_ask_the_plot(prose_html, atp_struct)
    if needs["what_changed"]:
        prose_html = substitute_what_changed(prose_html, wc_struct)
    if needs["twenty_years"]:
        prose_html = substitute_twenty_years(prose_html, ty_struct)
    if needs["vera"]:
        prose_html = substitute_vera_applet(prose_html, va_struct)
    prose_html = substitute_cartoon_normal_things(prose_html)
    prose_html = substitute_cartoon_ip_printer(prose_html)
    prose_html = substitute_cartoon_orchestrator(prose_html)
    prose_html = substitute_cartoon_storage_migrations(prose_html)
    prose_html = substitute_jeppesen_award_cartoon(prose_html)
    prose_html = substitute_harry_plot_video(prose_html)
    if needs["milp"]:
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
        fullbleed=True,
    )
    prose_html = substitute_runway_video(
        prose_html,
        marker="plotly-vs-powerpoint-morph",
        mp4_filename="plotly-vs-powerpoint-morph.mp4",
        aria_label="An old-timey photographer with a magnesium flash captures a complex evolving 3D wireframe of meshes, wind-tunnel readings, post-process versions and design revisions; the printed photo lands on a table while the lattice keeps changing behind it",
        caption="A PNG is a snapshot. The data was already moving by the time the flash went off.",
        fullbleed=True,
    )
    prose_html = substitute_runway_video(
        prose_html,
        marker="connections-by-hand",
        mp4_filename="connections-by-hand.mp4",
        aria_label="The same evolving 3D wireframe lattice from the photographer scene. A hand reaches in, plucks a few orbs, and places them onto a plot on a wooden easel. Thin cyan threads stay connected from each plot point back to its source node in the lattice — and pulses travel along them as the lattice keeps shifting.",
        caption="The connections were always meant to be first-class. Engineering data just got there last.",
        fullbleed=True,
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
        fullbleed=True,
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
    article_map_html = render_article_map(CURRENT_ARTICLE_ID)
    out = HTML_TEMPLATE.format(
        title=page_title,
        library_tags=required_library_tags(needs),
        article_css=ARTICLE_CSS,
        globe_css=globe_css,
        flowchart_css=flow_css,
        atomic_css=atomic_css,
        pv_css=pv_css,
        dbm_css=dbm_css,
        fv_css=fv_css,
        va_css=va_css,
        atp_css=atp_css,
        wc_css=wc_css,
        ty_css=ty_css,
        article_map=article_map_html,
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
        wc_js=wc_js,
        ty_js=ty_js,
        flowchart_scrolly_js=FLOWCHART_SCROLLY_JS,
        orch_scrolly_js=ORCH_SCROLLY_JS,
        map_js=MAP_JS,
        section_flip_js=SECTION_FLIP_JS,
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
    global PROSE_MD, OUT, CURRENT_ARTICLE_ID
    spec = ARTICLES[article_id]
    PROSE_MD = spec["md"]
    OUT      = spec["out"]
    CURRENT_ARTICLE_ID = article_id
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
