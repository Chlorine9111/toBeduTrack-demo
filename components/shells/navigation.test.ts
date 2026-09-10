import { describe, expect, it } from "vitest";
import { buildShellNavigation } from "@/components/shells/navigation";

describe("buildShellNavigation", () => {
  it("returns teacher navigation and quota for subject teacher", () => {
    const navigation = buildShellNavigation(["subject_teacher"], "subject_teacher");

    expect(navigation.primaryItems.map((item) => item.id)).toEqual([
      "new-chat",
      "content-assets",
      "question-bank",
      "feedback",
      "exam-agent",
    ]);
    expect(navigation.mobileItems.map((item) => item.id)).toEqual([
      "content-assets",
      "question-bank",
    ]);
    expect(navigation.actorLabel).toEqual({
      zh: "教师",
      en: "Teacher",
    });
    expect(navigation.showQuota).toBe(true);
  });

  it("keeps a multi-role subject teacher in the teacher/admin shell", () => {
    const navigation = buildShellNavigation(
      ["subject_teacher", "admin"],
      "subject_teacher",
    );

    expect(navigation.primaryItems.map((item) => item.id)).toEqual([
      "new-chat",
      "content-assets",
      "question-bank",
      "feedback",
      "exam-agent",
    ]);
    expect(navigation.mobileItems.map((item) => item.id)).toEqual([
      "content-assets",
      "question-bank",
    ]);
    expect(navigation.showQuota).toBe(true);
  });

  it("lets admin see only the surviving teacher/admin shell items", () => {
    const navigation = buildShellNavigation(
      ["admin", "subject_teacher"],
      "admin",
    );

    expect(navigation.primaryItems.map((item) => item.id)).toEqual([
      "new-chat",
      "content-assets",
      "question-bank",
      "feedback",
      "exam-agent",
    ]);
    expect(navigation.mobileItems.map((item) => item.id)).toEqual([
      "content-assets",
      "question-bank",
    ]);
    expect(navigation.actorLabel).toEqual({
      zh: "管理员",
      en: "Admin",
    });
    expect(navigation.showQuota).toBe(false);
  });
});
