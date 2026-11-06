/**
 * Generates MCP server configuration for AI coding agents.
 *
 * Formats checked against each agent's docs on 2026-11-02:
 * - Claude Code: .mcp.json, `mcpServers`, `type: "http"` for remote, `${VAR}` expansion
 * - Codex: config.toml `[mcp_servers.<name>]`, `url` + `bearer_token_env_var` for remote
 * - Gemini CLI: .gemini/settings.json `mcpServers`, `httpUrl` for streamable HTTP
 * - Cursor: .cursor/mcp.json `mcpServers`, `url` for remote
 * - Antigravity: .agents/mcp_config.json `mcpServers`, `serverUrl` for remote
 * - VS Code (Copilot): .vscode/mcp.json `servers` with explicit `type`
 */

export type AgentId = 'claude-code' | 'codex' | 'gemini-cli' | 'cursor' | 'antigravity' | 'vscode';

export interface Agent {
  id: AgentId;
  name: string;
  /** Project-scoped config file, relative to the repo root. */
  file: string;
  /** Where the user-wide config lives, for the note shown with the output. */
  globalFile: string;
  language: 'json' | 'toml';
  docs: string;
}

export const agents: readonly Agent[] = [
  { id: 'claude-code', name: 'Claude Code', file: '.mcp.json', globalFile: '~/.claude.json (via `claude mcp add --scope user`)', language: 'json', docs: 'https://docs.claude.com/en/docs/claude-code/mcp' },
  { id: 'codex', name: 'OpenAI Codex', file: '.codex/config.toml', globalFile: '~/.codex/config.toml', language: 'toml', docs: 'https://developers.openai.com/codex/mcp' },
  { id: 'gemini-cli', name: 'Gemini CLI', file: '.gemini/settings.json', globalFile: '~/.gemini/settings.json', language: 'json', docs: 'https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/mcp-server.md' },
  { id: 'cursor', name: 'Cursor', file: '.cursor/mcp.json', globalFile: '~/.cursor/mcp.json', language: 'json', docs: 'https://docs.cursor.com/context/model-context-protocol' },
  { id: 'antigravity', name: 'Antigravity', file: '.agents/mcp_config.json', globalFile: '~/.gemini/config/mcp_config.json', language: 'json', docs: 'https://antigravity.google/docs/mcp' },
  { id: 'vscode', name: 'VS Code (Copilot)', file: '.vscode/mcp.json', globalFile: 'User settings → MCP: Open User Configuration', language: 'json', docs: 'https://code.visualstudio.com/docs/copilot/chat/mcp-servers' },
];

type Transport =
  | { kind: 'stdio'; command: string; args: string[] }
  | { kind: 'http'; url: string; /** Env var holding a bearer token; omitted when the server uses OAuth. */ tokenEnv?: string };

export interface McpServer {
  id: string;
  name: string;
  description: string;
  transport: Transport;
  /** Shown under the config: prerequisites, sign-in, caveats. */
  note: string;
  docs: string;
}

export const servers: readonly McpServer[] = [
  {
    id: 'androidboss',
    name: 'AndroidBoss',
    description: 'This site’s tools for your agent: R8 retrace, compatibility checks, KMP libraries, permissions, targetSdk changes, Kotlin to Swift and more.',
    transport: { kind: 'http', url: 'https://androidboss.info/mcp' },
    note: 'No sign-in. Inputs are processed in memory and not stored. Every tool is read-only.',
    docs: 'https://androidboss.info/agents/mcp-server/',
  },
  {
    id: 'mobile',
    name: 'Mobile MCP',
    description: 'Drive Android emulators, devices and iOS simulators: tap, type, screenshot, read the UI tree.',
    transport: { kind: 'stdio', command: 'npx', args: ['-y', '@mobilenext/mobile-mcp@latest'] },
    note: 'Needs Node.js plus the Android SDK (adb on PATH) and, for iOS, Xcode. Use an emulator or test device.',
    docs: 'https://github.com/mobile-next/mobile-mcp',
  },
  {
    id: 'firebase',
    name: 'Firebase',
    description: 'Manage Firebase projects, Crashlytics, Remote Config, Auth and Firestore from your agent.',
    transport: { kind: 'stdio', command: 'npx', args: ['-y', 'firebase-tools@latest', 'mcp'] },
    note: 'Needs Node.js. Sign in once with `npx firebase-tools login`.',
    docs: 'https://firebase.google.com/docs/cli/mcp-server',
  },
  {
    id: 'github',
    name: 'GitHub',
    description: 'Issues, pull requests, Actions runs and code search on GitHub.',
    transport: { kind: 'http', url: 'https://api.githubcopilot.com/mcp/', tokenEnv: 'GITHUB_PAT' },
    note: 'Create a fine-grained personal access token and export it as GITHUB_PAT. Never commit the token.',
    docs: 'https://github.com/github/github-mcp-server',
  },
  {
    id: 'figma',
    name: 'Figma',
    description: 'Read frames, components and variables from Figma designs to build matching Compose UI.',
    transport: { kind: 'http', url: 'https://mcp.figma.com/mcp' },
    note: 'Remote server; your agent opens a Figma sign-in the first time. Paste links to frames in your prompts.',
    docs: 'https://help.figma.com/hc/en-us/articles/39888612464151',
  },
  {
    id: 'context7',
    name: 'Context7',
    description: 'Up-to-date library docs (Compose, Ktor, Koin, Room…) pulled into the prompt on demand.',
    transport: { kind: 'stdio', command: 'npx', args: ['-y', '@upstash/context7-mcp'] },
    note: 'Needs Node.js. Works without an API key at low volume.',
    docs: 'https://github.com/upstash/context7',
  },
  {
    id: 'sentry',
    name: 'Sentry',
    description: 'Look up crashes, stack traces and releases from Sentry while fixing bugs.',
    transport: { kind: 'http', url: 'https://mcp.sentry.dev/mcp' },
    note: 'Remote server; your agent opens a Sentry sign-in the first time.',
    docs: 'https://docs.sentry.io/product/sentry-mcp/',
  },
];

export interface McpConfigResult {
  agent: Agent;
  file: string;
  language: 'json' | 'toml';
  content: string;
  /** Equivalent CLI commands, for agents that have them. */
  commands: string[];
  notes: string[];
}

const TOKEN_PLACEHOLDER = (env: string) => `<YOUR_${env}>`;

function jsonEntry(agent: AgentId, s: McpServer): Record<string, unknown> {
  const t = s.transport;
  if (t.kind === 'stdio') {
    return agent === 'vscode' ? { type: 'stdio', command: t.command, args: t.args } : { command: t.command, args: t.args };
  }
  const auth = (token: string) => (t.tokenEnv ? { headers: { Authorization: `Bearer ${token}` } } : {});
  switch (agent) {
    case 'claude-code':
      return { type: 'http', url: t.url, ...auth(`\${${t.tokenEnv}}`) };
    case 'vscode':
      return { type: 'http', url: t.url, ...auth(`\${env:${t.tokenEnv}}`) };
    case 'cursor':
      return { url: t.url, ...auth(`\${env:${t.tokenEnv}}`) };
    case 'gemini-cli':
      return { httpUrl: t.url, ...auth(TOKEN_PLACEHOLDER(t.tokenEnv ?? '')) };
    case 'antigravity':
      return { serverUrl: t.url, ...auth(TOKEN_PLACEHOLDER(t.tokenEnv ?? '')) };
    case 'codex':
      throw new Error('Codex uses TOML');
  }
}

const tomlString = (s: string) => JSON.stringify(s);

function tomlEntry(s: McpServer): string {
  const t = s.transport;
  const lines = [`[mcp_servers.${s.id}]`];
  if (t.kind === 'stdio') {
    lines.push(`command = ${tomlString(t.command)}`, `args = [${t.args.map(tomlString).join(', ')}]`);
  } else {
    lines.push(`url = ${tomlString(t.url)}`);
    if (t.tokenEnv) lines.push(`bearer_token_env_var = ${tomlString(t.tokenEnv)}`);
  }
  return lines.join('\n');
}

function cliCommands(agent: AgentId, list: readonly McpServer[]): string[] {
  if (agent === 'claude-code') {
    return list.map((s) => {
      const t = s.transport;
      if (t.kind === 'stdio') return `claude mcp add --scope project ${s.id} -- ${[t.command, ...t.args].join(' ')}`;
      // Single quotes keep ${VAR} literal so .mcp.json stores the reference, not the token.
      const header = t.tokenEnv ? ` --header 'Authorization: Bearer \${${t.tokenEnv}}'` : '';
      return `claude mcp add --scope project --transport http ${s.id} ${t.url}${header}`;
    });
  }
  if (agent === 'codex') {
    return list.map((s) => {
      const t = s.transport;
      if (t.kind === 'stdio') return `codex mcp add ${s.id} -- ${[t.command, ...t.args].join(' ')}`;
      return `codex mcp add ${s.id} --url ${t.url}${t.tokenEnv ? ` --bearer-token-env-var ${t.tokenEnv}` : ''}`;
    });
  }
  return [];
}

export function generateMcpConfig(agentId: AgentId, serverIds: readonly string[]): McpConfigResult {
  const agent = agents.find((a) => a.id === agentId);
  if (!agent) throw new Error(`Unknown agent: ${agentId}`);
  const list = servers.filter((s) => serverIds.includes(s.id));

  let content: string;
  if (agent.language === 'toml') {
    content = list.length ? `${list.map(tomlEntry).join('\n\n')}\n` : '';
  } else {
    const entries = Object.fromEntries(list.map((s) => [s.id, jsonEntry(agent.id, s)]));
    content = `${JSON.stringify(agent.id === 'vscode' ? { servers: entries } : { mcpServers: entries }, null, 2)}\n`;
  }

  const notes = list.map((s) => `${s.name}: ${s.note}`);
  const tokenServers = list.filter((s) => s.transport.kind === 'http' && s.transport.tokenEnv);
  if (tokenServers.length && (agent.id === 'gemini-cli' || agent.id === 'antigravity')) {
    notes.push(`Replace ${tokenServers.map((s) => TOKEN_PLACEHOLDER((s.transport as { tokenEnv: string }).tokenEnv)).join(', ')} with your token, and keep this file out of git (use the user-wide config instead).`);
  }
  if (agent.id === 'codex') notes.push('Project-scoped .codex/config.toml is only read for trusted projects. Use ~/.codex/config.toml otherwise.');

  return { agent, file: agent.file, language: agent.language, content, commands: cliCommands(agent.id, list), notes };
}
