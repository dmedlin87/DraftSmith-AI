# Test Coverage Report

> NOTE: This is a point-in-time coverage snapshot generated on **November 29, 2025** from `npm run test:coverage`.
> For current coverage and an auto-dated report, run `npm run test:full` (or `npm run test:coverage && npm run test:status && npm run test:audit`) and use the auto-generated `docs/TEST_COVERAGE.md` from `scripts/generate-test-status.mjs`.

## Summary

- **Overall Coverage:** High across most modules.
- **Core Logic:** Excellent coverage in `services/gemini`, `features/shared/context`, and `features/editor/hooks`.
- **UI Components:** Strong coverage in `features/agent` and `features/project`.

## Detailed Coverage

| File | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s |
|---|---|---|---|---|---|
| **All files** | **93.58** | **80.4** | **90.75** | **93.58** | |
| **features/agent** | **100** | **100** | **100** | **100** | |
| index.ts | 100 | 100 | 100 | 100 | |
| **features/agent/components** | **98.27** | **86.53** | **97.29** | **98.27** | |
| ActivityFeed.tsx | 97.29 | 86.2 | 100 | 97.29 | 112-113 |
| ChatInterface.tsx | 98.43 | 81.81 | 94.73 | 98.43 | 233-234,242 |
| PersonaSelector.tsx | 100 | 100 | 100 | 100 | |
| **features/agent/hooks** | **95.14** | **84.37** | **100** | **95.14** | |
| useAgentService.ts | 93.15 | 82.14 | 100 | 93.15 | 69-73 |
| useAgenticEditor.ts | 96.66 | 86.2 | 100 | 96.66 | 35,47-48 |
| **features/analysis** | **100** | **100** | **100** | **100** | |
| index.ts | 100 | 100 | 100 | 100 | |
| **features/analysis/components** | **97.01** | **84.21** | **91.3** | **97.01** | |
| AnalysisPanel.tsx | 98.82 | 86.66 | 100 | 98.82 | 149 |
| CritiquePanel.tsx | 96.55 | 92.85 | 100 | 96.55 | 116 |
| Dashboard.tsx | 97.36 | 84.61 | 90 | 97.36 | 131 |
| ExecutiveSummary.tsx | 91.66 | 72.22 | 75 | 91.66 | 35-36 |
| **features/analysis/context** | **100** | **100** | **100** | **100** | |
| AnalysisContext.tsx | 100 | 100 | 100 | 100 | |
| **features/editor** | **100** | **100** | **100** | **100** | |
| index.ts | 100 | 100 | 100 | 100 | |
| **features/editor/components** | **95.03** | **90.36** | **88.37** | **95.03** | |
| AIPresenceOrb.tsx | 100 | 100 | 100 | 100 | |
| CommentCard.tsx | 100 | 83.33 | 100 | 100 | 32 |
| EditorWorkspace.tsx | 93.1 | 85.71 | 85.71 | 93.1 | 148-151 |
| MagicBar.tsx | 94.23 | 96 | 85.71 | 94.23 | 54,115 |
| RichTextEditor.tsx | 96.26 | 90.76 | 88.88 | 96.26 | 117-118,178 |
| VersionControlPanel.tsx | 94.28 | 90 | 85.71 | 94.28 | 100-101 |
| **features/editor/extensions** | **82.53** | **72** | **87.5** | **82.53** | |
| CommentMark.ts | 82.53 | 72 | 87.5 | 82.53 | 58,67-68,78-83,106-107 |
| **features/editor/hooks** | **93.58** | **83.14** | **86.56** | **93.58** | |
| useAutoResize.ts | 61.53 | 50 | 50 | 61.53 | 18-24 |
| useBranching.ts | 98.36 | 94.73 | 100 | 98.36 | 42 |
| useDocumentHistory.ts | 100 | 100 | 100 | 100 | |
| useEditorSelection.ts | 96.15 | 90.9 | 100 | 96.15 | 25 |
| useInlineComments.ts | 100 | 94.44 | 100 | 100 | 76 |
| useMagicEditor.ts | 93.58 | 47.36 | 100 | 93.58 | 121,141-143,164 |
| **features/layout** | **88.49** | **76.57** | **57.69** | **88.49** | |
| EditorLayout.tsx | 89.28 | 91.66 | 60 | 89.28 | 100-114,223-234 |
| MainLayout.tsx | 86.08 | 67.14 | 50 | 86.08 | 303,307,318-340 |
| UploadLayout.tsx | 100 | 100 | 100 | 100 | |
| Workspace.tsx | 100 | 100 | 100 | 100 | |
| index.ts | 100 | 100 | 100 | 100 | |
| **features/lore** | **100** | **100** | **100** | **100** | |
| index.ts | 100 | 100 | 100 | 100 | |
| **features/lore/components** | **92.73** | **80.14** | **88.37** | **92.73** | |
| KnowledgeGraph.tsx | 85 | 68.33 | 62.5 | 85 | 374-375,427-429 |
| LoreManager.tsx | 99.79 | 88.88 | 94.28 | 99.79 | 222 |
| **features/project** | **100** | **100** | **100** | **100** | |
| index.ts | 100 | 100 | 100 | 100 | |
| **features/project/components** | **90.6** | **88.32** | **80.73** | **90.6** | |
| FileUpload.tsx | 100 | 100 | 100 | 100 | |
| ImportWizard.tsx | 86.61 | 83.61 | 76.11 | 86.61 | 1539-1540,1566 |
| ProjectDashboard.tsx | 94.5 | 82.75 | 69.23 | 94.5 | 181-188,202-203 |
| ProjectSidebar.tsx | 100 | 100 | 100 | 100 | |
| StoryBoard.tsx | 97.67 | 100 | 94.11 | 97.67 | 10-19 |
| **features/project/store** | **98.98** | **82.08** | **100** | **98.98** | |
| useProjectStore.ts | 98.98 | 82.08 | 100 | 98.98 | 45-46,65 |
| **features/settings** | **100** | **100** | **100** | **100** | |
| index.ts | 100 | 100 | 100 | 100 | |
| **features/settings/components** | **88.36** | **100** | **80** | **88.36** | |
| CritiqueIntensitySelector.tsx | 88.23 | 100 | 75 | 88.23 | 106-119 |
| ExperienceSelector.tsx | 88.44 | 100 | 83.33 | 88.44 | 177-199 |
| **features/settings/store** | **100** | **100** | **100** | **100** | |
| useSettingsStore.ts | 100 | 100 | 100 | 100 | |
| **features/shared** | **100** | **100** | **100** | **100** | |
| index.ts | 100 | 100 | 100 | 100 | |
| **features/shared/components** | **100** | **100** | **100** | **100** | |
| ErrorBoundary.tsx | 100 | 100 | 100 | 100 | |
| UsageBadge.tsx | 100 | 100 | 100 | 100 | |
| **features/shared/context** | **99.25** | **68.75** | **85.71** | **99.25** | |
| EditorContext.tsx | 99.56 | 80 | 100 | 99.56 | 100 |
| EngineContext.tsx | 100 | 100 | 66.66 | 100 | |
| UsageContext.tsx | 97.1 | 57.14 | 100 | 97.1 | 28-29 |
| **features/shared/hooks** | **87.11** | **77.33** | **88.88** | **87.11** | |
| useDraftSmithEngine.ts | 87.8 | 71.42 | 100 | 87.8 | 200-220,223-224 |
| useManuscriptIndexer.ts | 94.87 | 69.23 | 100 | 94.87 | 60-63 |
| usePlotSuggestions.ts | 100 | 100 | 100 | 100 | |
| useViewportCollision.ts | 80 | 83.33 | 75 | 80 | 90-94,158-190 |
| **features/shared/utils** | **81.2** | **80.76** | **88.88** | **81.2** | |
| diffUtils.ts | 100 | 100 | 100 | 100 | |
| textLocator.ts | 80.62 | 80.39 | 87.5 | 80.62 | 139-148,182,196 |
| **features/voice** | **100** | **100** | **100** | **100** | |
| index.ts | 100 | 100 | 100 | 100 | |
| **features/voice/components** | **97.12** | **81.25** | **100** | **97.12** | |
| VoiceMode.tsx | 97.12 | 81.25 | 100 | 97.12 | 29-30,93-95 |
| **features/voice/hooks** | **89.69** | **72.15** | **88.88** | **89.69** | |
| useAudioController.ts | 86.31 | 62.85 | 66.66 | 86.31 | 207,215,253-263 |
| useTextToSpeech.ts | 97.01 | 75 | 100 | 97.01 | 41-42 |
| useVoiceSession.ts | 91.06 | 82.14 | 100 | 91.06 | 225-239,268-271 |
| **features/voice/services** | **100** | **100** | **100** | **100** | |
| audioUtils.ts | 100 | 100 | 100 | 100 | |
| **services** | **82.11** | **76.31** | **90.9** | **82.11** | |
| db.ts | 100 | 100 | 100 | 100 | |
| manuscriptIndexer.ts | 100 | 73.68 | 100 | 100 | 4,57-59,77-78 |
| manuscriptParser.ts | 83.83 | 81.81 | 100 | 83.83 | 73-92,154-160 |
| pdfExport.ts | 68.85 | 73.52 | 86.66 | 68.85 | 197-203,220-222 |
| **services/gemini** | **98.77** | **87.21** | **97.29** | **98.77** | |
| agent.ts | 100 | 95.23 | 100 | 100 | 92 |
| analysis.ts | 100 | 93.54 | 100 | 100 | 67,293 |
| audio.ts | 96.55 | 81.25 | 88.88 | 96.55 | 16-17,75-76 |
| client.ts | 100 | 100 | 100 | 100 | |
| critiquePrompts.ts | 100 | 50 | 100 | 100 | 56 |
| experiencePrompts.ts | 100 | 50 | 100 | 100 | 57,64 |
| prompts.ts | 100 | 100 | 100 | 100 | |
| resilientParser.ts | 95.16 | 87.17 | 100 | 95.16 | 96-97,179-180 |
| tokenGuard.ts | 97.76 | 83.33 | 100 | 97.76 | 72,112-113 |
