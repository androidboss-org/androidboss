/**
 * The AndroidBoss MCP server: the site's tools for AI coding agents. Every tool
 * is read-only and deterministic, computed from the same core and data packages
 * as androidboss.info, with nothing stored. http.ts serves it over HTTP (mcp.androidboss.org
 * and androidboss.info/mcp); the CLI in packages/cli runs it locally.
 */
import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod';
import { retrace } from '@androidboss/core/retrace';
import { jsonToKotlin } from '@androidboss/core/json-to-kotlin';
import { checkVersions, CHECKED_ON as COMPAT_CHECKED_ON } from '@androidboss/core/compat';
import { buildCommand, CHECKED_VERSION as CLI_VERSION, defaults as cliDefaults, tasks as cliTasks } from '@androidboss/core/android-cli';
import { crashToPrompt, goals } from '@androidboss/core/crash-prompt';
import { convertToCatalog } from '@androidboss/core/catalog';
import { convertVector } from '@androidboss/core/vector';
import { generateRules, lintRules, ruleKinds, type RuleKind } from '@androidboss/core/keep-rules';
import { generateActuals, TARGETS, type Target } from '@androidboss/core/expect-actual';
import { swiftInterop } from '@androidboss/core/swift-interop';
import { bundleSnippets, kmpLibraries, KMP_LIBRARIES_CHECKED_ON, LIBRARY_CATEGORIES, TARGET_GROUPS, type TargetGroup } from '@androidboss/data/kmp-libraries';
import { checkManifest, findPermission, PERMISSIONS_SOURCE } from '@androidboss/data/permissions';
import { changesBetween, changeUrl, findTargetSdk, readManifest, VERSION_NAMES } from '@androidboss/data/target-sdk';

export const SERVER_INFO = { name: 'androidboss', title: 'AndroidBoss', version: '0.1.0', websiteUrl: 'https://androidboss.info/agents/mcp-server/' };

export const INSTRUCTIONS = `Tools for Android and Kotlin Multiplatform work, from androidboss.info. Each one is deterministic and checked against real toolchains (R8, Gradle, Kotlin/Native, swiftc, the Android CLI). Inputs are processed in memory and not stored.
Prefer these over guessing: retrace obfuscated stack traces with a mapping, check Kotlin/AGP/Gradle compatibility before changing versions, look up a permission or a targetSdk change before editing a manifest, and use find_kmp_libraries for current library versions.`;

/**
 * Upper bounds on text inputs. The Workers Free plan allows 10 ms of CPU per request,
 * so inputs stay near what a real app produces: a 5 MB mapping.txt covers about
 * 40,000 classes. Larger calls fail fast with a validation error instead of using CPU.
 */
export const LIMIT = { mapping: 5_000_000, large: 500_000, medium: 100_000, small: 10_000 } as const;

/**
 * Limits for a server on the user's own machine (`npx androidboss mcp`): no CPU cap,
 * so a mapping.txt from the largest apps fits. Stdio messages are capped at STDIO_MAX_BYTES.
 */
export const LOCAL_LIMIT = { mapping: 100_000_000, large: 20_000_000, medium: 10_000_000, small: 1_000_000 } as const;
export const STDIO_MAX_BYTES = 128 * 1024 * 1024;

/**
 * The same server for the user's own machine: the `androidboss` npm package (packages/cli).
 * Pages show its install commands only once `published` is true, i.e. it is on npm.
 */
export const LOCAL_CLI = { package: 'androidboss', published: false } as const;

/** The largest request body the Worker reads: the biggest input plus JSON-RPC overhead. */
export const MAX_REQUEST_BYTES = 6_000_000;
const text = (max: number, describe: string) => z.string().min(1).max(max).describe(describe);

const READ_ONLY = { readOnlyHint: true, idempotentHint: true, destructiveHint: false, openWorldHint: false } as const;

/** A tool result: readable text for the model, the same data as structured content. */
function result<T extends Record<string, unknown>>(summary: string, data: T) {
  return { content: [{ type: 'text' as const, text: summary }], structuredContent: data };
}

export interface ToolInfo {
  name: string;
  title: string;
  description: string;
}

/**
 * A fresh server with every tool registered. `onTool` sees each registration,
 * which is how toolCatalog() lists the tools without a client round trip.
 * `limits` caps text inputs: LIMIT on the Worker, LOCAL_LIMIT on the user's machine.
 */
export function createServer(onTool?: (tool: ToolInfo) => void, limits: Record<keyof typeof LIMIT, number> = LIMIT): McpServer {
  const L = limits;
  const server = new McpServer(SERVER_INFO, { instructions: INSTRUCTIONS });
  if (onTool) {
    const register = server.registerTool.bind(server) as (name: string, config: { title?: string; description?: string }, cb: unknown) => unknown;
    (server as { registerTool: unknown }).registerTool = (name: string, config: { title?: string; description?: string }, cb: unknown) => {
      onTool({ name, title: config.title ?? name, description: config.description ?? '' });
      return register(name, config, cb);
    };
  }

  server.registerTool(
    'retrace',
    {
      title: 'R8 retrace',
      description: 'Deobfuscate an Android stack trace with the mapping.txt from the same R8/ProGuard build. Output matches Google’s retrace tool.',
      inputSchema: z.object({
        mapping: text(L.mapping, 'Contents of mapping.txt (app/build/outputs/mapping/<variant>/mapping.txt).'),
        stackTrace: text(L.medium, 'The obfuscated stack trace or logcat excerpt.'),
      }),
      outputSchema: z.object({ text: z.string(), framesTotal: z.number(), framesRetraced: z.number(), ambiguous: z.number() }),
      annotations: READ_ONLY,
    },
    async ({ mapping, stackTrace }) => {
      const r = retrace(mapping, stackTrace);
      return result(r.text, { ...r });
    },
  );

  server.registerTool(
    'json_to_kotlin',
    {
      title: 'JSON to Kotlin data classes',
      description: 'Turn a JSON sample into Kotlin data classes for kotlinx.serialization (default), Moshi or Gson. Types are inferred across array items; nullable when a value is null or missing.',
      inputSchema: z.object({
        json: text(L.large, 'A JSON object or array.'),
        rootName: z.string().max(100).optional().describe('Name of the top-level class. Default: Root.'),
        library: z.enum(['kotlinx', 'moshi', 'gson', 'none']).optional().describe('Serialization library. Default: kotlinx.'),
        packageName: z.string().max(200).optional(),
      }),
      outputSchema: z.object({ code: z.string(), classCount: z.number(), warnings: z.array(z.string()) }),
      annotations: READ_ONLY,
    },
    async ({ json, rootName, library, packageName }) => {
      const r = jsonToKotlin(json, { ...(rootName ? { rootName } : {}), ...(library ? { library } : {}), ...(packageName ? { packageName } : {}) });
      return result([r.code, ...r.warnings.map((w) => `// Warning: ${w}`)].join('\n'), { ...r });
    },
  );

  server.registerTool(
    'check_compatibility',
    {
      title: 'Kotlin, AGP and Gradle compatibility',
      description: `Check whether Kotlin, Android Gradle Plugin, Gradle, Compose Compiler, KSP, Compose Multiplatform and compileSdk versions work together, using the official compatibility tables (checked ${COMPAT_CHECKED_ON}). Pass the versions you have or plan to use.`,
      inputSchema: z.object({
        kotlin: z.string().max(40).optional(),
        agp: z.string().max(40).optional().describe('Android Gradle Plugin version.'),
        gradle: z.string().max(40).optional(),
        composeCompiler: z.string().max(40).optional().describe('Only for Kotlin before 2.0.'),
        ksp: z.string().max(60).optional(),
        cmp: z.string().max(40).optional().describe('Compose Multiplatform version.'),
        compileSdk: z.string().max(10).optional(),
      }),
      outputSchema: z.object({ checks: z.array(z.object({ status: z.string(), title: z.string(), detail: z.string(), source: z.string() })) }),
      annotations: READ_ONLY,
    },
    async (versions) => {
      const checks = checkVersions(versions);
      return result(checks.length ? checks.map((c) => `[${c.status}] ${c.title}: ${c.detail} (${c.source})`).join('\n') : 'Nothing to check: pass at least two versions.', { checks });
    },
  );

  server.registerTool(
    'android_cli_tasks',
    {
      title: 'Android CLI tasks',
      description: `List what the Android CLI can do (Android CLI ${CLI_VERSION}): task ids, what each does, and the fields android_cli_command takes for it.`,
      inputSchema: z.object({ query: z.string().max(100).optional().describe('Filter by words in the title or summary.') }),
      outputSchema: z.object({ tasks: z.array(z.object({ id: z.string(), group: z.string(), title: z.string(), summary: z.string(), fields: z.array(z.object({ id: z.string(), label: z.string(), required: z.boolean() })) })) }),
      annotations: READ_ONLY,
    },
    async ({ query }) => {
      const words = (query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
      const list = cliTasks
        .filter((t) => words.every((w) => `${t.title} ${t.summary}`.toLowerCase().includes(w)))
        .map((t) => ({ id: t.id, group: t.group, title: t.title, summary: t.summary, fields: t.fields.map((f) => ({ id: f.id, label: f.label, required: !!f.required })) }));
      return result(list.map((t) => `${t.id}: ${t.title}. ${t.summary}`).join('\n') || 'No task matches.', { tasks: list });
    },
  );

  server.registerTool(
    'android_cli_command',
    {
      title: 'Android CLI command',
      description: `Build the exact Android CLI command for a task from android_cli_tasks, validated against Android CLI ${CLI_VERSION}. Fields you leave out use the task's defaults.`,
      inputSchema: z.object({
        taskId: z.string().max(100).describe('A task id from android_cli_tasks.'),
        values: z.record(z.string(), z.union([z.string(), z.boolean()])).optional().describe('Field id to value.'),
      }),
      outputSchema: z.object({ commands: z.array(z.string()), missing: z.array(z.string()), note: z.string().optional() }),
      annotations: READ_ONLY,
    },
    async ({ taskId, values }) => {
      const task = cliTasks.find((t) => t.id === taskId);
      if (!task) return { isError: true, content: [{ type: 'text' as const, text: `Unknown task "${taskId}". Call android_cli_tasks for the list.` }] };
      const merged = { ...cliDefaults(task), ...(values ?? {}) };
      const r = buildCommand(taskId, merged);
      const missing = r.missing.length ? `\nMissing required: ${r.missing.join(', ')}` : '';
      return result(`${r.commands.join('\n')}${missing}`, { ...r, ...(task.note ? { note: task.note } : {}) });
    },
  );

  server.registerTool(
    'crash_to_prompt',
    {
      title: 'Crash to agent prompt',
      description: 'Turn an Android crash or ANR (logcat, Play Console or Crashlytics text) into a compact, redacted prompt: root cause, app frames to open first, and the trimmed trace. Removes emails, tokens, IPs and similar secrets.',
      inputSchema: z.object({
        crash: text(L.medium, 'The stack trace or logcat output.'),
        goal: z.enum(Object.keys(goals) as [string, ...string[]]).optional().describe(`What the prompt asks for: ${Object.entries(goals).map(([k, v]) => `${k} (${v})`).join(', ')}.`),
        appPackage: z.string().max(200).optional().describe('Your app’s package, to tell app frames from library frames. Detected when omitted.'),
      }),
      outputSchema: z.object({ prompt: z.string(), appPackage: z.string(), rootCause: z.object({ type: z.string(), message: z.string() }).optional(), files: z.array(z.string()), obfuscated: z.boolean(), warnings: z.array(z.string()) }),
      annotations: READ_ONLY,
    },
    async ({ crash, goal, appPackage }) => {
      const r = crashToPrompt(crash, { ...(goal ? { goal: goal as keyof typeof goals } : {}), ...(appPackage ? { appPackage } : {}) });
      return result(r.prompt, { prompt: r.prompt, appPackage: r.appPackage, ...(r.rootCause ? { rootCause: r.rootCause } : {}), files: r.files, obfuscated: r.obfuscated, warnings: r.warnings });
    },
  );

  server.registerTool(
    'version_catalog',
    {
      title: 'Convert to a version catalog',
      description: 'Move the dependencies and plugins of a build.gradle(.kts) file into libs.versions.toml, and rewrite the build file to use the catalog accessors. Accessors are checked to compile with Gradle.',
      inputSchema: z.object({
        buildFile: text(L.medium, 'Contents of build.gradle.kts or build.gradle.'),
        dsl: z.enum(['kts', 'groovy']).optional().describe('Default: kts.'),
      }),
      outputSchema: z.object({ toml: z.string(), buildFile: z.string(), warnings: z.array(z.string()) }),
      annotations: READ_ONLY,
    },
    async ({ buildFile, dsl }) => {
      const r = convertToCatalog(buildFile, dsl ?? 'kts');
      return result(`# gradle/libs.versions.toml\n${r.toml}\n\n# build file\n${r.buildFile}`, { toml: r.toml, buildFile: r.buildFile, warnings: r.warnings });
    },
  );

  server.registerTool(
    'convert_vector',
    {
      title: 'Convert SVG and vectors',
      description: 'Convert between SVG, Android VectorDrawable XML and Compose ImageVector Kotlin. Output compiles with aapt2 and the Compose compiler.',
      inputSchema: z.object({
        input: text(L.large, 'An SVG document or a VectorDrawable XML.'),
        to: z.enum(['image-vector', 'vector-drawable', 'svg']).describe('Target format.'),
        name: z.string().max(100).optional().describe('ImageVector property name. Default: MyIcon.'),
        packageName: z.string().max(200).optional(),
      }),
      outputSchema: z.object({ output: z.string(), warnings: z.array(z.string()) }),
      annotations: READ_ONLY,
    },
    async ({ input, to, name, packageName }) => {
      const r = convertVector(input, to, { ...(name ? { name } : {}), ...(packageName ? { packageName } : {}) });
      return result(r.output, { output: r.output, warnings: r.warnings });
    },
  );

  server.registerTool(
    'keep_rules',
    {
      title: 'R8 keep rules',
      description: `Generate R8 keep rules for code R8 can't see being used (reflection, JSON models, JNI, JavaScript interfaces), and/or lint an existing proguard-rules.pro for rules that disable shrinking or keep too much. Rule kinds: ${Object.entries(ruleKinds).map(([k, v]) => `${k} (${v.label}${v.target ? `; target: ${v.target}` : ''})`).join('; ')}.`,
      inputSchema: z.object({
        rules: z.array(z.object({ kind: z.enum(Object.keys(ruleKinds) as [RuleKind, ...RuleKind[]]), target: z.string().max(300).optional() })).max(50).optional(),
        lint: z.string().max(L.medium).optional().describe('An existing proguard-rules.pro to check.'),
      }),
      outputSchema: z.object({ rules: z.string(), findings: z.array(z.object({ level: z.string(), line: z.number(), message: z.string() })) }),
      annotations: READ_ONLY,
    },
    async ({ rules, lint }) => {
      const generated = rules?.length ? generateRules(rules) : '';
      const findings = (lint ? lintRules(lint) : []).map((f) => ({ level: f.level, line: f.line, message: f.message }));
      return result([generated, ...findings.map((f) => `${f.level}${f.line ? ` (line ${f.line})` : ''}: ${f.message}`)].filter(Boolean).join('\n') || 'Pass rules to generate or lint to check.', { rules: generated, findings });
    },
  );

  server.registerTool(
    'expect_actual',
    {
      title: 'Generate actual declarations',
      description: 'Write actual declarations for each Kotlin Multiplatform target from commonMain expect code, with KMP wizard file names. Stubs compile with Kotlin 2.4 for Android, iOS, JVM, JS and Wasm.',
      inputSchema: z.object({
        common: text(L.medium, 'commonMain code with expect declarations, including its package line.'),
        fileName: z.string().max(100).optional().describe('Base file name, e.g. Platform. Default: Platform.'),
        module: z.string().max(100).optional().describe('Gradle module, for paths. Default: shared.'),
        targets: z.array(z.enum(TARGETS.map((t) => t.id) as [Target, ...Target[]])).optional().describe('Default: android, ios, jvm.'),
      }),
      outputSchema: z.object({ files: z.array(z.object({ path: z.string(), content: z.string() })), notices: z.array(z.object({ level: z.string(), text: z.string() })), usesExpectClasses: z.boolean() }),
      annotations: READ_ONLY,
    },
    async ({ common, fileName, module, targets }) => {
      const r = generateActuals(common, { fileName: fileName ?? 'Platform', module: module ?? 'shared', targets: targets ?? ['android', 'ios', 'jvm'] });
      const files = r.files.map((f) => ({ path: f.path, content: f.content }));
      return result([...files.map((f) => `// ${f.path}\n${f.content}`), ...r.notices.map((n) => `// ${n.level}: ${n.text}`)].join('\n'), { files, notices: r.notices, usesExpectClasses: r.usesExpectClasses });
    },
  );

  server.registerTool(
    'kotlin_to_swift',
    {
      title: 'How Kotlin reads from Swift',
      description: 'Show how a shared-module Kotlin file is called from Swift through a Kotlin/Native framework (Objective-C export): Int32 and KotlinInt, suspend as async, sealed classes, enums, renamed methods. The Swift it writes type-checks with swiftc against a real framework.',
      inputSchema: z.object({
        kotlin: text(L.medium, 'One Kotlin file from commonMain.'),
        fileName: z.string().max(100).optional().describe('Kotlin file name; top-level code lives on <Name>Kt. Default: Shared.kt.'),
        module: z.string().max(100).optional().describe('Framework baseName. Default: Shared.'),
      }),
      outputSchema: z.object({ swiftFile: z.string(), rows: z.array(z.object({ kotlin: z.string(), swift: z.string(), notes: z.array(z.string()) })), notes: z.array(z.string()) }),
      annotations: READ_ONLY,
    },
    async ({ kotlin, fileName, module }) => {
      const r = swiftInterop(kotlin, { fileName: fileName ?? 'Shared.kt', module: module ?? 'Shared' });
      const rows = r.rows.map((x) => ({ kotlin: x.kotlin, swift: x.swift, notes: x.notes.map((n) => n.text) }));
      return result([r.swiftFile, ...r.notes.map((n) => `// Note: ${n.text}`)].join('\n'), { swiftFile: r.swiftFile, rows, notes: r.notes.map((n) => n.text) });
    },
  );

  server.registerTool(
    'find_kmp_libraries',
    {
      title: 'Find KMP libraries',
      description: `Find Kotlin Multiplatform libraries by task and target, with the newest stable version and targets read from Maven (checked ${KMP_LIBRARIES_CHECKED_ON}), plus a libs.versions.toml and dependency block for the ones you pick. Categories: ${LIBRARY_CATEGORIES.map((c) => c.id).join(', ')}.`,
      inputSchema: z.object({
        query: z.string().max(100).optional().describe('Words to match in the name, description or coordinates.'),
        category: z.enum(LIBRARY_CATEGORIES.map((c) => c.id) as [string, ...string[]]).optional(),
        targets: z.array(z.enum(TARGET_GROUPS.map((t) => t.id) as [TargetGroup, ...TargetGroup[]])).optional().describe('Only libraries that publish all of these. Default: android, ios.'),
      }),
      outputSchema: z.object({
        libraries: z.array(z.object({ name: z.string(), coordinates: z.string(), version: z.string(), released: z.string(), targets: z.array(z.string()), description: z.string(), url: z.string() })),
        toml: z.string(),
        kts: z.string(),
      }),
      annotations: READ_ONLY,
    },
    async ({ query, category, targets }) => {
      const want = targets?.length ? targets : (['android', 'ios'] as TargetGroup[]);
      const words = (query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
      const found = kmpLibraries.filter(
        (l) => (!category || l.category === category) && want.every((t) => l.targets.includes(t)) && words.every((w) => `${l.name} ${l.description} ${l.coordinates}`.toLowerCase().includes(w)),
      );
      const bundle = bundleSnippets(found, want);
      const libraries = found.map((l) => ({ name: l.name, coordinates: l.coordinates, version: l.version, released: l.released, targets: l.targets, description: l.description, url: l.url }));
      return result(libraries.length ? libraries.map((l) => `${l.name} ${l.coordinates}:${l.version} (${l.released}): ${l.description}`).join('\n') : 'No library matches. Try fewer words or targets.', { libraries, toml: found.length ? bundle.toml : '', kts: found.length ? bundle.kts : '' });
    },
  );

  server.registerTool(
    'android_permissions',
    {
      title: 'Android permissions',
      description: `Look up Android permissions (protection level, API level, runtime group) and/or check an AndroidManifest.xml for runtime permissions, Play-restricted ones and maxSdkVersion mistakes. Data from ${PERMISSIONS_SOURCE}.`,
      inputSchema: z.object({
        names: z.array(z.string().max(200)).max(50).optional().describe('Permission names, e.g. ACCESS_FINE_LOCATION or android.permission.CAMERA.'),
        manifest: z.string().max(L.medium).optional().describe('AndroidManifest.xml (the merged one is best).'),
        targetSdk: z.number().int().min(21).max(40).optional().describe('Default: 36.'),
      }),
      outputSchema: z.object({
        permissions: z.array(z.object({ name: z.string(), level: z.string().optional(), since: z.number().optional(), description: z.string().optional(), found: z.boolean() })),
        manifest: z.array(z.object({ name: z.string(), line: z.number(), findings: z.array(z.object({ level: z.string(), text: z.string() })) })),
      }),
      annotations: READ_ONLY,
    },
    async ({ names, manifest, targetSdk }) => {
      type Found = { name: string; found: boolean; level?: string; since?: number; description?: string };
      const permissions = (names ?? []).map((n): Found => {
        const p = findPermission(n);
        return p ? { name: p.name, level: p.level, ...(p.since ? { since: p.since } : {}), ...(p.description ? { description: p.description } : {}), found: true } : { name: n, found: false };
      });
      const checked = manifest ? checkManifest(manifest, targetSdk ?? 36).map((u) => ({ name: u.name, line: u.line, findings: u.findings })) : [];
      const lines = [
        ...permissions.map((p) => (p.found ? `${p.name}: ${p.level}${p.since ? `, API ${p.since}` : ''}${p.description ? `. ${p.description}` : ''}` : `${p.name}: not a known platform permission`)),
        ...checked.flatMap((u) => u.findings.map((f) => `${u.name} (line ${u.line}) [${f.level}]: ${f.text}`)),
      ];
      return result(lines.join('\n') || 'Pass names to look up or a manifest to check.', { permissions, manifest: checked });
    },
  );

  server.registerTool(
    'target_sdk_changes',
    {
      title: 'targetSdk behavior changes',
      description: `What changes when an app raises targetSdk, from Google's behavior change pages for Android 12 to 17. With a manifest, marks the changes it shows signs of. Versions: ${Object.entries(VERSION_NAMES).map(([k, v]) => `${k} (${v})`).join(', ')}.`,
      inputSchema: z.object({
        from: z.number().int().min(30).max(40).optional().describe('Current targetSdk. Read from the manifest when omitted.'),
        to: z.number().int().min(31).max(40).describe('New targetSdk.'),
        manifest: z.string().max(L.medium).optional(),
      }),
      outputSchema: z.object({ changes: z.array(z.object({ api: z.number(), area: z.string(), title: z.string(), action: z.string(), url: z.string(), appliesBecause: z.string().optional() })) }),
      annotations: READ_ONLY,
    },
    async ({ from, to, manifest }) => {
      const start = from ?? (manifest ? findTargetSdk(manifest) : undefined) ?? to - 1;
      const facts = manifest ? readManifest(manifest) : null;
      const changes = changesBetween(start, to).map((c) => {
        const hit = facts && c.detect ? c.detect(facts) : null;
        return { api: c.api, area: c.area, title: c.title, action: c.action, url: changeUrl(c), ...(hit ? { appliesBecause: hit.reason } : {}) };
      });
      return result(changes.map((c) => `API ${c.api} ${c.title}${c.appliesBecause ? ` (applies: ${c.appliesBecause})` : ''}: ${c.action}`).join('\n') || 'No behavior changes between those versions.', { changes });
    },
  );

  return server;
}

/** Every tool's name, title and description, in registration order: for the docs page and llms.txt. */
export function toolCatalog(): ToolInfo[] {
  const tools: ToolInfo[] = [];
  createServer((t) => tools.push(t));
  return tools;
}
