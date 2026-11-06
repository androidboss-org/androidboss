import { describe, expect, it } from 'vitest';
import { createMcpFetch, DOCS_URL } from './http.ts';
import { MAX_REQUEST_BYTES } from './index.ts';

const serve = createMcpFetch();
const URL_ = 'https://mcp.androidboss.org/mcp';

describe('MCP over HTTP', () => {
  it('answers CORS preflights', async () => {
    const r = await serve(new Request(URL_, { method: 'OPTIONS' }));
    expect(r.status).toBe(204);
    expect(r.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('sends browsers to the setup page', async () => {
    const r = await serve(new Request(URL_, { headers: { accept: 'text/html' } }));
    expect(r.status).toBe(302);
    expect(r.headers.get('location')).toBe(DOCS_URL);
  });

  it('refuses oversized bodies before reading them', async () => {
    const r = await serve(new Request(URL_, { method: 'POST', headers: { 'content-length': String(MAX_REQUEST_BYTES + 1) }, body: 'x' }));
    expect(r.status).toBe(413);
  });

  it('serves MCP with CORS headers', async () => {
    const init = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } };
    const r = await serve(new Request(URL_, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: JSON.stringify(init) }));
    expect(r.status).toBe(200);
    expect(r.headers.get('access-control-expose-headers')).toContain('mcp-session-id');
    expect(await r.text()).toContain('"name":"androidboss"');
  });
});
