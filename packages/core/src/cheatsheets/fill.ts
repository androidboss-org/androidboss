import type { Cheatsheet, Entry, Variable } from './types.ts';

export const PLACEHOLDER = /\{\{([a-zA-Z][a-zA-Z0-9]*)(?::(cap|lower))?\}\}/g;

/** The variable keys a command uses, in order of first use. */
export function placeholders(command: string): string[] {
  return [...new Set([...command.matchAll(PLACEHOLDER)].map((m) => m[1]!))];
}

/**
 * Replaces {{key}} with values[key], falling back to the variable's example.
 * {{key:cap}} capitalises the first letter (debug → Debug, for Gradle task names),
 * {{key:lower}} lowercases it.
 */
export function fill(command: string, variables: Variable[], values: Record<string, string> = {}): string {
  return command.replace(PLACEHOLDER, (whole, key: string, mod?: string) => {
    const v = variables.find((x) => x.key === key);
    if (!v) return whole;
    const value = values[key]?.trim() || v.example;
    if (mod === 'cap') return value.charAt(0).toUpperCase() + value.slice(1);
    if (mod === 'lower') return value.toLowerCase();
    return value;
  });
}

export interface FoundEntry {
  sheet: Cheatsheet;
  entry: Entry;
  score: number;
}

/**
 * Entries matching every word of the query, best first: title words weigh most,
 * then tags, then the command and note.
 */
export function findEntries(sheets: readonly Cheatsheet[], query: string, sheet?: string): FoundEntry[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const found: FoundEntry[] = [];
  for (const s of sheets) {
    if (sheet && s.slug !== sheet) continue;
    for (const section of s.sections) {
      for (const entry of section.entries) {
        const title = entry.title.toLowerCase();
        const tags = entry.tags.join(' ').toLowerCase();
        const rest = `${entry.command} ${entry.note ?? ''} ${section.title} ${s.title}`.toLowerCase();
        let score = 0;
        let all = true;
        for (const w of words) {
          if (new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(title)) score += 4;
          else if (title.includes(w)) score += 3;
          else if (tags.includes(w)) score += 2;
          else if (rest.includes(w)) score += 1;
          else all = false;
        }
        if (all) found.push({ sheet: s, entry, score: words.length ? score : 0 });
      }
    }
  }
  return found.sort((a, b) => b.score - a.score);
}

/** All entries of a sheet, with their section. */
export const entriesOf = (s: Cheatsheet) => s.sections.flatMap((section) => section.entries.map((entry) => ({ section, entry })));
