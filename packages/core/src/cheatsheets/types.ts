/**
 * Cheatsheets: task-first command references, each entry checked against the
 * real tool (see cheatsheets.tools.test.ts). Commands use {{key}} placeholders,
 * optionally {{key:cap}} or {{key:lower}}, filled from the sheet's variables.
 */

export interface Variable {
  key: string;
  label: string;
  /** Used in the static page, the Markdown twin and when nothing is filled in. */
  example: string;
}

/**
 * How an entry is checked by the opt-in toolchain tests:
 * help    every subcommand and flag appears in the tool's own help text
 * run     the command is run (read-only commands, against the test emulator)
 * none    can't be checked automatically; `note` says why or what to watch for
 */
export type Verify = 'help' | 'run' | 'none';

export interface Entry {
  /** Unique within the sheet; used as the page anchor. */
  id: string;
  /** Task-first, starting with a verb: "Show logs for one app". */
  title: string;
  /** One or more lines; each line is one command. */
  command: string;
  note?: string;
  /** Minimum platform or tool version, e.g. "Android 11+" or "AGP 9.3+". */
  since?: string;
  /** Destructive: deletes data. Device-state: changes settings until undone. */
  danger?: 'destructive' | 'device-state';
  /** Added or changed recently, shown with a "New" badge. */
  isNew?: boolean;
  tags: string[];
  docs?: string;
  verify: Verify;
}

export interface Section {
  id: string;
  title: string;
  entries: Entry[];
}

export interface Cheatsheet {
  slug: string;
  title: string;
  /** One line, 120 characters or less. */
  tagline: string;
  /** Short paragraph for the top of the page and the Markdown twin. */
  intro: string;
  tool: { name: string; version: string; checkedOn: string; docs: string };
  variables: Variable[];
  sections: Section[];
  /** Site tools to link from this sheet, by path. */
  related: string[];
}
