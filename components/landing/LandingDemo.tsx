"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Check, ArrowRight } from "lucide-react";
import { Button } from "@heroui/react";
import type { TabId } from "@/lib/landing/mock-data";
import { useLanguage } from "@/lib/landing/i18n";
import { LanguageToggle } from "./LanguageToggle";
import ChatPanel from "./ChatPanel";
import RubricPanel from "./RubricPanel";
import WorksheetPanel from "./WorksheetPanel";
import ExamPanel from "./ExamPanel";
import ExportOverlay from "./ExportOverlay";
import CTASection from "./CTASection";

export default function LandingDemo() {
  const { locale, t, chatFlows } = useLanguage();
  const [activeTab, setActiveTab] = useState<TabId>(0);
  const [completedTabs, setCompletedTabs] = useState<Set<TabId>>(new Set());
  const [panelVisible, setPanelVisible] = useState<Record<TabId, boolean>>({
    0: false,
    1: false,
    2: false,
  });
  const [interacted, setInteracted] = useState<Record<TabId, boolean>>({
    0: false,
    1: false,
    2: false,
  });
  const [showGuide, setShowGuide] = useState<Record<TabId, boolean>>({
    0: false,
    1: false,
    2: false,
  });
  const [showOverlay, setShowOverlay] = useState(false);
  const [panelLoading, setPanelLoading] = useState<Record<TabId, boolean>>({
    0: false,
    1: false,
    2: false,
  });

  const guideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const tabs: { id: TabId; label: string }[] = [
    { id: 0, label: t.tabs.rubric },
    { id: 1, label: t.tabs.worksheet },
    { id: 2, label: t.tabs.exam },
  ];

  // Reset all demo state when locale changes
  useEffect(() => {
    setActiveTab(0);
    setCompletedTabs(new Set());
    setPanelVisible({ 0: false, 1: false, 2: false });
    setPanelLoading({ 0: false, 1: false, 2: false });
    setInteracted({ 0: false, 1: false, 2: false });
    setShowGuide({ 0: false, 1: false, 2: false });
    setShowOverlay(false);
    if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);
  }, [locale]);

  useEffect(() => {
    if (guideTimerRef.current) clearTimeout(guideTimerRef.current);

    if (panelVisible[activeTab] && !showGuide[activeTab] && activeTab !== 2) {
      guideTimerRef.current = setTimeout(() => {
        setShowGuide((prev) => ({ ...prev, [activeTab]: true }));
      }, 10000);
    }

    return () => {
      if (guideTimerRef.current) clearTimeout(guideTimerRef.current);
    };
  }, [panelVisible, activeTab, showGuide]);

  const handlePanelTrigger = useCallback(() => {
    setPanelLoading((prev) => ({ ...prev, [activeTab]: true }));
    loadingTimerRef.current = setTimeout(() => {
      setPanelVisible((prev) => ({ ...prev, [activeTab]: true }));
      setPanelLoading((prev) => ({ ...prev, [activeTab]: false }));
    }, 1200);
  }, [activeTab]);

  const handleInteraction = useCallback(() => {
    if (!interacted[activeTab]) {
      setInteracted((prev) => ({ ...prev, [activeTab]: true }));
      setShowGuide((prev) => ({ ...prev, [activeTab]: true }));
    }
  }, [activeTab, interacted]);

  const handleTabComplete = useCallback((tab: TabId) => {
    setCompletedTabs((prev) => new Set([...prev, tab]));
    const nextTab = (tab + 1) as TabId;
    if (nextTab <= 2) {
      setActiveTab(nextTab);
    }
  }, []);

  const handleExportComplete = useCallback(() => {
    setShowOverlay(true);
    setCompletedTabs((prev) => new Set([...prev, 2]));
  }, []);

  const handleRestart = useCallback(() => {
    setShowOverlay(false);
    setActiveTab(0);
    setCompletedTabs(new Set());
    setPanelVisible({ 0: false, 1: false, 2: false });
    setPanelLoading({ 0: false, 1: false, 2: false });
    setInteracted({ 0: false, 1: false, 2: false });
    setShowGuide({ 0: false, 1: false, 2: false });
    if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);
  }, []);

  const handleTabClick = useCallback((tab: TabId) => {
    setActiveTab(tab);
  }, []);

  // Tab key cycles through tabs
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Tab") {
        e.preventDefault();
        setActiveTab((prev) => ((prev + 1) % 3) as TabId);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const scrollToDemo = () => {
    document
      .getElementById("demo-section")
      ?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="flex min-h-screen flex-col">
      {/* ===== HERO ===== */}
      <section className="relative flex flex-col items-center justify-center px-6 pt-14 pb-8 md:pt-20 md:pb-10">
        {/* Language Toggle */}
        <div className="absolute top-5 right-6">
          <LanguageToggle />
        </div>

        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-6"
        >
          <span className="font-display text-xl font-bold tracking-tight text-slate-800">
            {t.hero.brand}
          </span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.08 }}
          className="font-display text-center text-4xl font-semibold leading-[1.15] tracking-tight text-slate-900 md:text-5xl lg:text-[3.5rem]"
        >
          {t.hero.titleLine1}
          <br />
          <span className="text-slate-400">{t.hero.titleLine2}</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="mt-4 max-w-md text-center text-[15px] leading-relaxed text-slate-500"
        >
          {t.hero.subtitle}
          <br className="hidden sm:block" />
          {t.hero.subtitleLine2}
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.4 }}
        >
          <Button
            onPress={scrollToDemo}
            className="mt-8 inline-flex items-center gap-2 bg-slate-900 px-6 py-2.5 text-sm font-medium text-white"
            aria-label="Scroll to demo"
          >
            {t.hero.ctaButton}
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </motion.div>
      </section>

      {/* ===== DEMO SECTION ===== */}
      <section
        id="demo-section"
        className="mx-auto w-full max-w-6xl flex-1 px-4 pb-8 md:px-6"
      >
        {/* Step Tabs */}
        <div className="mb-5 flex flex-col items-center gap-2">
          <div className="inline-flex items-center gap-1 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xs">
            {tabs.map((tab, idx) => {
              const isActive = activeTab === tab.id;
              const isComplete = completedTabs.has(tab.id);

              return (
                <Button
                  key={tab.id}
                  variant={isActive ? "primary" : "ghost"}
                  onPress={() => handleTabClick(tab.id)}
                  className={`relative flex items-center gap-2 px-4 py-2 text-sm font-medium ${
                    isActive
                      ? "bg-slate-900 text-white shadow-md"
                      : "text-slate-500"
                  }`}
                >
                  {isComplete ? (
                    <div className="flex h-4.5 w-4.5 items-center justify-center rounded-full bg-emerald-500">
                      <Check
                        className="h-2.5 w-2.5 text-white"
                        strokeWidth={3}
                      />
                    </div>
                  ) : (
                    <span
                      className={`flex h-4.5 w-4.5 items-center justify-center rounded-full text-[10px] font-bold leading-none ${
                        isActive
                          ? "bg-white/20 text-white"
                          : "bg-slate-100 text-slate-400"
                      }`}
                    >
                      {idx + 1}
                    </span>
                  )}
                  <span className="hidden sm:inline">{tab.label}</span>
                </Button>
              );
            })}
          </div>
          <span className="text-[11px] text-slate-300 tracking-wide">
            <kbd className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">Tab</kbd>
            {" "}{t.tabs.tabHint}
          </span>
        </div>

        {/* Main Content Area */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex flex-col lg:flex-row"
              style={{ minHeight: "calc(100vh - 320px)" }}
            >
              {/* Chat Panel (Left) */}
              <div className="w-full border-b border-slate-100 lg:w-[35%] lg:border-b-0 lg:border-r">
                <div className="h-[280px] lg:h-full">
                  <ChatPanel
                    key={`chat-${activeTab}`}
                    tabId={activeTab}
                    flow={chatFlows[activeTab]}
                    onPanelTrigger={handlePanelTrigger}
                  />
                </div>
              </div>

              {/* Right Panel */}
              <div className="relative flex-1 overflow-hidden">
                <div className="landing-scrollbar h-[calc(100vh-420px)] overflow-y-auto p-4 lg:h-full lg:p-5">
                  {activeTab === 0 && (
                    <RubricPanel
                      key={locale}
                      visible={panelVisible[0]}
                      loading={panelLoading[0]}
                      onInteracted={handleInteraction}
                    />
                  )}
                  {activeTab === 1 && (
                    <WorksheetPanel
                      key={locale}
                      visible={panelVisible[1]}
                      loading={panelLoading[1]}
                      onInteracted={handleInteraction}
                    />
                  )}
                  {activeTab === 2 && (
                    <ExamPanel
                      key={locale}
                      visible={panelVisible[2]}
                      loading={panelLoading[2]}
                      onInteracted={handleInteraction}
                      onExportComplete={handleExportComplete}
                    />
                  )}
                </div>

                {/* Guide Bar */}
                <AnimatePresence>
                  {showGuide[activeTab] &&
                    !completedTabs.has(activeTab) &&
                    activeTab !== 2 && (
                      <motion.div
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 16 }}
                        className="absolute bottom-0 left-0 right-0 border-t border-slate-100 bg-white px-5 py-3"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 text-sm">
                            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-50">
                              <Check
                                className="h-3 w-3 text-emerald-600"
                                strokeWidth={3}
                              />
                            </div>
                            <span className="font-medium text-slate-700">
                              {t.guide[String(activeTab)].done}
                            </span>
                            <span className="hidden text-slate-400 sm:inline">
                              {t.guide[String(activeTab)].next}
                            </span>
                          </div>
                          <Button
                            size="sm"
                            onPress={() => handleTabComplete(activeTab)}
                            className="inline-flex items-center gap-1.5 bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white shrink-0"
                          >
                            {t.guide[String(activeTab)].cta}
                            <ArrowRight className="h-3 w-3" />
                          </Button>
                        </div>
                      </motion.div>
                    )}
                </AnimatePresence>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Export Overlay */}
          <ExportOverlay visible={showOverlay} onRestart={handleRestart} />
        </div>
      </section>

      {/* ===== BOTTOM CTA ===== */}
      <CTASection />

      {/* ===== Footer ===== */}
      <footer className="border-t border-slate-100 py-8 text-center text-xs text-slate-400">
        <p>{t.footer.tagline}</p>
      </footer>
    </div>
  );
}
