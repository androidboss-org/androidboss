/**
 * Compatibility data, copied from the official tables on CHECKED_ON. Update the
 * tables and the date together; each table names its source.
 */

export const CHECKED_ON = '2026-11-03';

export const SOURCES = {
  agpGradle: 'https://developer.android.com/build/releases/about-agp#updating-gradle',
  kgp: 'https://kotlinlang.org/docs/gradle-configure-project.html#apply-the-plugin',
  composeCompiler: 'https://developer.android.com/jetpack/androidx/releases/compose-kotlin',
  cmp: 'https://kotlinlang.org/docs/multiplatform/compose-compatibility-and-versioning.html',
  apiLevel: 'https://developer.android.com/build/releases/about-agp#api-level-support',
  ksp: 'https://github.com/google/ksp/releases',
} as const;

/** AGP major.minor → minimum required Gradle. */
export const AGP_GRADLE: [string, string][] = [
  ['9.5', '9.6.0'], ['9.4', '9.6.0'], ['9.3', '9.5.0'], ['9.2', '9.4.1'], ['9.1', '9.3.1'], ['9.0', '9.1.0'],
  ['8.13', '8.13'], ['8.12', '8.13'], ['8.11', '8.13'], ['8.10', '8.11.1'], ['8.9', '8.11.1'], ['8.8', '8.10.2'],
  ['8.7', '8.9'], ['8.6', '8.7'], ['8.5', '8.7'], ['8.4', '8.6'], ['8.3', '8.4'], ['8.2', '8.2'], ['8.1', '8.0'], ['8.0', '8.0'],
  ['7.4', '7.5'], ['7.3', '7.4'], ['7.2', '7.3.3'], ['7.1', '7.2'], ['7.0', '7.0'],
];

export interface KgpRow {
  from: string;
  to: string;
  gradle: [string, string];
  agp: [string, string];
  note?: string;
}

/** Kotlin Gradle plugin → tested Gradle and AGP ranges. */
export const KGP: KgpRow[] = [
  { from: '2.4.20', to: '2.4.21', gradle: ['7.6.3', '9.7.0'], agp: ['8.5.2', '9.3.1'] },
  { from: '2.4.0', to: '2.4.10', gradle: ['7.6.3', '9.5.0'], agp: ['8.5.2', '9.1.0'] },
  { from: '2.3.20', to: '2.3.21', gradle: ['7.6.3', '9.3.0'], agp: ['8.2.2', '9.0.0'] },
  { from: '2.3.10', to: '2.3.10', gradle: ['7.6.3', '9.0.0'], agp: ['8.2.2', '9.0.0'] },
  { from: '2.3.0', to: '2.3.0', gradle: ['7.6.3', '9.0.0'], agp: ['8.2.2', '8.13.0'] },
  { from: '2.2.20', to: '2.2.21', gradle: ['7.6.3', '8.14'], agp: ['7.3.1', '8.11.1'] },
  { from: '2.2.0', to: '2.2.10', gradle: ['7.6.3', '8.14'], agp: ['7.3.1', '8.10.0'] },
  { from: '2.1.20', to: '2.1.21', gradle: ['7.6.3', '8.12.1'], agp: ['7.3.1', '8.7.2'] },
  { from: '2.1.0', to: '2.1.10', gradle: ['7.6.3', '8.10'], agp: ['7.3.1', '8.7.2'], note: 'Fully compatible with Gradle up to 8.6; 8.7–8.10 may show withJava() deprecation warnings in KMP.' },
  { from: '2.0.20', to: '2.0.21', gradle: ['6.8.3', '8.8'], agp: ['7.1.3', '8.5'], note: 'Fully compatible with Gradle up to 8.6; 8.7–8.8 may show withJava() deprecation warnings in KMP.' },
  { from: '2.0.0', to: '2.0.0', gradle: ['6.8.3', '8.5'], agp: ['7.1.3', '8.3.1'] },
  { from: '1.9.20', to: '1.9.25', gradle: ['6.8.3', '8.1.1'], agp: ['4.2.2', '8.1.0'] },
  { from: '1.9.0', to: '1.9.10', gradle: ['6.8.3', '7.6.0'], agp: ['4.2.2', '7.4.0'] },
  { from: '1.8.20', to: '1.8.22', gradle: ['6.8.3', '7.6.0'], agp: ['4.1.3', '7.4.0'] },
  { from: '1.8.0', to: '1.8.11', gradle: ['6.8.3', '7.3.3'], agp: ['4.1.3', '7.2.1'] },
];

/** Compose Compiler (androidx, Kotlin < 2.0) → required Kotlin. Stable releases only. */
export const COMPOSE_COMPILER: [string, string][] = [
  ['1.5.15', '1.9.25'], ['1.5.14', '1.9.24'], ['1.5.13', '1.9.23'], ['1.5.12', '1.9.23'], ['1.5.11', '1.9.23'],
  ['1.5.10', '1.9.22'], ['1.5.9', '1.9.22'], ['1.5.8', '1.9.22'], ['1.5.7', '1.9.21'], ['1.5.6', '1.9.21'],
  ['1.5.5', '1.9.20'], ['1.5.4', '1.9.20'], ['1.5.3', '1.9.10'], ['1.5.2', '1.9.0'], ['1.5.1', '1.9.0'], ['1.5.0', '1.9.0'],
  ['1.4.8', '1.8.22'], ['1.4.7', '1.8.21'], ['1.4.6', '1.8.20'], ['1.4.5', '1.8.20'], ['1.4.4', '1.8.10'], ['1.4.3', '1.8.10'],
  ['1.4.2', '1.8.10'], ['1.4.1', '1.8.0'], ['1.4.0', '1.8.0'], ['1.3.2', '1.7.20'], ['1.3.1', '1.7.10'], ['1.3.0', '1.7.10'],
  ['1.2.0', '1.7.0'], ['1.1.1', '1.6.10'], ['1.1.0', '1.6.10'],
];

/** Compose Multiplatform → Jetpack Compose it is based on. */
export const CMP_COMPOSE: [string, string][] = [
  ['1.12.2', '1.12.1'], ['1.11.1', '1.11.2'], ['1.10.3', '1.10.5'], ['1.9.3', '1.9.4'], ['1.8.2', '1.8.2'],
  ['1.7.3', '1.7.6'], ['1.7.1', '1.7.5'], ['1.7.0', '1.7.1'], ['1.6.11', '1.6.7'], ['1.6.10', '1.6.7'],
  ['1.6.2', '1.6.4'], ['1.6.1', '1.6.3'], ['1.6.0', '1.6.1'], ['1.5.12', '1.5.4'], ['1.5.11', '1.5.4'],
  ['1.5.10', '1.5.4'], ['1.5.1', '1.5.0'], ['1.5.0', '1.5.0'],
];

/** compileSdk / targetSdk API level → minimum AGP. */
export const API_AGP: [number, string][] = [
  [37, '9.1.1'], [36.1, '8.13.0'], [36, '8.9.1'], [35, '8.6.0'], [34, '8.1.1'], [33, '7.2'],
];
