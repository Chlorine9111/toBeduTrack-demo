"use client";

import { motion } from "motion/react";
import {
  Calculator,
  FlaskConical,
  Code2,
  BookOpen,
  Globe2,
  Brain,
} from "lucide-react";
import { type ReactNode } from "react";
import { Card, Chip } from "@heroui/react";
import { useHomeI18n } from "@/lib/home/i18n";

interface Subject {
  readonly icon: ReactNode;
  readonly name: string;
  readonly courses: readonly string[];
}

const SUBJECTS: readonly Subject[] = [
  {
    icon: <Calculator className="h-4 w-4" />,
    name: "Mathematics",
    courses: ["AP Calculus AB/BC", "AP Statistics", "AP Precalculus"],
  },
  {
    icon: <FlaskConical className="h-4 w-4" />,
    name: "Sciences",
    courses: ["AP Physics 1 & 2", "AP Chemistry", "AP Biology"],
  },
  {
    icon: <Code2 className="h-4 w-4" />,
    name: "Computer Science",
    courses: ["AP CS A", "AP CS Principles"],
  },
  {
    icon: <BookOpen className="h-4 w-4" />,
    name: "English",
    courses: ["AP English Lang", "AP English Lit"],
  },
  {
    icon: <Globe2 className="h-4 w-4" />,
    name: "Social Studies",
    courses: ["AP US History", "AP World History", "AP Gov"],
  },
  {
    icon: <Brain className="h-4 w-4" />,
    name: "More Subjects",
    courses: ["AP Psychology", "AP Economics", "AP Art History"],
  },
];

export default function SubjectGrid() {
  const { t } = useHomeI18n();

  return (
    <section id="subjects" className="px-6 py-20 md:py-28">
      <div className="mx-auto max-w-6xl">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5 }}
          className="mx-auto max-w-2xl text-center"
        >
          <h2 className="font-display text-3xl font-bold tracking-[-0.025em] text-foreground md:text-4xl">
            {t.subjects.title}
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-default-500">
            {t.subjects.subtitle}
          </p>
        </motion.div>

        {/* Grid */}
        <div className="mt-14 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SUBJECTS.map((subject, idx) => (
            <motion.div
              key={subject.name}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.4, delay: idx * 0.06 }}
              className="group"
            >
              <Card className="p-5 transition-all duration-300 hover:shadow-md">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-default-100 text-default-500 transition-colors group-hover:bg-foreground group-hover:text-white">
                    {subject.icon}
                  </div>
                  <h3 className="font-display text-[14px] font-semibold text-foreground">
                    {subject.name}
                  </h3>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {subject.courses.map((course) => (
                    <Chip key={course} variant="soft" className="text-[11px]">
                      {course}
                    </Chip>
                  ))}
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
