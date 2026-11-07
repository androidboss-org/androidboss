<div align="center">

<a href="https://androidboss.org">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset=".github/assets/androidboss-lockup-white.svg">
    <img alt="AndroidBoss" src=".github/assets/androidboss-lockup.svg" width="345">
  </picture>
</a>

### Tested tools for Android and Kotlin Multiplatform developers and their coding agents

[![CI](https://img.shields.io/github/actions/workflow/status/androidboss-org/androidboss/ci.yml?branch=main&label=CI)](https://github.com/androidboss-org/androidboss/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/androidboss?label=npm)](https://www.npmjs.com/package/androidboss)
[![License: MIT](https://img.shields.io/github/license/androidboss-org/androidboss)](LICENSE)
[![Node.js](https://img.shields.io/node/v/androidboss)](https://nodejs.org/)

[Website](https://androidboss.info) · [MCP setup](https://androidboss.info/agents/mcp-server/) · [npm](https://www.npmjs.com/package/androidboss) · [Discussions](https://github.com/androidboss-org/androidboss/discussions) · [Report a bug](https://github.com/androidboss-org/androidboss/issues/new)

</div>

---

AndroidBoss turns the fiddly parts of Android and Kotlin® Multiplatform work into small, deterministic tools: deobfuscating an R8 stack trace, checking that Kotlin, AGP and Gradle versions work together, finding what changes when you raise `targetSdk`, writing `actual` declarations for each KMP target, and more.

The same tools are available three ways:

| | Where | Best for |
|---|---|---|
| **Hosted MCP server** | `https://mcp.androidboss.org/mcp` | Giving Claude Code, Codex, Gemini CLI, Cursor or VS Code the tools with nothing to install |
| **Local CLI and MCP server** | [`npx androidboss`](https://www.npmjs.com/package/androidboss) | Large or private inputs, offline work, scripts and CI |
| **Web tools** | [androidboss.info](https://androidboss.info/tools/) | Using them in a browser, with your input never leaving the page |

Every tool's output is checked against the real toolchain before it ships: R8 and Google's `retrace`, Gradle, aapt2, Kotlin/Native, `swiftc` and the Android CLI.

> [!NOTE]
> AndroidBoss is an independent, free and non-commercial community project, made by developers for developers. It isn't affiliated with or endorsed by Google. See [Legal and trademarks](https://androidboss.info/legal/).

## Contents

- [Quick start](#quick-start)
- [Tools](#tools)
- [Connect your agent](#connect-your-agent)
- [Command-line usage](#command-line-usage)
- [Versions](#versions)
- [Privacy and limits](#privacy-and-limits)
- [How it's built](#how-its-built)
- [Development](#development)
- [Contributing](#contributing)
- [Support the project](#support-the-project)
- [Licence](#licence)

## Quick start

**Give your coding agent the tools** (Claude Code shown; [other agents below](#connect-your-agent)):

```sh
claude mcp add --transport http androidboss https://mcp.androidboss.org/mcp
```

Then ask it something like *"Retrace this crash with app/build/outputs/mapping/release/mapping.txt"* or *"Can I move to AGP 9.5 with my current Gradle version?"*

**Or run the tools yourself** (Node.js 22.23.4 or newer; 26 LTS recommended):

```sh
npx androidboss tools
npx androidboss retrace --mapping @app/build/outputs/mapping/release/mapping.txt < crash.txt
npx androidboss check-compatibility --kotlin 2.4.0 --agp 9.5.1 --gradle 9.6.0
```

## Tools

| CLI command | MCP tool | What it does |
|---|---|---|
| `retrace` | `retrace` | Deobfuscates a stack trace with the `mapping.txt` from the same build. Output matches Google's `retrace`. |
| `json-to-kotlin` | `json_to_kotlin` | Kotlin data classes from a JSON sample, for kotlinx.serialization, Moshi or Gson. |
| `check-compatibility` | `check_compatibility` | Whether Kotlin, AGP, Gradle, KSP, Compose Multiplatform and `compileSdk` versions work together. |
| `android-cli-tasks` | `android_cli_tasks` | What the Android CLI can do, and the fields each task takes. |
| `android-cli-command` | `android_cli_command` | The exact Android CLI command for a task. |
| `crash-to-prompt` | `crash_to_prompt` | A crash or ANR as a short, redacted prompt for an agent: root cause, files to open, trimmed trace. |
| `version-catalog` | `version_catalog` | Moves a build file's dependencies and plugins into `libs.versions.toml`, lists newer stable versions, and can write them in (`--use-latest`). |
| `convert-vector` | `convert_vector` | SVG, VectorDrawable and Compose `ImageVector`, in any direction. |
| `keep-rules` | `keep_rules` | Writes R8 keep rules for reflection, JSON models and JNI, or lints `proguard-rules.pro`. |
| `expect-actual` | `expect_actual` | `actual` declarations for each KMP target from `commonMain` `expect` code. |
| `kotlin-to-swift` | `kotlin_to_swift` | How a shared Kotlin file looks when called from Swift. |
| `find-kmp-libraries` | `find_kmp_libraries` | KMP libraries by task and target, with current versions and a ready `libs.versions.toml`. |
| `android-permissions` | `android_permissions` | Permission facts, and a check of your `AndroidManifest.xml`. |
| `target-sdk-changes` | `target_sdk_changes` | Behaviour changes between two `targetSdk` levels, flagged against your manifest. |
| `cheatsheet` | `cheatsheet` | Tested commands and compiled snippets for adb, Gradle, the emulator, the Android CLI, coroutines and Flow, KMP Gradle, R8 keep rules, signing and `simctl`, searched by task, with your values filled in. |

All tools are read-only: they never write files, run commands or call other services.

## Connect your agent

The hosted server speaks Streamable HTTP (MCP `2026-07-28`, with a fallback for 2025 clients) and needs no sign-in. To run it on your own machine instead, use `npx -y androidboss mcp` as a stdio server; see the last entry.

<details>
<summary><b>Claude Code</b></summary>

```sh
claude mcp add --transport http androidboss https://mcp.androidboss.org/mcp
```

Or in `.mcp.json`:

```json
{
  "mcpServers": {
    "androidboss": { "type": "http", "url": "https://mcp.androidboss.org/mcp" }
  }
}
```
</details>

<details>
<summary><b>OpenAI Codex</b></summary>

```sh
codex mcp add androidboss --url https://mcp.androidboss.org/mcp
```

Or in `.codex/config.toml`:

```toml
[mcp_servers.androidboss]
url = "https://mcp.androidboss.org/mcp"
```
</details>

<details>
<summary><b>Gemini CLI</b></summary>

In `.gemini/settings.json`:

```json
{
  "mcpServers": {
    "androidboss": { "httpUrl": "https://mcp.androidboss.org/mcp" }
  }
}
```
</details>

<details>
<summary><b>Cursor</b></summary>

In `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "androidboss": { "url": "https://mcp.androidboss.org/mcp" }
  }
}
```
</details>

<details>
<summary><b>VS Code (GitHub Copilot)</b></summary>

In `.vscode/mcp.json`:

```json
{
  "servers": {
    "androidboss": { "type": "http", "url": "https://mcp.androidboss.org/mcp" }
  }
}
```
</details>

<details>
<summary><b>Antigravity</b></summary>

In `.agents/mcp_config.json`:

```json
{
  "mcpServers": {
    "androidboss": { "serverUrl": "https://mcp.androidboss.org/mcp" }
  }
}
```
</details>

<details>
<summary><b>Any agent, running locally (stdio)</b></summary>

```sh
claude mcp add androidboss -- npx -y androidboss mcp
```

For agents configured in JSON, add a stdio server:

```json
{
  "mcpServers": {
    "androidboss": { "command": "npx", "args": ["-y", "androidboss", "mcp"] }
  }
}
```
</details>

`https://androidboss.info/mcp` serves the same tools from the same code, and keeps working for existing setups.

## Command-line usage

```text
androidboss <tool> [--option value]... [--json]
androidboss tools              list the tools
androidboss help <tool>        a tool's options
androidboss mcp                run as a local MCP server over stdio
```

Options come from each tool's input schema, so the CLI and the MCP server always accept the same inputs.

| Syntax | Meaning | Example |
|---|---|---|
| `--name value` | An option, in kebab-case or camelCase | `--target-sdk 36` |
| `@path` | Read the value from a file | `--manifest @app/src/main/AndroidManifest.xml` |
| `-` | Read the value from standard input | `--manifest -` |
| Piped input | Fills the tool's one missing required text option | `androidboss retrace --mapping @mapping.txt < crash.txt` |
| `a,b` or repeated | A list | `--targets android,ios` |
| `--key.sub value` | One key of an object option | `--values.device pixel_9` |
| `--json` | Print the structured result instead of text | `androidboss find-kmp-libraries --query ktor --json` |

Exit codes: `0` success, `1` the tool reported an error, `2` a usage error (unknown option, missing value, unreadable file).

More examples:

```sh
# What changes when targetSdk goes to 36, checked against your manifest
npx androidboss target-sdk-changes --to 36 --manifest @app/src/main/AndroidManifest.xml

# Networking libraries that publish both Android and iOS targets
npx androidboss find-kmp-libraries --category networking --targets android,ios

# Exact, tested commands by task, with your package filled in
npx androidboss cheatsheet --query "logs one app" --values.package com.my.app

# Look up permissions and check a manifest for Play-restricted ones
npx androidboss android-permissions --names CAMERA,ACCESS_FINE_LOCATION --manifest @app/src/main/AndroidManifest.xml
```

## Versions

| Component | Version |
|---|---|
| `androidboss` CLI on npm | 0.4.2 |
| MCP server | 0.4.2, MCP spec `2026-07-28` with a fallback for 2025 clients |
| Node.js | 26 LTS recommended. Minimum 22.23.4; on the 24 line use 24.22.1 or newer, which include the [October 2026 security fixes](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases) |
| Android CLI commands | Checked against Android CLI 1.1.16717390 (2 November 2026) |
| Kotlin, AGP and Gradle compatibility data | Copied from the official tables, re-checked 8 November 2026 |
| Newest library and plugin versions | 2,225 Google Maven artifacts, 108 Maven Central libraries and 26 Gradle plugins, read from the repositories on 8 November 2026 (`npm run update:latest -w @androidboss/data`) |
| Cheatsheets | 282 entries in 9 sheets. Commands checked against adb 37.0.1 (Android 17 emulator), Gradle 9.9 with AGP 9.5.1, emulator 37, build-tools 37.0.0, Android CLI 1.1.16717390 and Xcode 27; Kotlin snippets compiled with kotlinx.coroutines 1.11; keep rules run through R8; KMP Gradle snippets configured with Kotlin 2.4.21 and AGP 9.5.1 (re-checked on Gradle 9.9 and build-tools 37.0.0, 7 November 2026) |

Each release is listed with its changes on the [Releases](https://github.com/androidboss-org/androidboss/releases) page.

## Privacy and limits

- **Nothing is stored.** The hosted server handles each request in memory and keeps no database; request bodies aren't logged. The CLI runs entirely on your machine.
- **Inputs are capped on the hosted server** to stay within Cloudflare's free tier: a `mapping.txt` up to 5 MB, most other inputs up to 100 KB, and a per-IP rate limit. The CLI accepts mapping files up to 100 MB.
- **Mind what you send.** `crash_to_prompt` redacts emails, tokens and IP addresses, but review crash logs before sharing them with any service.

## How it's built

```text
packages/
  core/         Tool logic in plain TypeScript. Runs in browsers, Node.js and Workers.
                core/src/cheatsheets holds the cheatsheets and the tests that check every
                command against the real tools (npm run test:cheatsheets -w @androidboss/core).
  data/         Data the tools read: permissions, targetSdk changes, compatibility tables,
                KMP libraries, Apple privacy keys, newest library versions. Refreshed from
                the source by scripts/.
  mcp/          The MCP server (15 tools) and its HTTP handler.
  cli/          The npm package `androidboss`: the server as commands and as a stdio server.
apps/
  mcp-worker/   mcp.androidboss.org on Cloudflare Workers.
```

The web tools at [androidboss.info](https://androidboss.info) use `core` and `data` from this repository, so a fix here reaches the website, the MCP server and the CLI together.

Correctness comes from fixtures produced by the real tools. For example, `packages/core/src/retrace/fixtures` holds a mapping and stack traces from an R8 build together with the exact output of Google's `retrace`, and the implementation must reproduce it byte for byte.

## Development

You need [Node.js](https://nodejs.org/) 26 LTS (the version in `.nvmrc`; with nvm, run `nvm use`). Node 22.23.4 or newer also works.

```sh
git clone https://github.com/androidboss-org/androidboss.git
cd androidboss
npm ci
npm test          # unit tests for every package
npm run check     # type checks
```

| Command | What it does |
|---|---|
| `npm test -w @androidboss/core` | Tests for one package |
| `npm run build -w androidboss` | Bundles the CLI into `packages/cli/dist/androidboss.mjs` |
| `node packages/cli/dist/androidboss.mjs tools` | Runs your local build of the CLI |
| `npm run dev -w @androidboss/mcp-worker` | Serves the MCP Worker at `http://localhost:8787/mcp` |
| `MCP_URL=http://localhost:8787/mcp npm test -w @androidboss/mcp` | Runs the MCP client tests against a running server |

Some tests compile or run generated code with real toolchains. They're skipped unless you turn them on:

| Variable | Needs | Checks |
|---|---|---|
| `CHECK_GRADLE=1` | Gradle (`$GRADLE` or a wrapper download); macOS, Android SDK and Xcode for the KMP libraries | Version catalogs compile with Gradle; every KMP library compiles for Android, iOS and JVM |
| `CHECK_KMP=1` | Gradle, Android SDK, Xcode | `expect`/`actual` stubs compile for every target; generated Swift type-checks with `swiftc` |
| `CHECK_ANDROID=1` | Android SDK, Gradle | VectorDrawables through aapt2; `ImageVector` and themes through the Kotlin and Compose compilers |
| `CHECK_ANDROID_CLI=1` | Android CLI | Every Android CLI command against the installed CLI |

```sh
CHECK_GRADLE=1 npm test -w @androidboss/core
```

## Contributing

Bug reports, fixes and new tools are welcome. For questions, ideas and show-and-tell, use [GitHub Discussions](https://github.com/androidboss-org/androidboss/discussions).

1. **Open an issue first** for anything bigger than a small fix, so we can agree on the approach. For a wrong result, include the input, the output you expected and the tool that produced it.
2. **Keep tools deterministic and read-only.** The same input must give the same output, with no network calls.
3. **Prove it against the real tool.** A change to output needs a test, ideally with a fixture produced by the official toolchain, like the existing ones.
4. **Run `npm test` and `npm run check`** before opening a pull request. CI runs both.

Data in `packages/data` comes from the update scripts in `packages/data/scripts`; change the script rather than editing the generated JSON by hand.

### Releases

Each release has a `vX.Y.Z` tag matching the version in `packages/cli/package.json`. Pushing the tag runs the [release workflow](.github/workflows/release.yml), which tests the project, publishes the CLI to [npm](https://www.npmjs.com/package/androidboss) through [trusted publishing](https://docs.npmjs.com/trusted-publishers) with provenance (no stored tokens; npm shows which commit and workflow built it), and creates a [GitHub Release](https://github.com/androidboss-org/androidboss/releases) with the package tarball.

### Security

Please don't report security problems in public issues. Use [private vulnerability reporting](https://github.com/androidboss-org/androidboss/security/advisories/new) instead.

## Support the project

If AndroidBoss saves you time:

- ⭐ **Star the repository** so other Android developers can find it.
- ☕ **Sponsor the work** with the **Sponsor** button at the top of the repository.
- 🛠️ **Report a wrong result or send a fix.** Real-world inputs make the tools better.
- 💬 **Share how you use it** in [Discussions](https://github.com/androidboss-org/androidboss/discussions).

The project is non-commercial: no ads, no paid plans. Donations only help cover hosting and domains.

## Licence

[MIT](LICENSE) © AndroidBoss

The CLI bundles third-party packages under their own licences, listed in `dist/THIRD-PARTY-LICENSES.txt` inside the npm package.

### Trademarks

Android is a trademark of Google LLC. Google Play is a trademark of Google LLC. Apple, App Store, iOS, Swift and Xcode are trademarks of Apple Inc., registered in the U.S. and other countries and regions. Kotlin® is a trademark protected by the Kotlin Foundation. Gradle is a trademark of Gradle, Inc. Other names belong to their owners and are used only to say which products the tools work with.

AndroidBoss is not affiliated with or endorsed by Google, Apple, JetBrains or the Kotlin Foundation, and uses none of their logos. If you own a trademark used here and have a concern, please email [legal@androidboss.info](mailto:legal@androidboss.info) or [open an issue](https://github.com/androidboss-org/androidboss/issues/new): we'll reply within 7 days and, at your request, change the content, rename the project or take it offline, and transfer the domains to you free of charge. Details: [Legal and trademarks](https://androidboss.info/legal/).
