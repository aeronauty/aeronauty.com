# Runway prompts — topology-instinct articles

## Article 1 CFD handoff pair — `figures/cfd-handoff-manual.mp4` and `figures/cfd-handoff-api.mp4`

Replacement for the old storage-migrations cartoon plus `data-drift.mp4` full-screen video. The point is concrete CFD admin, not abstract data drift: `.dat`/post-processing/export/email/CSV/PowerPoint, then the same handoff as direct request/response against one source of truth.

- **Generated:** 2026-05-04 via Runway API image-to-video.
- **Models:** `gen4.5` for `cfd-handoff-manual.mp4`; `gen4_turbo` for `cfd-handoff-api.mp4` after the second `gen4.5` job was throttled.
- **Duration:** 5 seconds each.
- **Aspect ratio:** `1280:720`.
- **Start frames:** `figures/cfd-handoff-manual-start.png` and `figures/cfd-handoff-api-start.png`, rendered from `figures/cfd-handoff-mockups.html`.
- **Text strategy:** any explanatory wording belongs in article captions/HTML. The prompts ask Runway not to invent labels.

**Manual prompt:**
> Use the provided clean editorial diagram as the first frame and preserve its cream paper, black ink, restrained cyan accent style. Five second calm explainer video. Show a CFD file handoff chain without readable words: an engineer loads a simulation result file into a post-processing viewer, exports a generic file card, another workstation receives a spreadsheet-like attachment via email, then a person copies chart fragments into a slide deck. The central person visibly becomes the manual join between tools, moving small cards from one side to the other. File icons drift along dashed paths; screens glow subtly; no legible text, no logos, no letters, no numbers, no UI labels. Motion is quiet and precise, not comedic, not frantic.

**API prompt:**
> Use the provided clean editorial diagram as the first frame and preserve its cream paper, black ink, restrained green and cyan accent style. Five second calm explainer video. Show the same CFD workflow done properly: workstations and a slide view stay connected to one central data store by small glowing request pulses. The faded human in the middle no longer carries file cards; the request tokens move directly between tools and the shared source of truth. The database cylinder gently pulses, relationship lines light up in sequence, and all screens update from the same source. No legible text, no logos, no letters, no numbers, no UI labels. Minimal camera movement, no sci-fi interface, editorial technical illustration.

## Article 2 hero — `figures/desk-becoming-navigable.mp4`

Interior counterpart to article 1's globe/network hero: the same cluttered brain/desk becomes traversable without becoming magically tidy.

- **Generated:** 2026-05-04 via Runway API text-to-video, regenerated once to remove pseudo-text, cropped slightly from the left edge, then trimmed to ~5.8s before final export so the late text artefact never appears.
- **Model:** `gen4.5`
- **Duration:** 8 seconds
- **Aspect ratio:** 16:9

**Prompt:**
> 16:9 cinematic editorial web hero, 8s. Messy engineering/writing desk at dawn: pale wood, blank papers, blank sticky notes, unlabeled folders, blank dark laptop screen, coffee rings, notebooks, simple aircraft outline, abstract plots made only of clean curves/dots, database boxes connected by lines. Slow top-down or shallow oblique dolly. Clutter starts overwhelming; restrained cyan-teal connection lines and small light pulses appear between objects, forming one calm navigable path. Desk stays messy, not cleaned. Warm humane watercolor/ink texture, not glossy AI, not cyberpunk. ZERO TEXT ANYWHERE: no letters, numbers, words, labels, logos, handwriting, fake writing, pseudo-writing, glyphs, UI text, keyboard letters, or scribbles. Surfaces may contain only blank areas or pure geometric lines, curves, dots, arrows. No faces, robots, globe, planet, route map, or magic tidying. Leave calm negative space for title overlay.

---

Six short videos that the article wires up automatically once each MP4 lands at the named path. Drop the rendered file into the package, run `python3 build_article.py --all`, and the build swaps in the video. If the MP4 is missing, the build either keeps the still cartoon (beats 3 + 8) or shows a small "Video pending" placeholder where the video will go (the four new ones). Nothing breaks before the videos are ready.

**Recommended model:** Runway Gen-4.5 (Pro) for all six. Use **image-to-video** wherever a start frame is named, **text-to-video** otherwise. **Aspect ratio:** 16:9 for everything.

**House style note for every prompt:** subtle motion, no flashy camera moves, no text/words/letters anywhere in the frame, no speech bubbles. Cinematic restraint. The article's tone is calm and observational; the videos should feel like that, not like film trailers.

---

## 1. `figures/data-black-market/03-folders.mp4` — the directory hunt

The strongest add of the six. Replaces the still in beat 3 of the data-black-market scrolly with a few seconds of *actually looking*.

- **Duration:** 5 seconds
- **Start frame:** `figures/data-black-market/03-folders.png` (image-to-video)
- **End frame:** none — let Runway infer from the prompt

**Prompt:**
> A black-and-white pen-and-ink editorial cartoon panel. A woman sits at a desk in front of a computer monitor. The monitor shows a desktop file-browser window with a long vertical list of similarly-named folder icons. The cursor scrolls smoothly downward through the folder list — folders pass continuously, the list extending well beyond what fits on screen. The cursor's hover state hops from one folder to the next as the list moves. Subtle parallax: the woman remains still, the room around her unmoving, only the file list inside the screen scrolls. The cyan-teal accent stays on whichever single folder the cursor is hovering. Cross-hatched pencil shading throughout. No text, no readable letters anywhere. Calm pace. The whole shot reads as quietly resigned engineering archaeology.

**Avoid:** spinning camera, zooms, panning the room, any text appearing. Just the cursor scrolling the list.

---

## 2. `figures/data-black-market/08-archaeology.mp4` — the closing zoom-out

Replaces the still beat-8 fullbleed with a slow cinematic landing for the data-black-market figure.

- **Duration:** 8 seconds
- **Start frame:** `figures/data-black-market/08-archaeology.png` (image-to-video)
- **End frame:** none

**Prompt:**
> A black-and-white pen-and-ink editorial cartoon panel. An open-plan engineering office at the end of day, late afternoon turning to evening. Most desks are empty, chairs tucked under. One desk in the middle of the panel is still occupied: a woman in a navy fleece, viewed from behind, sitting still at her monitor. The camera performs a very slow gradual pull-back: starts on the still-glowing monitor in front of her, then slowly widens to reveal the empty office around her — empty chairs, a sleeping printer, a whiteboard with fading marker, a row of windows with deepening evening light. The pull-back is gentle and continuous, like a held breath. The cyan-teal accent stays on her glowing monitor throughout. Cross-hatched pencil shading. No text, no letters anywhere.

**Avoid:** dramatic zooms, anyone moving (she stays still — that's the point), the sky changing colour mid-shot.

---

## 3. `figures/plotly-vs-powerpoint-morph.mp4` — the dead chart coming alive

A 6-second moment where a static slide-deck chart fluidly unfolds into an interactive Plotly figure. Goes near the existing plotly-vs-powerpoint figure.

- **Duration:** 6 seconds
- **Start frame:** none (text-to-video) — or, if you want, screenshot the static slide-deck mockup from `figures/plotly-vs-powerpoint.html` for the start frame
- **End frame:** none

**Prompt:**
> A clean editorial illustration on a soft cream background, 16:9. The frame opens on a slide deck displayed on a laptop screen — Slide 14 visible, holding a small static line chart, no interactivity. A cursor enters frame from the right and clicks the chart. The chart fluidly transforms in place: gridlines unfold, axes extend and label tick marks, data points lift off the page and become hoverable circles, a tooltip flickers into existence on one of them, the curves turn from static drawn lines into vector-precise plotted lines that subtly redraw themselves. By the end of the shot, the same chart is unmistakably alive — interactive, sharp, vector-rendered, the slide chrome around it has receded. Calm transformation, no glitch effects. Pen-and-ink editorial cartoon style with one small element (the cursor's click ripple, then the active tooltip) highlighted in soft cyan-teal. No text, no readable axis labels — the labels are suggestive marks only.

**Avoid:** Matrix-style code rain, glitch transitions, data points bouncing dramatically. The transformation is *competent and quiet*, not flashy.

---

## 4. `figures/paradigm-globe-pan.mp4` — Earth, with arcs drawing in

Establishing pan that goes just before the interactive globe demo. Sets the planetary-network register the demo then hands you to play with.

- **Duration:** 6 seconds
- **Start frame:** none (text-to-video)
- **End frame:** none

**Prompt:**
> A view of Earth from low Earth orbit, gently rotating, deep blue-black space behind. The terminator (day-night line) is visible across one continent. As the shot progresses, thin luminous great-circle arcs draw themselves one by one across the Earth's surface — an arc starts at one airport-shaped point of light, grows along its great-circle path, and lands at another point of light, where a small new dot of light pulses on. Three or four arcs draw in over the duration, each on a different continent, each landing at a new dot. The arcs are soft cyan-teal. The Earth itself is rendered in cinematic monochrome — graphite-toned continents, pale graphite oceans, soft cloud edges. No country labels, no city names, no text. The motion is slow and calm. Final beat: the arcs hold steady on a slowly-turning globe.

**Avoid:** sci-fi UI overlays, country borders glowing, label text appearing, the camera spinning fast. The Earth's rotation is barely perceptible.

---

## 5. `figures/connections-by-hand.mp4` — drawing the connections

A short close-up of a hand drawing a flat table on paper, then drawing connecting arcs between cells. Pairs with the article's "the connections were always meant to be first-class" beat near the close.

- **Duration:** 5 seconds
- **Start frame:** none (text-to-video)
- **End frame:** none

**Prompt:**
> Top-down close-up of a sheet of warm cream paper. A hand holding a fountain pen enters frame from the right. In time-lapsed strokes, the hand draws a small flat data table — a 3-column, 4-row grid — with confident pen lines, each cell roughly the size of a thumbnail. Once the grid exists, the hand begins drawing arcing connecting lines between cells: a curve from one cell up to another in a different row, another curve crossing back, three or four arcs in total, each drawn fluidly as if linking related entries. The arcs are subtly tinted cyan-teal, while the table itself is straight black ink on cream. The hand is rendered loose and gestural, in the same pen-and-ink graphic-novel style as the rest of the article's cartoons. No readable handwriting — the pen marks suggest content without forming letters. Calm, deliberate pace.

**Avoid:** speed-painting effects, the camera tilting, the hand finishing cleanly with a flourish. End with the last arc still fresh.

---

## 6. `figures/orchestrator-day.mp4` — desk timelapse

Article 2's closing beat. Pairs with the orchestrator cartoon and the "the brain that was a tax is now an asset" line.

- **Duration:** 8 seconds
- **Start frame:** `figures/cartoon-orchestrator.png` (image-to-video, optional — text-to-video also fine)
- **End frame:** none

**Prompt:**
> A warm editorial cartoon panel of a desk in a room with a single overhead lamp. A man sits at the desk, calm, taking notes in a notebook with a pencil. Around him, a loose half-circle of small abstract specialist agent figures — a circle, a hexagon, a square, a triangle — each working on a small task (one writing on a tiny ledger, one typing, one looking through a magnifier, one carrying a small tool), connected back to the desk by thin communication lines. Time-lapse: the overhead light shifts subtly through the duration — soft morning gold at the start, midday neutral, late-afternoon amber, then dimming toward evening as a desk lamp warms and takes over. The agents come and go from the half-circle, swapping in and out as the day passes. The man at the desk stays calm and stays put, occasionally turning a page in his notebook. The thin communication lines between desk and agents are highlighted in soft cyan-teal — the only colour accent. Everything else is monochrome graphite and ink on warm cream. Pen-and-ink graphic-novel style with cross-hatched shading. No readable text or letters anywhere.

**Avoid:** the man getting up or moving dramatically, agents leaving the frame entirely (they swap, not disappear), any clock visible.

---

## Workflow

1. Generate each video in Runway with the named filename (no spaces).
2. Drop it into the path shown at the top of each section — for the data-black-market ones that's `figures/data-black-market/`, the others go to `figures/`.
3. From `content/private/topology-instinct/`, run:
   ```
   python3 build_article.py --all
   ```
4. Commit + push when you're happy. The build automatically detects each MP4 and swaps it in.

If a video is wrong, just regenerate and overwrite the same filename — the build will pick up the new one on next run.
