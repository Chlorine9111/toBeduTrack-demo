# Follow-up Questions System - Implementation Plan

## Overview

Based on Maxwell's requirements, implementing a two-phase follow-up system:
1. **Pre-generation**: Parameter clarification (minimize questions, maximize inference)
2. **Post-generation**: Result optimization suggestions

## Current System Analysis

### Existing Follow-up Implementation

The current system (`app/api/chat/intent/route.ts`) already has:
- `followUpQuestions` field in intent response
- `refineFollowUpQuestions()` function
- Option-based question system
- Required vs preference question distinction

**Key insight**: The foundation exists! We need to ENHANCE, not rebuild.

### What's Missing (from requirements)

1. **Pre-generation enhancements**:
   - ✅ Teacher profile context (partially exists via previousIntent)
   - ❌ Historical behavior analysis
   - ❌ Confidence-based question filtering
   - ❌ Natural language confirmation (currently uses options)

2. **Post-generation system**:
   - ❌ Result self-check logic
   - ❌ Quality assessment
   - ❌ Suggestion generation
   - ❌ Historical pattern matching

## Implementation Strategy

### Phase 1: Data Model (MVP - No historical analysis yet)

```typescript
// types/followup.ts
export interface TeacherProfile {
  id: string;
  preferences: {
    defaultDifficulty?: number;
    defaultCount?: number;
    preferredTemplates?: string[];
  };
  teachingContext: {
    currentCourse?: string;
    currentUnit?: string;
    gradeLevel?: string;
  };
  // Phase 2: Add behavioral data
  // behavioralPatterns?: {
  //   commonAdjustments: Record<string, unknown>;
  //   modificationHistory: Array<{field: string; from: unknown; to: unknown}>;
  // };
}

export interface ParameterInference {
  field: string;
  value: unknown;
  confidence: 'high' | 'medium' | 'low' | 'unknown';
  source: 'explicit' | 'profile' | 'history' | 'default';
}

export interface PostGenerationSuggestion {
  id: string;
  type: 'correctness' | 'quality' | 'personalization' | 'workflow';
  priority: number; // 1-4, 1 highest
  title: string;
  description: string;
  action: {
    type: 'replace_item' | 'adjust_difficulty' | 'export' | 'custom';
    params: Record<string, unknown>;
  };
}
```

### Phase 2: System Prompts (Opus)

Create two specialized prompts:

#### Pre-generation Prompt
```
You are a parameter inference engine for a teacher assistant.

INPUT:
- Teacher's message
- Teacher profile (course, preferences, teaching context)
- Previous task parameters

TASK:
1. Extract all explicit parameters from the message
2. Infer missing parameters using:
   - Profile data (high confidence)
   - Pedagogical defaults (medium confidence)
3. Evaluate: can we generate with current info, or MUST we ask?

RULES:
- Only ask if parameter is CRITICAL and UNKNOWN
- If confidence >= medium, include in confirmation, don't ask separately
- Maximum 1 question (preferably 0)

OUTPUT (JSON):
{
  "inferences": [{"field": "difficulty", "value": 2, "confidence": "high", "source": "profile"}],
  "mustAsk": {"field": "topicFocus", "reason": "Cannot generate without knowing which concepts to cover"},
  "confirmation": "AP Calc Unit 3, 6道选择题, 中等难度, 包含 Chain Rule 应用. 直接生成?"
}
```

#### Post-generation Prompt
```
You are a quality checker for generated educational content.

INPUT:
- Generated content (exercises, rubric, etc.)
- Original parameters
- Teacher profile

TASK:
1. CORRECTNESS: Check for errors (wrong answers, contradictions)
2. QUALITY: Verify difficulty distribution, knowledge coverage
3. PATTERNS: Compare with teacher's typical adjustments (if available)
4. WORKFLOW: Suggest natural next steps

OUTPUT (JSON, max 3 suggestions):
[
  {
    "type": "correctness",
    "priority": 1,
    "title": "题目 #3 答案有误",
    "description": "选项 B 应该是正确答案,当前标记的是 C",
    "action": {"type": "replace_item", "params": {"itemId": 3}}
  }
]
```

### Phase 3: Core Logic

#### Enhance existing `refineFollowUpQuestions()`

Current implementation filters questions. We'll add:
- Confidence scoring
- Automatic inference
- Natural language confirmation generation

#### New: `checkGeneratedContent()`

```typescript
async function checkGeneratedContent(params: {
  contentType: 'exercises' | 'rubric' | 'lesson';
  content: unknown;
  originalParams: Record<string, unknown>;
  teacherProfile?: TeacherProfile;
}): Promise<PostGenerationSuggestion[]>
```

### Phase 4: API Integration

Modify `/api/chat/intent/route.ts`:
- Add profile loading
- Enhance inference logic
- Add confidence scoring

Create new route `/api/generation/check`:
- Post-generation quality check
- Suggestion generation

### Phase 5: UI Components

1. **Confirmation Dialog** (replaces multi-round questions)
```tsx
<ConfirmationDialog>
  <p>AP Calculus Unit 3, 6道选择题, 中等难度, Chain Rule应用</p>
  <div>
    <Button onClick={confirm}>直接生成</Button>
    <Button onClick={adjust}>调整参数</Button>
  </div>
</ConfirmationDialog>
```

2. **Suggestion Buttons** (post-generation)
```tsx
<SuggestionBar>
  {suggestions.map(s => (
    <SuggestionButton
      priority={s.priority}
      onClick={() => applySuggestion(s)}
    >
      {s.title}
    </SuggestionButton>
  ))}
</SuggestionBar>
```

## MVP Scope (This Implementation)

✅ Include:
- Enhanced parameter inference with confidence scoring
- Natural language confirmation (reduce multi-round questions to single confirmation)
- Post-generation quality check (correctness + quality)
- Suggestion system (max 3 suggestions, sorted by priority)
- UI components for confirmation and suggestions

❌ Defer to Phase 2:
- Historical behavior analysis
- Personalized pattern matching
- Multi-session learning

## Testing Plan

1. **Unit tests**: Inference logic, confidence scoring
2. **Integration tests**: Full flow from intent to suggestions
3. **Manual testing**: Real teacher workflows
4. **Edge cases**: Ambiguous inputs, conflicting parameters

## Migration Strategy

- Non-breaking: All new features are additive
- Backward compatible: Existing API contracts unchanged
- Feature flag: Can enable/disable new flow

## Success Metrics

- Average questions per task: Target <0.5 (down from current ~1.5)
- Confirmation accuracy: >90% (teacher proceeds without adjustment)
- Suggestion adoption rate: >30% (teacher clicks at least one suggestion)

---

*Using Opus model for all AI inference tasks*
