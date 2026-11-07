/**
 * Version comparison and catalog update logic, without the data, so browser
 * pages can import it and load latest-versions.json separately.
 */

export interface LatestVersions {
  checkedOn: string;
  /** "group:artifact" → newest stable version. */
  libraries: Record<string, string>;
  /** Plugin id → newest stable version. */
  plugins: Record<string, string>;
}

const PRERELEASE = /[-.](alpha|beta|rc|dev|eap|m\d|snapshot|pre|preview|cr)\d*/i;
export const isPrerelease = (v: string) => PRERELEASE.test(v);

/** Compares Maven-style versions: 1.10.0 > 1.9.2, and 2.0.0 > 2.0.0-rc01. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(/[.-]/);
  const pb = b.split(/[.-]/);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? '';
    const y = pb[i] ?? '';
    const nx = Number(x);
    const ny = Number(y);
    if (x !== '' && y !== '' && !Number.isNaN(nx) && !Number.isNaN(ny)) {
      if (nx !== ny) return nx - ny;
    } else if (x !== y) {
      // A version that ends is a release; one that continues with a qualifier is a pre-release.
      if (x === '') return Number.isNaN(ny) ? 1 : -1;
      if (y === '') return Number.isNaN(nx) ? -1 : 1;
      return x.localeCompare(y);
    }
  }
  return 0;
}

/** The newest stable version of a list, or the newest of all if none is stable. */
export function newestStable(versions: string[]): string | undefined {
  const sorted = [...versions].sort(compareVersions);
  const stable = sorted.filter((v) => !isPrerelease(v));
  return (stable.length ? stable : sorted).at(-1);
}

export interface Update {
  current: string;
  latest: string;
  /** The first version number changes (1.x → 2.x): read the release notes first. */
  major: boolean;
}

/** A newer stable version than `current`, if one is known. */
export function updateFor(current: string | undefined, latest: string | undefined): Update | undefined {
  if (!current || !latest || /[$}]/.test(current) || isPrerelease(latest)) return undefined;
  if (compareVersions(latest, current) <= 0) return undefined;
  // Date-based versions (BOMs such as 2026.09.00) change their first number every year.
  const calendar = /^20\d\d\./.test(current);
  return { current, latest, major: !calendar && current.split('.')[0] !== latest.split('.')[0] };
}


export interface CatalogEntry {
  /** "group:name" for a library, the plugin id for a plugin. */
  coordinates: string;
  kind: 'library' | 'plugin';
  version?: string;
  versionRef?: string;
}

export interface CatalogUpdate extends Update {
  /** The [versions] key; for inline versions, the coordinates. */
  ref: string;
  /** The libraries and plugins using this version. */
  uses: string[];
  /** Safe to rewrite automatically: every user of the ref has the same newest version. */
  applicable: boolean;
  /** Why it isn't applicable. */
  reason?: string;
}

/**
 * Newer stable versions for a converted catalog, one per version key. A key shared
 * by several artifacts (a BOM-less family such as retrofit2) is only marked
 * applicable when every artifact's newest version is the same.
 */
export function catalogUpdates(entries: CatalogEntry[], latest: LatestVersions): CatalogUpdate[] {
  const byRef = new Map<string, CatalogEntry[]>();
  for (const e of entries) {
    if (!e.version) continue;
    const ref = e.versionRef ?? e.coordinates;
    byRef.set(ref, [...(byRef.get(ref) ?? []), e]);
  }
  const out: CatalogUpdate[] = [];
  for (const [ref, users] of byRef) {
    const current = users[0]!.version!;
    const newest = users.map((u) => (u.kind === 'plugin' ? latest.plugins[u.coordinates] : latest.libraries[u.coordinates]));
    const known = newest.filter((v): v is string => Boolean(v));
    if (!known.length) continue;
    const best = [...known].sort(compareVersions).at(-1)!;
    const update = updateFor(current, best);
    if (!update) continue;
    const agree = known.length === users.length && new Set(known).size === 1;
    out.push({
      ref,
      ...update,
      uses: users.map((u) => u.coordinates),
      applicable: agree,
      ...(agree ? {} : { reason: known.length < users.length ? 'Not every artifact using this version is in the data; check them by hand.' : `The artifacts using this version have different newest versions (${[...new Set(known)].join(', ')}).` }),
    });
  }
  return out.sort((a, b) => a.ref.localeCompare(b.ref));
}
