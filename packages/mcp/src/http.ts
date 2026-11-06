/**
 * The MCP server over Streamable HTTP, for a Cloudflare Worker or any runtime with
 * the Fetch API. Used by apps/mcp-worker (mcp.androidboss.org) and by the
 * androidboss.info site at /mcp. Requests are handled in memory: nothing is stored
 * or logged.
 */
import { createMcpHandler } from '@modelcontextprotocol/server';
import { createServer, MAX_REQUEST_BYTES } from './index.ts';

/** Browser-based MCP clients (such as the MCP Inspector) call from other origins. The server is public and holds no user state. */
export const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
  'access-control-allow-headers': 'content-type, accept, authorization, mcp-protocol-version, mcp-session-id, last-event-id',
  'access-control-expose-headers': 'mcp-session-id, mcp-protocol-version',
  'access-control-max-age': '86400',
};

export const DOCS_URL = 'https://androidboss.info/agents/mcp-server/';

/**
 * A fetch handler for the MCP endpoint. Answers CORS preflights, sends browsers to
 * the setup page, and refuses bodies over MAX_REQUEST_BYTES before reading them.
 */
export function createMcpFetch(docsUrl: string = DOCS_URL): (request: Request) => Promise<Response> {
  // The SDK's own body limit (4 MiB by default) also covers bodies sent without a Content-Length.
  const mcp = createMcpHandler(() => createServer(), { maxRequestBodySize: MAX_REQUEST_BYTES });
  return async (request) => {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    // Someone opening the endpoint in a browser gets the setup page instead of a protocol error.
    if (request.method === 'GET' && request.headers.get('accept')?.includes('text/html')) {
      return Response.redirect(new URL(docsUrl, request.url).href, 302);
    }
    // Refuse oversized bodies before reading them, so they cost almost no CPU.
    const length = Number(request.headers.get('content-length') ?? '0');
    if (length > MAX_REQUEST_BYTES) {
      return new Response(`Request too large: the limit is ${MAX_REQUEST_BYTES / 1_000_000} MB.`, { status: 413, headers: CORS });
    }
    const response = await mcp.fetch(request);
    const headers = new Headers(response.headers);
    for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  };
}
