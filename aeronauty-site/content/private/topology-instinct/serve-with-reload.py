#!/usr/bin/env python3
"""
Live-reload dev server for the topology-instinct article.

- Serves the article dir over HTTP (default port 8780).
- Watches prose-source.md for changes.
- On change: runs build_article.py to rebuild index.html.
- Serves a /.build-stamp endpoint that returns the latest index.html mtime
  so the browser can poll it and refresh automatically.

Usage:
    python3 serve-with-reload.py            # port 8780
    python3 serve-with-reload.py 8765       # custom port

Stop with Ctrl-C.
"""
from __future__ import annotations

import http.server
import os
import socketserver
import subprocess
import sys
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BUILD_SCRIPT = ROOT / "build_article.py"
PROSE_FILE   = ROOT / "prose-source.md"
INDEX_HTML   = ROOT / "index.html"

# Watch a few input files in addition to the prose, so figure-source edits
# rebuild too.
WATCH_FILES = [
    PROSE_FILE,
    BUILD_SCRIPT,
    ROOT / "figures" / "flat-view.html",
    ROOT / "figures" / "adhd-flowchart-animated.html",
    ROOT / "figures" / "atomic-row.html",
    ROOT / "figures" / "data-black-market.html",
    ROOT / "figures" / "plotly-vs-powerpoint.html",
    ROOT / "figures" / "vera-applet.html",
    Path("/tmp/topology-instinct-build/globe-demo.html"),
]


def file_mtime(p: Path) -> float:
    try:
        return p.stat().st_mtime
    except FileNotFoundError:
        return 0.0


def latest_input_mtime() -> float:
    return max((file_mtime(p) for p in WATCH_FILES), default=0.0)


def rebuild() -> None:
    print(f"[{time.strftime('%H:%M:%S')}] rebuilding...", flush=True)
    try:
        result = subprocess.run(
            ["python3", str(BUILD_SCRIPT)],
            cwd=ROOT, capture_output=True, text=True, timeout=60,
        )
        if result.returncode != 0:
            print("  BUILD FAILED:", file=sys.stderr)
            print(result.stderr, file=sys.stderr)
            return
        # Last build line in output is informative
        last = [l for l in result.stdout.splitlines() if l.strip()]
        if last:
            print(f"  → {last[-1]}", flush=True)
    except subprocess.TimeoutExpired:
        print("  BUILD TIMEOUT", file=sys.stderr)


def watcher_thread() -> None:
    last_seen = latest_input_mtime()
    # Always do an initial build so index.html is fresh.
    rebuild()
    while True:
        time.sleep(0.4)
        m = latest_input_mtime()
        if m > last_seen:
            last_seen = m
            rebuild()


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self) -> None:
        # Disable caching so refreshes always pick up the new build.
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def do_GET(self) -> None:  # noqa: N802
        # Tiny endpoint the browser polls — returns the index.html mtime.
        if self.path == "/.build-stamp":
            stamp = str(file_mtime(INDEX_HTML))
            data = stamp.encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/plain")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return

        # Serve index.html with a reload-poller injected at the bottom.
        if self.path in {"/", "/index.html", "/index.html/"}:
            try:
                html = INDEX_HTML.read_bytes()
            except FileNotFoundError:
                self.send_error(404, "index.html not built yet")
                return
            poller = self._reload_script(file_mtime(INDEX_HTML))
            html = html.replace(b"</body>", poller.encode() + b"</body>", 1)
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(html)))
            self.end_headers()
            self.wfile.write(html)
            return

        super().do_GET()

    @staticmethod
    def _reload_script(initial_stamp: float) -> str:
        return f"""
<script>
(function() {{
  let last = "{initial_stamp}";
  setInterval(async () => {{
    try {{
      const r = await fetch("/.build-stamp", {{cache: "no-store"}});
      if (!r.ok) return;
      const t = (await r.text()).trim();
      if (t && t !== last) {{ last = t; location.reload(); }}
    }} catch (_) {{}}
  }}, 750);
}})();
</script>
"""

    def log_message(self, fmt: str, *args) -> None:
        # Quieter than default — only log non-stamp requests.
        if "/.build-stamp" in (args[0] if args else ""):
            return
        super().log_message(fmt, *args)


def main() -> None:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8780
    os.chdir(ROOT)

    # Watcher in a background thread.
    threading.Thread(target=watcher_thread, daemon=True).start()

    # Allow address re-use so quick restarts don't hit "address already in use".
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("127.0.0.1", port), Handler) as httpd:
        print(f"\n  topology-instinct dev server")
        print(f"  http://127.0.0.1:{port}/")
        print(f"  watching prose-source.md + figures/*.html for changes")
        print(f"  ctrl-c to stop\n", flush=True)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n  stopped.")


if __name__ == "__main__":
    main()
