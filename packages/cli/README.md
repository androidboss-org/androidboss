# androidboss

The tools from [androidboss.info](https://androidboss.info/) in your terminal, and as a local MCP server for your coding agent. Everything runs on your machine: nothing is uploaded, and there are no rate limits.

Needs Node.js 22 or newer. One file, no dependencies.

```sh
npx androidboss tools
```

## In the terminal

```sh
# Deobfuscate a crash with the mapping from the same build
npx androidboss retrace --mapping @app/build/outputs/mapping/release/mapping.txt < crash.txt

# Check Kotlin, AGP and Gradle work together before you bump them
npx androidboss check-compatibility --kotlin 2.4.0 --agp 9.5.0 --gradle 9.6.0

# Kotlin data classes from a JSON sample
npx androidboss json-to-kotlin --root-name User < user.json

# What changes when targetSdk goes to 36, checked against your manifest
npx androidboss target-sdk-changes --to 36 --manifest @app/src/main/AndroidManifest.xml
```

- `@path` reads a file; `-` reads standard input. Piped input fills the tool's one missing text option.
- Lists: `--targets android,ios`, or repeat the option.
- `--json` prints the structured result instead of text.
- `npx androidboss help <tool>` lists a tool's options.

| Tool | What it does |
|---|---|
| `retrace` | Deobfuscate a stack trace with mapping.txt; output matches Google's retrace |
| `json-to-kotlin` | Kotlin data classes for kotlinx.serialization, Moshi or Gson |
| `check-compatibility` | Kotlin, AGP, Gradle, KSP, Compose Multiplatform and compileSdk versions |
| `android-cli-tasks`, `android-cli-command` | The exact Android CLI command for a task |
| `crash-to-prompt` | A crash or ANR as a short, redacted prompt for an agent |
| `version-catalog` | Move a build file's dependencies into libs.versions.toml |
| `convert-vector` | SVG, VectorDrawable and Compose ImageVector in any direction |
| `keep-rules` | Write R8 keep rules, or lint proguard-rules.pro |
| `expect-actual` | actual declarations for each KMP target |
| `kotlin-to-swift` | How a Kotlin file looks from Swift |
| `find-kmp-libraries` | KMP libraries by task and target, with current versions |
| `android-permissions` | Permission facts, and a manifest check |
| `target-sdk-changes` | Behavior changes between two targetSdk levels |

Each tool's output is checked against the real toolchain (R8, Gradle, aapt2, Kotlin/Native, swiftc, the Android CLI) before it ships.

## As an MCP server

`npx androidboss mcp` serves the same 14 tools over stdio. For Claude Code:

```sh
claude mcp add androidboss -- npx -y androidboss mcp
```

For other agents, add a stdio server with the command `npx` and the arguments `-y androidboss mcp`. Setup for Codex, Gemini CLI, Cursor, Antigravity and VS Code: [androidboss.info/agents/mcp-server](https://androidboss.info/agents/mcp-server/#run-locally).

The hosted server at `https://androidboss.info/mcp` has the same tools with no install. Run it locally when your inputs are large (a mapping.txt over 5 MB), private, or when you're offline.

## Licences

MIT. The bundled packages keep their own licences, listed in `dist/THIRD-PARTY-LICENSES.txt`.
