//! Hess-Smith panel solver and velocity-grid fill for the Circulation
//! Machine, compiled to WASM for interactive speed. The math mirrors
//! `lib/foil/{geometry,solver,field}.ts` operation-for-operation — the
//! TypeScript harness (`scripts/validate-foil.ts`) asserts parity between the
//! two implementations, so change both together or not at all.
//!
//! JS keeps geometry generation and rendering; this crate receives the closed
//! node loop (nodes[0] = trailing edge) and does the O(N^2)/O(N^3) solve and
//! the ~9M-kernel grid fill.

use wasm_bindgen::prelude::*;

const TWO_PI: f64 = 2.0 * std::f64::consts::PI;
const FOUR_PI: f64 = 4.0 * std::f64::consts::PI;

#[derive(Clone, Copy)]
struct Panel {
    ax: f64,
    ay: f64,
    mx: f64,
    my: f64,
    len: f64,
    tx: f64,
    ty: f64,
    nx: f64,
    ny: f64,
}

struct Geometry {
    panels: Vec<Panel>,
    nodes: Vec<(f64, f64)>,
    perimeter: f64,
    chord: f64,
    bbox: (f64, f64, f64, f64), // x_min, x_max, y_min, y_max
}

fn signed_area(nodes: &[(f64, f64)]) -> f64 {
    let n = nodes.len();
    let mut s = 0.0;
    for i in 0..n {
        let a = nodes[i];
        let b = nodes[(i + 1) % n];
        s += a.0 * b.1 - b.0 * a.1;
    }
    0.5 * s
}

/// Build panels from a closed loop, enforcing clockwise orientation while
/// keeping nodes[0] (the trailing edge) first — same rules as buildPanels().
fn build_geometry(nodes_flat: &[f64], alpha: f64) -> Geometry {
    let mut nodes: Vec<(f64, f64)> = nodes_flat
        .chunks_exact(2)
        .map(|c| (c[0], c[1]))
        .collect();
    if signed_area(&nodes) > 0.0 {
        let tail: Vec<(f64, f64)> = nodes[1..].iter().rev().cloned().collect();
        let mut flipped = vec![nodes[0]];
        flipped.extend(tail);
        nodes = flipped;
    }

    let n = nodes.len();
    let mut panels = Vec::with_capacity(n);
    let mut perimeter = 0.0;
    let (mut x_min, mut x_max, mut y_min, mut y_max) = (f64::MAX, f64::MIN, f64::MAX, f64::MIN);

    for i in 0..n {
        let a = nodes[i];
        let b = nodes[(i + 1) % n];
        let dx = b.0 - a.0;
        let dy = b.1 - a.1;
        let len = dx.hypot(dy);
        let tx = dx / len;
        let ty = dy / len;
        panels.push(Panel {
            ax: a.0,
            ay: a.1,
            mx: 0.5 * (a.0 + b.0),
            my: 0.5 * (a.1 + b.1),
            len,
            tx,
            ty,
            nx: -ty,
            ny: tx,
        });
        perimeter += len;
        x_min = x_min.min(a.0);
        x_max = x_max.max(a.0);
        y_min = y_min.min(a.1);
        y_max = y_max.max(a.1);
    }

    // chord = extent along the unrotated chord direction
    let ca = (-alpha).cos();
    let sa = (-alpha).sin();
    let mut c_min = f64::MAX;
    let mut c_max = f64::MIN;
    for nd in &nodes {
        let c = nd.0 * ca + nd.1 * sa;
        c_min = c_min.min(c);
        c_max = c_max.max(c);
    }

    Geometry {
        panels,
        nodes,
        perimeter,
        chord: c_max - c_min,
        bbox: (x_min, x_max, y_min, y_max),
    }
}

/// (us_x, us_y, uv_x, uv_y): global-frame velocity at (px, py) per unit
/// source and vortex sheet strength on panel p.
#[inline]
fn panel_influence(p: &Panel, px: f64, py: f64) -> (f64, f64, f64, f64) {
    let rx = px - p.ax;
    let ry = py - p.ay;
    let x = rx * p.tx + ry * p.ty;
    let y = rx * p.nx + ry * p.ny;
    let l = p.len;

    let r1sq = x * x + y * y;
    let dx2 = x - l;
    let r2sq = dx2 * dx2 + y * y;
    if r1sq < 1e-20 || r2sq < 1e-20 {
        return (0.0, 0.0, 0.0, 0.0);
    }

    let log_term = (r1sq / r2sq).ln() / FOUR_PI;
    // th2 - th1 in one atan2 (exact identity, mirrored in solver.ts)
    let d_theta = (y * l).atan2(x * dx2 + y * y);
    let ang_term = d_theta / TWO_PI;

    let (us, vs) = (log_term, ang_term);
    let (uv, vv) = (-ang_term, log_term);

    (
        us * p.tx + vs * p.nx,
        us * p.ty + vs * p.ny,
        uv * p.tx + vv * p.nx,
        uv * p.ty + vv * p.ny,
    )
}

#[inline]
fn self_influence(p: &Panel) -> (f64, f64, f64, f64) {
    (0.5 * p.nx, 0.5 * p.ny, -0.5 * p.tx, -0.5 * p.ty)
}

fn solve_dense(a: &mut [f64], b: &mut [f64], n: usize) {
    for k in 0..n {
        let mut piv = k;
        let mut pmax = a[k * n + k].abs();
        for i in (k + 1)..n {
            let v = a[i * n + k].abs();
            if v > pmax {
                pmax = v;
                piv = i;
            }
        }
        if piv != k {
            for j in k..n {
                a.swap(k * n + j, piv * n + j);
            }
            b.swap(k, piv);
        }
        let akk = a[k * n + k];
        // mirror of the TS solver's singular guard: trap (-> JS exception,
        // caught by the caller's fallback) instead of silently returning NaN
        assert!(akk.abs() >= 1e-13, "panel system singular");
        for i in (k + 1)..n {
            let f = a[i * n + k] / akk;
            if f == 0.0 {
                continue;
            }
            a[i * n + k] = 0.0;
            for j in (k + 1)..n {
                a[i * n + j] -= f * a[k * n + j];
            }
            b[i] -= f * b[k];
        }
    }
    for i in (0..n).rev() {
        let mut s = b[i];
        for j in (i + 1)..n {
            s -= a[i * n + j] * b[j];
        }
        b[i] = s / a[i * n + i];
    }
}

/// Solver output, read from JS via the flat-array getters.
#[wasm_bindgen]
pub struct SolveOut {
    sigma: Vec<f64>,
    vt: Vec<f64>,
    cp: Vec<f64>,
    gamma: f64,
    circulation: f64,
    cl_gamma: f64,
    cl_cp: f64,
    cm_quarter: f64,
    perimeter: f64,
    chord: f64,
}

#[wasm_bindgen]
impl SolveOut {
    #[wasm_bindgen(getter)]
    pub fn sigma(&self) -> Vec<f64> {
        self.sigma.clone()
    }
    #[wasm_bindgen(getter)]
    pub fn vt(&self) -> Vec<f64> {
        self.vt.clone()
    }
    #[wasm_bindgen(getter)]
    pub fn cp(&self) -> Vec<f64> {
        self.cp.clone()
    }
    #[wasm_bindgen(getter)]
    pub fn gamma(&self) -> f64 {
        self.gamma
    }
    #[wasm_bindgen(getter)]
    pub fn circulation(&self) -> f64 {
        self.circulation
    }
    #[wasm_bindgen(getter)]
    pub fn cl_gamma(&self) -> f64 {
        self.cl_gamma
    }
    #[wasm_bindgen(getter)]
    pub fn cl_cp(&self) -> f64 {
        self.cl_cp
    }
    #[wasm_bindgen(getter)]
    pub fn cm_quarter(&self) -> f64 {
        self.cm_quarter
    }
    #[wasm_bindgen(getter)]
    pub fn perimeter(&self) -> f64 {
        self.perimeter
    }
    #[wasm_bindgen(getter)]
    pub fn chord(&self) -> f64 {
        self.chord
    }
}

/// Hess-Smith solve on a closed node loop (x0,y0,x1,y1,... with nodes[0] at
/// the TE). With kutta=false the given circulation is imposed instead of the
/// Kutta row. Freestream is (1, 0); incidence is already in the geometry.
#[wasm_bindgen]
pub fn solve_section(
    nodes_flat: &[f64],
    alpha: f64,
    kutta: bool,
    imposed_circulation: f64,
    pivot_x: f64,
    pivot_y: f64,
) -> SolveOut {
    let geo = build_geometry(nodes_flat, alpha);
    let panels = &geo.panels;
    let n = panels.len();

    // influence table: panel j's unit-sheet velocities at control point i
    let mut inf = vec![(0.0f64, 0.0f64, 0.0f64, 0.0f64); n * n];
    for i in 0..n {
        let pi = panels[i];
        for j in 0..n {
            inf[i * n + j] = if i == j {
                self_influence(&panels[j])
            } else {
                panel_influence(&panels[j], pi.mx, pi.my)
            };
        }
    }

    let first = panels[0];
    let last = panels[n - 1];

    let (sigma, gamma) = if kutta {
        let dim = n + 1;
        let mut a = vec![0.0f64; dim * dim];
        let mut b = vec![0.0f64; dim];
        for i in 0..n {
            let pi = panels[i];
            let mut vortex_normal = 0.0;
            for j in 0..n {
                let e = inf[i * n + j];
                a[i * dim + j] = e.0 * pi.nx + e.1 * pi.ny;
                vortex_normal += e.2 * pi.nx + e.3 * pi.ny;
            }
            a[i * dim + n] = vortex_normal;
            b[i] = -pi.nx;
        }
        let mut vortex_kutta = 0.0;
        for j in 0..n {
            let ef = inf[j];
            let el = inf[(n - 1) * n + j];
            a[n * dim + j] = ef.0 * first.tx + ef.1 * first.ty + el.0 * last.tx + el.1 * last.ty;
            vortex_kutta += ef.2 * first.tx + ef.3 * first.ty + el.2 * last.tx + el.3 * last.ty;
        }
        a[n * dim + n] = vortex_kutta;
        b[n] = -(first.tx + last.tx);

        solve_dense(&mut a, &mut b, dim);
        let gamma = b[n];
        b.truncate(n);
        (b, gamma)
    } else {
        let gamma = imposed_circulation / geo.perimeter;
        let mut a = vec![0.0f64; n * n];
        let mut b = vec![0.0f64; n];
        for i in 0..n {
            let pi = panels[i];
            let mut vortex_normal = 0.0;
            for j in 0..n {
                let e = inf[i * n + j];
                a[i * n + j] = e.0 * pi.nx + e.1 * pi.ny;
                vortex_normal += e.2 * pi.nx + e.3 * pi.ny;
            }
            b[i] = -pi.nx - gamma * vortex_normal;
        }
        solve_dense(&mut a, &mut b, n);
        (b, gamma)
    };

    let mut vt = vec![0.0f64; n];
    let mut cp = vec![0.0f64; n];
    for i in 0..n {
        let pi = panels[i];
        let mut vx = 1.0;
        let mut vy = 0.0;
        for j in 0..n {
            let e = inf[i * n + j];
            vx += e.0 * sigma[j] + e.2 * gamma;
            vy += e.1 * sigma[j] + e.3 * gamma;
        }
        vt[i] = vx * pi.tx + vy * pi.ty;
        cp[i] = 1.0 - vt[i] * vt[i];
    }

    let circulation = gamma * geo.perimeter;
    let c = geo.chord;
    let cl_gamma = -2.0 * circulation / c;

    let mut fy = 0.0;
    let mut mz = 0.0;
    for i in 0..n {
        let p = panels[i];
        fy += -cp[i] * p.ny * p.len;
        mz += -cp[i] * ((p.mx - pivot_x) * p.ny - (p.my - pivot_y) * p.nx) * p.len;
    }

    SolveOut {
        sigma,
        vt,
        cp,
        gamma,
        circulation,
        cl_gamma,
        cl_cp: fy / c,
        cm_quarter: -mz / (c * c),
        perimeter: geo.perimeter,
        chord: c,
    }
}

// ---------------------------------------------------------------------------
// Fast transcendentals for the grid fill only. WASM has no native atan2/ln
// instructions, so libm calls dominate the ~9M kernel evaluations; these
// polynomial versions are good to ~1e-7 rad (atan2) / ~1e-11 rel (ln) — the
// harness measures ~1e-7 end-to-end grid error against the f64 libm fill,
// comparable to the f32 storage resolution and three orders below the 5e-3
// physical tolerance. The solve path keeps full libm precision.
// ---------------------------------------------------------------------------

/// ln(x) for normal positive x: exponent split + atanh series on [sqrt(1/2), sqrt(2)).
#[inline]
fn fast_ln(x: f64) -> f64 {
    let bits = x.to_bits();
    let mut e = ((bits >> 52) & 0x7ff) as i64 - 1023;
    let mut m = f64::from_bits((bits & 0x000f_ffff_ffff_ffff) | 0x3ff0_0000_0000_0000);
    if m > std::f64::consts::SQRT_2 {
        m *= 0.5;
        e += 1;
    }
    let s = (m - 1.0) / (m + 1.0);
    let s2 = s * s;
    let p = 2.0
        * s
        * (1.0
            + s2 * (1.0 / 3.0
                + s2 * (0.2 + s2 * (1.0 / 7.0 + s2 * (1.0 / 9.0 + s2 * (1.0 / 11.0))))));
    e as f64 * std::f64::consts::LN_2 + p
}

/// atan(z) for z in [0, 1] via half-angle range reduction + odd Taylor series.
#[inline]
fn fast_atan_pos(z: f64) -> f64 {
    const T8: f64 = 0.414_213_562_373_095_15; // tan(pi/8)
    let (w, base) = if z > T8 {
        ((z - 1.0) / (z + 1.0), std::f64::consts::FRAC_PI_4)
    } else {
        (z, 0.0)
    };
    let w2 = w * w;
    base
        + w * (1.0
            + w2 * (-1.0 / 3.0
                + w2 * (0.2
                    + w2 * (-1.0 / 7.0
                        + w2 * (1.0 / 9.0 + w2 * (-1.0 / 11.0 + w2 * (1.0 / 13.0)))))))
}

#[inline]
fn fast_atan2(y: f64, x: f64) -> f64 {
    let ay = y.abs();
    let ax = x.abs();
    if ay == 0.0 {
        // match atan2's signed-zero convention on the axes (a grid point
        // exactly on a panel's extension line otherwise flips by 2 pi)
        return if x < 0.0 {
            if y.is_sign_negative() {
                -std::f64::consts::PI
            } else {
                std::f64::consts::PI
            }
        } else {
            y
        };
    }
    let a = if ay <= ax {
        fast_atan_pos(ay / ax)
    } else {
        std::f64::consts::FRAC_PI_2 - fast_atan_pos(ax / ay)
    };
    let a = if x < 0.0 { std::f64::consts::PI - a } else { a };
    if y < 0.0 {
        -a
    } else {
        a
    }
}

/// panel_influence with the fast transcendentals (grid fill only).
#[inline]
fn panel_influence_fast(p: &Panel, px: f64, py: f64) -> (f64, f64, f64, f64) {
    let rx = px - p.ax;
    let ry = py - p.ay;
    let x = rx * p.tx + ry * p.ty;
    let y = rx * p.nx + ry * p.ny;
    let l = p.len;

    let r1sq = x * x + y * y;
    let dx2 = x - l;
    let r2sq = dx2 * dx2 + y * y;
    if r1sq < 1e-20 || r2sq < 1e-20 {
        return (0.0, 0.0, 0.0, 0.0);
    }

    let log_term = fast_ln(r1sq / r2sq) / FOUR_PI;
    let d_theta = fast_atan2(y * l, x * dx2 + y * y);
    let ang_term = d_theta / TWO_PI;

    let (us, vs) = (log_term, ang_term);
    let (uv, vv) = (-ang_term, log_term);

    (
        us * p.tx + vs * p.nx,
        us * p.ty + vs * p.ny,
        uv * p.tx + vv * p.nx,
        uv * p.ty + vv * p.ny,
    )
}

fn inside_foil(geo: &Geometry, x: f64, y: f64) -> bool {
    let (x_min, x_max, y_min, y_max) = geo.bbox;
    if x < x_min || x > x_max || y < y_min || y > y_max {
        return false;
    }
    let nodes = &geo.nodes;
    let n = nodes.len();
    let mut inside = false;
    let mut j = n - 1;
    for i in 0..n {
        let a = nodes[i];
        let b = nodes[j];
        if (a.1 > y) != (b.1 > y) && x < (b.0 - a.0) * (y - a.1) / (b.1 - a.1) + a.0 {
            inside = !inside;
        }
        j = i;
    }
    inside
}

// Grid specs — must match OUTER_SPEC / INNER_SPEC in lib/foil/field.ts; the
// harness asserts the returned lengths so a drift fails loudly.
const OUTER: (f64, f64, usize, usize, f64) = (-1.6, -1.4, 211, 141, 0.02);
const INNER: (f64, f64, usize, usize, f64) = (-0.18, -0.3, 281, 121, 0.005);

/// Perturbation-velocity grids for the drift exhibit, as one flat buffer:
/// [outer_u, outer_v, inner_u, inner_v]. Interior-of-foil points stay zero,
/// matching the JS fill.
#[wasm_bindgen]
pub fn fill_grids(nodes_flat: &[f64], alpha: f64, sigma: &[f64], gamma: f64) -> Vec<f32> {
    let geo = build_geometry(nodes_flat, alpha);
    let panels = &geo.panels;

    let outer_len = OUTER.2 * OUTER.3;
    let inner_len = INNER.2 * INNER.3;
    let mut out = vec![0.0f32; 2 * outer_len + 2 * inner_len];
    let (outer_part, inner_part) = out.split_at_mut(2 * outer_len);
    let (outer_u, outer_v) = outer_part.split_at_mut(outer_len);
    let (inner_u, inner_v) = inner_part.split_at_mut(inner_len);

    for (spec, u, v) in [
        (OUTER, outer_u, outer_v),
        (INNER, inner_u, inner_v),
    ] {
        let (x0, y0, nx, ny, h) = spec;
        for iy in 0..ny {
            let y = y0 + iy as f64 * h;
            for ix in 0..nx {
                let x = x0 + ix as f64 * h;
                if inside_foil(&geo, x, y) {
                    continue;
                }
                let mut px = 0.0;
                let mut py = 0.0;
                for (j, p) in panels.iter().enumerate() {
                    let e = panel_influence_fast(p, x, y);
                    px += e.0 * sigma[j] + e.2 * gamma;
                    py += e.1 * sigma[j] + e.3 * gamma;
                }
                let k = iy * nx + ix;
                u[k] = px as f32;
                v[k] = py as f32;
            }
        }
    }
    out
}
