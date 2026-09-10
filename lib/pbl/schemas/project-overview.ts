import { z } from "zod";

export const overviewMaterialRefSchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(1),
});

export const projectOverviewSchema = z.object({
  optionLabel: z.enum(["A", "B", "C"]),
  title: z.string().trim().min(1).max(15),
  drivingQuestion: z.string().trim().min(1).max(120),
  overview: z.string().trim().min(1).max(600),
  projectForm: z.string().trim().min(1).max(40),
  highlight: z.string().trim().min(1).max(200),
  materialRefs: z.array(overviewMaterialRefSchema).min(1).max(3),
});

export const projectOverviewListSchema = z.object({
  options: z.array(projectOverviewSchema).min(2).max(3),
});

export type ProjectOverview = z.infer<typeof projectOverviewSchema>;
