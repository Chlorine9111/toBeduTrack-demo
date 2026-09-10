"use client";

import { useState } from "react";
import {
  Button,
  Checkbox,
  CheckboxGroup,
  Input,
  Label,
  ListBox,
  NumberField,
  Select,
  Slider,
  TextField,
} from "@heroui/react";
import { cn } from "@/lib/utils";
import type { DifficultyPreference, ExamTaskConfig } from "@/lib/exam-agent/types";

// ─── AP 课程数据 ────────────────────────────────────────

type CourseInfo = {
  id: string;
  name: string;
  units: { id: string; name: string }[];
};

const AP_COURSES: CourseInfo[] = [
  { id: "AP_STATS", name: "AP Statistics", units: [
    { id: "1", name: "U1: Exploring One-Variable Data (203)" },
    { id: "2", name: "U2: Exploring Two-Variable Data (62)" },
    { id: "3", name: "U3: Collecting Data (229)" },
    { id: "4", name: "U4: Probability & Random Variables (49)" },
    { id: "5", name: "U5: Sampling Distributions (142)" },
    { id: "6", name: "U6: Inference for Proportions (59)" },
    { id: "7", name: "U7: Inference for Means (200)" },
    { id: "8", name: "U8: Chi-Square (33)" },
    { id: "9", name: "U9: Inference for Slopes (23)" },
  ]},
  { id: "AP_MICRO", name: "AP Microeconomics", units: [
    { id: "1", name: "U1: Basic Economic Concepts (402)" },
    { id: "2", name: "U2: Supply & Demand (321)" },
    { id: "3", name: "U3: Production, Cost, Perfect Competition (89)" },
    { id: "4", name: "U4: Imperfect Competition (71)" },
    { id: "5", name: "U5: Factor Markets (54)" },
    { id: "6", name: "U6: Market Failure & Government (63)" },
  ]},
  { id: "APES", name: "AP Environmental Science", units: [
    { id: "1", name: "U1: The Living World: Ecosystems (161)" },
    { id: "2", name: "U2: The Living World: Biodiversity (83)" },
    { id: "3", name: "U3: Populations (101)" },
    { id: "4", name: "U4: Earth Systems & Resources (83)" },
    { id: "5", name: "U5: Land & Water Use (101)" },
    { id: "6", name: "U6: Energy Resources & Consumption (193)" },
    { id: "7", name: "U7: Atmospheric Pollution (69)" },
    { id: "8", name: "U8: Aquatic & Terrestrial Pollution (102)" },
    { id: "9", name: "U9: Global Change (107)" },
  ]},
  { id: "AP_CALC_AB", name: "AP Calculus AB", units: [
    { id: "0", name: "U0: Mixed / Review (816)" },
    { id: "1", name: "U1: Limits & Continuity (37)" },
    { id: "2", name: "U2: Definition of Differentiation (27)" },
    { id: "3", name: "U3: Differentiation: Composite (18)" },
    { id: "4", name: "U4: Contextual Applications (16)" },
    { id: "5", name: "U5: Analytical Applications (23)" },
    { id: "6", name: "U6: Integration (25)" },
    { id: "7", name: "U7: Differential Equations (14)" },
    { id: "8", name: "U8: Applications of Integration (24)" },
  ]},
  { id: "AP_CALC_BC", name: "AP Calculus BC", units: [
    { id: "0", name: "U0: Mixed / Review (742)" },
    { id: "1", name: "U1: Limits & Continuity (22)" },
    { id: "2", name: "U2: Differentiation (15)" },
    { id: "3", name: "U3: Differentiation: Composite (30)" },
    { id: "4", name: "U4: Contextual Applications (20)" },
    { id: "5", name: "U5: Analytical Applications (21)" },
    { id: "6", name: "U6: Integration (34)" },
    { id: "7", name: "U7: Differential Equations (33)" },
    { id: "9", name: "U9: Parametric, Polar, Vector (41)" },
    { id: "10", name: "U10: Infinite Sequences & Series (42)" },
  ]},
  { id: "AP_CHEM", name: "AP Chemistry", units: [
    { id: "1", name: "U1: Atomic Structure & Properties (122)" },
    { id: "2", name: "U2: Molecular & Ionic Bonding (95)" },
    { id: "3", name: "U3: Intermolecular Forces & Properties (220)" },
    { id: "4", name: "U4: Chemical Reactions (133)" },
    { id: "5", name: "U5: Kinetics (112)" },
    { id: "6", name: "U6: Thermodynamics (86)" },
    { id: "7", name: "U7: Equilibrium (131)" },
    { id: "8", name: "U8: Acids & Bases (101)" },
  ]},
  { id: "AP_BIO", name: "AP Biology", units: [
    { id: "0", name: "U0: Mixed / Review (253)" },
    { id: "1", name: "U1: Chemistry of Life (40)" },
    { id: "2", name: "U2: Cell Structure & Function (208)" },
    { id: "5", name: "U5: Heredity (99)" },
    { id: "7", name: "U7: Natural Selection & Evolution (400)" },
  ]},
  { id: "AP_MACRO", name: "AP Macroeconomics", units: [
    { id: "1", name: "U1: Basic Economic Concepts (178)" },
    { id: "2", name: "U2: Economic Indicators & Business Cycle (128)" },
    { id: "3", name: "U3: National Income & Price Determination (212)" },
    { id: "4", name: "U4: Financial Sector (182)" },
    { id: "5", name: "U5: Stabilization Policies (251)" },
    { id: "6", name: "U6: Open Economy & International (49)" },
  ]},
  { id: "AP_CSA", name: "AP Computer Science A", units: [
    { id: "1", name: "U1: Primitive Types (27)" },
    { id: "2", name: "U2: Using Objects (28)" },
    { id: "3", name: "U3: Boolean & If Statements (22)" },
    { id: "4", name: "U4: Iteration (19)" },
    { id: "5", name: "U5: Writing Classes (29)" },
    { id: "6", name: "U6: Array (16)" },
    { id: "7", name: "U7: ArrayList (19)" },
    { id: "8", name: "U8: 2D Array (11)" },
    { id: "9", name: "U9: Inheritance (20)" },
    { id: "10", name: "U10: Recursion (13)" },
  ]},
  { id: "AP_PRECALC", name: "AP Precalculus", units: [
    { id: "1", name: "U1: Polynomial & Rational Functions (145)" },
    { id: "2", name: "U2: Exponential & Logarithmic (42)" },
    { id: "3", name: "U3: Trigonometric & Polar (49)" },
  ]},
];

// ─── 难度映射 ───────────────────────────────────────────

const DIFFICULTY_MARKS = [
  { value: 0, label: "基础为主" },
  { value: 1, label: "均衡" },
  { value: 2, label: "高阶为主" },
] as const;

const DIFFICULTY_TO_VALUE: Record<DifficultyPreference, number> = {
  easy: 0,
  balanced: 1,
  hard: 2,
};

const VALUE_TO_DIFFICULTY: Record<number, DifficultyPreference> = {
  0: "easy",
  1: "balanced",
  2: "hard",
};

// ─── Props ──────────────────────────────────────────────

type ConfigFormProps = {
  onSubmit: (config: ExamTaskConfig) => void;
  loading?: boolean;
};

// ─── 组件 ───────────────────────────────────────────────

export default function ConfigForm({ onSubmit, loading = false }: ConfigFormProps) {
  const [subjectId, setSubjectId] = useState<string>("");
  const [selectedUnits, setSelectedUnits] = useState<string[]>([]);
  const [questionCount, setQuestionCount] = useState<number>(25);
  const [questionTypes, setQuestionTypes] = useState<string[]>(["MC", "FR"]);
  const [difficultyValue, setDifficultyValue] = useState<number>(1);
  const [examName, setExamName] = useState<string>("");
  const [language, setLanguage] = useState<"中文" | "英文">("中文");

  const selectedCourse = AP_COURSES.find((c) => c.id === subjectId);
  const hasUnits = (selectedCourse?.units.length ?? 0) > 0;

  const handleSubjectChange = (value: string) => {
    setSubjectId(value);
    setSelectedUnits([]);
  };

  const handleSubmit = () => {
    if (!subjectId) return;

    const course = AP_COURSES.find((c) => c.id === subjectId);
    if (!course) return;

    const resolvedUnits = selectedUnits.length > 0 ? selectedUnits : course.units.map((u) => u.id);
    const resolvedUnitNames = resolvedUnits.map(
      (uid) => course.units.find((u) => u.id === uid)?.name ?? uid
    );

    const config: ExamTaskConfig = {
      subject: subjectId,
      subjectName: course.name,
      units: resolvedUnits,
      unitNames: resolvedUnitNames,
      questionCount,
      questionTypes: questionTypes as ("MC" | "FR")[],
      difficultyPreference: VALUE_TO_DIFFICULTY[difficultyValue] ?? "balanced",
      language,
      examName: examName.trim() || undefined,
    };

    onSubmit(config);
  };

  const isValid = subjectId !== "" && questionTypes.length > 0;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">新建出卷任务</h2>
        <p className="mt-0.5 text-sm text-muted">配置考试参数，AI 将自动生成试卷</p>
      </div>

      {/* 学科 */}
      <Select
        placeholder="请选择学科"
        selectedKey={subjectId || null}
        onSelectionChange={(key) => handleSubjectChange(String(key ?? ""))}
        className="w-full"
      >
        <Label>学科</Label>
        <Select.Trigger>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            {AP_COURSES.map((course) => (
              <ListBox.Item key={course.id} id={course.id} textValue={course.name}>
                {course.name}
                <ListBox.ItemIndicator />
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>

      {/* 单元（多选，仅当选择了有单元的课程时显示） */}
      {hasUnits && (
        <Select
          placeholder="默认全部单元"
          selectionMode="multiple"
          value={selectedUnits}
          onChange={(keys) => setSelectedUnits(keys as string[])}
          className="w-full"
        >
          <Label>单元（可多选）</Label>
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox selectionMode="multiple">
              {(selectedCourse?.units ?? []).map((unit) => (
                <ListBox.Item key={unit.id} id={unit.id} textValue={unit.name}>
                  {unit.name}
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
      )}

      {/* 题目数量 */}
      <NumberField
        defaultValue={25}
        minValue={5}
        maxValue={50}
        value={questionCount}
        onChange={setQuestionCount}
        className="w-full"
      >
        <Label>题目数量（5–50）</Label>
        <NumberField.Group>
          <NumberField.DecrementButton />
          <NumberField.Input />
          <NumberField.IncrementButton />
        </NumberField.Group>
      </NumberField>

      {/* 题型 */}
      <CheckboxGroup
        value={questionTypes}
        onChange={setQuestionTypes}
        name="questionTypes"
        className="w-full"
      >
        <Label>题型</Label>
        <div className="mt-2 flex gap-4">
          <Checkbox value="MC">
            <Checkbox.Control>
              <Checkbox.Indicator />
            </Checkbox.Control>
            <Checkbox.Content>
              <Label>MC（选择题）</Label>
            </Checkbox.Content>
          </Checkbox>
          <Checkbox value="FR">
            <Checkbox.Control>
              <Checkbox.Indicator />
            </Checkbox.Control>
            <Checkbox.Content>
              <Label>FR（问答题）</Label>
            </Checkbox.Content>
          </Checkbox>
        </div>
      </CheckboxGroup>

      {/* 难度 */}
      <div className="w-full">
        <Slider
          minValue={0}
          maxValue={2}
          step={1}
          value={difficultyValue}
          onChange={(val) => setDifficultyValue(typeof val === "number" ? val : val[0])}
          className="w-full"
        >
          <Label>难度偏好</Label>
          <Slider.Track>
            <Slider.Fill />
            <Slider.Thumb />
          </Slider.Track>
        </Slider>
        <div className="mt-2 flex justify-between text-xs text-muted">
          {DIFFICULTY_MARKS.map((mark) => (
            <span
              key={mark.value}
              className={cn(
                "transition-colors",
                difficultyValue === mark.value && "font-medium text-foreground"
              )}
            >
              {mark.label}
            </span>
          ))}
        </div>
      </div>

      {/* 试卷名称（可选） */}
      <TextField
        value={examName}
        onChange={setExamName}
        className="w-full"
      >
        <Label>试卷名称（可选）</Label>
        <Input placeholder="例：期中考试模拟卷" />
      </TextField>

      {/* 语言切换 */}
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-foreground">出题语言</span>
        <div className="flex gap-2">
          <Button
            variant={language === "中文" ? "primary" : "outline"}
            size="sm"
            onPress={() => setLanguage("中文")}
          >
            中文
          </Button>
          <Button
            variant={language === "英文" ? "primary" : "outline"}
            size="sm"
            onPress={() => setLanguage("英文")}
          >
            英文
          </Button>
        </div>
      </div>

      {/* 提交 */}
      <Button
        variant="primary"
        size="lg"
        onPress={handleSubmit}
        isDisabled={!isValid || loading}
        isPending={loading}
        className="w-full"
      >
        {({ isPending }) => (isPending ? "生成中…" : "开始出卷")}
      </Button>
    </div>
  );
}
