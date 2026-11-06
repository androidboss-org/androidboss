// Kotlin hard keywords: these cannot be used as identifiers without backticks.
const HARD_KEYWORDS = new Set([
  'as', 'break', 'class', 'continue', 'do', 'else', 'false', 'for', 'fun', 'if', 'in',
  'interface', 'is', 'null', 'object', 'package', 'return', 'super', 'this', 'throw',
  'true', 'try', 'typealias', 'typeof', 'val', 'var', 'when', 'while',
]);

/** Splits "user_id", "userId", "User-ID", "user id" into lowercase words. */
function words(raw: string): string[] {
  return raw
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase());
}

const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);

/** JSON key → Kotlin property name (camelCase, valid identifier). */
export function propertyName(key: string): string {
  const parts = words(key);
  let name = parts.length ? parts[0] + parts.slice(1).map(cap).join('') : 'value';
  if (/^[0-9]/.test(name)) name = `n${name}`;
  return HARD_KEYWORDS.has(name) ? `\`${name}\`` : name;
}

/** JSON key → Kotlin class name (PascalCase, valid identifier). */
export function className(key: string): string {
  let name = words(key).map(cap).join('');
  if (!name) name = 'Item';
  if (/^[0-9]/.test(name)) name = `N${name}`;
  return name;
}

/** Best-effort singular for naming list item classes: "users" → "user", "categories" → "category". */
export function singular(word: string): string {
  if (/ies$/i.test(word) && word.length > 4) return word.slice(0, -3) + (word.endsWith('IES') ? 'Y' : 'y');
  if (/(ss|us|is)$/i.test(word)) return word;
  if (/(xes|ches|shes|sses)$/i.test(word)) return word.slice(0, -2);
  if (/s$/i.test(word) && word.length > 1) return word.slice(0, -1);
  return word;
}
