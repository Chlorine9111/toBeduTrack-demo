"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { ModuleTourId, ProductTourState } from "./types";
import { readTourStateFromLocal, writeTourStateToLocal } from "./storage";
import { fetchTourState, patchTourState } from "./api";

type ProductTourContextValue = {
  state: ProductTourState;
  isLoading: boolean;
  isSidebarTourActive: boolean;
  sidebarTourStep: number;
  startSidebarTour: () => void;
  nextSidebarStep: () => void;
  skipSidebarTour: () => void;
  shouldShowModuleTour: (id: ModuleTourId) => boolean;
  activeModuleTour: { moduleId: ModuleTourId; step: number } | null;
  startModuleTour: (id: ModuleTourId) => void;
  nextModuleStep: (id: ModuleTourId) => void;
  skipModuleTour: (id: ModuleTourId) => void;
  neverShowAllTours: () => void;
  resetAllTours: () => void;
};

const FALLBACK: ProductTourContextValue = {
  state: {},
  isLoading: false,
  isSidebarTourActive: false,
  sidebarTourStep: 0,
  startSidebarTour: () => {},
  nextSidebarStep: () => {},
  skipSidebarTour: () => {},
  shouldShowModuleTour: () => false,
  activeModuleTour: null,
  startModuleTour: () => {},
  nextModuleStep: () => {},
  skipModuleTour: () => {},
  neverShowAllTours: () => {},
  resetAllTours: () => {},
};

const ProductTourContext = createContext<ProductTourContextValue>(FALLBACK);

export function useProductTour() {
  return useContext(ProductTourContext);
}

function mergeState(
  prev: ProductTourState,
  patch: Partial<ProductTourState>,
): ProductTourState {
  return {
    ...prev,
    ...patch,
    moduleTours: {
      ...prev.moduleTours,
      ...patch.moduleTours,
    },
  };
}

export function ProductTourProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ProductTourState>({});
  const [isLoading, setIsLoading] = useState(true);
  const [sidebarActive, setSidebarActive] = useState(false);
  const [sidebarStep, setSidebarStep] = useState(0);
  const [activeModule, setActiveModule] = useState<{
    moduleId: ModuleTourId;
    step: number;
  } | null>(null);

  const stateRef = useRef(state);
  stateRef.current = state;

  const persist = useCallback((patch: Partial<ProductTourState>) => {
    setState((prev) => {
      const next = mergeState(prev, patch);
      writeTourStateToLocal(next);
      return next;
    });
    patchTourState(patch).catch(() => {});
  }, []);

  // 初始化：localStorage 首帧 + API 后台同步
  useEffect(() => {
    const local = readTourStateFromLocal();
    if (Object.keys(local).length > 0) {
      setState(local);
      setIsLoading(false);
    }

    fetchTourState()
      .then(({ tourState, onboardingCompletedAt }) => {
        setState(tourState);
        writeTourStateToLocal(tourState);
        setIsLoading(false);

        // 自动启动侧边栏导览
        if (
          onboardingCompletedAt &&
          !tourState.sidebarTourCompletedAt &&
          !tourState.allToursDisabled
        ) {
          setTimeout(() => setSidebarActive(true), 1200);
        }
      })
      .catch(() => setIsLoading(false));
  }, []);

  const startSidebarTour = useCallback(() => {
    setSidebarStep(0);
    setSidebarActive(true);
  }, []);

  const nextSidebarStep = useCallback(() => {
    setSidebarStep((prev) => prev + 1);
  }, []);

  const skipSidebarTour = useCallback(() => {
    setSidebarActive(false);
    setSidebarStep(0);
    persist({ sidebarTourCompletedAt: new Date().toISOString() });
  }, [persist]);

  const shouldShowModuleTour = useCallback(
    (id: ModuleTourId) => {
      const s = stateRef.current;
      if (s.allToursDisabled) return false;
      const entry = s.moduleTours?.[id];
      if (entry?.completedAt || entry?.neverShow) return false;
      return true;
    },
    [],
  );

  const startModuleTour = useCallback((id: ModuleTourId) => {
    setActiveModule({ moduleId: id, step: 0 });
  }, []);

  const nextModuleStep = useCallback((_id: ModuleTourId) => {
    setActiveModule((prev) =>
      prev ? { ...prev, step: prev.step + 1 } : null,
    );
  }, []);

  const skipModuleTour = useCallback(
    (id: ModuleTourId) => {
      setActiveModule(null);
      persist({
        moduleTours: {
          ...stateRef.current.moduleTours,
          [id]: {
            ...stateRef.current.moduleTours?.[id],
            completedAt: new Date().toISOString(),
          },
        },
      });
    },
    [persist],
  );

  const neverShowAllTours = useCallback(() => {
    setSidebarActive(false);
    setActiveModule(null);
    persist({ allToursDisabled: true });
  }, [persist]);

  const resetAllTours = useCallback(() => {
    const reset: ProductTourState = {
      sidebarTourCompletedAt: null,
      allToursDisabled: false,
      moduleTours: {},
    };
    setState(reset);
    writeTourStateToLocal(reset);
    patchTourState(reset).catch(() => {});
    setSidebarActive(false);
    setSidebarStep(0);
    setActiveModule(null);
  }, []);

  const value = useMemo<ProductTourContextValue>(
    () => ({
      state,
      isLoading,
      isSidebarTourActive: sidebarActive,
      sidebarTourStep: sidebarStep,
      startSidebarTour,
      nextSidebarStep,
      skipSidebarTour,
      shouldShowModuleTour,
      activeModuleTour: activeModule,
      startModuleTour,
      nextModuleStep,
      skipModuleTour,
      neverShowAllTours,
      resetAllTours,
    }),
    [
      state,
      isLoading,
      sidebarActive,
      sidebarStep,
      startSidebarTour,
      nextSidebarStep,
      skipSidebarTour,
      shouldShowModuleTour,
      activeModule,
      startModuleTour,
      nextModuleStep,
      skipModuleTour,
      neverShowAllTours,
      resetAllTours,
    ],
  );

  return (
    <ProductTourContext.Provider value={value}>
      {children}
    </ProductTourContext.Provider>
  );
}
