/**
 * `npx androidboss`: the AndroidBoss tools in a terminal, and as a local MCP
 * server over stdio. Both run the exact server that androidboss.info/mcp runs,
 * on this machine, so nothing is sent anywhere and there are no rate limits.
 */
import { Client, type Transport } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { serveStdio, StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { createServer, LOCAL_LIMIT, SERVER_INFO, STDIO_MAX_BYTES } from '@androidboss/mcp';
import { describeOptions, parseToolArgs, UsageError, type Io, type JsonSchema } from './args.ts';

declare const __VERSION__: string | undefined;
export const VERSION = typeof __VERSION__ === 'string' ? __VERSION__ : '0.0.0-dev';

export interface Out {
  stdout(text: string): void;
  stderr(text: string): void;
}

const localServer = () => createServer(undefined, LOCAL_LIMIT);

const USAGE = `androidboss ${VERSION}: Android and Kotlin Multiplatform tools from androidboss.info, run on your machine.

Usage:
  androidboss <tool> [--option value]... [--json]
  androidboss tools              list the tools
  androidboss help <tool>        a tool's options
  androidboss mcp                run as a local MCP server (stdio) for your coding agent

Values: @file reads a file, - reads standard input. Piped input fills a tool's one missing text option.

Examples:
  androidboss retrace --mapping @app/build/outputs/mapping/release/mapping.txt < crash.txt
  androidboss check-compatibility --kotlin 2.4.0 --agp 9.5.0 --gradle 9.6.0
  androidboss json-to-kotlin --root-name User < user.json
  androidboss cheatsheet --query "logs one app" --values.package com.my.app

Docs: https://androidboss.info/agents/mcp-server/`;

/** A client wired to a local server in memory: no network, no process. */
async function connect(): Promise<Client> {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  serveStdio(localServer, { transport: serverSide as Transport });
  const client = new Client({ name: 'androidboss-cli', version: VERSION });
  await client.connect(clientSide as Transport);
  return client;
}

type Tool = { name: string; title?: string; description?: string; inputSchema: JsonSchema };
type CallResult = { content?: { type: string; text?: string }[]; structuredContent?: unknown; isError?: boolean };

const toolName = (s: string) => s.replace(/-/g, '_');
const cliName = (s: string) => s.replace(/_/g, '-');

function suggest(name: string, tools: Tool[]): string {
  const near = tools.filter((t) => t.name.includes(toolName(name)) || toolName(name).includes(t.name.split('_')[0]!)).map((t) => cliName(t.name));
  return `Unknown tool "${name}".${near.length ? ` Did you mean ${near.join(' or ')}?` : ''} Run "androidboss tools" for the list.`;
}

/** Runs one command line. Returns the process exit code: 0 done, 1 the tool reported an error, 2 a usage error. */
export async function run(argv: string[], io: Io, out: Out): Promise<number> {
  const [command, ...rest] = argv;
  if (!command || command === '--help' || command === '-h' || (command === 'help' && !rest.length)) {
    out.stdout(USAGE);
    return 0;
  }
  if (command === '--version' || command === '-v') {
    out.stdout(VERSION);
    return 0;
  }
  if (command === 'mcp') {
    serveStdio(localServer, { transport: new StdioServerTransport(undefined, undefined, { maxBufferSize: STDIO_MAX_BYTES }) });
    return -1; // keeps running until the agent closes stdin
  }

  const client = await connect();
  try {
    const { tools } = (await client.listTools()) as { tools: Tool[] };
    if (command === 'tools') {
      const width = Math.max(...tools.map((t) => cliName(t.name).length));
      out.stdout(tools.map((t) => `${cliName(t.name).padEnd(width)}  ${t.title ?? ''}`).join('\n'));
      return 0;
    }
    const wanted = command === 'help' ? rest[0]! : command;
    const tool = tools.find((t) => t.name === toolName(wanted));
    if (!tool) {
      out.stderr(suggest(wanted, tools));
      return 2;
    }
    if (command === 'help' || rest.includes('--help') || rest.includes('-h')) {
      const options = describeOptions(tool.inputSchema);
      out.stdout([`androidboss ${cliName(tool.name)}: ${tool.title ?? tool.name}`, '', tool.description ?? '', '', 'Options:', ...(options.length ? options : ['  (none)']), '  --json  print the structured result as JSON'].join('\n'));
      return 0;
    }

    let parsed;
    try {
      parsed = parseToolArgs(tool.inputSchema, rest, io);
    } catch (e) {
      if (!(e instanceof UsageError)) throw e;
      out.stderr(`${e.message}\nRun "androidboss help ${cliName(tool.name)}" for its options.`);
      return 2;
    }
    let r: CallResult;
    try {
      r = (await client.callTool({ name: tool.name, arguments: parsed.args })) as CallResult;
    } catch (e) {
      out.stderr((e as Error).message);
      return 2;
    }
    const text = (r.content ?? []).map((c) => c.text ?? '').join('\n');
    if (r.isError) {
      out.stderr(text);
      return 1;
    }
    out.stdout(parsed.json ? JSON.stringify(r.structuredContent ?? {}, null, 2) : text);
    return 0;
  } finally {
    await client.close();
  }
}

export { SERVER_INFO };
