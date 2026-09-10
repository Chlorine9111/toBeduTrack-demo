"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type PresetMode = "focus" | "split" | "canvas";

const PRESET_FOCUS = 0.75;
const PRESET_SPLIT = 0.50;
const PRESET_CANVAS = 0.15;

const PRESET_VALUES: Record<PresetMode, number> = {
  focus: PRESET_FOCUS,
  split: PRESET_SPLIT,
  canvas: PRESET_CANVAS,
};

const PRESET_SNAP_THRESHOLD = 0.03;
const PRESET_STORAGE_KEY = "deskmate-panel-preset";
const TRANSITION_DURATION = 250;

const SNAP_POINTS = [PRESET_FOCUS, PRESET_SPLIT, PRESET_CANVAS];
const SNAP_STICKY_RANGE = 0.03;
const SNAP_STICKY_DAMPING = 0.4;
const SPRING_OVERSHOOT_FACTOR = 0.15;
const SPRING_STIFFNESS = 0.2;
const SPRING_EPSILON = 0.001;

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function findNearestPreset(ratio: number): PresetMode | null {
  for (const [mode, value] of Object.entries(PRESET_VALUES) as [PresetMode, number][]) {
    if (Math.abs(ratio - value) <= PRESET_SNAP_THRESHOLD) {
      return mode;
    }
  }
  return null;
}

interface UseResizablePanelOptions {
  initialRatio?: number;
  minRatio?: number;
  maxRatio?: number;
  snapToZeroThreshold?: number;
}

interface ResizablePanelState {
  ratio: number;
  isDragging: boolean;
  handleRef: React.RefCallback<HTMLElement>;
  containerRef: React.RefCallback<HTMLElement>;
  chatPanelRef: React.RefCallback<HTMLElement>;
  reset: () => void;
  toggleFullCanvas: () => void;
  presetMode: PresetMode | null;
  setPresetMode: (mode: PresetMode) => void;
  isTransitioning: boolean;
  isFullscreenTransitioning: boolean;
}

/**
 * 高性能可拖拽面板。
 *
 * 核心思路：拖拽时只更新一个 CSS 变量 `--chat-ratio`，
 * 浏览器通过 CSS `calc()` 自动算出宽度，配合 `contain: strict`
 * 限制 reflow 范围。松手后 commit 到 React state。
 *
 * 比直接写 style.flex 更快，因为 CSS 变量变化只触发
 * 依赖它的属性重算，而 `contain: strict` 阻止 reflow 扩散到子元素。
 */
export function useResizablePanel(
  options: UseResizablePanelOptions = {},
): ResizablePanelState {
  const {
    initialRatio = 0.34,
    minRatio = 0.2,
    maxRatio = 0.6,
    snapToZeroThreshold = 0.12,
  } = options;

  const [ratio, setRatio] = useState(() => {
    if (typeof window === "undefined") return initialRatio;
    const saved = localStorage.getItem(PRESET_STORAGE_KEY);
    if (saved && saved in PRESET_VALUES) {
      return PRESET_VALUES[saved as PresetMode];
    }
    return initialRatio;
  });
  const [isDragging, setIsDragging] = useState(false);
  const [presetMode, setPresetModeState] = useState<PresetMode | null>(() => {
    if (typeof window === "undefined") return null;
    const saved = localStorage.getItem(PRESET_STORAGE_KEY);
    if (saved && saved in PRESET_VALUES) {
      return saved as PresetMode;
    }
    return null;
  });
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isFullscreenTransitioning, setIsFullscreenTransitioning] = useState(false);

  const [handleNode, setHandleNode] = useState<HTMLElement | null>(null);
  const containerEl = useRef<HTMLElement | null>(null);
  const chatPanelEl = useRef<HTMLElement | null>(null);
  const draggingRef = useRef(false);
  const rafIdRef = useRef(0);
  const pendingRatioRef = useRef(ratio);
  const ratioBeforeFullCanvas = useRef(ratio);
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const springRafRef = useRef(0);
  const fullscreenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const containerRef = useCallback((node: HTMLElement | null) => {
    containerEl.current = node;
  }, []);

  const handleRef = useCallback((node: HTMLElement | null) => {
    setHandleNode(node);
  }, []);

  const chatPanelRef = useCallback((node: HTMLElement | null) => {
    chatPanelEl.current = node;
  }, []);

  // 用 CSS 变量驱动布局——比直接写 style.flex 更高效
  const applyRatioToDOM = useCallback((newRatio: number) => {
    const container = containerEl.current;
    const chatPanel = chatPanelEl.current;
    if (!container || !chatPanel) return;

    if (newRatio === 0) {
      chatPanel.style.display = "none";
    } else {
      chatPanel.style.display = "";
      // 只更新一个 CSS 变量，浏览器自动 calc 宽度
      container.style.setProperty("--chat-ratio", String(newRatio));
    }
  }, []);

  const setPresetMode = useCallback((mode: PresetMode) => {
    const targetRatio = PRESET_VALUES[mode];
    setPresetModeState(mode);
    setRatio(targetRatio);
    pendingRatioRef.current = targetRatio;

    localStorage.setItem(PRESET_STORAGE_KEY, mode);

    setIsTransitioning(true);
    if (transitionTimerRef.current) {
      clearTimeout(transitionTimerRef.current);
    }
    transitionTimerRef.current = setTimeout(() => {
      setIsTransitioning(false);
      transitionTimerRef.current = null;
    }, TRANSITION_DURATION);
  }, []);

  // 清理 transition timer
  useEffect(() => {
    return () => {
      if (transitionTimerRef.current) {
        clearTimeout(transitionTimerRef.current);
      }
      if (fullscreenTimerRef.current) {
        clearTimeout(fullscreenTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!handleNode) return;

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      // 取消正在运行的 spring 动画
      if (springRafRef.current) {
        cancelAnimationFrame(springRafRef.current);
        springRafRef.current = 0;
      }
      draggingRef.current = true;
      setIsDragging(true);
      // 拖拽开始时清除预设模式
      setPresetModeState(null);
      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";

      // 拖拽开始时给面板加 contain，限制 reflow 范围
      chatPanelEl.current?.style.setProperty("contain", "strict");
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!draggingRef.current || !containerEl.current) return;

      const rect = containerEl.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      let newRatio = x / rect.width;

      if (newRatio < snapToZeroThreshold) {
        newRatio = 0;
      } else {
        newRatio = Math.max(minRatio, Math.min(maxRatio, newRatio));
      }

      // Phase 3c: 磁吸阻力感——接近吸附点时降低灵敏度
      if (!prefersReducedMotion()) {
        const prevRatio = pendingRatioRef.current;
        for (const sp of SNAP_POINTS) {
          if (Math.abs(newRatio - sp) < SNAP_STICKY_RANGE) {
            const delta = newRatio - prevRatio;
            newRatio = prevRatio + delta * SNAP_STICKY_DAMPING;
            newRatio = Math.max(minRatio, Math.min(maxRatio, newRatio));
            break;
          }
        }
      }

      pendingRatioRef.current = newRatio;

      // rAF 节流
      if (!rafIdRef.current) {
        rafIdRef.current = requestAnimationFrame(() => {
          rafIdRef.current = 0;
          applyRatioToDOM(pendingRatioRef.current);
        });
      }
    };

    const onMouseUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      setIsDragging(false);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";

      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = 0;
      }

      // 松手：清掉拖拽期间的 inline style，让 React 接管
      const chatPanel = chatPanelEl.current;
      const container = containerEl.current;
      if (chatPanel) {
        chatPanel.style.display = "";
        chatPanel.style.removeProperty("contain");
      }
      if (container) {
        container.style.removeProperty("--chat-ratio");
      }

      // 吸附检测：如果与某个预设差距 <= 0.03，自动吸附
      const finalRatio = pendingRatioRef.current;
      const nearestPreset = findNearestPreset(finalRatio);
      if (nearestPreset) {
        const snapTarget = PRESET_VALUES[nearestPreset];
        setPresetModeState(nearestPreset);
        localStorage.setItem(PRESET_STORAGE_KEY, nearestPreset);

        // Phase 3b: spring 回弹——overshoot 再衰减到目标值
        if (!prefersReducedMotion() && Math.abs(finalRatio - snapTarget) > SPRING_EPSILON) {
          // 轻微过冲
          let current = snapTarget + (snapTarget - finalRatio) * SPRING_OVERSHOOT_FACTOR;
          const tick = () => {
            current += (snapTarget - current) * SPRING_STIFFNESS;
            if (Math.abs(current - snapTarget) < SPRING_EPSILON) {
              current = snapTarget;
              springRafRef.current = 0;
              setRatio(snapTarget);
              pendingRatioRef.current = snapTarget;
              // 清掉 spring 期间的 inline style
              if (containerEl.current) {
                containerEl.current.style.removeProperty("--chat-ratio");
              }
              return;
            }
            applyRatioToDOM(current);
            springRafRef.current = requestAnimationFrame(tick);
          };
          // spring 期间保持 CSS 变量驱动，不走 React state
          if (chatPanel) {
            chatPanel.style.display = "";
          }
          springRafRef.current = requestAnimationFrame(tick);
          // 先设一个临时 ratio，spring 结束后会覆盖为精确值
          setRatio(snapTarget);
          pendingRatioRef.current = snapTarget;
        } else {
          setRatio(snapTarget);
          pendingRatioRef.current = snapTarget;
        }
      } else {
        setRatio(finalRatio);
        localStorage.removeItem(PRESET_STORAGE_KEY);
      }
    };

    handleNode.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);

    return () => {
      handleNode.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = 0;
      }
      if (springRafRef.current) {
        cancelAnimationFrame(springRafRef.current);
        springRafRef.current = 0;
      }
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [handleNode, minRatio, maxRatio, snapToZeroThreshold, applyRatioToDOM]);

  const reset = useCallback(() => {
    setRatio(initialRatio);
    pendingRatioRef.current = initialRatio;
  }, [initialRatio]);

  const toggleFullCanvas = useCallback(() => {
    if (fullscreenTimerRef.current) {
      clearTimeout(fullscreenTimerRef.current);
      fullscreenTimerRef.current = null;
    }

    setRatio((current) => {
      if (current === 0) {
        // 恢复：先标记过渡中，300ms 后结束
        setIsFullscreenTransitioning(true);
        const restored = ratioBeforeFullCanvas.current;
        pendingRatioRef.current = restored;
        fullscreenTimerRef.current = setTimeout(() => {
          setIsFullscreenTransitioning(false);
          fullscreenTimerRef.current = null;
        }, 300);
        return restored;
      }
      // 展开全屏：标记过渡中，300ms 后结束
      setIsFullscreenTransitioning(true);
      ratioBeforeFullCanvas.current = current;
      pendingRatioRef.current = 0;
      fullscreenTimerRef.current = setTimeout(() => {
        setIsFullscreenTransitioning(false);
        fullscreenTimerRef.current = null;
      }, 300);
      return 0;
    });
  }, []);

  return {
    ratio,
    isDragging,
    handleRef,
    containerRef,
    chatPanelRef,
    reset,
    toggleFullCanvas,
    presetMode,
    setPresetMode,
    isTransitioning,
    isFullscreenTransitioning,
  };
}
