'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { FoilSolution } from '@/lib/foil/solver'
import { VelocityGrid, traceStreamlineGrid, stagnationPoints } from '@/lib/foil/field'
import { Vec2 } from '@/lib/foil/geometry'

// world window of the foil-frame view
const X0 = -0.55
const X1 = 1.85
const Y0 = -0.62
const Y1 = 0.62
const ASPECT = (X1 - X0) / (Y1 - Y0)

const INK = '#1a1714'
const PAPER_RAISED = '#fbf8f1'
const STREAM = 'rgba(107, 99, 90, 0.55)'
const RED = '#d7263d'

interface GridState {
  grid: VelocityGrid
  sol: FoilSolution
  version: number
}

export function DesignerCanvas({
  sol,
  gridState,
  stale,
  transition,
}: {
  sol: FoilSolution
  gridState: GridState | null
  stale: boolean
  /** boundary-layer transition stations (x/c) from the viscous overlay */
  transition?: { xtrU: number; xtrL: number } | null
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [resizeTick, setResizeTick] = useState(0)

  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setResizeTick((n) => n + 1))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // ResizeObserver measures CSS pixels only, so a devicePixelRatio-only
  // change (dragging between displays) needs its own trigger; the media
  // query is re-armed at each new ratio.
  useEffect(() => {
    const mq = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
    const onChange = () => setResizeTick((n) => n + 1)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [resizeTick])

  const streamlines: Vec2[][] = useMemo(() => {
    if (!gridState) return []
    const lines: Vec2[][] = []
    for (let y = -0.58; y <= 0.581; y += 0.055) {
      lines.push(
        traceStreamlineGrid(gridState.grid, gridState.sol.geo, { x: X0 + 0.01, y }, {
          step: 0.012,
          maxSteps: 460,
          xMin: X0 - 0.05,
          xMax: X1 + 0.05,
          yMax: 1.2,
        }),
      )
    }
    return lines
  }, [gridState])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const cssW = canvas.clientWidth
    const cssH = cssW / ASPECT
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(cssW * dpr)
    canvas.height = Math.round(cssH * dpr)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)

    const sx = (x: number) => ((x - X0) / (X1 - X0)) * cssW
    const sy = (y: number) => ((Y1 - y) / (Y1 - Y0)) * cssH

    ctx.fillStyle = PAPER_RAISED
    ctx.fillRect(0, 0, cssW, cssH)

    // streamlines (possibly one solve behind while the field recomputes)
    ctx.lineWidth = 1
    ctx.strokeStyle = STREAM
    ctx.globalAlpha = stale ? 0.35 : 1
    for (const line of streamlines) {
      if (line.length < 2) continue
      ctx.beginPath()
      ctx.moveTo(sx(line[0].x), sy(line[0].y))
      for (let i = 1; i < line.length; i++) ctx.lineTo(sx(line[i].x), sy(line[i].y))
      ctx.stroke()
    }
    ctx.globalAlpha = 1

    // foil silhouette
    const nodes = sol.geo.nodes
    ctx.beginPath()
    ctx.moveTo(sx(nodes[0].x), sy(nodes[0].y))
    for (let i = 1; i < nodes.length; i++) ctx.lineTo(sx(nodes[i].x), sy(nodes[i].y))
    ctx.closePath()
    ctx.fillStyle = INK
    ctx.fill()

    // boundary-layer transition markers from the viscous overlay: the panels
    // carry their pre-rotation chordwise station, so find the crossing on
    // each surface (lower = first half TE->LE, upper = second half LE->TE)
    if (transition) {
      const panels = sol.geo.panels
      const half = panels.length / 2
      const mark = (station: number, from: number, to: number, color: string) => {
        if (station >= 0.999) return // no transition before the TE
        for (let i = from; i < to - 1; i++) {
          const a = panels[i].xc
          const b = panels[i + 1].xc
          if ((a - station) * (b - station) <= 0) {
            const p = panels[i]
            ctx.beginPath()
            ctx.arc(sx(p.mx + p.nx * 0.012), sy(p.my + p.ny * 0.012), 3, 0, 2 * Math.PI)
            ctx.fillStyle = color
            ctx.fill()
            return
          }
        }
      }
      mark(transition.xtrU, half, panels.length, '#a81c2e')
      mark(transition.xtrL, 0, half, '#1f5f8b')
    }

    // stagnation points
    for (const s of stagnationPoints(sol)) {
      ctx.beginPath()
      ctx.arc(sx(s.x), sy(s.y), 4.5, 0, 2 * Math.PI)
      ctx.fillStyle = RED
      ctx.fill()
      ctx.lineWidth = 1.5
      ctx.strokeStyle = PAPER_RAISED
      ctx.stroke()
    }

    // freestream arrow
    ctx.strokeStyle = 'rgba(26,23,20,0.5)'
    ctx.fillStyle = 'rgba(26,23,20,0.5)'
    ctx.lineWidth = 1.5
    const ay = sy(Y1 - 0.07)
    ctx.beginPath()
    ctx.moveTo(sx(X0 + 0.05), ay)
    ctx.lineTo(sx(X0 + 0.22), ay)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(sx(X0 + 0.22) + 6, ay)
    ctx.lineTo(sx(X0 + 0.22) - 2, ay - 4)
    ctx.lineTo(sx(X0 + 0.22) - 2, ay + 4)
    ctx.closePath()
    ctx.fill()
    // canvas cannot resolve var(); read the loaded font family off the DOM
    const mono = getComputedStyle(canvas).getPropertyValue('--font-mono').trim()
    ctx.font = `11px ${mono || 'ui-monospace'}, monospace`
    ctx.fillText('U∞', sx(X0 + 0.05), ay - 7)
  }, [sol, streamlines, stale, resizeTick, transition])

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        className="w-full rounded-[2px] border border-[var(--rule)]"
        style={{ aspectRatio: `${ASPECT}` }}
        role="img"
        aria-label="Potential-flow streamlines around the designed section"
      />
      {!gridState && (
        <div className="data-strip absolute inset-0 flex items-center justify-center bg-[rgba(251,248,241,0.6)]">
          computing flow field…
        </div>
      )}
    </div>
  )
}
