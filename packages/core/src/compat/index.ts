/**
 * Checks a set of Android / Kotlin build tool versions against the official
 * compatibility tables in data.ts.
 */
import { API_AGP, AGP_GRADLE, CMP_COMPOSE, COMPOSE_COMPILER, KGP, SOURCES } from './data.ts';

export * from './data.ts';

export function compareVersions(a: string, b: string): number {
  const pa = a.split(/[.-]/).map((p) => (/^\d+$/.test(p) ? Number(p) : NaN));
  const pb = b.split(/[.-]/).map((p) => (/^\d+$/.test(p) ? Number(p) : NaN));
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = Number.isNaN(pa[i] ?? 0) ? 0 : (pa[i] ?? 0);
    const y = Number.isNaN(pb[i] ?? 0) ? 0 : (pb[i] ?? 0);
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

const majorMinor = (v: string) => v.split('.').slice(0, 2).join('.');
// Pre-releases (8.12.0-alpha02, 2.2.0-RC2, 2.3.0-dev-123) compare as their release.
const isVersion = (v: string) => /^\d+(\.\d+){1,3}(-[\w.-]+)?$/.test(v);

export type Status = 'ok' | 'warn' | 'error' | 'info';

export interface Check {
  status: Status;
  title: string;
  detail: string;
  source: string;
}

export interface Versions {
  kotlin?: string;
  agp?: string;
  gradle?: string;
  composeCompiler?: string;
  ksp?: string;
  cmp?: string;
  compileSdk?: string;
}

export function checkVersions(v: Versions): Check[] {
  const out: Check[] = [];
  const kotlin = v.kotlin?.trim();
  const agp = v.agp?.trim();
  const gradle = v.gradle?.trim();
  for (const [label, value] of Object.entries({ Kotlin: kotlin, AGP: agp, Gradle: gradle })) {
    if (value && !isVersion(value)) out.push({ status: 'error', title: `${label} "${value}" isn't a version`, detail: 'Use numbers like 2.1.0.', source: '' });
  }

  // AGP ↔ Gradle
  if (agp && isVersion(agp) && gradle && isVersion(gradle)) {
    const row = AGP_GRADLE.find(([a]) => a === majorMinor(agp));
    if (!row) {
      out.push({ status: 'info', title: `AGP ${agp} isn't in the table`, detail: compareVersions(agp, AGP_GRADLE[0]![0]) > 0 ? 'It is newer than the data here; check its release notes.' : 'Very old AGP; upgrade.', source: SOURCES.agpGradle });
    } else if (compareVersions(gradle, row[1]) < 0) {
      out.push({ status: 'error', title: `AGP ${agp} needs Gradle ${row[1]} or newer`, detail: `You have Gradle ${gradle}. Run ./gradlew wrapper --gradle-version ${row[1]}.`, source: SOURCES.agpGradle });
    } else {
      out.push({ status: 'ok', title: `AGP ${agp} works with Gradle ${gradle}`, detail: `Minimum for AGP ${row[0]} is Gradle ${row[1]}.`, source: SOURCES.agpGradle });
    }
  }

  // Kotlin Gradle plugin ↔ Gradle / AGP
  if (kotlin && isVersion(kotlin)) {
    const row = KGP.find((r) => compareVersions(kotlin, r.from) >= 0 && compareVersions(kotlin, r.to) <= 0);
    if (!row) {
      out.push({ status: 'info', title: `Kotlin ${kotlin} isn't in the table`, detail: compareVersions(kotlin, KGP[0]!.to) > 0 ? 'It is newer than the data here.' : 'Older than Kotlin 1.8; upgrade.', source: SOURCES.kgp });
    } else {
      if (gradle && isVersion(gradle)) {
        const [lo, hi] = row.gradle;
        if (compareVersions(gradle, lo) < 0) out.push({ status: 'error', title: `Kotlin ${kotlin} needs Gradle ${lo} or newer`, detail: `You have ${gradle}.`, source: SOURCES.kgp });
        else if (compareVersions(gradle, hi) > 0) out.push({ status: 'warn', title: `Gradle ${gradle} is newer than Kotlin ${kotlin} was tested with`, detail: `Tested up to Gradle ${hi}. It often works, but expect deprecation warnings; upgrading Kotlin is safer.`, source: SOURCES.kgp });
        else out.push({ status: row.note && compareVersions(gradle, '8.6') > 0 ? 'warn' : 'ok', title: `Kotlin ${kotlin} supports Gradle ${gradle}`, detail: row.note ?? `Tested range: Gradle ${lo}–${hi}.`, source: SOURCES.kgp });
      }
      if (agp && isVersion(agp)) {
        const [lo, hi] = row.agp;
        if (compareVersions(agp, lo) < 0) out.push({ status: 'error', title: `Kotlin ${kotlin} needs AGP ${lo} or newer`, detail: `You have AGP ${agp}.`, source: SOURCES.kgp });
        else if (compareVersions(agp, hi) > 0) out.push({ status: 'warn', title: `AGP ${agp} is newer than Kotlin ${kotlin} was tested with`, detail: `Tested up to AGP ${hi}. Upgrade Kotlin, or expect to hit untested combinations.`, source: SOURCES.kgp });
        else out.push({ status: 'ok', title: `Kotlin ${kotlin} supports AGP ${agp}`, detail: `Tested range: AGP ${lo}–${hi}.`, source: SOURCES.kgp });
      }
    }
  }

  // Compose compiler
  if (kotlin && isVersion(kotlin)) {
    const cc = v.composeCompiler?.trim();
    if (compareVersions(kotlin, '2.0.0') >= 0) {
      out.push({
        status: cc ? 'warn' : 'ok',
        title: 'Use the Compose Compiler Gradle plugin',
        detail: `With Kotlin 2.0+, apply org.jetbrains.kotlin.plugin.compose at version ${kotlin} (same as Kotlin) and remove composeOptions.kotlinCompilerExtensionVersion${cc ? ` (${cc})` : ''}.`,
        source: SOURCES.composeCompiler,
      });
    } else if (cc) {
      const row = COMPOSE_COMPILER.find(([c]) => c === cc);
      const right = COMPOSE_COMPILER.find(([, k]) => k === kotlin)?.[0];
      if (!row) out.push({ status: 'info', title: `Compose Compiler ${cc} isn't in the table`, detail: right ? `Kotlin ${kotlin} pairs with Compose Compiler ${right}.` : '', source: SOURCES.composeCompiler });
      else if (row[1] !== kotlin) out.push({ status: 'error', title: `Compose Compiler ${cc} needs Kotlin ${row[1]}`, detail: right ? `For Kotlin ${kotlin}, use Compose Compiler ${right}.` : `No stable Compose Compiler targets Kotlin ${kotlin}.`, source: SOURCES.composeCompiler });
      else out.push({ status: 'ok', title: `Compose Compiler ${cc} matches Kotlin ${kotlin}`, detail: '', source: SOURCES.composeCompiler });
    }
  }

  // KSP
  const ksp = v.ksp?.trim();
  if (ksp) {
    const legacy = ksp.match(/^(\d+\.\d+\.\d+)-(\d+\.\d+\.\d+)$/);
    if (legacy) {
      if (kotlin && legacy[1] !== kotlin) out.push({ status: 'error', title: `KSP ${ksp} is built for Kotlin ${legacy[1]}`, detail: `Old KSP versions are tied to one Kotlin version. Use a KSP ${kotlin}-x.y.z release, or KSP 2.3.0+, which is independent of Kotlin.`, source: SOURCES.ksp });
      else if (kotlin) out.push({ status: 'ok', title: `KSP ${ksp} matches Kotlin ${kotlin}`, detail: 'Consider KSP 2.3.0+: KSP1 is deprecated and newer versions aren’t tied to Kotlin.', source: SOURCES.ksp });
    } else if (isVersion(ksp) && compareVersions(ksp, '2.3.0') >= 0) {
      out.push({ status: 'ok', title: `KSP ${ksp} isn’t tied to a Kotlin version`, detail: 'Since 2.3.0 KSP versions are independent of Kotlin (KSP2). Use a recent Kotlin.', source: SOURCES.ksp });
    } else {
      out.push({ status: 'info', title: `Couldn’t read KSP version "${ksp}"`, detail: 'Expected 2.1.0-1.0.29 (old scheme) or 2.3.0+ (new scheme).', source: SOURCES.ksp });
    }
  }

  // Compose Multiplatform
  const cmp = v.cmp?.trim();
  if (cmp && isVersion(cmp)) {
    const jc = CMP_COMPOSE.find(([c]) => c === cmp)?.[1];
    if (kotlin && compareVersions(cmp, '1.8.0') >= 0 && compareVersions(kotlin, '2.1.0') < 0) {
      out.push({ status: 'error', title: `Compose Multiplatform ${cmp} needs Kotlin 2.1.0+`, detail: 'Since 1.8.0 it uses the K2 compiler. The compose compiler plugin must match your Kotlin version.', source: SOURCES.cmp });
    } else {
      out.push({ status: 'ok', title: `Compose Multiplatform ${cmp}${jc ? ` is based on Jetpack Compose ${jc}` : ''}`, detail: 'Apply org.jetbrains.kotlin.plugin.compose at your Kotlin version. iOS and web targets: Kotlin 2.2.20+ recommended.', source: SOURCES.cmp });
    }
  }

  // compileSdk ↔ AGP
  const api = v.compileSdk?.trim();
  if (api && agp && isVersion(agp)) {
    const level = parseFloat(api);
    const row = API_AGP.find(([l]) => l === level);
    if (row && compareVersions(agp, row[1]) < 0) out.push({ status: 'error', title: `API ${api} needs AGP ${row[1]} or newer`, detail: `You have AGP ${agp}.`, source: SOURCES.apiLevel });
    else if (row) out.push({ status: 'ok', title: `AGP ${agp} supports API ${api}`, detail: `Minimum is AGP ${row[1]}.`, source: SOURCES.apiLevel });
  }
  return out;
}
