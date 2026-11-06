import { describe, expect, it } from 'vitest';
import { agents, generateMcpConfig, servers } from './index.ts';

const all = servers.map((s) => s.id);

describe('generateMcpConfig', () => {
  it('writes Claude Code .mcp.json with http type and ${VAR} expansion', () => {
    const r = generateMcpConfig('claude-code', ['mobile', 'github']);
    expect(r.file).toBe('.mcp.json');
    expect(JSON.parse(r.content)).toEqual({
      mcpServers: {
        mobile: { command: 'npx', args: ['-y', '@mobilenext/mobile-mcp@latest'] },
        github: { type: 'http', url: 'https://api.githubcopilot.com/mcp/', headers: { Authorization: 'Bearer ${GITHUB_PAT}' } },
      },
    });
    expect(r.commands).toEqual([
      'claude mcp add --scope project mobile -- npx -y @mobilenext/mobile-mcp@latest',
      'claude mcp add --scope project --transport http github https://api.githubcopilot.com/mcp/ --header \'Authorization: Bearer ${GITHUB_PAT}\'',
    ]);
  });

  it('writes Codex TOML with bearer_token_env_var', () => {
    const r = generateMcpConfig('codex', ['firebase', 'github', 'figma']);
    expect(r.language).toBe('toml');
    expect(r.content).toBe(`[mcp_servers.firebase]
command = "npx"
args = ["-y", "firebase-tools@latest", "mcp"]

[mcp_servers.github]
url = "https://api.githubcopilot.com/mcp/"
bearer_token_env_var = "GITHUB_PAT"

[mcp_servers.figma]
url = "https://mcp.figma.com/mcp"
`);
    expect(r.commands[1]).toBe('codex mcp add github --url https://api.githubcopilot.com/mcp/ --bearer-token-env-var GITHUB_PAT');
    expect(r.notes.some((n) => n.includes('trusted'))).toBe(true);
  });

  it('uses httpUrl for Gemini CLI and serverUrl for Antigravity, with token placeholders', () => {
    const gemini = JSON.parse(generateMcpConfig('gemini-cli', ['github']).content);
    expect(gemini.mcpServers.github).toEqual({ httpUrl: 'https://api.githubcopilot.com/mcp/', headers: { Authorization: 'Bearer <YOUR_GITHUB_PAT>' } });
    const ag = generateMcpConfig('antigravity', ['github', 'sentry']);
    expect(JSON.parse(ag.content).mcpServers.sentry).toEqual({ serverUrl: 'https://mcp.sentry.dev/mcp' });
    expect(ag.notes.at(-1)).toContain('<YOUR_GITHUB_PAT>');
  });

  it('uses url for Cursor and a servers map with types for VS Code', () => {
    expect(JSON.parse(generateMcpConfig('cursor', ['figma']).content)).toEqual({ mcpServers: { figma: { url: 'https://mcp.figma.com/mcp' } } });
    expect(JSON.parse(generateMcpConfig('vscode', ['context7', 'github']).content)).toEqual({
      servers: {
        context7: { type: 'stdio', command: 'npx', args: ['-y', '@upstash/context7-mcp'] },
        github: { type: 'http', url: 'https://api.githubcopilot.com/mcp/', headers: { Authorization: 'Bearer ${env:GITHUB_PAT}' } },
      },
    });
  });

  it('keeps server order from the registry and handles empty selection', () => {
    const r = generateMcpConfig('cursor', ['sentry', 'mobile']);
    expect(Object.keys(JSON.parse(r.content).mcpServers)).toEqual(['mobile', 'sentry']);
    expect(generateMcpConfig('codex', []).content).toBe('');
    expect(JSON.parse(generateMcpConfig('cursor', []).content)).toEqual({ mcpServers: {} });
  });

  it('produces valid output for every agent and server', () => {
    for (const a of agents) {
      const r = generateMcpConfig(a.id, all);
      if (r.language === 'json') expect(() => JSON.parse(r.content)).not.toThrow();
      expect(r.notes.length).toBeGreaterThanOrEqual(all.length);
    }
  });

  it('rejects unknown agents', () => {
    // @ts-expect-error bad id
    expect(() => generateMcpConfig('nope', [])).toThrow();
  });
});
