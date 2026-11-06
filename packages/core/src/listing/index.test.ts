import { describe, expect, it } from 'vitest';
import { charCount, checkAppStoreListing, commaLists, descriptionClaims, checkPlayListing, playDescriptionHtml, repeatedWords, unattributedTestimonials, utf8Bytes, wordLists, type AppStoreListing, type PlayListing } from './index.ts';

const play: PlayListing = {
  title: 'Receipts: Expense Tracker',
  developerName: 'Ledgerly Labs',
  shortDescription: 'Snap receipts, track spending and export reports for your accountant.',
  fullDescription: 'Ledgerly turns paper receipts into tidy expense reports.\n\n<b>Scan in a second</b>\nPoint the camera at a receipt and the amount, date and shop are filled in.',
};
const msgs = (f: { field: string; level: string; text: string }[]) => f.map((x) => `${x.level} ${x.field}: ${x.text}`);
const has = (f: string[], prefix: string) => expect(f.some((x) => x.startsWith(prefix)), `${prefix}\n${f.join('\n')}`).toBe(true);

describe('counting', () => {
  it('counts code points and UTF-8 bytes', () => {
    expect(charCount('café 🎉')).toBe(6);
    expect(utf8Bytes('café')).toBe(5);
    expect(utf8Bytes('日記')).toBe(6);
  });
});

describe('checkPlayListing', () => {
  it('passes a clean listing', () => {
    expect(checkPlayListing(play)).toEqual([]);
  });

  it('applies limits and the title rules of the Metadata policy', () => {
    const f = msgs(checkPlayListing({ ...play, title: '#1 BEST Budget App 💰 FREE!!', shortDescription: 'x'.repeat(81) }));
    has(f, 'error App name: No emoji here: the Metadata policy bans e');
    has(f, 'error App name: Repeated special characters aren’t allowe');
    has(f, 'warning App name: “BEST”, “FREE” is in capitals. Only allow');
    has(f, 'error App name: “#1”, “best”, “free”');
    has(f, 'error Short description: 81 characters; the limit is 80.');
  });

  it('counts limits in characters, not bytes', () => {
    expect(checkPlayListing({ ...play, title: '家計簿'.repeat(10) }).filter((x) => x.text.includes('limit'))).toEqual([]);
    expect(checkPlayListing({ ...play, title: '家計簿'.repeat(10) + '!' }).some((x) => x.text === '31 characters; the limit is 30.')).toBe(true);
  });

  it('allows capitals for acronyms', () => {
    expect(checkPlayListing({ ...play, title: 'PDF Scanner & GPS Log' })).toEqual([]);
  });
});

describe('description heuristics', () => {
  it('finds quotes without a source', () => {
    expect(unattributedTestimonials('“Best app I have ever used!” ★★★★★\n"Changed how I budget" - The Verge\n🥇 "Great for families" — Wirecutter\n"A must have app" by Lifehacker\n🥇 "A MUST HAVE APP" (Lifehacker)')).toEqual(['Best app I have ever used!']);
  });

  it('finds vertical and comma word lists but not normal bullets', () => {
    expect(wordLists('budget\nexpenses\nreceipts\ntax\ninvoice\n')).toHaveLength(1);
    expect(wordLists('• Scan receipts in a second.\n• Export to CSV.\n• Share with your accountant.')).toEqual([]);
    expect(commaLists('Keywords: budget, money, expense, tracker, finance, spending, bills, tax, receipts, wallet, savings, bank planner')).toHaveLength(1);
    expect(commaLists('Learn Spanish, French and German.')).toEqual([]);
  });

  it('reports heavily repeated words', () => {
    expect(repeatedWords('budget '.repeat(16) + 'plan your month and save more each week')[0]).toEqual({ word: 'budget', count: 16 });
    expect(repeatedWords('ledgerly '.repeat(16) + 'plan your month', 15, ['Ledgerly'])).toEqual([]);
    expect(repeatedWords(play.fullDescription)).toEqual([]);
  });

  it('flags the claims the policy names, not every superlative', () => {
    expect(descriptionClaims('The #1 planner. Editor’s Choice 2025! Best budget app ever. The best way to plan.')).toEqual(['#1', 'editor’s choice', 'best budget app ever']);
    expect(descriptionClaims('Find the best route and learn faster.')).toEqual([]);
  });

  it('flags tags Play was not seen rendering', () => {
    has(msgs(checkPlayListing({ ...play, fullDescription: 'Hi <ul><li>one</li></ul> <b>ok</b>' })), 'info Full description: <ul>, <li> wasn’t seen on live listings');
  });
});

describe('playDescriptionHtml', () => {
  it('keeps Play’s tags, escapes everything else', () => {
    expect(playDescriptionHtml('<B>Fast</B> & <u>easy</u>\n<h1 class="x">Hi</h1><br/><img src=x onerror=alert(1)><a href="javascript:x">x</a>')).toBe(
      '<b>Fast</b> &amp; <u>easy</u><br>&lt;h1 class=&quot;x&quot;&gt;Hi</h1><br>&lt;img src=x onerror=alert(1)&gt;&lt;a href=&quot;javascript:x&quot;&gt;x&lt;/a&gt;',
    );
  });
});

describe('checkAppStoreListing', () => {
  const ios: AppStoreListing = { name: 'Ledgerly', subtitle: 'Receipts to expense reports', promotionalText: '', description: 'Scan receipts.', keywords: 'receipt,expense,scanner,budget,tax', developerName: 'Ledgerly Labs' };

  it('passes a clean listing', () => {
    expect(checkAppStoreListing(ios)).toEqual([]);
  });

  it('checks keyword bytes, length, duplicates, names and spaces', () => {
    const f = msgs(checkAppStoreListing({ ...ios, keywords: 'receipt, tax, ledgerly, labs, receipt, ok, ' + 'é'.repeat(40) }));
    has(f, 'error Keywords: 123 bytes; the limit is 100.');
    has(f, 'error Keywords: Each keyword must be longer than two cha');
    has(f, 'warning Keywords: Repeated: receipt.');
    has(f, 'warning Keywords: ledgerly, labs already in the app or com');
    has(f, 'info Keywords: 6 bytes spent on spaces around commas. ');
  });

  it('enforces name, subtitle, promotional text and plain-text description', () => {
    const f = msgs(checkAppStoreListing({ ...ios, name: 'L', subtitle: 's'.repeat(31), promotionalText: 'p'.repeat(171), description: '<b>Hi</b>' }));
    expect(f).toEqual([
      'error Name: Must be at least 2 characters.',
      'error Subtitle: 31 characters; the limit is 30.',
      'error Promotional text: 171 characters; the limit is 170.',
      'warning Description: App Store descriptions are plain text; HTML tags show up literally.',
    ]);
  });
});
