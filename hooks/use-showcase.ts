"use client"

import { useReducer, useCallback, useEffect, useRef } from "react"

const TOTAL_STEPS = 9 // 0..8

export interface ShowcaseState {
  currentStep: number
  direction: 1 | -1
  autoPlaying: boolean
  visitedSteps: Set<number>
  bridgeVisible: boolean
}

type Action =
  | { type: "NEXT" }
  | { type: "PREV" }
  | { type: "GOTO"; step: number }
  | { type: "TOGGLE_AUTOPLAY" }
  | { type: "SHOW_BRIDGE" }
  | { type: "HIDE_BRIDGE" }

function reducer(state: ShowcaseState, action: Action): ShowcaseState {
  switch (action.type) {
    case "NEXT": {
      if (state.currentStep >= TOTAL_STEPS - 1) return state
      const next = state.currentStep + 1
      return {
        ...state,
        currentStep: next,
        direction: 1,
        visitedSteps: new Set([...state.visitedSteps, next]),
        bridgeVisible: false,
      }
    }
    case "PREV": {
      if (state.currentStep <= 0) return state
      return {
        ...state,
        currentStep: state.currentStep - 1,
        direction: -1,
        bridgeVisible: false,
      }
    }
    case "GOTO": {
      if (action.step < 0 || action.step >= TOTAL_STEPS) return state
      if (action.step === state.currentStep) return state
      return {
        ...state,
        currentStep: action.step,
        direction: action.step > state.currentStep ? 1 : -1,
        visitedSteps: new Set([...state.visitedSteps, action.step]),
        bridgeVisible: false,
      }
    }
    case "TOGGLE_AUTOPLAY":
      return { ...state, autoPlaying: !state.autoPlaying }
    case "SHOW_BRIDGE":
      return { ...state, bridgeVisible: true }
    case "HIDE_BRIDGE":
      return { ...state, bridgeVisible: false }
    default:
      return state
  }
}

const INITIAL_STATE: ShowcaseState = {
  currentStep: 0,
  direction: 1,
  autoPlaying: false,
  visitedSteps: new Set([0]),
  bridgeVisible: false,
}

export function useShowcase() {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE)
  const autoPlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const next = useCallback(() => dispatch({ type: "NEXT" }), [])
  const prev = useCallback(() => dispatch({ type: "PREV" }), [])
  const goTo = useCallback((step: number) => dispatch({ type: "GOTO", step }), [])
  const toggleAutoPlay = useCallback(() => dispatch({ type: "TOGGLE_AUTOPLAY" }), [])

  // 键盘导航
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      switch (e.key) {
        case "ArrowRight":
        case " ":
          e.preventDefault()
          next()
          break
        case "ArrowLeft":
          e.preventDefault()
          prev()
          break
        case "Escape":
          window.location.href = "/demo/overview"
          break
        case "p":
        case "P":
          toggleAutoPlay()
          break
        default:
          if (/^[1-9]$/.test(e.key)) {
            goTo(parseInt(e.key, 10))
          }
      }
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [next, prev, goTo, toggleAutoPlay])

  // 自动播放
  useEffect(() => {
    if (!state.autoPlaying) {
      if (autoPlayTimerRef.current) clearTimeout(autoPlayTimerRef.current)
      return
    }
    if (state.currentStep >= TOTAL_STEPS - 1) {
      dispatch({ type: "TOGGLE_AUTOPLAY" })
      return
    }
    autoPlayTimerRef.current = setTimeout(next, 10_000)
    return () => {
      if (autoPlayTimerRef.current) clearTimeout(autoPlayTimerRef.current)
    }
  }, [state.autoPlaying, state.currentStep, next])

  return {
    state,
    next,
    prev,
    goTo,
    toggleAutoPlay,
    totalSteps: TOTAL_STEPS,
    isFirst: state.currentStep === 0,
    isLast: state.currentStep === TOTAL_STEPS - 1,
  }
}
