# Quill AI Testing Plan

> This document describes the testing strategy and phases for Quill AI.  
> For up-to-date test counts and coverage, see [TEST_COVERAGE.md](./TEST_COVERAGE.md), which is auto-generated from the Vitest coverage report.

## Current State

### Coverage Summary (snapshot)

> Snapshot as of **2025-11-29** from a specific `npm run test:coverage` run. For current coverage and test counts, always use the auto-generated [TEST_COVERAGE.md](./TEST_COVERAGE.md).

| Metric | Snapshot | Target |
|--------|----------|--------|
| Statements | 85.96% | 80% |
| Branches | 79.8% | 75% |
| Functions | 72.67% | 80% |
| Lines | 85.96% | 80% |

#### Historical Coverage Snapshot (2025-11-29)

The following table is the direct output from `npm run test:coverage` on 2025-11-29. It is kept here as a historical example only; for current coverage, refer to [TEST_COVERAGE.md](./TEST_COVERAGE.md).

```text
All files                                    |   85.96 |     79.8 |   72.67 |   85.96 |                                                     
 ManuscriptMate                              |   93.42 |     87.5 |      50 |   93.42 |                                                     
  App.tsx                                    |     100 |      100 |     100 |     100 |                                                     
  index.tsx                                  |       0 |        0 |       0 |       0 | 1-15                                               
  types.ts                                   |     100 |      100 |     100 |     100 |                                                     
 ManuscriptMate/config                       |   93.44 |    88.88 |   83.33 |   93.44 |                                                     
  api.ts                                     |     100 |      100 |     100 |     100 |                                                     
  index.ts                                   |       0 |        0 |       0 |       0 | 1-8                                                
  models.ts                                  |     100 |      100 |     100 |     100 |                                                     
 ManuscriptMate/features                     |       0 |        0 |       0 |       0 |                                                     
  index.ts                                   |       0 |        0 |       0 |       0 | 1-29                                               
 ManuscriptMate/features/agent               |       0 |        0 |       0 |       0 |                                                     
  index.ts                                   |       0 |        0 |       0 |       0 | 1-15                                               
 ManuscriptMate/features/agent/components    |   77.25 |    66.66 |   70.58 |   77.25 |                                                     
  AIPresenceOrb.tsx                          |   98.26 |    94.73 |     100 |   98.26 | 163-166                                             
  ActivityFeed.tsx                           |     100 |     62.5 |     100 |     100 | 31-37                                               
  ChatInterface.tsx                          |   75.29 |    52.94 |      75 |   75.29 | 59-61,83-92,102-111,140-192,203-208,262,264,266    
  PersonaSelector.tsx                        |   40.25 |     62.5 |      25 |   40.25 | 27-30,38-39,65-91,96-157                           
 ManuscriptMate/features/agent/hooks         |   82.51 |     61.7 |     100 |   82.51 |                                                     
  useAgentService.ts                         |   85.86 |    69.69 |     100 |   85.86 | 115-120,122-135,183-184,187-188,206-221            
  useAgenticEditor.ts                        |   76.68 |    42.85 |     100 |   76.68 | 67-68,74-75,79-88,103-105,108-113,116-129,132      
 ManuscriptMate/features/analysis            |       0 |        0 |       0 |       0 |                                                     
  index.ts                                   |       0 |        0 |       0 |       0 | 1-25                                               
 ManuscriptMate/features/analysis/components |    99.3 |    92.42 |   90.32 |    99.3 |                                                     
  AnalysisPanel.tsx                          |   99.54 |    84.21 |      75 |   99.54 | 53                                                 
  BrainstormingPanel.tsx                     |     100 |      100 |     100 |     100 |                                                     
  CharactersSection.tsx                      |   99.28 |    93.75 |     100 |   99.28 | 16                                                 
  Dashboard.tsx                              |     100 |      100 |     100 |     100 |                                                     
  ExecutiveSummary.tsx                       |     100 |      100 |     100 |     100 |                                                     
  PacingSection.tsx                          |   98.07 |    91.66 |      75 |   98.07 | 27-29                                              
  PlotIssuesSection.tsx                      |   98.64 |    77.77 |     100 |   98.64 | 22                                                 
  SettingConsistencySection.tsx              |     100 |      100 |     100 |     100 |                                                     
  StrengthsWeaknesses.tsx                    |     100 |      100 |     100 |     100 |                                                     
 ManuscriptMate/features/analysis/context    |   95.83 |    70.58 |     100 |   95.83 |                                                     
  AnalysisContext.tsx                        |   95.83 |    70.58 |     100 |   95.83 | 125-127,143-145,155-157,215-216                    
 ManuscriptMate/features/editor              |       0 |        0 |       0 |       0 |                                                     
  index.ts                                   |       0 |        0 |       0 |       0 | 1-25                                               
 ManuscriptMate/features/editor/components   |   79.95 |     83.8 |   77.33 |   79.95 |                                                     
  CommentCard.tsx                            |   28.13 |      100 |       0 |   28.13 | 30-72,107-229                                       
  DiffViewer.tsx                             |     100 |      100 |     100 |     100 |                                                     
  EditorWorkspace.tsx                        |   92.68 |    82.35 |   44.44 |   92.68 | 72-86                                               
  FindReplaceModal.tsx                       |   95.23 |     62.5 |   81.81 |   95.23 | 46-47,115-121,173-174                               
  MagicBar.tsx                               |   97.48 |    91.52 |    87.5 |   97.48 | 161,243-245,303-306                                
  RichTextEditor.tsx                         |   68.81 |       72 |   66.66 |   68.81 | ...,175-193,201-202,225,229-230,234-235,244,262-275
  VersionControlPanel.tsx                    |   98.47 |    94.11 |   94.44 |   98.47 | 192,195,302-304                                     
  VisualDiff.tsx                             |       0 |        0 |       0 |       0 | 1-50                                               
 ManuscriptMate/features/editor/extensions   |    55.8 |      100 |   21.05 |    55.8 |                                                     
  CommentMark.ts                             |    55.8 |      100 |   21.05 |    55.8 | ...69-70,76-77,83-84,98-143,149-151,154-171,174-176
 ManuscriptMate/features/editor/hooks        |   90.66 |    78.99 |      90 |   90.66 |                                                     
  useAutoResize.ts                           |    61.6 |    84.61 |      50 |    61.6 | 45-46,72-112                                       
  useBranching.ts                            |   97.36 |    82.75 |     100 |   97.36 | 106-108,127                                        
  useDocumentHistory.ts                      |   97.74 |    83.33 |     100 |   97.74 | 40-41,49-50                                        
  useInlineComments.ts                       |   92.57 |     90.9 |     100 |   92.57 | 128-144                                             
  useMagicEditor.ts                          |   93.58 |    47.36 |     100 |   93.58 | 86-89,118-121,141-143,164                          
 ManuscriptMate/features/layout              |   87.07 |    75.89 |    56.6 |   87.07 |                                                     
  EditorLayout.tsx                           |   89.28 |    91.66 |      60 |   89.28 | 89-94,100-114,223-234                               
  MainLayout.tsx                             |   86.08 |    67.14 |      50 |   86.08 | ...-104,107-109,112-113,252-255,299-303,307,318-340
  UploadLayout.tsx                           |     100 |      100 |     100 |     100 |                                                     
  Workspace.tsx                              |     100 |      100 |     100 |     100 |                                                     
  index.ts                                   |       0 |        0 |       0 |       0 | 1-10                                               
 ManuscriptMate/features/lore                |     100 |      100 |     100 |     100 |                                                     
  index.ts                                   |     100 |      100 |     100 |     100 |                                                     
 ManuscriptMate/features/lore/components     |   78.63 |       69 |   43.58 |   78.63 |                                                     
  KnowledgeGraph.tsx                         |      85 |    68.33 |    62.5 |      85 | ...-286,312,316-337,340-354,357-360,374-375,427-429
  LoreManager.tsx                            |   72.82 |       70 |    38.7 |   72.82 | ...,312-315,318-322,334,343,359-361,376-378,425-477
 ManuscriptMate/features/project             |     100 |      100 |     100 |     100 |                                                     
  index.ts                                   |     100 |      100 |     100 |     100 |                                                     
 ManuscriptMate/features/project/components  |   82.96 |    83.83 |   69.72 |   82.96 |                                                     
  FileUpload.tsx                             |     100 |      100 |     100 |     100 |                                                     
  ImportWizard.tsx                           |   74.21 |    74.87 |    58.2 |   74.21 | ...531-1532,1539-1540,1557,1566,1576-1592,1610-1615
  ProjectDashboard.tsx                       |    94.5 |    82.75 |   69.23 |    94.5 | 92-99,172-173,181-188,202-203                      
  ProjectSidebar.tsx                         |     100 |      100 |     100 |     100 |                                                     
  StoryBoard.tsx                             |   97.67 |      100 |   94.11 |   97.67 | 10-19                                              
 ManuscriptMate/features/project/store       |   98.98 |    82.08 |     100 |   98.98 |                                                     
  useProjectStore.ts                         |   98.98 |    82.08 |     100 |   98.98 | 45-46,65                                           
 ManuscriptMate/features/shared              |     100 |      100 |     100 |     100 |                                                     
  index.ts                                   |     100 |      100 |     100 |     100 |                                                     
 ManuscriptMate/features/shared/components   |     100 |      100 |     100 |     100 |                                                     
  ErrorBoundary.tsx                          |     100 |      100 |     100 |     100 |                                                     
  UsageBadge.tsx                             |     100 |      100 |     100 |     100 |                                                     
 ManuscriptMate/features/shared/context      |   94.63 |    68.75 |   85.71 |   94.63 |                                                     
  EditorContext.tsx                          |   92.49 |    70.27 |     100 |   92.49 | 94,143-156,161-162,167-168,220-225                 
  EngineContext.tsx                          |     100 |      100 |   66.66 |     100 |                                                     
  UsageContext.tsx                           |    97.1 |    57.14 |     100 |    97.1 | 28-29                                              
 ManuscriptMate/features/shared/hooks        |   84.25 |    68.42 |   88.88 |   84.25 |                                                     
  useDraftSmithEngine.ts                     |    81.3 |    35.29 |     100 |    81.3 | 55-56,58-59,124-126,142-146,155-156,194-196,198-226
  useManuscriptIndexer.ts                    |   94.87 |    69.23 |     100 |   94.87 | 60-63                                              
  usePlotSuggestions.ts                      |     100 |      100 |     100 |     100 |                                                     
  useViewportCollision.ts                    |      80 |    83.33 |      75 |      80 | 90-94,158-190                                       
 ManuscriptMate/features/shared/utils        |    81.2 |    80.76 |   88.88 |    81.2 |                                                     
  diffUtils.ts                               |     100 |      100 |     100 |     100 |                                                     
  textLocator.ts                             |   80.62 |    80.39 |    87.5 |   80.62 | 50-51,57-86,124-125,129-130,134-135,139-148,182,196
 ManuscriptMate/features/voice               |       0 |        0 |       0 |       0 |                                                     
  index.ts                                   |       0 |        0 |       0 |       0 | 1-21                                               
 ManuscriptMate/features/voice/components    |   97.12 |    81.25 |     100 |   97.12 |                                                     
  VoiceMode.tsx                              |   97.12 |    81.25 |     100 |   97.12 | 29-30,93-95                                        
 ManuscriptMate/features/voice/hooks         |   89.69 |    72.15 |   88.88 |   89.69 |                                                     
  useAudioController.ts                      |   86.31 |    62.85 |   66.66 |   86.31 | ...-122,145-146,162-165,191-197,205-207,215,253-263
  useTextToSpeech.ts                         |   97.01 |       75 |     100 |   97.01 | 41-42                                              
  useVoiceSession.ts                         |   91.06 |    82.14 |     100 |   91.06 | 134-135,152-154,181-182,225-239,268-271            
 ManuscriptMate/features/voice/services      |     100 |      100 |     100 |     100 |                                                     
  audioUtils.ts                              |     100 |      100 |     100 |     100 |                                                     
 ManuscriptMate/public                       |       0 |        0 |       0 |       0 |                                                     
  audio-processor.js                         |       0 |        0 |       0 |       0 | 1-81                                               
 ManuscriptMate/services                     |   87.47 |    79.31 |     100 |   87.47 |                                                     
  db.ts                                      |     100 |      100 |     100 |     100 |                                                     
  manuscriptIndexer.ts                       |   76.05 |    70.58 |     100 |   76.05 | 22-55                                              
  manuscriptParser.ts                        |   83.83 |    81.81 |     100 |   83.83 | 73-92,154-160                                      
  pdfExport.ts                               |    97.5 |    83.33 |     100 |    97.5 | 15-17,176-177                                      
 ManuscriptMate/services/gemini              |   98.64 |    88.97 |   97.05 |   98.64 |                                                     
  agent.ts                                   |     100 |    95.23 |     100 |     100 | 88                                                  
  analysis.ts                                |     100 |    93.54 |     100 |     100 | 67,293                                              
  audio.ts                                   |   96.55 |    81.25 |   88.88 |   96.55 | 16-17,75-76                                        
  client.ts                                  |     100 |      100 |     100 |     100 |                                                     
  prompts.ts                                 |     100 |      100 |     100 |     100 |                                                     
  resilientParser.ts                         |   95.16 |    87.17 |     100 |   95.16 | 78-85,96-97,179-180                                
  tokenGuard.ts                              |   97.76 |    83.33 |     100 |   97.76 | 72,112-113                                          
 ManuscriptMate/services/telemetry           |     100 |      100 |     100 |     100 |                                                     
  errorReporter.ts                           |     100 |      100 |     100 |     100 |                                                     
 ManuscriptMate/types                        |     100 |      100 |     100 |     100 |                                                     
  personas.ts                                |     100 |      100 |     100 |     100 |   
```

### Well Covered (>80%)

- `config/` — ~93%
- `services/gemini/*` — >98%
- `features/project/store/useProjectStore.ts` — ~99%
- `features/shared/context/EditorContext.tsx` — ~92%
- `types/` — 100%

### Partially Covered (40-80%)

- `features/agent/components/` — ChatInterface, PersonaSelector
- `features/editor/components/` — RichTextEditor, CommentCard, VisualDiff
- `features/lore/components/` — KnowledgeGraph, LoreManager
- `features/shared/hooks/` — useDraftSmithEngine, useViewportCollision
- `services/` (non-Gemini utilities like `manuscriptIndexer`, `manuscriptParser`)

### Remaining Focus Areas

These areas are functionally tested but still below the long-term coverage targets and are good candidates for future polish:

- **Agent UI:** Deeper interaction paths in `ChatInterface.tsx`, additional branches in Persona switching.
- **Editor UI:** Edge cases in `RichTextEditor.tsx`, `CommentCard.tsx`, and `VisualDiff.tsx` (e.g., unusual diff shapes, long comments, collision handling).
- **Lore Tools:** More scenarios in `KnowledgeGraph.tsx` (drag/hover behaviors) and `LoreManager.tsx` (world rules editing, complex character relationships).
- **Shared hooks:** Additional branches in `useDraftSmithEngine.ts` and `useViewportCollision.ts`.
- **Voice & audio:** Minor remaining branches in `useAudioController.ts` and the AudioWorklet pipeline.

---

## Definition of Done

Coverage is considered **complete** when:

1. **80%+ statement coverage** on all non-UI logic (services, stores, hooks, utils)
2. **60%+ statement coverage** on React components (render + key interactions)
3. **All critical paths** have explicit tests (auth, data persistence, API calls)
4. **Zero regressions** — tests catch breaking changes
5. **CI-enforced thresholds** prevent coverage drops

---

## Testing Phases

### Phase 1: Core Logic (Priority: Critical)

**Goal:** Cover business logic that doesn't require React rendering  
**Target:** +30% coverage

| Module | Test File | Status | Lines |
|--------|-----------|--------|-------|
| `services/gemini/agent.ts` | `tests/services/gemini/agent.test.ts` | ✅ Exists | ~200 |
| `services/gemini/analysis.ts` | `tests/services/gemini/analysis.test.ts` | ✅ Exists | ~150 |
| `services/gemini/prompts.ts` | `tests/services/gemini/prompts.test.ts` | ❌ Missing | 50 |
| `services/gemini/client.ts` | `tests/services/gemini/client.test.ts` | ❌ Missing | 100 |
| `services/gemini/geminiService.ts` | `tests/services/gemini/geminiService.test.ts` | ❌ Missing | 80 |
| `services/manuscriptParser.ts` | `tests/services/manuscriptParser.test.ts` | ✅ Exists | ~150 |
| `services/manuscriptIndexer.ts` | `tests/services/manuscriptIndexer.test.ts` | ✅ Exists | ~100 |
| `services/tokenGuard.ts` | `tests/services/tokenGuard.test.ts` | ✅ Exists | ~80 |
| `config/api.ts` | `tests/config/api.test.ts` | ✅ Exists | ~50 |
| `config/models.ts` | `tests/config/models.test.ts` | ✅ Exists | ~40 |

### Phase 2: State Management (Priority: High)

**Goal:** Cover Zustand stores and React contexts  
**Target:** +15% coverage

| Module | Test File | Status | Lines |
|--------|-----------|--------|-------|
| `features/project/store/useProjectStore.ts` | `tests/store/useProjectStore.test.ts` | ✅ Exists (41%) | +150 |
| `features/shared/context/EditorContext.tsx` | `tests/context/EditorContext.test.tsx` | ❌ Missing | 200 |
| `features/shared/context/EngineContext.tsx` | `tests/context/EngineContext.test.tsx` | ❌ Missing | 100 |
| `features/shared/context/UsageContext.tsx` | `tests/context/UsageContext.test.tsx` | ❌ Missing | 80 |
| `features/analysis/context/AnalysisContext.tsx` | `tests/context/AnalysisContext.test.tsx` | ❌ Missing | 150 |

### Phase 3: Custom Hooks (Priority: High)

**Goal:** Cover hook logic with `renderHook`  
**Target:** +15% coverage

| Module | Test File | Status | Lines |
|--------|-----------|--------|-------|
| `features/agent/hooks/useAgentService.ts` | `tests/hooks/useAgentService.test.ts` | ❌ Missing | 150 |
| `features/agent/hooks/useAgenticEditor.ts` | `tests/hooks/useAgenticEditor.test.ts` | ❌ Missing | 120 |
| `features/editor/hooks/useMagicEditor.ts` | `tests/hooks/useMagicEditor.test.ts` | ❌ Missing | 100 |
| `features/editor/hooks/useDocumentHistory.ts` | `tests/hooks/useDocumentHistory.test.ts` | ❌ Missing | 80 |
| `features/editor/hooks/useBranching.ts` | `tests/hooks/useBranching.test.ts` | ❌ Missing | 100 |
| `features/editor/hooks/useInlineComments.ts` | `tests/hooks/useInlineComments.test.ts` | ❌ Missing | 80 |
| `features/shared/hooks/useDraftSmithEngine.ts` | `tests/hooks/useDraftSmithEngine.test.ts` | ❌ Missing | 120 |
| `features/shared/hooks/usePlotSuggestions.ts` | `tests/hooks/usePlotSuggestions.test.ts` | ❌ Missing | 60 |
| `features/voice/hooks/useVoiceSession.ts` | `tests/hooks/useVoiceSession.test.ts` | ❌ Missing | 150 |
| `features/voice/hooks/useTextToSpeech.ts` | `tests/hooks/useTextToSpeech.test.ts` | ❌ Missing | 80 |

### Phase 4: React Components (Priority: Medium)

**Goal:** Render tests + key user interactions  
**Target:** +15% coverage

| Component | Test File | Priority |
|-----------|-----------|----------|
| `ChatInterface.tsx` | `tests/components/ChatInterface.test.tsx` | High |
| `RichTextEditor.tsx` | `tests/components/RichTextEditor.test.tsx` | High |
| `AnalysisPanel.tsx` | `tests/components/AnalysisPanel.test.tsx` | Medium |
| `ProjectDashboard.tsx` | `tests/components/ProjectDashboard.test.tsx` | Medium |
| `MagicBar.tsx` | `tests/components/MagicBar.test.tsx` | Medium |
| `LoreManager.tsx` | `tests/components/LoreManager.test.tsx` | Low |
| `KnowledgeGraph.tsx` | `tests/components/KnowledgeGraph.test.tsx` | Low |
| `VoiceMode.tsx` | `tests/components/VoiceMode.test.tsx` | Low |

### Phase 5: Integration Tests (Priority: Low)

**Goal:** End-to-end flows without browser  
**Target:** +5% coverage

| Flow | Test File |
|------|-----------|
| Project create → chapter add → save | `tests/integration/project-flow.test.ts` |
| Analysis request → result display | `tests/integration/analysis-flow.test.ts` |
| Agent chat → manuscript edit | `tests/integration/agent-flow.test.ts` |

---

## Testing Patterns

### 1. Service Mocking (Gemini API)

```typescript
// tests/mocks/geminiClient.ts
vi.mock('@/services/gemini/client', () => ({
  getClient: () => ({
    models: { generateContent: vi.fn() }
  })
}));
```

### 2. Store Testing (Zustand)

```typescript
beforeEach(() => {
  useProjectStore.setState(initialState);
});
```

### 3. Hook Testing (React Testing Library)

```typescript
import { renderHook, act } from '@testing-library/react';
const { result } = renderHook(() => useMyHook());
act(() => { result.current.doSomething(); });
```

### 4. Context Testing

```typescript
const wrapper = ({ children }) => (
  <MyProvider>{children}</MyProvider>
);
renderHook(() => useMyContext(), { wrapper });
```

### 5. Component Testing

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
render(<MyComponent />);
fireEvent.click(screen.getByRole('button'));
expect(screen.getByText('Expected')).toBeInTheDocument();
```

---

## Commands

```bash
# Run all tests
npm test

# Run with coverage report
npm run test:coverage

# Run specific test file
npm test -- tests/services/gemini/agent.test.ts

# Run tests in watch mode
npm test -- --watch

# Open coverage report in browser
# After running test:coverage, open coverage/index.html
```

---

## CI Integration (Future)

Add to GitHub Actions or similar:

```yaml
- name: Run tests
  run: npm run test:coverage

- name: Check coverage thresholds
  run: |
    # Fail if coverage drops below thresholds
    npx vitest run --coverage --coverage.thresholds.statements=80
```

---

## Progress Tracking (Quill AI)

This phased plan reflects an earlier snapshot of progress. For current coverage and test counts, rely on the auto-generated [TEST_COVERAGE.md](./TEST_COVERAGE.md).

| Phase | Tests Added | Coverage Gain | Status |
|-------|-------------|---------------|--------|
| Phase 1 | 16/16 | services/gemini: 98.75% | ✅ Complete |
| Phase 2 | 3/5 | EditorContext: 92%, AnalysisContext: covered | ✅ Complete |
| Phase 3 | 1/10 | useDocumentHistory: covered | 🔄 In Progress |
| Phase 4 | 0/8 | — | ⏳ Pending |
| Phase 5 | 0/3 | — | ⏳ Pending |

### Key Coverage Achievements

- `services/gemini/*`: **98.75%** (agent, analysis, audio, client, prompts, resilientParser, tokenGuard)
- `features/project/store/useProjectStore.ts`: **100%**
- `features/shared/context/EditorContext.tsx`: **92.23%**
- `config/*`: **93.44%**
- `types/*`: **100%**

---

## Notes

- **Don't test implementation details** — test behavior
- **Mock at boundaries** — API calls, IndexedDB, browser APIs
- **Keep tests fast** — aim for <10s total runtime
- **One assertion focus** — multiple expects OK, but one concept per test
