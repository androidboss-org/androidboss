/**
 * Journeys writer: turn a user flow written in plain words into a Journey test
 * (`.journey.xml`), the natural-language UI test format run by Android Studio
 * Journeys and by coding agents through the Android CLI skill.
 *
 * Format and authoring rules follow Android Studio's own Journeys skill
 * (android-journeys/references/authoring.md) and the Android CLI journeys
 * reference: <journey name> with <description> and <actions xml:space="preserve">
 * holding one <action> per step; steps are UI interactions, or checks that
 * start with "Check"/"Verify"; no "launch the app" step; files live in
 * <module>/src/journeysTest/.
 */

export interface JourneyOptions {
  name: string;
  description: string;
  /** The flow: one step per line, a numbered list, or sentences. */
  steps: string;
  /** Split "do X, then do Y" into two steps. */
  splitThen: boolean;
  /** Rewrite statements like "The cart shows 1 item" as "Verify that …". */
  makeChecks: boolean;
  /** Gradle module that holds src/journeysTest/. */
  module: string;
}

export const defaultJourneyOptions: JourneyOptions = {
  name: 'Add to cart',
  description: '',
  steps: '',
  splitThen: true,
  makeChecks: true,
  module: 'app',
};

export type StepKind = 'action' | 'check';

export interface StepNote {
  level: 'warn' | 'info';
  text: string;
}

export interface JourneyStep {
  text: string;
  kind: StepKind;
  /** What the input said, when the step was rewritten. */
  original?: string;
  notes: StepNote[];
}

export interface JourneyResult {
  xml: string;
  fileName: string;
  /** Relative to the project root. */
  path: string;
  steps: JourneyStep[];
  /** Steps dropped, such as "Open the app". */
  removed: string[];
  warnings: string[];
  /** Prompt to run it with a coding agent and the Android CLI. */
  runPrompt: string;
}

// ---------------------------------------------------------------------------
// Splitting the input into steps

const BULLET = /^\s*(?:[-*•–]|\d+[.)]|\(?[a-z]\)|step\s*\d+\s*[:.)-]?)\s*/i;

export function splitSteps(input: string, splitThen: boolean): string[] {
  const lines = input
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => {
      let t = l;
      while (BULLET.test(t) && t.replace(BULLET, '') !== t) t = t.replace(BULLET, '');
      return t.trim();
    })
    .filter(Boolean);
  // One paragraph: split into sentences. Lists: one step per line.
  let steps = lines.length === 1 ? lines[0]!.split(/(?<=[.!?])\s+(?=[A-Z"'‘“])/) : lines;
  if (splitThen) steps = steps.flatMap((s) => s.split(/\s*(?:;|,?\s+and then\s+|,\s*then\s+|\.\s*Then\s+|\s+then\s+(?=[a-z]))/i));
  // "Tap X and make sure Y": the check becomes its own step. Other "and"s stay, as the agent splits those itself.
  if (splitThen) steps = steps.flatMap((s) => s.split(/\s*,?\s+and\s+(?=(?:make sure|ensure|verify|check|confirm)\b)/i));
  return steps.map((s) => s.trim().replace(/[.;,]+$/, '').trim()).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Classifying and rewriting steps

const CHECK_START = /^(?:check|verify|confirm)\b/i;
const CHECK_SYNONYM = /^(?:make sure|ensure|assert|expect|validate|see)\b(?:\s+that)?\s*/i;

const VERBS = new Set(
  (
    'tap click press type enter input fill select choose pick open go navigate scroll swipe search find add remove delete sign log ' +
    'clear toggle enable disable switch turn wait dismiss accept allow deny grant close return back submit save drag pull upload ' +
    'set change expand collapse play pause stop share copy paste refresh buy pay checkout create edit rename sort filter view hide ' +
    'show zoom mark star like follow unfollow send reply write attach take record skip continue complete finish tick untick uncheck ' +
    'slide hold long double pinch rotate fold unfold launch start restart sync download install uninstall rate review subscribe ' +
    'cancel retry undo redo agree decline answer move reorder join leave invite apply update upgrade' +
    ' check verify confirm'
  ).split(' '),
);

const LAUNCH = /^(?:(?:open|launch|start|run)\s+(?:the\s+)?(?:\w+\s+)?app\b|(?:open|launch|start)\s+\S+$)/i;
const STATEMENT = /\b(?:is|are|was|were|shows?|displays?|appears?|contains?|has|have|should|must|becomes?|reads?|says?|turns?|changes?)\b/i;

interface Lint {
  re: RegExp;
  level: StepNote['level'];
  text: string;
}

// From Android Studio's "Supported and unsupported capabilities" and the authoring rules.
const LINTS: Lint[] = [
  { re: /\b(?:R\.id\.|@\+?id\/|resource[- ]id|testTag)|\b[a-z]+(?:_[a-z0-9]+){1,}\b(?!\.\w)/, level: 'warn', text: 'Refer to what a user sees (a label or icon), not resource IDs or test tags.' },
  { re: /\blong[- ]?(?:press|tap|click)|press and hold|\bhold\b/i, level: 'warn', text: 'Long-press isn’t fully supported by Journeys yet.' },
  { re: /\bdouble[- ]?(?:tap|click)/i, level: 'warn', text: 'Double tap isn’t fully supported by Journeys yet.' },
  { re: /\bpinch|\bzoom (?:in|out)|two[- ]finger|multi[- ]?finger/i, level: 'warn', text: 'Multi-finger gestures aren’t fully supported by Journeys yet.' },
  { re: /\brotate|\blandscape|\bportrait|\b(?:un)?fold (?:the )?(?:device|phone)/i, level: 'warn', text: 'Rotation and folding aren’t fully supported by Journeys yet.' },
  { re: /^(?:if|when|unless|otherwise)\b|\bif (?:it|there|the)\b.*\b(?:then|otherwise)\b/i, level: 'warn', text: 'Conditional steps aren’t supported. Write one Journey per path.' },
  { re: /\bremember\b|\bsame (?:\w+ )?(?:as|value) (?:before|earlier)|\bas before\b|\bearlier\b|\bprevious(?:ly)? (?:noted|saved|entered)/i, level: 'warn', text: 'Journeys don’t remember values across steps. Repeat the value in this step.' },
  { re: /\bcount (?:the|how)|\bhow many\b|\bnumber of\b/i, level: 'warn', text: 'Counting is unreliable in Journeys. Check a visible number instead, like a badge.' },
  { re: /\b(?:works?|is (?:fine|ok|okay|correct|good))\b\s*$|\beverything\b/i, level: 'warn', text: 'Say what should be on screen, so the check can pass or fail.' },
  { re: /\b(?:fast|quickly|slow|within \d+\s*(?:ms|s|seconds?))\b/i, level: 'info', text: 'Journeys judge what’s on screen, not timing.' },
  { re: /\b(?:password|pin|otp|passcode)\b/i, level: 'info', text: 'Use a test account that exists on every build, never a real password.' },
  { re: /\b(?:log ?cat|database|shared ?pref|network request|api call|analytics|backend)\b/i, level: 'warn', text: 'Journeys only see the screen. Check what the user would see instead.' },
];

// Only lowercase ordinary sentence starts, never labels like "Settings".
const lowerFirst = (s: string) => s.replace(/^(The|A|An|It|Its|There|This|That|These|Those|My|Your|Our|Each|Every|All|No|Both|Nothing|Only)\b/, (w) => w.toLowerCase());
const upperFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function classifyStep(input: string, makeChecks: boolean): JourneyStep {
  let text = upperFirst(input.trim());
  const notes: StepNote[] = [];
  let kind: StepKind = 'action';

  const synonym = text.match(CHECK_SYNONYM);
  const first = text.split(/\s+/)[0]!.toLowerCase().replace(/[^a-z-]/g, '');
  if (CHECK_START.test(text)) kind = 'check';
  else if (synonym && makeChecks && text.length > synonym[0].length) {
    text = `Verify that ${lowerFirst(text.slice(synonym[0].length))}`;
    kind = 'check';
  } else if (!VERBS.has(first) && !VERBS.has(first.split('-')[0]!) && STATEMENT.test(text)) {
    if (makeChecks) {
      text = `Verify that ${lowerFirst(text)}`;
      kind = 'check';
    } else notes.push({ level: 'warn', text: 'Reads as a statement. Start checks with "Verify" or "Check", or the agent may treat the Journey as malformed.' });
  } else if (!VERBS.has(first) && !VERBS.has(first.split('-')[0]!)) {
    notes.push({ level: 'info', text: 'Doesn’t start with a familiar action. Make sure it’s something a user can do on screen.' });
  }

  for (const lint of LINTS) if (lint.re.test(input.trim())) notes.push({ level: lint.level, text: lint.text });
  if (text.length > 220) notes.push({ level: 'info', text: 'Long step. Splitting it into smaller steps makes runs more reliable.' });

  return { text, kind, ...(text !== upperFirst(input.trim()) ? { original: input.trim() } : {}), notes };
}

// ---------------------------------------------------------------------------
// Reading existing journey files

const decode = (s: string) =>
  s.replace(/&(lt|gt|quot|apos|amp|#\d+|#x[0-9a-f]+);/gi, (_m, e: string) =>
    e[0] === '#' ? String.fromCodePoint(e[1]!.toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ({ lt: '<', gt: '>', quot: '"', apos: "'", amp: '&' } as Record<string, string>)[e.toLowerCase()]!,
  );

export class JourneyError extends Error {}

/** Parse a `.journey.xml` back into its parts, for editing. */
export function parseJourney(xml: string): { name: string; description: string; actions: string[] } {
  const root = xml.match(/<journey\b([^>]*)>([\s\S]*?)<\/journey>/);
  if (!root) throw new JourneyError('No <journey> element found.');
  const name = root[1]!.match(/\bname\s*=\s*("([^"]*)"|'([^']*)')/);
  const description = root[2]!.match(/<description>([\s\S]*?)<\/description>/)?.[1] ?? '';
  const actions = [...root[2]!.matchAll(/<action>([\s\S]*?)<\/action>/g)].map((m) => decode(m[1]!.replace(/\s+/g, ' ').trim()));
  return { name: decode(name?.[2] ?? name?.[3] ?? ''), description: decode(description.replace(/\s+/g, ' ').trim()), actions };
}

// ---------------------------------------------------------------------------
// Output

const escapeText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = (s: string) => escapeText(s).replace(/"/g, '&quot;');

export function journeyFileName(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return `${slug || 'journey'}.journey.xml`;
}

export function writeJourney(partial: Partial<JourneyOptions> = {}): JourneyResult {
  const o = { ...defaultJourneyOptions, ...partial };
  const name = o.name.replace(/\s+/g, ' ').trim() || 'Journey';
  const removed: string[] = [];
  const warnings: string[] = [];

  let raw = o.steps.trim();
  let description = o.description.replace(/\s+/g, ' ').trim();
  if (/^\s*(?:<\?xml|<journey\b)/.test(raw)) {
    const parsed = parseJourney(raw);
    raw = parsed.actions.join('\n');
    if (!description) description = parsed.description;
  }

  const steps: JourneyStep[] = [];
  for (const s of splitSteps(raw, o.splitThen)) {
    if (!steps.length && LAUNCH.test(s)) {
      removed.push(s);
      continue;
    }
    steps.push(classifyStep(s, o.makeChecks));
  }

  if (removed.length) warnings.push('Removed the step that opens the app: Journeys start with your app already running.');
  if (steps.length && !steps.some((s) => s.kind === 'check')) warnings.push('No checks yet. Add a step like "Verify that the cart badge shows 1" so the Journey can fail.');
  if (steps.length && steps[steps.length - 1]!.kind !== 'check' && steps.some((s) => s.kind === 'check')) warnings.push('The last step isn’t a check. End with the result you expect.');
  if (steps.length > 15) warnings.push(`${steps.length} steps. Long Journeys are slower and flakier; consider splitting the flow.`);

  const desc = description || `${name}.`;
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<journey name="${escapeAttr(name)}">
    <description>${escapeText(desc)}</description>
    <actions xml:space="preserve">
${steps.map((s) => `        <action>${escapeText(s.text)}</action>`).join('\n')}
    </actions>
</journey>
`;
  const fileName = journeyFileName(name);
  const module = o.module.trim().replace(/^:/, '').replace(/:/g, '/') || 'app';
  const path = `${module}/src/journeysTest/${fileName}`;
  const runPrompt = `Using the Android CLI, run the journey in ${path} on the connected emulator and write the report.`;
  return { xml, fileName, path, steps, removed, warnings, runPrompt };
}
