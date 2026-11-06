import { describe, expect, it } from 'vitest';
import { categories, categoryById, toolPath, tools, toolsIn } from './tools.ts';

describe('tool registry', () => {
  it('has unique slugs', () => {
    const slugs = tools.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('uses URL-safe slugs', () => {
    for (const t of tools) expect(t.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('keeps taglines short enough for meta descriptions', () => {
    for (const t of tools) expect(t.tagline.length, t.slug).toBeLessThanOrEqual(120);
  });

  it('gives every category at least one tool', () => {
    for (const c of categories) expect(toolsIn(c.id).length, c.id).toBeGreaterThan(0);
  });
});

describe('toolPath', () => {
  it('puts agent and CLI tools under their hubs', () => {
    const agents = tools.find((t) => t.category === 'agents')!;
    const cli = tools.find((t) => t.category === 'cli')!;
    expect(toolPath(agents)).toBe(`/agents/${agents.slug}/`);
    expect(toolPath(cli)).toBe(`/cli/${cli.slug}/`);
  });

  it('puts everything else under /tools/', () => {
    const json = tools.find((t) => t.slug === 'json-to-kotlin')!;
    expect(toolPath(json)).toBe('/tools/json-to-kotlin/');
  });
});

describe('categoryById', () => {
  it('throws on an unknown id', () => {
    // @ts-expect-error testing a bad id
    expect(() => categoryById('nope')).toThrow();
  });
});
