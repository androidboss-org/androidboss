## What changed

<!-- One change per pull request. Link the issue: Fixes #123 -->

## How it was checked

<!-- Tests added or updated, and any real-tool checks you ran (for example CHECK_GRADLE=1, CHECK_ANDROID=1, test:cheatsheets) with the tool versions. -->

- [ ] `npm test` and `npm run check` pass
- [ ] Output changes have a test, ideally with a fixture from the official tool
- [ ] Tools stay deterministic and read-only (no network calls, file writes or commands)
- [ ] Generated data was changed through its script in `packages/data/scripts`, not by hand
