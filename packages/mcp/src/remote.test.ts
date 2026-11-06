/**
 * Talks to a running AndroidBoss MCP server over real HTTP with the official
 * client: `wrangler dev` locally, or production after a deploy.
 *   MCP_URL=http://localhost:8787/mcp npm test -w @androidboss/mcp
 *   MCP_URL=https://androidboss.info/mcp npm test -w @androidboss/mcp
 */
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { describe, expect, it } from 'vitest';
import { toolCatalog } from './index.ts';

const url = process.env.MCP_URL;

/** A mapping.txt with many classes, about the size of a mid-size app's. */
function bigMapping(classes: number): string {
  const lines: string[] = [];
  for (let i = 0; i < classes; i++) {
    lines.push(`com.example.feature${i % 50}.Screen${i} -> a${i}:`, `    java.lang.String title -> a`, `    1:10:void render(int):${20 + (i % 30)}:${29 + (i % 30)} -> a`, `    11:20:void onClick(java.lang.String):40:49 -> b`);
  }
  return `${lines.join('\n')}\n`;
}

describe.skipIf(!url)(`MCP server at ${url}`, () => {
  it('connects, lists every tool and calls them over HTTP', async () => {
    const client = new Client({ name: 'androidboss-remote-test', version: '1.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(url!)));
    try {
      const { tools } = await client.listTools();
      expect(tools.map((t) => t.name).sort()).toEqual(toolCatalog().map((t) => t.name).sort());

      const compat = (await client.callTool({ name: 'check_compatibility', arguments: { kotlin: '2.4.21', agp: '9.5.0', gradle: '9.6.0' } })) as { isError?: boolean; structuredContent?: { checks: unknown[] } };
      expect(compat.isError).toBeFalsy();
      expect(compat.structuredContent?.checks.length).toBeGreaterThan(0);

      // A realistic retrace: a 20,000-class mapping and a trace that hits it.
      const mapping = bigMapping(20_000);
      const started = Date.now();
      const r = (await client.callTool({ name: 'retrace', arguments: { mapping, stackTrace: 'java.lang.IllegalStateException\n\tat a19999.a(SourceFile:3)\n\tat a7.b(SourceFile:12)' } })) as { isError?: boolean; content: { text: string }[] };
      const ms = Date.now() - started;
      expect(r.isError, r.content[0]?.text).toBeFalsy();
      expect(r.content[0]!.text).toContain('com.example.feature49.Screen19999.render');
      console.log(`retrace with ${(mapping.length / 1e6).toFixed(1)} MB mapping: ${ms} ms round trip`);
    } finally {
      await client.close();
    }
  }, 120_000);
});
