import { describe, expect, it } from 'vitest';
import { fillRecipe, promptRecipes } from './prompt-recipes.ts';
import { toolPath, tools } from './tools.ts';

// Android CLI guides and agent skills belong to androidboss.info, so any /cli/<slug>/ link
// is accepted here; the website's tests check guide links, skill names and Gradle tasks.
const livePages = new Set(tools.filter((t) => t.status === 'live').map(toolPath));
const isKnownPage = (href: string) => livePages.has(href) || /^\/cli\/[a-z0-9-]+\/$/.test(href);

describe('prompt recipes', () => {
  it('have unique ids', () => {
    expect(new Set(promptRecipes.map((r) => r.id)).size).toBe(promptRecipes.length);
    expect(promptRecipes.length).toBeGreaterThanOrEqual(12);
  });

  describe.each(promptRecipes.map((r) => [r.id, r] as const))('%s', (_id, r) => {
    it('uses every input and declares every placeholder', () => {
      const placeholders = [...new Set([...r.prompt.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]))];
      expect(placeholders.sort()).toEqual(r.inputs.map((i) => i.key).sort());
      expect(fillRecipe(r)).not.toMatch(/\{\{/);
    });

    it('links only to live tools and CLI pages', () => {
      expect(r.tools.map((t) => t.href).filter((h) => !isKnownPage(h))).toEqual([]);
    });

    it('says how to check the result and what to report', () => {
      expect(r.prompt).toMatch(/\bReport\b/);
      expect(r.summary.length).toBeLessThan(160);
    });
  });

  it('fills placeholders with values or fallbacks', () => {
    const r = promptRecipes.find((x) => x.id === 'viewmodel-tests')!;
    expect(fillRecipe(r, { class: 'CartViewModel', module: '' })).toContain('./gradlew :app:testDebugUnitTest --tests "*CartViewModelTest"');
    expect(fillRecipe(r, { class: '  ', module: ':feature:cart' })).toContain('Write unit tests for the class I have open in :feature:cart.');
  });
});
