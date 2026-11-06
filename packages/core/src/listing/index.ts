/**
 * Store listing text checks for Google Play and the App Store, and the
 * description HTML Google Play renders.
 *
 * Limits: Play Console "Create and set up your app" store listing table and
 * the Metadata policy; App Store Connect "App information" and "Platform
 * version information". Rendering: what live play.google.com listings showed
 * on 2026-11-03 (see PLAY_RENDERED_TAGS).
 */
import { promotionalWords } from '../store-assets/index.ts';

export const LISTING_RULES_CHECKED_ON = '2026-11-03';

export const PLAY_LIMITS = { title: 30, shortDescription: 80, fullDescription: 4000 } as const;
export const APP_STORE_LIMITS = { nameMin: 2, name: 30, subtitle: 30, promotionalText: 170, description: 4000, keywordBytes: 100, keywordMin: 3 } as const;

/**
 * Tags kept in descriptions on live Play listings (Canva, Strava, Reddit,
 * Microsoft To Do: <b>; TickTick: <u>; Adobe Acrobat: <h1>). Line breaks
 * become <br>. On play.google.com <u> is underlined, but <b> computes to
 * weight 400 and <h1> to a plain 14px block line.
 */
export const PLAY_RENDERED_TAGS = ['b', 'u', 'h1', 'br'] as const;

export interface ListingFinding {
  field: string;
  level: 'error' | 'warning' | 'info';
  text: string;
}

/** Characters as people count them: code points, so an emoji or a CJK character is one. */
export const charCount = (s: string) => [...s].length;
export const utf8Bytes = (s: string) => new TextEncoder().encode(s).length;

const EMOJI = /\p{Extended_Pictographic}/u;
const REPEATED_SPECIAL = /([^\p{L}\p{N}\s])\1|[★☆✓✔✅❤♥►▶◆■●•|]{2,}/u;
const KAOMOJI = /[(（][^()（）]{0,6}[̀-ͯ∀-⋿฀-๿°ツ][^()（）]{0,6}[)）]|[:;=]-?[)(DPp]\B/u;

/** Words of 4+ letters in capitals, ignoring common acronyms. */
function shoutedWords(s: string): string[] {
  const ok = new Set(['HTML', 'JSON', 'HTTP', 'HTTPS', 'NASA', 'PDF', 'GPS', 'VPN', 'AI', 'TV', 'USB', 'NFC', 'SMS', 'MP3', 'MP4', 'HDR', 'RSVP', 'FAQ', 'ASAP', 'IPTV']);
  return [...s.matchAll(/\b\p{Lu}{4,}\b/gu)].map((m) => m[0]).filter((w) => !ok.has(w));
}

function limit(out: ListingFinding[], field: string, value: string, max: number, unit = 'characters') {
  const n = unit === 'bytes' ? utf8Bytes(value) : charCount(value);
  if (n > max) out.push({ field, level: 'error', text: `${n} ${unit}; the limit is ${max}.` });
}

/** Rules the Metadata policy sets for the title, icon and developer name. */
function nameRules(out: ListingFinding[], field: string, value: string) {
  if (EMOJI.test(value)) out.push({ field, level: 'error', text: 'No emoji here: the Metadata policy bans emoji and emoticons in the title and developer name.' });
  else if (KAOMOJI.test(value)) out.push({ field, level: 'error', text: 'Looks like an emoticon; the Metadata policy bans them in the title and developer name.' });
  if (REPEATED_SPECIAL.test(value)) out.push({ field, level: 'error', text: 'Repeated special characters aren’t allowed in the title or developer name.' });
  const caps = shoutedWords(value);
  if (caps.length) out.push({ field, level: 'warning', text: `“${caps.join('”, “')}” is in capitals. Only allowed when it is part of your brand name.` });
  const promo = promotionalWords(value);
  if (promo.length) out.push({ field, level: 'error', text: `“${promo.join('”, “')}”: ranking, price, promotional and Google Play program words aren’t allowed in the title or developer name.` });
}

const STOP = new Set(
  'a an and are as at be but by can do for from get has have how in into is it its it’s just like make more my no not of on one or our so than that the their them then there these this to up us use was we what when where which while who will with you your all any app apps'.split(' '),
);

/**
 * Non-stop words used often enough to look like keyword stuffing. `ignore`
 * holds words from the app and developer name, which listings naturally repeat.
 * Calibrated on 23 published listings: top apps repeat their main keyword
 * up to about 20 times in 4000 characters.
 */
export function repeatedWords(text: string, minCount = 15, ignore: string[] = []): { word: string; count: number }[] {
  const skip = new Set(ignore.map((w) => w.toLowerCase()));
  const counts = new Map<string, number>();
  for (const m of text.toLowerCase().matchAll(/\p{L}[\p{L}\p{N}'’-]{2,}/gu)) if (!STOP.has(m[0]) && !skip.has(m[0])) counts.set(m[0], (counts.get(m[0]) ?? 0) + 1);
  const words = [...counts.values()].reduce((a, b) => a + b, 0);
  return [...counts]
    .filter(([, c]) => c >= minCount && c / Math.max(words, 1) > 0.025)
    .sort((a, b) => b[1] - a[1])
    .map(([word, count]) => ({ word, count }));
}

/** Quoted praise with no source on the same line, e.g. "Best app ever!" ★★★★★. */
export function unattributedTestimonials(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split('\n')) {
    const strip = line.replace(/<[^>]+>/g, '').trim();
    const q = strip.match(/^[^\p{L}"“”]*["“]([^"“”]{8,})["”](.*)$/u);
    if (!q) continue;
    const rest = q[2]!.trim();
    // A source after a dash, "by", "via" or a comma counts as attribution.
    if (/^([-–—~,(]|by\b|via\b|from\b)\s*\S/iu.test(rest)) continue;
    out.push(q[1]!.trim());
  }
  return out;
}

/** Runs of short lines without punctuation, the "vertical word lists" the policy names. */
export function wordLists(text: string): string[] {
  const lists: string[] = [];
  let run: string[] = [];
  const flush = () => {
    if (run.length >= 5) lists.push(run.join(', '));
    run = [];
  };
  for (const raw of text.split('\n')) {
    const line = raw.replace(/<[^>]+>/g, '').replace(/^[\s\-–•*▪·►→+]+/u, '').trim();
    if (line && line.split(/\s+/).length <= 2 && !/[.:!?,;]/.test(line)) run.push(line);
    else flush();
  }
  flush();
  return lists;
}

/** Comma lists of 12 or more short items: fine for languages or artists, a problem when they are search terms. */
export function commaLists(text: string): string[] {
  return [...text.matchAll(/(?<![\p{L}\p{N}])(?:[\p{L}\p{N}][\p{L}\p{N} '’.&-]{0,24}\s*,\s*){11,}[\p{L}\p{N}][\p{L}\p{N} '’.&-]{0,24}/gu)].map((m) => m[0]);
}

/** Ranking, award and superlative claims the Metadata policy gives as examples for descriptions. */
const CLAIMS = /(?<![\w#])(#\s?1|no\.?\s?1|number one|editor'?’?s'? choice|app of the year|best of play|award[- ]winning|best \w+(?: \w+)? ever)(?!\w)/giu;
export function descriptionClaims(text: string): string[] {
  return [...new Set([...text.matchAll(CLAIMS)].map((m) => m[0].toLowerCase()))];
}

export interface PlayListing {
  title: string;
  developerName: string;
  shortDescription: string;
  fullDescription: string;
}

export function checkPlayListing(l: PlayListing): ListingFinding[] {
  const out: ListingFinding[] = [];
  if (!l.title.trim()) out.push({ field: 'App name', level: 'error', text: 'Required.' });
  limit(out, 'App name', l.title, PLAY_LIMITS.title);
  nameRules(out, 'App name', l.title);
  nameRules(out, 'Developer name', l.developerName);

  if (!l.shortDescription.trim()) out.push({ field: 'Short description', level: 'error', text: 'Required.' });
  limit(out, 'Short description', l.shortDescription, PLAY_LIMITS.shortDescription);
  if (!l.fullDescription.trim()) out.push({ field: 'Full description', level: 'error', text: 'Required.' });
  limit(out, 'Full description', l.fullDescription, PLAY_LIMITS.fullDescription);

  for (const [field, text] of [['Short description', l.shortDescription], ['Full description', l.fullDescription]] as const) {
    const claims = descriptionClaims(text);
    if (claims.length) out.push({ field, level: 'warning', text: `“${claims.join('”, “')}”: the Metadata policy gives ranking and award claims such as “#1” or “Editor’s Choice” and claims such as “best game ever” as violations.` });
    const caps = shoutedWords(text);
    if (caps.length >= 20) out.push({ field, level: 'info', text: `${caps.length} words in capitals (${caps.slice(0, 4).join(', ')}…). Capitals for headings are common, but capitals used to stand out in search count as manipulation.` });
  }
  if (EMOJI.test(l.shortDescription)) out.push({ field: 'Short description', level: 'info', text: 'Has emoji. Allowed in descriptions, but keep them few: excessive formatting is a policy reason for rejection.' });

  for (const t of unattributedTestimonials(l.fullDescription))
    out.push({ field: 'Full description', level: 'warning', text: `Quote without a source: “${t.slice(0, 60)}”. Unattributed or anonymous testimonials aren’t allowed; name the publication or person.` });
  for (const w of wordLists(l.fullDescription)) out.push({ field: 'Full description', level: 'warning', text: `Looks like a vertical word list (“${w.slice(0, 60)}…”). Word blocks and word lists are listed policy violations.` });
  for (const w of commaLists(l.fullDescription)) out.push({ field: 'Full description', level: 'info', text: `Long comma list (“${w.slice(0, 60)}…”). Fine for languages or artists; a list of search terms is a word block.` });
  const rep = repeatedWords(`${l.shortDescription}\n${l.fullDescription}`, 15, `${l.title} ${l.developerName}`.split(/[^\p{L}\p{N}]+/u));
  if (rep.length) out.push({ field: 'Full description', level: 'info', text: `Most repeated: ${rep.slice(0, 5).map((r) => `${r.word} ×${r.count}`).join(', ')}. Repetitive keywords are a listed reason for rejection; write for people, not search.` });

  const unknown = [...new Set([...l.fullDescription.matchAll(/<\/?([a-z][a-z0-9]*)\b[^>]*>/gi)].map((m) => m[1]!.toLowerCase()))].filter((t) => !(PLAY_RENDERED_TAGS as readonly string[]).includes(t));
  if (unknown.length) out.push({ field: 'Full description', level: 'info', text: `<${unknown.join('>, <')}> wasn’t seen on live listings. Play keeps <b>, <u>, <h1> and line breaks.` });
  return out;
}

export interface AppStoreListing {
  name: string;
  subtitle: string;
  promotionalText: string;
  description: string;
  keywords: string;
  developerName: string;
}

export function checkAppStoreListing(l: AppStoreListing): ListingFinding[] {
  const out: ListingFinding[] = [];
  if (charCount(l.name.trim()) < APP_STORE_LIMITS.nameMin) out.push({ field: 'Name', level: 'error', text: 'Must be at least 2 characters.' });
  limit(out, 'Name', l.name, APP_STORE_LIMITS.name);
  limit(out, 'Subtitle', l.subtitle, APP_STORE_LIMITS.subtitle);
  limit(out, 'Promotional text', l.promotionalText, APP_STORE_LIMITS.promotionalText);
  if (!l.description.trim()) out.push({ field: 'Description', level: 'error', text: 'Required.' });
  limit(out, 'Description', l.description, APP_STORE_LIMITS.description);
  if (/<\/?[a-z][a-z0-9]*\b[^>]*>/i.test(l.description)) out.push({ field: 'Description', level: 'warning', text: 'App Store descriptions are plain text; HTML tags show up literally.' });

  limit(out, 'Keywords', l.keywords, APP_STORE_LIMITS.keywordBytes, 'bytes');
  const kws = l.keywords.split(',').map((k) => k.trim()).filter(Boolean);
  if (!kws.length) out.push({ field: 'Keywords', level: 'error', text: 'Required.' });
  const short = kws.filter((k) => charCount(k) < APP_STORE_LIMITS.keywordMin);
  if (short.length) out.push({ field: 'Keywords', level: 'error', text: `Each keyword must be longer than two characters: ${short.join(', ')}.` });
  const seen = new Set<string>();
  const dup = kws.filter((k) => (seen.has(k.toLowerCase()) ? true : (seen.add(k.toLowerCase()), false)));
  if (dup.length) out.push({ field: 'Keywords', level: 'warning', text: `Repeated: ${dup.join(', ')}.` });
  const named = new Set(`${l.name} ${l.developerName}`.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => charCount(w) > 2));
  const wasted = kws.filter((k) => named.has(k.toLowerCase()));
  if (wasted.length) out.push({ field: 'Keywords', level: 'warning', text: `${wasted.join(', ')} already in the app or company name, which are searchable. Use the bytes for other words.` });
  const spaces = (l.keywords.match(/,\s+|\s+,/g) ?? []).join('').replace(/,/g, '').length;
  if (spaces) out.push({ field: 'Keywords', level: 'info', text: `${spaces} byte${spaces > 1 ? 's' : ''} spent on spaces around commas. Separate with commas only.` });
  return out;
}

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * The full description as Play shows it: text escaped, the tags Play renders
 * restored (without attributes), line breaks as <br>. Safe to assign to innerHTML.
 */
export function playDescriptionHtml(text: string): string {
  return escape(text)
    .replace(/&lt;(\/?)(b|u|h1)&gt;/gi, (_, slash: string, tag: string) => `<${slash}${tag.toLowerCase()}>`)
    .replace(/&lt;br\s*\/?&gt;/gi, '<br>')
    .replace(/\r?\n/g, '<br>');
}

/** Plain text with line breaks, as the App Store shows it. */
export function plainTextHtml(text: string): string {
  return escape(text).replace(/\r?\n/g, '<br>');
}
