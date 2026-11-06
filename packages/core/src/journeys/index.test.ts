import { describe, expect, it } from 'vitest';
import { classifyStep, journeyFileName, parseJourney, splitSteps, writeJourney } from './index.ts';

// Examples from Android Studio's Journeys authoring guide (android-journeys/references/authoring.md).
const STUDIO_AUTH = `<?xml version="1.0" encoding="utf-8"?>
<journey name="Validate User Authentication Flow">
    <description>Tests credentials entry, button trigger, and transition to dashboard.</description>
    <actions xml:space="preserve">
        <action>Enter 'user@example.com' into the email input field</action>
        <action>Enter 'password123' into the password field</action>
        <action>Tap the 'Log In' button</action>
        <action>Verify that the dashboard screen is visible</action>
    </actions>
</journey>
`;

const STUDIO_NAV = `<?xml version="1.0" encoding="utf-8"?>
<journey name="Validate Detail Navigation">
    <description>Tests tapping a list item and navigating to the details screen.</description>
    <actions xml:space="preserve">
        <action>Verify that the main feed screen is visible</action>
        <action>Tap the first item in the list</action>
        <action>Verify that the detail view displays the item details</action>
        <action>Tap the back button</action>
        <action>Confirm return to the main feed screen</action>
    </actions>
</journey>
`;

describe('splitSteps', () => {
  it('reads bullets, numbers and step labels', () => {
    expect(splitSteps('1. Tap Search\n2) Type "soda"\n- Tap the first result\n* Step 4: Verify the price is shown', true)).toEqual([
      'Tap Search',
      'Type "soda"',
      'Tap the first result',
      'Verify the price is shown',
    ]);
  });

  it('splits a paragraph into sentences and "then" clauses', () => {
    expect(splitSteps('Tap the cart icon, then tap Checkout. The order summary should appear. Tap Pay and then verify "Thanks" is shown.', true)).toEqual([
      'Tap the cart icon',
      'tap Checkout',
      'The order summary should appear',
      'Tap Pay',
      'verify "Thanks" is shown',
    ]);
  });

  it('splits an action from a check joined by "and"', () => {
    expect(splitSteps('Tap the cart icon and make sure the total is $1.99', true)).toEqual(['Tap the cart icon', 'make sure the total is $1.99']);
    expect(splitSteps('Tap Save, and verify "Saved" appears', true)).toEqual(['Tap Save', 'verify "Saved" appears']);
  });

  it('keeps "then" when splitting is off, and never splits other "and"s', () => {
    expect(splitSteps('Tap the cart icon, then tap Checkout', false)).toEqual(['Tap the cart icon, then tap Checkout']);
    expect(splitSteps('Search for soda and add the first result to the cart', true)).toEqual(['Search for soda and add the first result to the cart']);
  });
});

describe('classifyStep', () => {
  it('keeps actions and checks as written', () => {
    expect(classifyStep('Tap the "Log In" button', true)).toEqual({ text: 'Tap the "Log In" button', kind: 'action', notes: [] });
    expect(classifyStep('check that the badge shows 1', true)).toEqual({ text: 'Check that the badge shows 1', kind: 'check', notes: [] });
    expect(classifyStep('Confirm return to the main feed screen', true).kind).toBe('check');
  });

  it('turns statements and check synonyms into Verify steps', () => {
    expect(classifyStep('The cart badge shows 1', true)).toMatchObject({ text: 'Verify that the cart badge shows 1', kind: 'check', original: 'The cart badge shows 1' });
    expect(classifyStep('Make sure the total is $4.99', true)).toMatchObject({ text: 'Verify that the total is $4.99', kind: 'check' });
    expect(classifyStep('ensure that Settings is visible', true).text).toBe('Verify that Settings is visible');
  });

  it('warns about statements when rewriting is off', () => {
    const s = classifyStep('The cart badge shows 1', false);
    expect(s.kind).toBe('action');
    expect(s.notes[0]!.text).toMatch(/Start checks with "Verify"/);
  });

  it('flags unsupported gestures, IDs, conditions and memory', () => {
    const notes = (t: string) => classifyStep(t, true).notes.map((n) => n.text);
    expect(notes('Long-press the photo')).toContain('Long-press isn’t fully supported by Journeys yet.');
    expect(notes('Double tap the map')).toContain('Double tap isn’t fully supported by Journeys yet.');
    expect(notes('Pinch to zoom in on the map')[0]).toMatch(/Multi-finger/);
    expect(notes('Rotate the device to landscape')[0]).toMatch(/Rotation/);
    expect(notes('Tap R.id.btn_login')[0]).toMatch(/not resource IDs/);
    expect(notes('Tap btn_submit')[0]).toMatch(/not resource IDs/);
    expect(notes('If a dialog appears, tap OK, otherwise continue')[0]).toMatch(/Conditional/);
    expect(notes('Enter the same value as before')[0]).toMatch(/don’t remember/);
    expect(notes('Verify that it works')[0]).toMatch(/Say what should be on screen/);
    expect(notes('Verify the API call succeeded')[0]).toMatch(/only see the screen/);
    expect(notes('Tap the "Log In" button')).toEqual([]);
  });
});

describe('parseJourney', () => {
  it('reads Android Studio journey files', () => {
    expect(parseJourney(STUDIO_AUTH)).toEqual({
      name: 'Validate User Authentication Flow',
      description: 'Tests credentials entry, button trigger, and transition to dashboard.',
      actions: ["Enter 'user@example.com' into the email input field", "Enter 'password123' into the password field", "Tap the 'Log In' button", 'Verify that the dashboard screen is visible'],
    });
  });

  it('decodes entities and multi-line actions', () => {
    const j = parseJourney(`<journey name='Q &amp; A'><actions>\n<action>\n  Tap &quot;Next&quot;\n  on the first card\n</action></actions></journey>`);
    expect(j).toEqual({ name: 'Q & A', description: '', actions: ['Tap "Next" on the first card'] });
  });

  it('rejects text without a journey', () => {
    expect(() => parseJourney('<foo/>')).toThrow('No <journey> element found.');
  });
});

describe('writeJourney', () => {
  it('reproduces Android Studio’s examples exactly', () => {
    for (const xml of [STUDIO_AUTH, STUDIO_NAV]) {
      const p = parseJourney(xml);
      const r = writeJourney({ name: p.name, description: p.description, steps: p.actions.join('\n') });
      expect(r.xml).toBe(xml);
      expect(r.steps.every((s) => !s.original)).toBe(true);
    }
  });

  it('round-trips its own output', () => {
    const r = writeJourney({ name: 'Q&A <beta>', steps: 'Tap "Ask" & wait\nVerify that <none> is shown' });
    const back = parseJourney(r.xml);
    expect(back).toEqual({ name: 'Q&A <beta>', description: 'Q&A <beta>.', actions: ['Tap "Ask" & wait', 'Verify that <none> is shown'] });
  });

  it('builds a journey from a plain description', () => {
    const r = writeJourney({
      name: 'Add to cart',
      module: ':feature:shop',
      steps: 'Open the app. Search for "soda", then tap the first result. Tap Add to cart. The cart badge shows 1.',
    });
    expect(r.removed).toEqual(['Open the app']);
    expect(r.steps.map((s) => [s.kind, s.text])).toEqual([
      ['action', 'Search for "soda"'],
      ['action', 'Tap the first result'],
      ['action', 'Tap Add to cart'],
      ['check', 'Verify that the cart badge shows 1'],
    ]);
    expect(r.fileName).toBe('add_to_cart.journey.xml');
    expect(r.path).toBe('feature/shop/src/journeysTest/add_to_cart.journey.xml');
    expect(r.warnings).toEqual(['Removed the step that opens the app: Journeys start with your app already running.']);
    expect(r.xml).toContain('    <actions xml:space="preserve">\n        <action>Search for "soda"</action>\n');
    expect(r.runPrompt).toBe('Using the Android CLI, run the journey in feature/shop/src/journeysTest/add_to_cart.journey.xml on the connected emulator and write the report.');
  });

  it('warns when nothing is checked or the flow ends on an action', () => {
    expect(writeJourney({ steps: 'Tap Search\nType soda' }).warnings[0]).toMatch(/No checks yet/);
    expect(writeJourney({ steps: 'Verify Home is shown\nTap Search' }).warnings[0]).toMatch(/last step isn’t a check/);
  });

  it('accepts a pasted journey file as the steps', () => {
    const r = writeJourney({ name: 'Login', steps: STUDIO_AUTH });
    expect(r.steps).toHaveLength(4);
    expect(r.xml).toContain('<description>Tests credentials entry, button trigger, and transition to dashboard.</description>');
  });
});

describe('journeyFileName', () => {
  it('makes snake_case file names like Android Studio’s', () => {
    expect(journeyFileName('Login Flow')).toBe('login_flow.journey.xml');
    expect(journeyFileName('CheckoutWithPayPal')).toBe('checkout_with_pay_pal.journey.xml');
    expect(journeyFileName('Café — Écran 2')).toBe('cafe_ecran_2.journey.xml');
    expect(journeyFileName('!!!')).toBe('journey.journey.xml');
  });
});
