import { create } from 'zustand'
import { DemoState } from './panels/types'

interface DemoStore extends DemoState {
  // Actions
  setActiveTab: (tab: 'ett' | 'panel' | 'trefftz') => void
  setShowStreamlines: (show: boolean) => void
  setNacaDigits: (digits: string) => void
  setChord: (chord: number) => void
  setVelocity: (velocity: number) => void
  setDensity: (density: number) => void
  setAngleOfAttack: (aoa: number) => void
  setNPanels: (nPanels: number) => void
  setPathDiffPercent: (percent: number) => void
  setSpan: (span: number) => void
  setArea: (area: number) => void
  
  // Reset functions
  resetToDefaults: () => void
  resetEttParams: () => void
  resetPanelParams: () => void
  resetTrefftzParams: () => void
}

const defaultState: DemoState = {
  activeTab: 'ett',
  showStreamlines: false,
  nacaDigits: '0012',
  chord: 1.0,
  velocity: 10.0,
  density: 1.225,
  angleOfAttack: 5.0,
  nPanels: 120,
  pathDiffPercent: 1.0,
  span: 10.0,
  area: 20.0,
}

export const useDemoStore = create<DemoStore>((set, get) => ({
  ...defaultState,
  
  // Tab management
  setActiveTab: (tab) => set({ activeTab: tab }),
  
  // Streamlines
  setShowStreamlines: (show) => set({ showStreamlines: show }),
  
  // Airfoil parameters
  setNacaDigits: (digits) => {
    // Validate NACA digits format
    if (/^\d{4}$/.test(digits)) {
      set({ nacaDigits: digits })
    }
  },
  setChord: (chord) => set({ chord: Math.max(0.1, Math.min(10, chord)) }),
  
  // Flow parameters
  setVelocity: (velocity) => set({ velocity: Math.max(1, Math.min(1000, velocity)) }),
  setDensity: (density) => set({ density: Math.max(0.1, Math.min(10, density)) }),
  setAngleOfAttack: (aoa) => set({ angleOfAttack: Math.max(-30, Math.min(30, aoa)) }),
  
  // Panel method parameters
  setNPanels: (nPanels) => set({ nPanels: Math.max(60, Math.min(240, Math.round(nPanels))) }),
  
  // ETT parameters
  setPathDiffPercent: (percent) => set({ pathDiffPercent: Math.max(0, Math.min(20, percent)) }),
  
  // Trefftz parameters
  setSpan: (span) => set({ span: Math.max(1, Math.min(100, span)) }),
  setArea: (area) => set({ area: Math.max(1, Math.min(1000, area)) }),
  
  // Reset functions
  resetToDefaults: () => set(defaultState),
  
  resetEttParams: () => set({
    velocity: defaultState.velocity,
    density: defaultState.density,
    chord: defaultState.chord,
    pathDiffPercent: defaultState.pathDiffPercent,
    angleOfAttack: defaultState.angleOfAttack,
  }),
  
  resetPanelParams: () => set({
    nacaDigits: defaultState.nacaDigits,
    chord: defaultState.chord,
    velocity: defaultState.velocity,
    angleOfAttack: defaultState.angleOfAttack,
    nPanels: defaultState.nPanels,
    density: defaultState.density,
    showStreamlines: defaultState.showStreamlines,
  }),
  
  resetTrefftzParams: () => set({
    span: defaultState.span,
    area: defaultState.area,
    velocity: defaultState.velocity,
    density: defaultState.density,
  }),
}))

// Selector hooks - selecting individual primitive values
export const useActiveTab = () => useDemoStore((state) => state.activeTab)
export const useShowStreamlines = () => useDemoStore((state) => state.showStreamlines)

// Individual selectors for better performance
export const useNacaDigits = () => useDemoStore((state) => state.nacaDigits)
export const useChord = () => useDemoStore((state) => state.chord)
export const useNPanels = () => useDemoStore((state) => state.nPanels)
export const useVelocity = () => useDemoStore((state) => state.velocity)
export const useDensity = () => useDemoStore((state) => state.density)
export const useAngleOfAttack = () => useDemoStore((state) => state.angleOfAttack)
export const usePathDiffPercent = () => useDemoStore((state) => state.pathDiffPercent)
export const useSpan = () => useDemoStore((state) => state.span)
export const useArea = () => useDemoStore((state) => state.area)
