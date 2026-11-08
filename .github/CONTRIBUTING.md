# Contributing to AndroidBoss

Thanks for helping. Bug reports, fixes, cheatsheet entries and new tools are all welcome. For questions, ideas and show-and-tell, use [GitHub Discussions](https://github.com/androidboss-org/androidboss/discussions). Everyone taking part follows the [Code of Conduct](CODE_OF_CONDUCT.md).

## Reporting a wrong result

Most bugs here are a tool giving a wrong answer. [Open a bug report](https://github.com/androidboss-org/androidboss/issues/new?template=bug_report.yml) with:

- the tool (`retrace`, `cheatsheet`, `check_compatibility`…) and how you ran it (hosted MCP server, `npx androidboss` or a browser tool on androidboss.info);
- the input, trimmed to the smallest case that still shows the problem;
- what you got, and what you expected, ideally with a link to official docs or the output of the real tool.

Don't paste secrets, signing passwords or private code. Security problems go through [private vulnerability reporting](SECURITY.md), not issues.

## Before you start

**Open an issue first** for anything bigger than a small fix, so we can agree on the approach before you spend time on it. Issues labelled [`good first issue`](https://github.com/androidboss-org/androidboss/labels/good%20first%20issue) are a good place to start.

## Setting up

You need Node.js 22.23.4 or newer (`.nvmrc` has the version CI uses).

```bash
npm ci
npm test          # unit tests for every package
npm run check     # type checks
```

The README's [Development](../README.md#development) section lists the per-package commands and the opt-in checks against real toolchains (`CHECK_GRADLE`, `CHECK_KMP`, `CHECK_ANDROID`, `CHECK_ANDROID_CLI`).

## Rules for changes

1. **Keep tools deterministic and read-only.** The same input must give the same output, with no network calls, no file writes and no commands run.
2. **Prove it against the real tool.** A change to output needs a test, ideally with a fixture produced by the official toolchain, like the existing ones. If you change a cheatsheet entry, run `npm run test:cheatsheets -w @androidboss/core` with the tool installed.
3. **Say what it was checked against.** Data and cheatsheets name the tool version and the date they were checked. Update both when you re-check.
4. **Don't edit generated data by hand.** Data in `packages/data` comes from the scripts in `packages/data/scripts`; change the script and run it.
5. **Compatibility claims follow official sources.** Two versions are only listed as working together when Google's or JetBrains' tables say so.
6. **Run `npm test` and `npm run check`** before opening a pull request. CI runs both.

## Pull requests

- Keep each pull request to one change, with a short description of what changed and how you checked it.
- Link the issue it fixes (`Fixes #123`).
- New dependencies need a reason: the CLI is bundled, and every package adds to what users download.

By contributing, you agree that your contribution is licensed under the [MIT licence](../LICENSE).

## Releases

Maintainers release by pushing a `vX.Y.Z` tag that matches `packages/cli/package.json`. The release workflow tests the project, publishes to npm through trusted publishing with provenance, and creates the GitHub Release.
