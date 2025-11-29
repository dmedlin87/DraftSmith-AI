# Critique Intensity Settings

## Overview

Allow users to control how rigorous/picky the AI critique is. Different authors have different needs:

- **Professional/MFA-level authors** want surgical precision and high-bar feedback
- **Hobby authors** want encouraging feedback that still helps them improve without overwhelming

This is NOT about dumbing down the AI or making it a "feel good" bot. It's about calibrating expectations and focus areas appropriately for the writer's goals.

---

## Proposed Solution: Critique Presets

### Option A: Named Presets (Recommended)

Three distinct modes that affect both **analysis** and **agent feedback**:

| Preset | Label | Target Audience | Focus |
|--------|-------|-----------------|-------|
| `developmental` | **Developmental** | Hobby/early writers | Big-picture issues only. Story logic, character consistency, major pacing problems. Ignores prose-level nitpicks. |
| `standard` | **Standard** | Intermediate writers | Balanced critique. Prose issues, moderate structural feedback, consistency checks. Default mode. |
| `intensive` | **Intensive** | Advanced/professional | Publication-ready bar. Line-level prose critique, nuanced pacing, deep consistency analysis, industry standards. |

**Why presets over a slider:**

- Sliders feel arbitrary ("what does 60% strictness mean?")
- Presets map to real editorial stages (developmental edit → line edit)
- Easier to implement and test
- More discoverable UX

### Option B: Slider with Labels

If presets feel too limiting, a 1-5 slider with labeled stops:

```
Encouraging ───────────────────────── Intensive
    1          2          3          4          5
 (big        (balanced)            (publication
 picture)                          ready)
```

Not recommended—middle values become meaningless.

---

## Implementation Plan

### Phase 1: Types & State

**File:** `types/critiqueSettings.ts`

```ts
export type CritiqueIntensity = 'developmental' | 'standard' | 'intensive';

export interface CritiqueSettings {
  intensity: CritiqueIntensity;
}

export const CRITIQUE_PRESETS: Record<CritiqueIntensity, CritiquePreset> = {
  developmental: {
    id: 'developmental',
    label: 'Developmental',
    description: 'Focus on story-level issues: plot, characters, and major pacing problems.',
    icon: '🌱',
    color: '#10b981', // green
  },
  standard: {
    id: 'standard',
    label: 'Standard',
    description: 'Balanced critique covering structure, prose, and consistency.',
    icon: '⚖️',
    color: '#6366f1', // indigo
  },
  intensive: {
    id: 'intensive',
    label: 'Intensive',
    description: 'Publication-ready bar. Line-level prose, deep analysis, industry standards.',
    icon: '🔬',
    color: '#ef4444', // red
  },
};
```

**Store addition** (in `useProjectStore` or new `useSettingsStore`):

```ts
interface SettingsSlice {
  critiqueIntensity: CritiqueIntensity;
  setCritiqueIntensity: (intensity: CritiqueIntensity) => void;
}
```

### Phase 2: Prompt Engineering

The intensity setting modifies system prompts for both **analysis** and **agent chat**.

**New file:** `services/gemini/critiquePrompts.ts`

```ts
export const INTENSITY_MODIFIERS: Record<CritiqueIntensity, string> = {
  developmental: `
[CRITIQUE INTENSITY: DEVELOPMENTAL]
You are providing a developmental edit. Focus ONLY on:
- Major plot holes and logic breaks
- Character consistency across the manuscript
- Pacing at the chapter/act level (not sentence-level)
- Core story questions (Is the premise clear? Is the conflict compelling?)

DO NOT critique:
- Prose style or word choice (unless egregiously unclear)
- Minor inconsistencies that don't affect the story
- "Writerly" concerns like show-don't-tell at paragraph level

Your goal: Help the author know if their STORY works before they polish the prose.
Be encouraging when the fundamentals are solid. Point out what's working.
`,

  standard: `
[CRITIQUE INTENSITY: STANDARD]
Provide balanced editorial feedback covering:
- Plot structure and pacing
- Character arcs and consistency
- Prose clarity and flow
- Dialogue authenticity
- Show vs. tell balance
- Setting integration

Flag issues proportionally—don't nitpick every sentence, but don't ignore recurring problems.
Balance critique with acknowledgment of strengths.
`,

  intensive: `
[CRITIQUE INTENSITY: INTENSIVE]
You are providing a rigorous, publication-ready critique. Apply professional editorial standards:
- Line-level prose analysis (rhythm, word choice, redundancy)
- Deep structural examination (scene-by-scene pacing, tension curves)
- Thorough consistency checking (timeline, character details, world rules)
- Industry expectations (genre conventions, market positioning)
- Subtle craft issues (POV discipline, filter words, dialogue attribution)

Be precise and demanding. The author wants to know everything that could be improved.
Don't soften feedback—clarity is kindness. Cite specific passages.
`
};
```

### Phase 3: Integration Points

#### Analysis Service (`services/gemini/analysis.ts`)

Inject intensity modifier into analysis prompts:

```ts
export const fetchPacingAnalysis = async (
  text: string, 
  intensity: CritiqueIntensity = 'standard'
) => {
  const intensityMod = INTENSITY_MODIFIERS[intensity];
  const prompt = `${intensityMod}\n\n${PACING_PROMPT}`;
  // ... rest of function
};
```

#### Agent Service (`services/gemini/agent.ts`)

Modify `createAgentSession` to accept intensity:

```ts
export const createAgentSession = (
  lore?: Lore, 
  analysis?: AnalysisResult, 
  fullManuscriptContext?: string, 
  persona?: Persona,
  intensity: CritiqueIntensity = 'standard'  // NEW
) => {
  const intensityMod = INTENSITY_MODIFIERS[intensity];
  
  let systemInstruction = AGENT_SYSTEM_INSTRUCTION
    .replace('{{INTENSITY_MODIFIER}}', intensityMod)  // NEW
    .replace('{{LORE_CONTEXT}}', loreContext)
    // ...
};
```

#### Inline Comments (`hooks/useInlineComments.ts`)

Filter comments by severity based on intensity:

- **Developmental:** Only show "critical" severity
- **Standard:** Show "critical" + "moderate"
- **Intensive:** Show all severities

### Phase 4: Settings UI

**New component:** `features/settings/components/CritiqueIntensitySelector.tsx`

```tsx
export const CritiqueIntensitySelector = () => {
  const { critiqueIntensity, setCritiqueIntensity } = useSettingsStore();
  
  return (
    <div className="space-y-3">
      <label className="text-sm font-medium text-slate-300">
        Critique Intensity
      </label>
      <div className="grid grid-cols-3 gap-2">
        {Object.values(CRITIQUE_PRESETS).map(preset => (
          <button
            key={preset.id}
            onClick={() => setCritiqueIntensity(preset.id)}
            className={cn(
              "p-3 rounded-lg border-2 transition-all",
              critiqueIntensity === preset.id 
                ? "border-indigo-500 bg-indigo-500/10" 
                : "border-slate-700 hover:border-slate-600"
            )}
          >
            <div className="text-2xl mb-1">{preset.icon}</div>
            <div className="font-medium">{preset.label}</div>
            <div className="text-xs text-slate-400 mt-1">
              {preset.description}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};
```

**Placement options:**

1. **Project Settings panel** (per-project setting)
2. **Global Settings modal** (app-wide default)
3. **Quick toggle in Analysis Panel header** (easy access)

Recommendation: Store at **project level** with global default. Authors might want different intensity for different manuscripts.

---

## UX Considerations

### Discoverability

- Show current intensity badge in Analysis Panel header
- Tooltip explaining what the current mode focuses on
- First-time prompt when analysis completes: "Want more/less detailed feedback?"

### Avoiding "Dumb Mode" Perception

- Never call it "easy mode" or imply the author isn't capable
- Frame as "editorial focus" not "difficulty level"
- Developmental mode is what professional editors actually do first

### Transitioning Between Modes

- When switching to higher intensity, warn: "This will re-analyze with stricter standards"
- Cache analysis results per intensity level to allow comparison

---

## Future Extensions

### Per-Category Intensity

Let users set different intensity per analysis category:

```
Plot Analysis:     [Developmental ▼]
Character Analysis: [Standard ▼]  
Prose Analysis:    [Intensive ▼]
```

### Custom Thresholds

Advanced users could define custom rules:

- "Flag adverbs only if >5 per page"
- "Ignore passive voice in dialogue"

### Learning Mode

Track which suggestions users accept/reject and calibrate automatically.

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `types/critiqueSettings.ts` | Create | Types and preset definitions |
| `features/settings/store/useSettingsStore.ts` | Create | Global settings store |
| `services/gemini/critiquePrompts.ts` | Create | Intensity modifier prompts |
| `services/gemini/analysis.ts` | Modify | Accept intensity param |
| `services/gemini/agent.ts` | Modify | Accept intensity param |
| `services/gemini/prompts.ts` | Modify | Add `{{INTENSITY_MODIFIER}}` placeholder |
| `features/settings/components/CritiqueIntensitySelector.tsx` | Create | UI component |
| `features/analysis/components/AnalysisPanel.tsx` | Modify | Show intensity badge, quick toggle |
| `hooks/useInlineComments.ts` | Modify | Filter by intensity |

---

## Open Questions

1. **Per-project or global?** Leaning per-project with global default
2. **Re-analyze on change?** Probably yes, with confirmation
3. **Affect agent chat only, or also analysis?** Both
4. **Show both versions side-by-side?** Nice-to-have, not MVP

---

## MVP Scope

For initial implementation:

1. ✅ Types and presets
2. ✅ Settings store with persistence  
3. ✅ Prompt modifiers for all three levels
4. ✅ Integration with agent chat
5. ✅ Basic UI selector
6. ⏳ Analysis integration (can follow)
7. ⏳ Inline comment filtering (can follow)
