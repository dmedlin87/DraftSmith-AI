<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Quill AI

<!-- TEST_HEALTH_BADGES:START - Do not remove or modify this section -->
<!-- Badges are updated by npm run test:status -->
![Tests](https://img.shields.io/badge/tests-800+-brightgreen)
![Coverage](https://img.shields.io/badge/coverage-93%25-brightgreen)
<!-- TEST_HEALTH_BADGES:END -->

AI-powered manuscript editor with real-time analysis, multi-persona agents, and voice interaction.

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies: `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app: `npm run dev`

## Testing

```bash
npm test              # Run all tests (watch mode)
npm run test:run      # Run all tests once
npm run test:coverage # Generate coverage report
npm run test:status   # Generate docs/TEST_COVERAGE.md
npm run test:audit    # Analyze test gaps
npm run test:full     # Coverage + status + audit
npm run test:quick    # Fast dot reporter
```

See:

- [docs/TEST_COVERAGE.md](./docs/TEST_COVERAGE.md) — Auto-generated coverage status
- [docs/TEST_AUDIT.md](./docs/TEST_AUDIT.md) — Auto-generated gap analysis
- [docs/TESTING.md](./docs/TESTING.md) — Test strategy and patterns

## Documentation

All project documentation lives in the [`docs/`](./docs/) folder:

- **[TESTING.md](./docs/TESTING.md)** — Test coverage plan and progress tracking
