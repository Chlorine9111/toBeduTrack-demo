"use client";

import { motion } from "motion/react";
import { useHomeI18n } from "@/lib/home/i18n";

export default function TestimonialSection() {
  const { t } = useHomeI18n();

  return (
    <section id="testimonials" className="bg-neutral-50/60 px-6 py-20 md:py-28">
      <div className="mx-auto max-w-6xl">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5 }}
          className="mx-auto max-w-2xl text-center"
        >
          <h2 className="font-display text-3xl font-bold tracking-[-0.025em] text-neutral-900 md:text-4xl">
            {t.testimonials.title}
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-neutral-500">
            {t.testimonials.subtitle}
          </p>
        </motion.div>

        {/* Testimonial cards */}
        <div className="mt-14 grid gap-5 md:grid-cols-3">
          {t.testimonials.items.map((item, idx) => (
            <motion.div
              key={item.author}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.4, delay: idx * 0.1 }}
              className="relative rounded-xl border border-neutral-200/80 bg-white p-6"
            >
              <p className="text-[14px] leading-relaxed text-neutral-600">
                &ldquo;{item.quote}&rdquo;
              </p>
              <div className="mt-5 border-t border-neutral-100 pt-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-900">
                    <span className="text-[10px] font-bold text-white">
                      {item.author
                        .split(" ")
                        .filter(Boolean)
                        .map((n) => n[0])
                        .join("")}
                    </span>
                  </div>
                  <div>
                    <div className="text-[13px] font-semibold text-neutral-800">
                      {item.author}
                    </div>
                    <div className="text-[12px] text-neutral-400">
                      {item.role} · {item.school}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
