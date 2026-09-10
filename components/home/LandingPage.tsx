"use client";

import LinkButton from "@/components/shells/LinkButton";
import { Card, Separator } from "@heroui/react";
import { Pencil, Sparkles, Share2, Calculator, FlaskConical, Terminal, BookOpen, Globe, Star } from "lucide-react";
import { HomeI18nProvider } from "@/lib/home/i18n";
import MarketingNavbar from "@/components/shells/MarketingNavbar";
import MarketingFooter from "@/components/shells/MarketingFooter";
import HeroEditor from "@/components/home/HeroEditor";
import DemoTabs from "@/components/home/DemoTabs";

/* ------------------------------------------------------------------ */
/*  Workflow steps                                                     */
/* ------------------------------------------------------------------ */

const WORKFLOW_STEPS = [
  {
    icon: Pencil,
    title: "Describe",
    description: "Tell us your subject, topic, and specific requirements in natural language.",
  },
  {
    icon: Sparkles,
    title: "Generate",
    description: "Our specialized AI drafts a high-fidelity document tailored to your classroom.",
  },
  {
    icon: Share2,
    title: "Export",
    description: "Download as PDF or Google Doc, ready to print or share with students.",
  },
] as const;

/* ------------------------------------------------------------------ */
/*  Subject cards                                                      */
/* ------------------------------------------------------------------ */

const SUBJECTS = [
  { icon: Calculator, label: "Mathematics" },
  { icon: FlaskConical, label: "Sciences" },
  { icon: Terminal, label: "Computer Science" },
  { icon: BookOpen, label: "English" },
  { icon: Globe, label: "Social Studies" },
] as const;

/* ------------------------------------------------------------------ */
/*  Stats                                                              */
/* ------------------------------------------------------------------ */

const STATS = [
  { value: "38+", label: "AP Subjects" },
  { value: "12", label: "Document Types" },
  { value: "< 10s", label: "Generation Time" },
] as const;

/* ================================================================== */
/*  LandingPage Component                                              */
/* ================================================================== */

export default function LandingPage() {
  return (
    <HomeI18nProvider>
      <MarketingNavbar />

      <main className="min-h-screen pt-[52px]">
        {/* -------------------------------------------------------- */}
        {/*  Hero Section                                             */}
        {/* -------------------------------------------------------- */}
        <section className="mx-auto max-w-[1100px] px-6 pt-24 pb-0 flex flex-col items-center text-center">
          <h1 className="text-4xl sm:text-5xl md:text-[3.5rem] font-bold leading-[1.1] tracking-[-0.02em] text-foreground max-w-4xl mb-6">
            Describe what you teach.{" "}
            <br className="hidden sm:block" />
            Get materials ready to use.
          </h1>

          <p className="text-lg font-medium tracking-tight text-default-500 mb-10">
            Rubric &middot; Worksheet &middot; Exam &middot; Lesson Plan &middot; PBL
          </p>

          <LinkButton
            href="/auth/register"
            className="rounded-lg px-8 py-4 text-lg font-semibold mb-20"
            size="lg"
          >
            Get Started Free
          </LinkButton>

          {/* Interactive Editor Demo */}
          <HeroEditor />
        </section>

        {/* -------------------------------------------------------- */}
        {/*  Interactive Demo — Tabs                                  */}
        {/* -------------------------------------------------------- */}
        <DemoTabs />

        {/* -------------------------------------------------------- */}
        {/*  Workflow — 3 steps                                       */}
        {/* -------------------------------------------------------- */}
        <section className="mx-auto max-w-[1100px] px-6 py-32">
          <h2 className="mb-20 text-center text-[1.75rem] font-semibold text-foreground">
            Three steps. That&apos;s it.
          </h2>

          <div className="grid gap-12 md:grid-cols-3">
            {WORKFLOW_STEPS.map((step) => {
              const Icon = step.icon;
              return (
                <Card key={step.title} variant="transparent" className="group p-0">
                  <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-default-200 text-foreground transition-transform group-hover:scale-110">
                    <Icon className="h-7 w-7" />
                  </div>
                  <Card.Header className="p-0">
                    <Card.Title className="mb-3 text-xl font-bold">{step.title}</Card.Title>
                    <Card.Description className="leading-relaxed">{step.description}</Card.Description>
                  </Card.Header>
                </Card>
              );
            })}
          </div>
        </section>

        {/* -------------------------------------------------------- */}
        {/*  Trust & Social Proof                                     */}
        {/* -------------------------------------------------------- */}
        <section className="bg-default-100 py-20">
          <div className="mx-auto max-w-[1100px] px-6">
            {/* Stats row */}
            <div className="grid grid-cols-2 gap-8 pb-20 mb-20 text-center md:grid-cols-3">
              {STATS.map((stat, idx) => (
                <div
                  key={stat.label}
                  className={idx === 2 ? "col-span-2 md:col-span-1" : ""}
                >
                  <div className="mb-2 text-4xl font-bold text-foreground">{stat.value}</div>
                  <div className="text-xs font-bold uppercase tracking-widest text-default-500">
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>

            <Separator className="mb-20" />

            {/* Testimonial */}
            <div className="mx-auto max-w-3xl text-center">
              {/* Stars */}
              <div className="mb-8 inline-flex rounded-full bg-default-200 px-4 py-1">
                <div className="flex items-center space-x-1">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-yellow-500 text-yellow-500" />
                  ))}
                </div>
              </div>

              <p className="mb-10 text-2xl italic leading-relaxed text-foreground">
                &ldquo;Deskmate has completely changed how I prep for my AP Bio labs. What used to take
                two hours now takes minutes. The rubrics are exceptionally accurate.&rdquo;
              </p>

              <div className="flex flex-col items-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-default-200 text-xl font-bold text-foreground">
                  SM
                </div>
                <div className="font-bold text-foreground">Sarah Miller</div>
                <div className="text-sm text-default-500">High School Science Lead</div>
              </div>
            </div>
          </div>
        </section>

        {/* -------------------------------------------------------- */}
        {/*  Subject Coverage                                         */}
        {/* -------------------------------------------------------- */}
        <section className="mx-auto max-w-[1100px] px-6 py-32">
          <h2 className="mb-16 text-center text-[1.75rem] font-semibold text-foreground">
            Built for the subjects you teach.
          </h2>

          <div className="grid grid-cols-2 gap-6 md:grid-cols-3 lg:grid-cols-6">
            {SUBJECTS.map((subj) => {
              const Icon = subj.icon;
              return (
                <div
                  key={subj.label}
                  className="group rounded-xl bg-content1 p-8 text-center transition-colors hover:bg-default-100"
                >
                  <Icon className="mx-auto mb-4 h-8 w-8 text-default-500 transition-colors group-hover:text-foreground" />
                  <span className="text-sm font-semibold text-foreground">{subj.label}</span>
                </div>
              );
            })}

            {/* "More coming" placeholder */}
            <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-divider p-8">
              <span className="text-xs font-bold text-default-400">More coming</span>
            </div>
          </div>
        </section>

        {/* -------------------------------------------------------- */}
        {/*  Bottom CTA                                               */}
        {/* -------------------------------------------------------- */}
        <section className="mx-auto max-w-[1100px] px-6 pb-32">
          <div className="relative overflow-hidden rounded-3xl bg-foreground p-16 text-center md:p-24">
            {/* Blur orbs */}
            <div className="pointer-events-none absolute -right-32 -top-32 h-64 w-64 rounded-full bg-white/5 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-32 -left-32 h-64 w-64 rounded-full bg-white/5 blur-3xl" />

            <h2 className="relative z-10 mb-8 text-3xl font-bold text-white md:text-5xl">
              Your next lesson,{" "}
              <br />
              prepared by AI.
            </h2>

            <LinkButton
              href="/auth/register"
              variant="secondary"
              className="relative z-10 inline-block rounded-lg bg-white px-10 py-4 text-lg font-bold text-foreground hover:bg-default-100"
            >
              Get Started Free
            </LinkButton>

            <p className="relative z-10 mt-6 text-sm text-white/40">
              No credit card required &middot; Cancel anytime
            </p>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </HomeI18nProvider>
  );
}
