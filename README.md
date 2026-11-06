# AndroidBoss

The open-source tools behind [androidboss.info](https://androidboss.info/): deterministic helpers for Android and Kotlin Multiplatform developers and their coding agents. Each tool's output is checked against the real toolchain (R8, Gradle, aapt2, Kotlin/Native, swiftc, the Android CLI).

| Package | What it is |
|---|---|
| [`packages/core`](packages/core) | The tool logic in plain TypeScript: R8 retrace, JSON to Kotlin, version catalogs, vector conversion, keep rules, expect/actual stubs, Kotlin-to-Swift interop, APK checks and more. Runs in browsers and Node. |
| [`packages/data`](packages/data) | Data the tools read: Android permissions, targetSdk behaviour changes, Kotlin/AGP/Gradle compatibility, KMP libraries, Apple privacy keys. Refreshed from the source by the scripts in `packages/data/scripts`. |
| [`packages/mcp`](packages/mcp) | The AndroidBoss MCP server: 14 read-only tools for coding agents. |
| [`packages/cli`](packages/cli) | [`npx androidboss`](https://www.npmjs.com/package/androidboss): the same tools in a terminal and as a local stdio MCP server. |
| [`apps/mcp-worker`](apps/mcp-worker) | The hosted MCP server at `https://mcp.androidboss.org/mcp`, on Cloudflare Workers. |

## Use it

Hosted MCP server, no install:

```sh
claude mcp add --transport http androidboss https://mcp.androidboss.org/mcp
```

Locally, with nothing uploaded:

```sh
npx androidboss tools
npx androidboss retrace --mapping @app/build/outputs/mapping/release/mapping.txt < crash.txt
claude mcp add androidboss -- npx -y androidboss mcp
```

Setup for other agents: [androidboss.info/agents/mcp-server](https://androidboss.info/agents/mcp-server/).

## Develop

Needs Node.js 22.23 or newer.

```sh
npm ci
npm test
npm run check
```

Some tests check output against real toolchains and run only when asked:

```sh
CHECK_GRADLE=1 npm test        # Gradle: version catalogs, and every KMP library resolved
CHECK_KMP=1 npm test           # Kotlin/Native and swiftc: expect/actual stubs, Swift interop
CHECK_ANDROID=1 npm test       # Android SDK tools (aapt2, R8, apksigner) and the emulator
CHECK_ANDROID_CLI=1 npm test   # every Android CLI command against the installed CLI
```

Run the MCP Worker locally with `npm run dev -w @androidboss/mcp-worker`, then point the remote test at it:

```sh
MCP_URL=http://localhost:8787/mcp npm test -w @androidboss/mcp
```

## Licence

MIT. See [LICENSE](LICENSE).
