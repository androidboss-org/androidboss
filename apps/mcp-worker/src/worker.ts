/**
 * The AndroidBoss MCP server at https://mcp.androidboss.org/mcp. The root sends
 * browsers to the setup page; every other path is a 404.
 */
import { createMcpFetch, DOCS_URL } from '@androidboss/mcp/http';

const serveMcp = createMcpFetch();

export default {
  async fetch(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === '/mcp' || pathname === '/mcp/') return serveMcp(request);
    if (pathname === '/' && request.method === 'GET') return Response.redirect(DOCS_URL, 302);
    return new Response('Not found. The MCP endpoint is /mcp.', { status: 404 });
  },
};
