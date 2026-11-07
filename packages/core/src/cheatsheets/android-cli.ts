/**
 * The Android CLI quick reference, generated from the command builder's tasks so
 * the two never disagree. Commands use each task's defaults (or the field's
 * placeholder for required fields), checked by CHECK_ANDROID_CLI in
 * android-cli/cli.test.ts. A few commands the builder doesn't cover are added here.
 */
import { buildCommand, CHECKED_ON, CHECKED_VERSION, defaults, groups, tasks, type Values } from '../android-cli/index.ts';
import type { Cheatsheet, Entry, Section } from './types.ts';

const DOCS = 'https://developer.android.com/tools/agents/android-cli';
const DEV_SUMMIT = 'https://developer.android.com/blog/posts/android-dev-summit-26-developer-tools-performance';
/** Commands announced or reworked at Android Dev Summit 2026 (28 October). */
const NEW = new Set(['preview-list', 'preview-render', 'crashes', 'analyze', 'device-hub', 'device-remote', 'agent-plugins']);

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function taskEntry(t: (typeof tasks)[number]): Entry {
  const values: Values = { ...defaults(t) };
  for (const f of t.fields) if (f.required && !values[f.id] && f.placeholder) values[f.id] = f.placeholder;
  const { commands } = buildCommand(t.id, values);
  return {
    id: t.id,
    title: t.title,
    command: commands.join('\n'),
    note: t.note ?? t.summary,
    tags: [t.group.toLowerCase(), ...t.title.toLowerCase().split(/\s+/).filter((w) => w.length > 3)],
    docs: t.docs,
    verify: 'none',
    ...(NEW.has(t.id) ? { isNew: true } : {}),
  };
}

const extras: Record<string, Entry[]> = {
  'Inspect and interact': [
    { id: 'device-hub', title: 'Mirror and control a device in a window', command: 'android device hub', note: 'Device Hub shows local and remote devices and emulators without opening Android Studio.', isNew: true, tags: ['mirror', 'device hub', 'screen'], docs: DEV_SUMMIT, verify: 'help' },
    { id: 'device-remote', title: 'Rent a real phone from Google’s device lab', command: 'android device remote models\nandroid device remote create\nandroid device remote connect', note: 'Needs android auth login and a Google Cloud project; then install and test as with a local device.', isNew: true, tags: ['remote', 'physical device', 'device streaming'], docs: DEV_SUMMIT, verify: 'help' },
  ],
  'Agents and docs': [
    { id: 'agent-plugins', title: 'Install the official Android plugin in Claude Code or Codex', command: 'claude plugin marketplace add android/android-cli-plugin\nclaude plugin install android-cli@android-cli-plugin\ncodex plugin marketplace add android/android-cli-plugin\ncodex plugin add android-cli@android-cli-plugin', note: 'Commands from Google’s Android Dev Summit 2026 announcement; run the claude or codex pair for your agent.', isNew: true, tags: ['claude', 'codex', 'plugin', 'agent'], docs: 'https://developer.android.com/tools/agents/android-cli/agent-plugins', verify: 'none' },
  ],
};

const sections: Section[] = groups
  .map((g) => ({ id: slug(g), title: g, entries: [...tasks.filter((t) => t.group === g).map(taskEntry), ...(extras[g] ?? [])] }))
  .filter((s) => s.entries.length > 0);

export const androidCli: Cheatsheet = {
  slug: 'android-cli',
  title: 'Android CLI cheatsheet',
  tagline: 'Google’s Android CLI at a glance: build, run, emulators, Compose previews, profiling, crash signals and skills.',
  intro:
    'Every task in Google’s Android CLI with a ready command, including what’s new from Android Dev Summit 2026: Compose previews in the terminal, crash signals, APK analysis, Device Hub and remote devices. Generated from the same data as the command builder, which lets you set every option.',
  tool: { name: 'Android CLI', version: CHECKED_VERSION, checkedOn: CHECKED_ON, docs: DOCS },
  variables: [],
  related: ['/cli/command-builder/', '/cli/getting-started/', '/agents/skills/', '/cli/journeys/'],
  sections,
};
