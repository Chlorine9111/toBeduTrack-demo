"use client";

import { useMemo, useState } from "react";
import { Alert, Button, Card, Chip, Separator, Spinner, Table } from "@heroui/react";
import { CalendarClock, RefreshCcw, Sparkles, Wand2 } from "lucide-react";
import { useAppI18n } from "@/lib/app-i18n/provider";
import { createSampleScheduleInput } from "@/lib/scheduler/sample-data";
import type { AnnealingConfig, ClassTimetable, DayKey, ScheduleInput } from "@/lib/scheduler/types";

type GenerateResponse = {
  ok: boolean;
  elapsedMs?: number;
  summary?: {
    hardViolations: number;
    softPenalty: number;
    score: number;
  };
  warnings?: string[];
  byClass?: ClassTimetable[];
  error?: string | string[];
};

const DEFAULT_CONFIG: AnnealingConfig = {
  iterations: 12000,
  initialTemperature: 12,
  coolingRate: 0.997,
  hardPenaltyWeight: 1000
};

function buildSlotKeys(days: DayKey[], periodsPerDay: number) {
  const result: string[] = [];
  for (const day of days) {
    for (let period = 1; period <= periodsPerDay; period += 1) {
      result.push(`${day}-${period}`);
    }
  }
  return result;
}

function dayLabel(day: DayKey, isZh: boolean) {
  const map: Record<DayKey, string> = {
    Mon: isZh ? "周一" : "Mon",
    Tue: isZh ? "周二" : "Tue",
    Wed: isZh ? "周三" : "Wed",
    Thu: isZh ? "周四" : "Thu",
    Fri: isZh ? "周五" : "Fri"
  };
  return map[day];
}

export default function SchedulerPage() {
  const { isZh } = useAppI18n();
  const [data, setData] = useState<ScheduleInput>(createSampleScheduleInput());
  const [config, setConfig] = useState<AnnealingConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(false);
  const [activeClassId, setActiveClassId] = useState<string>("");
  const [result, setResult] = useState<GenerateResponse | null>(null);
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const [leaveTeacherId, setLeaveTeacherId] = useState(data.teachers[0]?.id ?? "");
  const [leaveSlot, setLeaveSlot] = useState("Mon-1");

  const [lockClassId, setLockClassId] = useState(data.classes[0]?.id ?? "");
  const [lockCourseId, setLockCourseId] = useState(data.courses[0]?.id ?? "");
  const [lockSlot, setLockSlot] = useState("Mon-1");

  const slotKeys = useMemo(() => buildSlotKeys(data.days, data.periodsPerDay), [data.days, data.periodsPerDay]);

  const classOptions = data.classes;
  const teacherOptions = data.teachers;
  const courseOptions = data.courses;

  const byClass = result?.byClass ?? [];
  const selectedClass = byClass.find((item) => item.classId === activeClassId) ?? byClass[0] ?? null;

  const slotLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const day of data.days) {
      for (let period = 1; period <= data.periodsPerDay; period += 1) {
        map.set(
          `${day}-${period}`,
          isZh ? `${dayLabel(day, isZh)} 第${period}节` : `${dayLabel(day, isZh)} P${period}`,
        );
      }
    }
    return map;
  }, [data.days, data.periodsPerDay, isZh]);

  const runSolver = async () => {
    setLoading(true);
    setStatus(null);

    try {
      const response = await fetch("/api/scheduler/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data, config })
      });
      const payload = (await response.json()) as GenerateResponse;

      if (!response.ok || !payload.ok) {
        const msg = Array.isArray(payload.error)
          ? payload.error.join("；")
          : payload.error || (isZh ? "排课失败" : "Schedule generation failed");
        throw new Error(msg);
      }

      setResult(payload);
      setActiveClassId(payload.byClass?.[0]?.classId ?? "");
      setStatus({
        type: "success",
        message: isZh
          ? `排课完成，用时 ${payload.elapsedMs}ms`
          : `Schedule generated in ${payload.elapsedMs}ms`,
      });
    } catch (error) {
      setStatus({
        type: "error",
        message: error instanceof Error ? error.message : isZh ? "排课失败" : "Schedule generation failed",
      });
    } finally {
      setLoading(false);
    }
  };

  const addTeacherLeave = () => {
    if (!leaveTeacherId || !leaveSlot) return;

    setData((prev) => ({
      ...prev,
      teachers: prev.teachers.map((teacher) => {
        if (teacher.id !== leaveTeacherId) return teacher;
        if (teacher.unavailable.includes(leaveSlot)) return teacher;
        return {
          ...teacher,
          unavailable: [...teacher.unavailable, leaveSlot]
        };
      })
    }));

    setStatus({
      type: "success",
      message: isZh
        ? "已添加老师不可用时段，重新排课即可生效"
        : "Teacher unavailability was added. Re-run the solver to apply it.",
    });
  };

  const removeTeacherLeave = (teacherId: string, slotKey: string) => {
    setData((prev) => ({
      ...prev,
      teachers: prev.teachers.map((teacher) => {
        if (teacher.id !== teacherId) return teacher;
        return {
          ...teacher,
          unavailable: teacher.unavailable.filter((slot) => slot !== slotKey)
        };
      })
    }));
  };

  const addLockedLesson = () => {
    if (!lockClassId || !lockCourseId || !lockSlot) return;
    const id = `lock_${Date.now()}`;

    setData((prev) => ({
      ...prev,
      lockedLessons: [...prev.lockedLessons, { id, classId: lockClassId, courseId: lockCourseId, slotKey: lockSlot }]
    }));
    setStatus({
      type: "success",
      message: isZh ? "已新增调课锁定规则" : "A locked lesson rule has been added",
    });
  };

  const removeLockedLesson = (lockId: string) => {
    setData((prev) => ({
      ...prev,
      lockedLessons: prev.lockedLessons.filter((item) => item.id !== lockId)
    }));
  };

  return (
    <div className="h-screen overflow-y-auto bg-slate-50 p-4 md:p-6">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
        <Card className="shadow-xs">
          <Card.Content className="p-4 md:p-5">
            <h1 className="text-xl font-semibold text-slate-900 md:text-2xl">
              {isZh ? "智能排课（模拟退火）" : "Smart Scheduling (Simulated Annealing)"}
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              {isZh
                ? "支持自动冲突修复、老师请假变更、课程锁定调课。点击\u201c一键排课\u201d后自动给出可执行课表。"
                : "Supports automatic conflict repair, teacher leave changes, and locked lesson adjustments. Click the solver to generate an executable timetable."}
            </p>
          </Card.Content>
        </Card>

        <div className="grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
          <Card className="shadow-xs">
            <Card.Content className="space-y-4 p-4 md:p-5">
            <div>
              <p className="text-sm font-semibold text-slate-900">{isZh ? "求解配置" : "Solver settings"}</p>
              <div className="mt-2 space-y-2 text-sm">
                <label className="block">
                  {isZh ? "迭代次数" : "Iterations"}
                  <input
                    type="number"
                    min={1000}
                    max={80000}
                    suppressHydrationWarning
                    value={config.iterations}
                    onChange={(e) => setConfig((prev) => ({ ...prev, iterations: Number(e.target.value || 12000) }))}
                    className="mt-1 h-9 w-full rounded border border-slate-300 px-2"
                  />
                </label>
                <label className="block">
                  {isZh ? "初始温度" : "Initial temperature"}
                  <input
                    type="number"
                    step="0.1"
                    suppressHydrationWarning
                    value={config.initialTemperature}
                    onChange={(e) => setConfig((prev) => ({ ...prev, initialTemperature: Number(e.target.value || 12) }))}
                    className="mt-1 h-9 w-full rounded border border-slate-300 px-2"
                  />
                </label>
                <label className="block">
                  {isZh ? "降温率" : "Cooling rate"}
                  <input
                    type="number"
                    step="0.0001"
                    suppressHydrationWarning
                    value={config.coolingRate}
                    onChange={(e) => setConfig((prev) => ({ ...prev, coolingRate: Number(e.target.value || 0.997) }))}
                    className="mt-1 h-9 w-full rounded border border-slate-300 px-2"
                  />
                </label>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-sm font-semibold text-slate-900">
                {isZh ? "老师请假/不可用时段" : "Teacher leave / unavailable slots"}
              </p>
              <div className="mt-2 grid gap-2">
                <select value={leaveTeacherId} onChange={(e) => setLeaveTeacherId(e.target.value)} className="h-9 rounded border border-slate-300 px-2 text-sm">
                  {teacherOptions.map((item) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </select>
                <select value={leaveSlot} onChange={(e) => setLeaveSlot(e.target.value)} className="h-9 rounded border border-slate-300 px-2 text-sm">
                  {slotKeys.map((slot) => (
                    <option key={slot} value={slot}>{slotLabelMap.get(slot) ?? slot}</option>
                  ))}
                </select>
                <Button variant="primary" onPress={addTeacherLeave} className="inline-flex h-9 items-center justify-center gap-1 rounded bg-slate-900 px-3 text-sm text-white">
                  <CalendarClock className="h-4 w-4" /> {isZh ? "添加请假" : "Add leave"}
                </Button>
              </div>

              <div className="mt-2 flex max-h-32 flex-wrap gap-1 overflow-auto text-xs text-slate-600">
                {data.teachers.flatMap((teacher) =>
                  teacher.unavailable.map((slot) => (
                    <Chip
                      key={`${teacher.id}-${slot}`}
                      variant="tertiary"
                    >
                      {teacher.name} · {slotLabelMap.get(slot) ?? slot}
                      <button type="button" className="ml-1 text-slate-400 hover:text-slate-700" onClick={() => removeTeacherLeave(teacher.id, slot)} aria-label="Remove">&times;</button>
                    </Chip>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-sm font-semibold text-slate-900">
                {isZh ? "课程锁定（调课请求）" : "Locked lessons (reschedule requests)"}
              </p>
              <div className="mt-2 grid gap-2">
                <select value={lockClassId} onChange={(e) => setLockClassId(e.target.value)} className="h-9 rounded border border-slate-300 px-2 text-sm">
                  {classOptions.map((item) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </select>
                <select value={lockCourseId} onChange={(e) => setLockCourseId(e.target.value)} className="h-9 rounded border border-slate-300 px-2 text-sm">
                  {courseOptions.map((item) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </select>
                <select value={lockSlot} onChange={(e) => setLockSlot(e.target.value)} className="h-9 rounded border border-slate-300 px-2 text-sm">
                  {slotKeys.map((slot) => (
                    <option key={slot} value={slot}>{slotLabelMap.get(slot) ?? slot}</option>
                  ))}
                </select>
                <Button variant="ghost" onPress={addLockedLesson} className="inline-flex h-9 items-center justify-center gap-1 rounded border border-slate-300 px-3 text-sm text-slate-700">
                  <Wand2 className="h-4 w-4" /> {isZh ? "添加锁定" : "Add lock"}
                </Button>
              </div>

              <div className="mt-2 flex max-h-32 flex-wrap gap-1 overflow-auto text-xs text-slate-600">
                {data.lockedLessons.length === 0 ? (
                  <p className="text-slate-400">{isZh ? "暂无锁定规则" : "No lock rules yet"}</p>
                ) : (
                  data.lockedLessons.map((item) => {
                    const clsName = data.classes.find((c) => c.id === item.classId)?.name ?? item.classId;
                    const courseName = data.courses.find((c) => c.id === item.courseId)?.name ?? item.courseId;
                    return (
                      <Chip
                        key={item.id}
                        variant="tertiary"
                      >
                        {clsName} {courseName} → {slotLabelMap.get(item.slotKey) ?? item.slotKey}
                        <button type="button" className="ml-1 text-slate-400 hover:text-slate-700" onClick={() => removeLockedLesson(item.id)} aria-label="Remove">&times;</button>
                      </Chip>
                    );
                  })
                )}
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                variant="primary"
                isDisabled={loading}
                onPress={() => void runSolver()}
                className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded bg-slate-900 px-4 text-sm text-white disabled:opacity-60"
              >
                {loading ? <Spinner size="sm" /> : <Sparkles className="h-4 w-4" />}
                {isZh ? "一键排课（模拟退火）" : "Run scheduler"}
              </Button>
              <Button
                variant="ghost"
                onPress={() => {
                  setData(createSampleScheduleInput());
                  setResult(null);
                  setStatus(null);
                }}
                className="inline-flex h-10 items-center justify-center gap-2 rounded border border-slate-300 px-3 text-sm text-slate-700"
              >
                <RefreshCcw className="h-4 w-4" /> {isZh ? "重置样例" : "Reset sample"}
              </Button>
            </div>
            </Card.Content>
          </Card>

          <Card className="shadow-xs">
            <Card.Content className="space-y-4 p-4 md:p-5">
            {status && (
              <Alert status={status.type === "success" ? "success" : "danger"}>
                <Alert.Indicator />
                <Alert.Content>
                  <Alert.Description>{status.message}</Alert.Description>
                </Alert.Content>
              </Alert>
            )}

            {result?.summary && (
              <div className="grid gap-2 md:grid-cols-3">
                <Card className="bg-slate-50">
                  <Card.Content className="p-3">
                    <p className="text-xs text-slate-500">{isZh ? "硬冲突" : "Hard conflicts"}</p>
                    <p className="text-xl font-semibold text-slate-900">{result.summary.hardViolations}</p>
                  </Card.Content>
                </Card>
                <Card className="bg-slate-50">
                  <Card.Content className="p-3">
                    <p className="text-xs text-slate-500">{isZh ? "软代价" : "Soft penalty"}</p>
                    <p className="text-xl font-semibold text-slate-900">{result.summary.softPenalty}</p>
                  </Card.Content>
                </Card>
                <Card className="bg-slate-50">
                  <Card.Content className="p-3">
                    <p className="text-xs text-slate-500">{isZh ? "总分" : "Score"}</p>
                    <p className="text-xl font-semibold text-slate-900">{result.summary.score}</p>
                  </Card.Content>
                </Card>
              </div>
            )}

            {result?.warnings && result.warnings.length > 0 && (
              <Alert status="warning">
                <Alert.Indicator />
                <Alert.Content>
                  <Alert.Title>{isZh ? "提示" : "Warnings"}</Alert.Title>
                  <Alert.Description>
                    <ul className="mt-1 list-disc pl-5 text-xs">
                      {result.warnings.map((item, idx) => (
                        <li key={`${item}-${idx}`}>{item}</li>
                      ))}
                    </ul>
                  </Alert.Description>
                </Alert.Content>
              </Alert>
            )}

            {byClass.length > 0 ? (
              <>
                <div className="flex flex-wrap gap-2">
                  {byClass.map((item) => (
                    <Button
                        key={item.classId}
                        variant={selectedClass?.classId === item.classId ? "primary" : "ghost"}
                        onPress={() => setActiveClassId(item.classId)}
                        className={`rounded px-3 py-1.5 text-sm ${selectedClass?.classId === item.classId ? "bg-slate-900 text-white" : "border border-slate-300 text-slate-700"}`}
                      >
                        {item.className}
                    </Button>
                  ))}
                </div>

                {selectedClass && (
                  <Table>
                    <Table.ScrollContainer>
                      <Table.Content aria-label={isZh ? "课表" : "Timetable"}>
                        <Table.Header>
                          <Table.Column>{isZh ? "时间" : "Time"}</Table.Column>
                          <Table.Column>{isZh ? "课程" : "Course"}</Table.Column>
                          <Table.Column>{isZh ? "教师" : "Teacher"}</Table.Column>
                          <Table.Column>{isZh ? "教室" : "Room"}</Table.Column>
                        </Table.Header>
                        <Table.Body>
                          {selectedClass.rows.map((row) => (
                            <Table.Row key={`${selectedClass.classId}-${row.slotKey}`}>
                              <Table.Cell className="font-medium">
                                {isZh ? `${dayLabel(row.day, isZh)} 第${row.period}节` : `${dayLabel(row.day, isZh)} P${row.period}`}
                              </Table.Cell>
                              <Table.Cell>{row.cell?.courseName ?? "-"}</Table.Cell>
                              <Table.Cell>{row.cell?.teacherName ?? "-"}</Table.Cell>
                              <Table.Cell>{row.cell?.roomName ?? "-"}</Table.Cell>
                            </Table.Row>
                          ))}
                        </Table.Body>
                      </Table.Content>
                    </Table.ScrollContainer>
                  </Table>
                )}
              </>
            ) : (
              <div className="flex min-h-56 items-center justify-center rounded-lg border border-dashed border-slate-300 text-sm text-slate-400">
                {isZh ? "点击左侧「一键排课」，生成课表结果" : "Run the scheduler on the left to generate a timetable"}
              </div>
            )}
            </Card.Content>
          </Card>
        </div>
      </div>
    </div>
  );
}
