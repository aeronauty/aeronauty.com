/**
 * Foil geometry for the from-scratch panel code.
 *
 * Node convention: a single closed loop, nodes[0] at the trailing edge,
 * traversing the LOWER surface to the leading edge and returning along the
 * upper surface. buildPanels() enforces this orientation (clockwise for y-up)
 * and derives per-panel frames.
 *
 * The parametric section is the classic four-digit family (public-domain
 * formulas): parabolic-arc camber line + polynomial thickness, with the
 * closed-trailing-edge thickness coefficient.
 */

export interface Vec2 {
  x: number
  y: number
}

export interface FoilPanel {
  /** start node */
  ax: number
  ay: number
  /** end node */
  bx: number
  by: number
  /** midpoint (control point) */
  mx: number
  my: number
  len: number
  /** unit tangent, a -> b */
  tx: number
  ty: number
  /** outward unit normal */
  nx: number
  ny: number
  /** chordwise station of the control point BEFORE incidence rotation, for plotting */
  xc: number
}

export interface FoilGeometry {
  /** closed loop nodes, nodes[0] = trailing edge (not repeated at the end) */
  nodes: Vec2[]
  panels: FoilPanel[]
  perimeter: number
  chord: number
  /** incidence used to rotate the section, radians (freestream is always +x) */
  alpha: number
  /**
   * moment reference point for cm. Defaults to (0.25, 0) — the quarter chord
   * of the unit-chord four-digit sections, which is also their rotation pivot.
   * Callers building other geometries (different chord/origin) must supply
   * their own if they read cmQuarter.
   */
  pivot: Vec2
  /** polygon bounding box (post-rotation) */
  bbox: { xMin: number; xMax: number; yMin: number; yMax: number }
}

export interface SectionParams {
  /** max camber, fraction of chord (e.g. 0.02) */
  camber: number
  /** chordwise position of max camber, fraction (e.g. 0.4) */
  camberPos: number
  /** max thickness, fraction of chord (e.g. 0.12) */
  thickness: number
  /** incidence, radians */
  alpha: number
  /** panel count (even) */
  nPanels: number
}

/** Camber line height and slope of the four-digit parabolic-arc camber line. */
function camberLine(x: number, m: number, p: number): { yc: number; dyc: number } {
  if (m === 0) return { yc: 0, dyc: 0 }
  if (x < p) {
    return {
      yc: (m / (p * p)) * (2 * p * x - x * x),
      dyc: ((2 * m) / (p * p)) * (p - x),
    }
  }
  const q = 1 - p
  return {
    yc: (m / (q * q)) * (1 - 2 * p + 2 * p * x - x * x),
    dyc: ((2 * m) / (q * q)) * (p - x),
  }
}

/** Four-digit thickness distribution, closed-TE variant (last coefficient -0.1036). */
function thicknessDist(x: number, t: number): number {
  const s = Math.sqrt(Math.max(x, 0))
  return (
    5 *
    t *
    (0.2969 * s - 0.126 * x - 0.3516 * x * x + 0.2843 * x * x * x - 0.1036 * x * x * x * x)
  )
}

/**
 * Generate the closed node loop for a four-digit-style section.
 * Cosine spacing around the whole loop clusters nodes at both the leading and
 * trailing edges. The section is rotated by -alpha about the quarter chord so
 * the solver can always use a freestream along +x.
 */
export function sectionNodes(params: SectionParams): Vec2[] {
  const { camber: m, camberPos: p, thickness: t, alpha, nPanels } = params
  const n = nPanels % 2 === 0 ? nPanels : nPanels + 1
  const nodes: Vec2[] = []

  for (let k = 0; k < n; k++) {
    const beta = (2 * Math.PI * k) / n
    const x = 0.5 * (1 + Math.cos(beta)) // 1 -> 0 -> 1
    const { yc, dyc } = camberLine(x, m, p)
    const yt = thicknessDist(x, t)
    const theta = Math.atan(dyc)
    const lower = beta < Math.PI // first half of the loop is the lower surface
    const px = lower ? x + yt * Math.sin(theta) : x - yt * Math.sin(theta)
    const py = lower ? yc - yt * Math.cos(theta) : yc + yt * Math.cos(theta)
    nodes.push({ x: px, y: py })
  }

  // Pitch nose-up by alpha: rotate clockwise about the quarter chord.
  const ca = Math.cos(-alpha)
  const sa = Math.sin(-alpha)
  const cx = 0.25
  const cy = 0
  for (const nd of nodes) {
    const dx = nd.x - cx
    const dy = nd.y - cy
    nd.x = cx + dx * ca - dy * sa
    nd.y = cy + dx * sa + dy * ca
  }
  return nodes
}

/**
 * Karman-Trefftz section for validating the panel solution against the exact
 * conformal-map result. Circle centre (-ex, ey), radius through zeta = 1 (the
 * TE preimage); map exponent kn = 2 - tau/pi gives trailing-edge included
 * angle tau (tau = 0 reduces to the cusped Joukowski map z = zeta + 1/zeta).
 * Map: z = kn (1+g)/(1-g), g = ((zeta-1)/(zeta+1))^kn, computed ratio-first so
 * the principal log branch is never crossed on the contour.
 * Returned unnormalised (chord ~ 4); rotated by -alpha like sectionNodes.
 */
export function karmanTrefftzNodes(
  ex: number,
  ey: number,
  teAngle: number,
  nPanels: number,
  alpha = 0,
): Vec2[] {
  const kn = 2 - teAngle / Math.PI
  const zcx = -ex
  const zcy = ey
  const R = Math.hypot(1 - zcx, zcy)
  const thTe = Math.atan2(0 - zcy, 1 - zcx) // angle of the TE preimage
  const n = nPanels % 2 === 0 ? nPanels : nPanels + 1
  const nodes: Vec2[] = []
  for (let k = 0; k < n; k++) {
    // sweep the circle so the mapped loop runs TE -> lower -> LE -> upper
    const th = thTe - (2 * Math.PI * k) / n
    const px = zcx + R * Math.cos(th)
    const py = zcy + R * Math.sin(th)
    nodes.push(ktMap(px, py, kn))
  }
  if (alpha !== 0) {
    const ca = Math.cos(-alpha)
    const sa = Math.sin(-alpha)
    for (const nd of nodes) {
      const dx = nd.x
      const dy = nd.y
      nd.x = dx * ca - dy * sa
      nd.y = dx * sa + dy * ca
    }
  }
  return nodes
}

/** The Karman-Trefftz map itself, z = kn (1+g)/(1-g) with g = ((z-1)/(z+1))^kn. */
export function ktMap(zx: number, zy: number, kn: number): Vec2 {
  const numx = zx - 1
  const numy = zy
  const denx = zx + 1
  const deny = zy
  const d2 = denx * denx + deny * deny
  const rx = (numx * denx + numy * deny) / d2
  const ry = (numy * denx - numx * deny) / d2
  const mod = Math.hypot(rx, ry)
  if (mod < 1e-300) return { x: kn, y: 0 } // the trailing edge itself
  const arg = Math.atan2(ry, rx)
  const gm = Math.pow(mod, kn)
  const ga = kn * arg
  const gx = gm * Math.cos(ga)
  const gy = gm * Math.sin(ga)
  // z = kn (1+g)/(1-g)
  const ax = 1 + gx
  const ay = gy
  const bx = 1 - gx
  const by = -gy
  const b2 = bx * bx + by * by
  return { x: (kn * (ax * bx + ay * by)) / b2, y: (kn * (ay * bx - ax * by)) / b2 }
}

/** Shoelace signed area (positive = counterclockwise for y-up). */
function signedArea(nodes: Vec2[]): number {
  let s = 0
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i]
    const b = nodes[(i + 1) % nodes.length]
    s += a.x * b.y - b.x * a.y
  }
  return 0.5 * s
}

/**
 * Build panels from a closed node loop. Enforces clockwise orientation
 * (keeping nodes[0] fixed, since the solver's Kutta row uses the two panels
 * adjacent to it), and computes tangents plus outward normals.
 */
export function buildPanels(
  nodesIn: Vec2[],
  alpha: number,
  xcOf?: (i: number) => number,
  pivot: Vec2 = { x: 0.25, y: 0 },
): FoilGeometry {
  let nodes = nodesIn
  if (signedArea(nodes) > 0) {
    nodes = [nodes[0], ...nodes.slice(1).reverse()]
  }
  const n = nodes.length
  const panels: FoilPanel[] = []
  let perimeter = 0
  let xMin = Infinity
  let xMax = -Infinity
  let yMin = Infinity
  let yMax = -Infinity

  for (let i = 0; i < n; i++) {
    const a = nodes[i]
    const b = nodes[(i + 1) % n]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len = Math.hypot(dx, dy)
    const tx = dx / len
    const ty = dy / len
    panels.push({
      ax: a.x,
      ay: a.y,
      bx: b.x,
      by: b.y,
      mx: 0.5 * (a.x + b.x),
      my: 0.5 * (a.y + b.y),
      len,
      tx,
      ty,
      // outward normal for a clockwise loop is the left normal of the tangent
      nx: -ty,
      ny: tx,
      xc: xcOf ? xcOf(i) : 0,
    })
    perimeter += len
    xMin = Math.min(xMin, a.x)
    xMax = Math.max(xMax, a.x)
    yMin = Math.min(yMin, a.y)
    yMax = Math.max(yMax, a.y)
  }

  // chord = extent along the unrotated chord direction
  const ca = Math.cos(-alpha)
  const sa = Math.sin(-alpha)
  let cMin = Infinity
  let cMax = -Infinity
  for (const nd of nodes) {
    const c = nd.x * ca + nd.y * sa
    cMin = Math.min(cMin, c)
    cMax = Math.max(cMax, c)
  }

  return {
    nodes,
    panels,
    perimeter,
    chord: cMax - cMin,
    alpha,
    pivot,
    bbox: { xMin, xMax, yMin, yMax },
  }
}

/** Full section-parameter path: nodes + panels + plotting stations. */
export function makeSection(params: SectionParams): FoilGeometry {
  const nodes = sectionNodes(params)
  const n = nodes.length
  // chordwise station of each panel midpoint before rotation, for Cp plots
  const xcs: number[] = []
  for (let k = 0; k < n; k++) {
    const b0 = (2 * Math.PI * k) / n
    const b1 = (2 * Math.PI * ((k + 1) % n)) / n || 2 * Math.PI
    const x0 = 0.5 * (1 + Math.cos(b0))
    const x1 = 0.5 * (1 + Math.cos(b1))
    xcs.push(0.5 * (x0 + x1))
  }
  return buildPanels(nodes, params.alpha, (i) => xcs[i])
}

/** Even-odd point-in-polygon test with a bounding-box precheck. */
export function insideFoil(geo: FoilGeometry, x: number, y: number): boolean {
  const { bbox, nodes } = geo
  if (x < bbox.xMin || x > bbox.xMax || y < bbox.yMin || y > bbox.yMax) return false
  let inside = false
  const n = nodes.length
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const a = nodes[i]
    const b = nodes[j]
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside
    }
  }
  return inside
}
