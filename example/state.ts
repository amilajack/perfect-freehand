import * as React from 'react'
import { createState, createSelectorHook } from '@state-designer/react'
import { getPointer } from './hooks/useEvents'
import { Mark, CompleteMark } from './types'
import pathAlgorithm from 'perfect-freehand'

const defaultOptions = {
  type: 'mouse',
  simulatePressure: true,
  streamline: 0.5,
  minSize: 2.5,
  maxSize: 8,
  smooth: 8,
  pressureChangeRate: 0.5,
  pressureMaxVelocity: 8,
  pressureVelocityEffect: 8,
}

const defaultSettings = {
  penMode: false,
  darkMode: false,
  showTrace: false,
  showControls: false,
  recomputePaths: true,
}

type Settings = typeof defaultSettings

const state = createState({
  data: {
    settings: { ...defaultSettings },
    alg: { ...defaultOptions },
    refs: null as {
      canvas: React.RefObject<HTMLCanvasElement>
      overlay: React.RefObject<HTMLCanvasElement>
      frame: React.RefObject<HTMLDivElement>
    } | null,
    restore: [] as { clear?: boolean; marks: CompleteMark[] }[],
    redos: [] as { clear?: boolean; marks: CompleteMark[] }[],
    marks: [] as CompleteMark[],
    currentMark: null as Mark | null,
  },
  on: {
    RESET_OPTIONS: [d => (d.alg = { ...defaultOptions }), 'updatePaths'],
    CHANGED_OPTIONS: [(d, p) => (d.alg = { ...d.alg, ...p }), 'updatePaths'],
    CHANGED_SETTINGS: [(d, p) => (d.settings = { ...d.settings, ...p }), ,],
    TOGGLED_CONTROLS: d => (d.settings.showControls = !d.settings.showControls),
    LOADED: ['setup', 'setDarkMode'],
    UNLOADED: 'cleanup',
    RESIZED: ['resize'],
    PRESSED_KEY_Z: [
      { if: ['metaPressed', 'shiftPressed'], do: 'redoMark' },
      { if: 'metaPressed', unless: 'shiftPressed', do: 'undoMark' },
    ],
    PRESSED_KEY_D: [
      (d, p) =>
        (d.settings = { ...d.settings, showTrace: !d.settings.showTrace }),
    ],
    PRESSED_KEY_E: ['clearMarks'],
    CLEARED_CANVAS: ['clearMarks'],
    UNDO: ['undoMark'],
    REDO: ['redoMark'],
    TOGGLED_DARK_MODE: ['toggleDarkMode', 'setDarkMode'],
  },
  states: {
    pointer: {
      initial: 'up',
      states: {
        up: {
          onEnter: [],
          on: {
            DOWNED_POINTER: {
              to: 'down',
              do: ['beginMark'],
            },
          },
        },
        down: {
          on: {
            LIFTED_POINTER: {
              do: ['completeMark'],
              to: 'up',
            },
            MOVED_POINTER: {
              do: ['addPointToMark'],
            },
          },
        },
      },
    },
  },
  onEnter: { do: 'setDarkMode' },
  conditions: {
    shiftPressed(data, payload) {
      return payload.keys.shift
    },
    metaPressed(data, payload) {
      return payload.keys.meta
    },
  },
  actions: {
    setup(
      data,
      payload: {
        marks: Mark[]
        alg: typeof defaultOptions
        settings: typeof defaultSettings
      }
    ) {
      const { marks, alg, settings } = payload

      data.alg = { ...data.alg, ...alg }

      data.marks = marks.map(mark => ({
        ...mark,
        path: pathAlgorithm(mark.points, { type: mark.type }),
      }))

      data.settings = {
        ...data.settings,
        ...settings,
        penMode: false,
      }
    },
    cleanup(data) {},
    resize(data) {
      const { canvas, frame } = data.refs!
      var rect = frame.current!.getBoundingClientRect()
      canvas.current!.width = rect.width //* dpr
      canvas.current!.height = rect.height //* dpr
    },
    beginMark(data) {
      const { x, y, p, type } = getPointer()
      data.settings.penMode = type === 'pen'

      data.redos = []

      data.currentMark = {
        type,
        points: [
          {
            x,
            y,
            angle: 0,
            pressure: p,
            distance: 0,
          },
        ],
        path: '',
      }
    },
    addPointToMark(data) {
      const { x, y, p, type } = getPointer()
      const { currentMark, alg } = data

      if (type !== currentMark!.type) return

      currentMark!.points.push({
        x: Math.round(x),
        y: Math.round(y),
        angle: 0,
        pressure: p,
        distance: 0,
      })

      currentMark!.path = pathAlgorithm(currentMark!.points, {
        ...alg,
        type: currentMark!.type,
      })
    },
    completeMark(data) {
      const { currentMark, alg } = data

      data.marks.push({
        ...currentMark!,
        path: pathAlgorithm(currentMark!.points, {
          ...alg,
          type: currentMark!.type,
        }),
      })

      data.currentMark = null
    },
    clearMarks(data) {
      data.marks = []
      data.redos = []
    },
    loadData(data, payload: { marks: Mark[] }) {
      data.marks = payload.marks.map(mark => ({
        ...mark,
        path: pathAlgorithm(mark.points, {
          ...data.alg,
          type: mark.type,
        }),
      }))
    },
    undoMark(data) {
      if (data.marks.length === 0) {
        const restored = data.restore.pop()
        if (restored) data.marks = restored.marks
        return
      }

      const undid = data.marks.pop()
      if (undid) {
        data.redos.push({ marks: [undid] })
      }
    },
    redoMark(data) {
      const undid = data.redos.pop()
      if (undid) {
        data.marks.push(...undid.marks)
      }
    },
    toggleDarkMode(data) {
      data.settings.darkMode = !data.settings.darkMode
    },
    setDarkMode(data) {
      if (typeof document === 'undefined') return

      if (data.settings.darkMode) {
        document.body.classList.add('dark')
      } else {
        document.body.classList.remove('dark')
      }
    },
    updatePaths(data) {
      const { currentMark, alg, marks } = data
      for (let mark of marks) {
        mark.path = pathAlgorithm(mark.points, {
          ...alg,
          type: mark.type,
        })
      }

      if (currentMark) {
        currentMark.path = pathAlgorithm(currentMark.points, {
          ...alg,
          type: currentMark.type,
        })
      }
    },
  },
})

state.onUpdate(d => {
  if (d.isIn('up')) {
    localStorage.setItem(
      'pressure_lines',
      JSON.stringify({
        alg: d.data.alg,
        marks: d.data.marks,
        settings: d.data.settings,
      })
    )
  }
})

export const useSelector = createSelectorHook(state)

export default state
