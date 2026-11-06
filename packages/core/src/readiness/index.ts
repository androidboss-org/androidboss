/**
 * Agent readiness: look at an Android / Kotlin Multiplatform project's file
 * list and a handful of small config files, and report what helps or hurts a
 * coding agent (Claude Code, Codex, Gemini CLI, Copilot) working in it.
 *
 * Pure: the caller lists the project's paths, asks `filesToRead` which ones to
 * read, and passes their contents to `checkReadiness`. Nothing else is read.
 */
import { checkVersions, type Versions } from '../compat/index.ts';

export interface ProjectSnapshot {
  /** Every file path, relative to the project root, with forward slashes. */
  paths: string[];
  /** Contents of the files `filesToRead` picked. */
  files: Record<string, string>;
}

export type CheckStatus = 'pass' | 'warn' | 'fail' | 'info';

export type Area = 'instructions' | 'build' | 'tests' | 'feedback' | 'safety' | 'tooling';

export const areas: Record<Area, string> = {
  instructions: 'Agent instructions',
  build: 'Build',
  tests: 'Tests',
  feedback: 'Fast feedback',
  safety: 'Secrets and safety',
  tooling: 'Agent tooling',
};

export interface ReadinessCheck {
  id: string;
  area: Area;
  status: CheckStatus;
  title: string;
  detail: string;
  /** Points this check is worth; info checks are 0. */
  weight: number;
  /** Related androidboss tool or doc. */
  link?: { href: string; label: string };
}

export interface ReadinessReport {
  score: number;
  checks: ReadinessCheck[];
  project: {
    kind: 'android' | 'kmp' | 'unknown';
    modules: string[];
    versions: Versions;
    instructionFiles: string[];
  };
}

// ---------------------------------------------------------------------------
// Which files to read

/** Directories never worth walking: build output, caches, VCS, dependencies. */
export const IGNORED_DIRS = new Set(['build', '.gradle', '.git', '.idea', 'node_modules', '.kotlin', '.cxx', '.externalNativeBuild', 'Pods', 'DerivedData', '.fleet', 'captures', 'out']);

export function isIgnoredPath(path: string): boolean {
  return path.split('/').some((p) => IGNORED_DIRS.has(p));
}

export const INSTRUCTION_FILES = ['AGENTS.md', 'CLAUDE.md', 'GEMINI.md', '.github/copilot-instructions.md', '.cursorrules', '.windsurfrules', 'CLAUDE.local.md'];
const INSTRUCTION_DIRS = ['.cursor/rules/', '.github/instructions/', '.windsurf/rules/'];
const MCP_FILES = ['.mcp.json', '.cursor/mcp.json', '.vscode/mcp.json', '.gemini/settings.json', '.codex/config.toml', '.junie/mcp/mcp.json', '.amazonq/mcp.json'];
const AGENT_SETTINGS = ['.claude/settings.json', '.gemini/settings.json', '.codex/config.toml'];

const isBuildFile = (p: string) => /(^|\/)(build|settings)\.gradle(\.kts)?$/.test(p);
const isWorkflow = (p: string) => /^\.github\/workflows\/[^/]+\.ya?ml$/.test(p) || /^(\.gitlab-ci\.yml|bitrise\.yml|codemagic\.yaml|\.circleci\/config\.yml|Jenkinsfile|azure-pipelines\.yml)$/.test(p);

export function filesToRead(paths: string[]): string[] {
  const wanted = new Set([
    ...INSTRUCTION_FILES,
    ...MCP_FILES,
    ...AGENT_SETTINGS,
    'gradle/libs.versions.toml',
    'gradle/wrapper/gradle-wrapper.properties',
    'gradle.properties',
    '.gitignore',
    '.editorconfig',
  ]);
  return paths.filter(
    (p) =>
      !isIgnoredPath(p) &&
      (wanted.has(p) ||
        isBuildFile(p) ||
        isWorkflow(p) ||
        /(^|\/)\.gitignore$/.test(p) ||
        // Nested AGENTS.md / CLAUDE.md in modules.
        /(^|\/)(AGENTS|CLAUDE|GEMINI)\.md$/.test(p) ||
        INSTRUCTION_DIRS.some((d) => p.startsWith(d) && /\.(md|mdc)$/.test(p))),
  );
}

// ---------------------------------------------------------------------------
// Helpers

const has = (s: ProjectSnapshot, p: string) => s.paths.includes(p);
const read = (s: ProjectSnapshot, p: string) => s.files[p] ?? '';
const buildFiles = (s: ProjectSnapshot) => Object.keys(s.files).filter(isBuildFile);
const allBuildText = (s: ProjectSnapshot) => buildFiles(s).map((p) => read(s, p)).join('\n');

function tomlVersions(toml: string): Record<string, string> {
  const section = toml.match(/\[versions\]([\s\S]*?)(?:\n\[|$)/)?.[1] ?? '';
  return Object.fromEntries([...section.matchAll(/^\s*([\w.-]+)\s*=\s*"([^"]+)"/gm)].map((m) => [m[1]!, m[2]!]));
}

/** Resolve the version of a plugin from the catalog or a build file. */
function pluginVersion(s: ProjectSnapshot, ids: RegExp, catalogKeys: string[], legacy?: 'agp' | 'kotlin'): string | undefined {
  const toml = read(s, 'gradle/libs.versions.toml');
  const versions = tomlVersions(toml);
  // [plugins] entries: name = { id = "com.android.application", version.ref = "agp" }
  for (const m of toml.matchAll(/^\s*[\w.-]+\s*=\s*\{([^}]*)\}/gm)) {
    const body = m[1]!;
    const id = body.match(/\bid\s*=\s*"([^"]+)"/)?.[1];
    if (!id || !ids.test(id)) continue;
    const ref = body.match(/version\.ref\s*=\s*"([^"]+)"/)?.[1];
    const direct = body.match(/\bversion\s*=\s*"([^"]+)"/)?.[1];
    const v = ref ? versions[ref] : direct;
    if (v) return v;
  }
  for (const k of catalogKeys) if (versions[k]) return versions[k];
  const text = allBuildText(s);
  for (const m of text.matchAll(/id\s*\(?\s*["']([\w.-]+)["']\s*\)?\s*version\s*\(?\s*["']([^"']+)["']/g)) if (ids.test(m[1]!)) return m[2];
  if (legacy === 'kotlin') {
    const dsl = text.match(/kotlin\s*\(\s*["'](?:android|multiplatform|jvm)["']\s*\)\s*version\s*["']([^"']+)["']/);
    if (dsl) return dsl[1];
  }
  // Old buildscript classpath.
  if (legacy === 'agp') return text.match(/com\.android\.tools\.build:gradle:([\d.]+[\w.-]*)/)?.[1];
  if (legacy === 'kotlin') return text.match(/kotlin-gradle-plugin:([\d.]+[\w.-]*)/)?.[1] ?? text.match(/ext\.kotlin_version\s*=\s*["']([^"']+)["']/)?.[1];
  return undefined;
}

export function detectVersions(s: ProjectSnapshot): Versions {
  const wrapper = read(s, 'gradle/wrapper/gradle-wrapper.properties');
  const gradle = wrapper.match(/gradle-([\d.]+(?:-[\w.]+)?)-(?:bin|all)\.zip/)?.[1];
  const agp = pluginVersion(s, /^com\.android\.(application|library|kotlin\.multiplatform\.library|test|dynamic-feature)$/, ['agp', 'androidGradlePlugin', 'android-gradle-plugin', 'androidGradle'], 'agp');
  const kotlin = pluginVersion(s, /^org\.jetbrains\.kotlin\.(android|multiplatform|jvm|plugin\.compose)$/, ['kotlin'], 'kotlin');
  const ksp = pluginVersion(s, /^com\.google\.devtools\.ksp$/, ['ksp']);
  const cmp = pluginVersion(s, /^org\.jetbrains\.compose$/, ['compose-multiplatform', 'composeMultiplatform', 'compose-plugin']);
  const compileSdk = allBuildText(s).match(/compileSdk(?:Version)?\s*(?:=|\()?\s*(\d{2})/)?.[1] ?? tomlVersions(read(s, 'gradle/libs.versions.toml'))['compileSdk'] ?? tomlVersions(read(s, 'gradle/libs.versions.toml'))['android-compileSdk'];
  return Object.fromEntries(Object.entries({ gradle, agp, kotlin, ksp, cmp, compileSdk }).filter(([, v]) => v)) as Versions;
}

function modules(s: ProjectSnapshot): string[] {
  const settings = read(s, 'settings.gradle.kts') || read(s, 'settings.gradle');
  const found = [...settings.matchAll(/include\s*\(?([^)\n]+)\)?/g)].flatMap((m) => [...m[1]!.matchAll(/["']:?([\w:.-]+)["']/g)].map((x) => x[1]!.replace(/:/g, '/')));
  return [...new Set(found)];
}

function gitignored(s: ProjectSnapshot, file: string): boolean {
  const rules = Object.entries(s.files)
    .filter(([p]) => /(^|\/)\.gitignore$/.test(p))
    .flatMap(([, text]) => text.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && !l.startsWith('!')));
  const name = file.split('/').pop()!;
  return rules.some((r) => {
    const rule = r.replace(/^\//, '').replace(/\/$/, '');
    if (rule === file || rule === name) return true;
    if (rule.includes('*')) {
      const re = new RegExp(`^${rule.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '§').replace(/\*/g, '[^/]*').replace(/§/g, '.*')}$`);
      return re.test(name) || re.test(file);
    }
    return file.startsWith(`${rule}/`) || file.includes(`/${rule}/`);
  });
}

// ---------------------------------------------------------------------------
// Checks

export function checkReadiness(s: ProjectSnapshot): ReadinessReport {
  const checks: ReadinessCheck[] = [];
  const add = (c: ReadinessCheck) => checks.push(c);
  const paths = s.paths.filter((p) => !isIgnoredPath(p));
  const buildText = allBuildText(s);
  const mods = modules(s);
  const kmp = /kotlin\s*\(\s*["']multiplatform["']\s*\)|org\.jetbrains\.kotlin\.multiplatform|kotlinMultiplatform|kotlin\.multiplatform/.test(buildText + read(s, 'gradle/libs.versions.toml'));
  const android = /com\.android\.(application|library|kotlin\.multiplatform\.library)|android\s*\{|androidApplication|androidLibrary/.test(buildText + read(s, 'gradle/libs.versions.toml'));
  const versions = detectVersions(s);

  // --- Instructions -------------------------------------------------------
  const instructionFiles = paths.filter((p) => INSTRUCTION_FILES.includes(p) || INSTRUCTION_DIRS.some((d) => p.startsWith(d)) || /(^|\/)(AGENTS|CLAUDE|GEMINI)\.md$/.test(p));
  const rootInstructions = instructionFiles.filter((p) => !p.includes('/') || p.startsWith('.github/') || INSTRUCTION_DIRS.some((d) => p.startsWith(d)));
  const instructionText = instructionFiles.map((p) => read(s, p)).join('\n');
  const generator = { href: '/agents/agents-md-generator/', label: 'AGENTS.md Generator' };

  if (!rootInstructions.length) {
    add({ id: 'instructions-file', area: 'instructions', status: 'fail', weight: 20, title: 'No agent instructions file', detail: 'Add an AGENTS.md at the root with build and test commands, architecture and conventions. Every agent reads it at the start of a session; without it the agent rediscovers your project each time.', link: generator });
  } else {
    // AGENTS.md earns its 4 points here; without it, a separate warning below.
    add({ id: 'instructions-file', area: 'instructions', status: 'pass', weight: has(s, 'AGENTS.md') ? 24 : 20, title: `Agent instructions: ${rootInstructions.join(', ')}`, detail: 'Agents read this at the start of every session.' });
    if (!has(s, 'AGENTS.md'))
      add({ id: 'agents-md', area: 'instructions', status: 'warn', weight: 4, title: 'No AGENTS.md', detail: `Only ${rootInstructions.join(', ')}. AGENTS.md is read by Codex, Copilot, Cursor, Gemini CLI, Junie and others; point the tool-specific file at it (for Claude Code, a CLAUDE.md containing @AGENTS.md) so they share one source.`, link: generator });

    const commands = /gradlew|\bgradle\s+\w|\bandroid\s+(run|build|emulator|layout)|\bbash\s+\S+\.sh\b|\.\/\S+\.sh\b|\b(make|just|task)\s+(test|build|check)\b/.test(instructionText);
    add(commands
      ? { id: 'instructions-commands', area: 'instructions', status: 'pass', weight: 8, title: 'Instructions include build and test commands', detail: 'Agents can verify their own changes.' }
      : { id: 'instructions-commands', area: 'instructions', status: 'warn', weight: 8, title: 'Instructions don’t show how to build or test', detail: 'List the exact commands, such as `./gradlew :app:assembleDebug` and `./gradlew test`, so the agent checks its work instead of guessing.', link: generator });

    const size = new TextEncoder().encode(instructionText).length;
    if (size > 40_000)
      add({ id: 'instructions-size', area: 'instructions', status: 'warn', weight: 3, title: `Instructions are long (${Math.round(size / 1000)} KB)`, detail: 'They are loaded into every session and crowd out your code. Keep the root file short and move detail into module-level AGENTS.md files or docs the agent can open when needed.' });
    else if (size < 300)
      add({ id: 'instructions-size', area: 'instructions', status: 'warn', weight: 3, title: 'Instructions are very short', detail: 'Add the modules, architecture, how to run tests and the conventions an agent can’t infer from the code.', link: generator });
    else add({ id: 'instructions-size', area: 'instructions', status: 'pass', weight: 3, title: 'Instructions are a reasonable size', detail: `${(size / 1000).toFixed(1)} KB.` });
  }

  // --- Build ---------------------------------------------------------------
  const wrapper = has(s, 'gradlew') && has(s, 'gradle/wrapper/gradle-wrapper.properties');
  add(wrapper
    ? { id: 'gradle-wrapper', area: 'build', status: 'pass', weight: 10, title: 'Gradle wrapper committed', detail: `The agent can build with ./gradlew${versions.gradle ? ` (Gradle ${versions.gradle})` : ''} without a local Gradle install.` }
    : { id: 'gradle-wrapper', area: 'build', status: 'fail', weight: 10, title: 'No Gradle wrapper', detail: 'Commit gradlew, gradlew.bat and gradle/wrapper/. Agents run builds in a plain shell and need a pinned Gradle version.' });

  if (versions.kotlin || versions.agp || versions.gradle) {
    const compat = checkVersions(versions);
    const errors = compat.filter((c) => c.status === 'error');
    const warns = compat.filter((c) => c.status === 'warn');
    const summary = [versions.kotlin && `Kotlin ${versions.kotlin}`, versions.agp && `AGP ${versions.agp}`, versions.gradle && `Gradle ${versions.gradle}`].filter(Boolean).join(', ');
    const link = { href: '/tools/compatibility-matrix/', label: 'Compatibility Matrix' };
    if (errors.length) add({ id: 'versions', area: 'build', status: 'fail', weight: 8, title: `Version mismatch: ${errors[0]!.title}`, detail: `${summary}. ${errors.map((e) => e.detail).join(' ')}`.trim(), link });
    else if (warns.length) add({ id: 'versions', area: 'build', status: 'warn', weight: 8, title: warns[0]!.title, detail: `${summary}. ${warns.map((e) => e.detail).join(' ')}`.trim(), link });
    else add({ id: 'versions', area: 'build', status: 'pass', weight: 8, title: 'Build tool versions are compatible', detail: summary, link });
  }

  const catalog = has(s, 'gradle/libs.versions.toml');
  const hardcoded = [...buildText.matchAll(/(?:implementation|api|ksp|kapt|testImplementation|androidTestImplementation|debugImplementation)\s*\(?\s*["'][\w.-]+:[\w.-]+:[\d][^"']*["']/g)].length;
  add(catalog && hardcoded < 3
    ? { id: 'version-catalog', area: 'build', status: 'pass', weight: 4, title: 'Dependencies in a version catalog', detail: 'One place to read and change versions, so upgrades stay consistent across modules.' }
    : { id: 'version-catalog', area: 'build', status: 'warn', weight: 4, title: catalog ? `${hardcoded} dependencies still have versions in build files` : 'No version catalog', detail: 'Agents upgrade dependencies more safely when versions live in gradle/libs.versions.toml instead of being repeated across modules.', link: { href: '/tools/version-catalog/', label: 'Version Catalog Converter' } });

  const props = read(s, 'gradle.properties');
  const speed = ['org.gradle.caching=true', 'org.gradle.configuration-cache=true', 'org.gradle.parallel=true'].filter((k) => !props.replace(/\s/g, '').includes(k));
  add(speed.length
    ? { id: 'gradle-speed', area: 'feedback', status: 'warn', weight: 4, title: 'Gradle speed settings missing', detail: `Agents build many times per task. Consider adding to gradle.properties: ${speed.join(', ')}. Check the configuration cache works with your plugins first.` }
    : { id: 'gradle-speed', area: 'feedback', status: 'pass', weight: 4, title: 'Build cache, configuration cache and parallel builds on', detail: 'Faster edit-build loops for agents.' });

  if (/jvmToolchain\s*\(|toolchain\s*\{|languageVersion\.set|JavaLanguageVersion\.of/.test(buildText))
    add({ id: 'jdk', area: 'build', status: 'pass', weight: 2, title: 'JDK toolchain pinned', detail: 'The build uses the same JDK whatever the agent’s shell has.' });
  else add({ id: 'jdk', area: 'build', status: 'info', weight: 0, title: 'JDK version not pinned', detail: 'Consider `kotlin { jvmToolchain(17) }` (or 21) so builds don’t depend on the JAVA_HOME of the shell the agent runs in, or name the JDK in AGENTS.md.' });

  // --- Tests ---------------------------------------------------------------
  const unit = paths.filter((p) => /\/src\/(test|commonTest|jvmTest|androidUnitTest|androidHostTest|desktopTest)\/.*\.(kt|java)$/.test(p));
  const ui = paths.filter((p) => /\/src\/(androidTest|androidInstrumentedTest|androidDeviceTest)\/.*\.(kt|java)$/.test(p));
  const journeys = paths.filter((p) => p.endsWith('.journey.xml'));
  const screenshot = paths.filter((p) => /\/src\/(screenshotTest)\//.test(p) || /paparazzi|roborazzi/i.test(p));
  add(unit.length >= 3
    ? { id: 'unit-tests', area: 'tests', status: 'pass', weight: 12, title: `${unit.length} unit test files`, detail: 'Fast tests the agent can run after each change.' }
    : unit.length
      ? { id: 'unit-tests', area: 'tests', status: 'warn', weight: 12, title: `Only ${unit.length} unit test file${unit.length === 1 ? '' : 's'}`, detail: 'Agents rely on tests to know a change works. Add tests for view models, repositories and parsing code first.' }
      : { id: 'unit-tests', area: 'tests', status: 'fail', weight: 12, title: 'No unit tests', detail: 'Without tests, an agent can only check that the code compiles. Start with tests for view models and data mapping, and say in AGENTS.md how to run them.' });
  add(ui.length || journeys.length || screenshot.length
    ? { id: 'ui-tests', area: 'tests', status: 'pass', weight: 6, title: 'UI-level tests', detail: [ui.length && `${ui.length} instrumented`, journeys.length && `${journeys.length} Journeys`, screenshot.length && `${screenshot.length} screenshot`].filter(Boolean).join(', ') + ' test files.' }
    : { id: 'ui-tests', area: 'tests', status: 'warn', weight: 6, title: 'No UI tests', detail: 'Add a few end-to-end checks of critical flows. Journeys let an agent test the UI from plain-language steps.', link: { href: '/cli/journeys-writer/', label: 'Journeys Writer' } });

  // --- Fast feedback -----------------------------------------------------------
  const linters = [
    /detekt/i.test(buildText) || paths.some((p) => /detekt.*\.ya?ml$/.test(p)) ? 'detekt' : '',
    /ktlint|kotlinter/i.test(buildText) || /ktlint/.test(read(s, '.editorconfig')) ? 'ktlint' : '',
    /spotless/i.test(buildText) ? 'Spotless' : '',
    /\blint\s*\{|lintOptions/.test(buildText) || paths.some((p) => /(^|\/)lint\.xml$/.test(p)) ? 'Android Lint config' : '',
  ].filter(Boolean);
  add(linters.length
    ? { id: 'linters', area: 'feedback', status: 'pass', weight: 6, title: `Static checks: ${linters.join(', ')}`, detail: 'Agents fix style and lint problems themselves when a command reports them.' }
    : { id: 'linters', area: 'feedback', status: 'warn', weight: 6, title: 'No formatter or static analysis', detail: 'Add ktlint or Spotless, and detekt, and list the commands in AGENTS.md. Agents match your style far better when a tool tells them what’s wrong.' });

  const workflows = paths.filter(isWorkflow);
  const ciText = workflows.map((p) => read(s, p)).join('\n');
  add(!workflows.length
    ? { id: 'ci', area: 'feedback', status: 'warn', weight: 6, title: 'No CI workflow', detail: 'CI catches what an agent missed before it reaches main. Even a workflow that runs ./gradlew build on pull requests helps.', link: { href: '/cli/ci-cd/', label: 'Android CLI in CI' } }
    : /gradlew[\s\S]{0,200}?\b(test\w*|check|build|verify\w*|connected\w*Test)\b|\bbash\s+\S*(test|check|ci|verify)\S*\.sh/i.test(ciText)
      ? { id: 'ci', area: 'feedback', status: 'pass', weight: 6, title: `CI runs tests (${workflows.length} workflow${workflows.length === 1 ? '' : 's'})`, detail: 'Agent changes are checked on every pull request.' }
      : { id: 'ci', area: 'feedback', status: 'warn', weight: 6, title: 'CI doesn’t seem to run tests', detail: 'Make sure a workflow runs ./gradlew test (or check) on pull requests.' });

  // --- Safety -------------------------------------------------------------
  // Certificates (.pem/.crt) are usually public; only private keys and keystores count.
  const secrets = paths.filter((p) => /\.(jks|keystore|p12|pfx)$/.test(p) || /(private|secret|_key|-key)[^/]*\.pem$/i.test(p) || /(^|\/)(keystore\.properties|secrets\.properties|local\.properties|\.env)$/.test(p) || /service[-_]?account.*\.json$/i.test(p));
  const exposed = secrets.filter((p) => !gitignored(s, p) && !/debug\.keystore$/.test(p));
  add(exposed.length
    ? { id: 'secrets', area: 'safety', status: 'fail', weight: 10, title: `Secrets may be committed: ${exposed.slice(0, 3).join(', ')}${exposed.length > 3 ? '…' : ''}`, detail: 'These files aren’t matched by .gitignore. Agents read and copy what’s in the repo. Ignore them, move signing keys out of the project, and deny agents access to them.' }
    : { id: 'secrets', area: 'safety', status: 'pass', weight: 10, title: secrets.length ? 'Secret files are git-ignored' : 'No signing keys or secret files in the project', detail: secrets.length ? `${secrets.length} file${secrets.length === 1 ? '' : 's'} like local.properties or keystores are ignored. Also deny agents read access to them in their settings.` : 'Nothing like a keystore or .env was found.' });

  const ignore = read(s, '.gitignore');
  const missing = ['build', '.gradle', 'local.properties'].filter((r) => !new RegExp(`(^|\\n)\\s*/?(\\*\\*/)?${r.replace('.', '\\.')}/?\\s*(\\n|$)`).test(ignore));
  add(!has(s, '.gitignore')
    ? { id: 'gitignore', area: 'safety', status: 'fail', weight: 4, title: 'No .gitignore', detail: 'Without it, build output and local.properties end up in commits an agent makes.' }
    : missing.length
      ? { id: 'gitignore', area: 'safety', status: 'warn', weight: 4, title: `.gitignore doesn’t list ${missing.join(', ')}`, detail: 'Agents often run git add -A. Ignore build output and local files at the root.' }
      : { id: 'gitignore', area: 'safety', status: 'pass', weight: 4, title: '.gitignore covers build output and local files', detail: 'build/, .gradle/ and local.properties stay out of commits.' });

  const settings = AGENT_SETTINGS.filter((p) => has(s, p));
  const deny = settings.some((p) => /deny|denied|disallow/i.test(read(s, p)));
  add(deny
    ? { id: 'agent-permissions', area: 'safety', status: 'pass', weight: 3, title: 'Agent permissions configured', detail: `Deny rules in ${settings.join(', ')}.` }
    : { id: 'agent-permissions', area: 'safety', status: 'info', weight: 0, title: 'No shared agent permission rules', detail: 'Commit agent settings (like .claude/settings.json) that deny reading keystores, .env and local.properties, and allow ./gradlew so routine builds don’t need approval.' });

  // --- Tooling --------------------------------------------------------------
  const mcp = MCP_FILES.filter((p) => has(s, p) && (p !== '.gemini/settings.json' || /mcpServers/.test(read(s, p))) && (p !== '.codex/config.toml' || /mcp_servers/.test(read(s, p))));
  add(mcp.length
    ? { id: 'mcp', area: 'tooling', status: 'pass', weight: 3, title: `MCP servers configured: ${mcp.join(', ')}`, detail: 'Shared tools for everyone who opens the project with an agent.' }
    : { id: 'mcp', area: 'tooling', status: 'info', weight: 0, title: 'No project MCP config', detail: 'Optional. A committed MCP config gives every agent the same tools, such as docs search or your issue tracker.', link: { href: '/agents/mcp-config/', label: 'MCP Config Generator' } });

  const skills = paths.filter((p) => /(^|\/)\.(claude|agents|github|gemini|codex)\/skills\/.+\/SKILL\.md$/.test(p) || /(^|\/)skills\/[^/]+\/SKILL\.md$/.test(p));
  add(skills.length
    ? { id: 'skills', area: 'tooling', status: 'pass', weight: 2, title: `${skills.length} agent skill${skills.length === 1 ? '' : 's'} in the repo`, detail: 'Repeatable workflows the agent can load when needed.' }
    : { id: 'skills', area: 'tooling', status: 'info', weight: 0, title: 'No project skills', detail: 'Optional. Run `android init` to give agents the Android CLI skill (devices, layout, screenshots, Journeys), and add skills for your own workflows.', link: { href: '/cli/getting-started/', label: 'Android CLI: getting started' } });

  if (!has(s, 'README.md') && !has(s, 'README'))
    add({ id: 'readme', area: 'instructions', status: 'warn', weight: 2, title: 'No README', detail: 'A short README with what the app does and how to run it helps agents and people alike.' });

  const total = checks.reduce((a, c) => a + c.weight, 0);
  const got = checks.reduce((a, c) => a + (c.status === 'pass' ? c.weight : c.status === 'warn' ? c.weight / 2 : 0), 0);
  return {
    score: total ? Math.round((got / total) * 100) : 0,
    checks,
    project: { kind: kmp ? 'kmp' : android ? 'android' : 'unknown', modules: mods, versions, instructionFiles },
  };
}

const ICON: Record<CheckStatus, string> = { pass: '✅', warn: '⚠️', fail: '❌', info: 'ℹ️' };

/** The report as Markdown, to paste into an agent as a to-do list or into an issue. */
export function reportMarkdown(r: ReadinessReport, origin = 'https://androidboss.info'): string {
  const v = r.project.versions;
  const lines = [
    `# Agent readiness: ${r.score}/100`,
    '',
    `Project: ${r.project.kind === 'kmp' ? 'Kotlin Multiplatform' : r.project.kind === 'android' ? 'Android' : 'unknown'}, ${r.project.modules.length || 'no'} module${r.project.modules.length === 1 ? '' : 's'}` +
      (Object.keys(v).length ? ` · ${Object.entries(v).map(([k, x]) => `${k} ${x}`).join(', ')}` : ''),
  ];
  const todo = r.checks.filter((c) => c.status === 'fail' || c.status === 'warn');
  if (todo.length) {
    lines.push('', '## To do', '');
    for (const c of [...todo].sort((a, b) => (a.status === b.status ? b.weight - a.weight : a.status === 'fail' ? -1 : 1)))
      lines.push(`- [ ] ${ICON[c.status]} **${c.title}.** ${c.detail}${c.link ? ` ([${c.link.label}](${origin}${c.link.href}))` : ''}`);
  }
  const done = r.checks.filter((c) => c.status === 'pass');
  if (done.length) lines.push('', '## Already in place', '', ...done.map((c) => `- ${ICON.pass} ${c.title}`));
  const ideas = r.checks.filter((c) => c.status === 'info');
  if (ideas.length) lines.push('', '## Optional', '', ...ideas.map((c) => `- ${c.title}. ${c.detail}`));
  return `${lines.join('\n')}\n`;
}
