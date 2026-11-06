/**
 * R8 / ProGuard keep rules for the reflection patterns that break minified
 * release builds, scoped as narrowly as the use case allows, and a lint for
 * proguard-rules.pro files.
 *
 * Each generated rule is checked with real R8 in keep-rules.r8.test.ts: the
 * scenario fails after shrinking without the rule and works with it.
 */

export type RuleKind = 'json-models' | 'class-for-name' | 'annotated-members' | 'js-interface' | 'jni-callbacks' | 'kotlin-reflect';

export interface RuleKindInfo {
  label: string;
  /** What the target field asks for; empty when the rule needs none. */
  target: string;
  placeholder: string;
  why: string;
}

export const ruleKinds: Record<RuleKind, RuleKindInfo> = {
  'json-models': {
    label: 'JSON models read by reflection (Gson, Jackson, reflective Moshi)',
    target: 'Package of the model classes',
    placeholder: 'com.example.api.model',
    why: 'These libraries map JSON keys to field names at runtime. R8 renames or removes fields it sees no code reading.',
  },
  'class-for-name': {
    label: 'Classes loaded by a name built at runtime (plugins, config)',
    target: 'Class or package',
    placeholder: 'com.example.plugins.**',
    why: 'R8 follows Class.forName("a.Constant") by itself, but a name from config or a server is invisible to it, so the class is removed or renamed.',
  },
  'annotated-members': {
    label: 'Members found by an annotation at runtime (event buses, custom DI)',
    target: 'Annotation class',
    placeholder: 'com.example.events.Subscribe',
    why: 'Code that scans for annotated methods needs the methods and the annotations kept.',
  },
  'js-interface': {
    label: 'WebView JavaScript interface',
    target: 'Bridge class',
    placeholder: 'com.example.web.WebAppBridge',
    why: 'JavaScript calls @JavascriptInterface methods by name, so they must not be renamed or removed.',
  },
  'jni-callbacks': {
    label: 'Classes and members used from native (JNI) code',
    target: 'Class',
    placeholder: 'com.example.native.Callbacks',
    why: 'Native code looks up classes, methods and fields by name (FindClass, GetMethodID). Native methods themselves are already kept by the default rules.',
  },
  'kotlin-reflect': {
    label: 'Kotlin reflection (kotlin-reflect, KClass.members)',
    target: 'Package or class inspected',
    placeholder: 'com.example.forms.**',
    why: 'kotlin-reflect reads Kotlin metadata, which R8 strips or rewrites unless kept.',
  },
};

export interface RuleRequest {
  kind: RuleKind;
  target?: string;
}

export class KeepRulesError extends Error {}

const NAME = /^[a-zA-Z_$][\w$]*(\.[a-zA-Z_$][\w$]*)*(\.\*\*?)?$/;

/** 'com.example.model' → 'com.example.model.**'; class names stay as they are. */
function scope(target: string, packageByDefault: boolean): string {
  const t = target.trim();
  if (!NAME.test(t)) throw new KeepRulesError(`"${t || '(empty)'}" isn't a Java/Kotlin class or package name.`);
  if (t.endsWith('*')) return t;
  // Lowercase last segment: a package.
  const last = t.split('.').pop()!;
  return packageByDefault || /^[a-z]/.test(last) ? `${t}.**` : t;
}

function rule(r: RuleRequest): string[] {
  const info = ruleKinds[r.kind];
  const head = [`# ${info.label}`, `# ${info.why}`];
  const t = r.target ?? '';
  switch (r.kind) {
    case 'json-models': {
      const s = scope(t, true);
      return [...head, '-keepattributes Signature, RuntimeVisibleAnnotations, AnnotationDefault', `-keepclassmembers class ${s} {`, '    <fields>;', '    <init>(...);', '}'];
    }
    case 'class-for-name': {
      const s = scope(t, false);
      return [...head, `-keep class ${s} {`, '    <init>(...);', '}'];
    }
    case 'annotated-members': {
      const s = scope(t, false);
      if (s.endsWith('*')) throw new KeepRulesError('Give the annotation class, not a package.');
      return [...head, '-keepattributes RuntimeVisibleAnnotations', `-keep @interface ${s}`, '-keepclassmembers class * {', `    @${s} <methods>;`, `    @${s} <fields>;`, '}'];
    }
    case 'js-interface': {
      const s = scope(t, false);
      return [...head, '-keepattributes RuntimeVisibleAnnotations', `-keepclassmembers class ${s} {`, '    @android.webkit.JavascriptInterface <methods>;', '}'];
    }
    case 'jni-callbacks': {
      const s = scope(t, false);
      return [...head, `-keep class ${s} {`, '    *;', '}'];
    }
    case 'kotlin-reflect': {
      const s = scope(t, false);
      return [...head, '-keepattributes RuntimeVisibleAnnotations, InnerClasses, Signature, EnclosingMethod', '-keep class kotlin.Metadata { *; }', `-keep class ${s} {`, '    *;', '}'];
    }
  }
}

export function generateRules(requests: readonly RuleRequest[]): string {
  if (!requests.length) return '# Choose what your app does with reflection to get rules.\n';
  const blocks = requests.map((r) => rule(r).join('\n'));
  return `${blocks.join('\n\n')}\n`;
}

/** Libraries whose current versions ship their own consumer rules: nothing to add. */
export const shipsOwnRules = [
  'Room',
  'Hilt and Dagger',
  'Jetpack Compose',
  'kotlinx.serialization (with the serialization compiler plugin)',
  'Moshi with codegen (@JsonClass(generateAdapter = true))',
  'Retrofit and OkHttp',
  'Gson fields annotated with @SerializedName',
  'Coroutines, Lifecycle, Navigation and WorkManager',
  'Firebase and Google Play services',
  'Class.forName("…") with a constant string: R8 follows it',
  'Line numbers in crashes: R8 keeps them by default and maps files and lines in mapping.txt, so -keepattributes SourceFile,LineNumberTable changes nothing',
];

// ---------------------------------------------------------------------------
// Lint

export type Level = 'error' | 'warning' | 'info';

export interface LintFinding {
  level: Level;
  line: number;
  message: string;
}

const DIRECTIVES = new Set(
  (
    'keep keepclassmembers keepclasseswithmembers keepnames keepclassmembernames keepclasseswithmembernames keepattributes keeppackagenames ' +
    'keepparameternames keepdirectories dontwarn dontnote ignorewarnings dontobfuscate dontoptimize dontshrink dontpreverify dontusemixedcaseclassnames ' +
    'optimizations optimizationpasses allowaccessmodification repackageclasses flattenpackagehierarchy renamesourcefileattribute adaptclassstrings ' +
    'adaptresourcefilenames adaptresourcefilecontents printmapping printseeds printusage printconfiguration whyareyoukeeping include basedirectory ' +
    'assumenosideeffects assumevalues applymapping obfuscationdictionary classobfuscationdictionary packageobfuscationdictionary verbose ' +
    'checkdiscard identifiernamestring if alwaysinline neverinline maximumremovedandroidloglevel keepkotlinmetadata dump target useuniqueclassmembernames ' +
    'overloadaggressively mergeinterfacesaggressively skipnonpubliclibraryclasses dontskipnonpubliclibraryclassmembers forceprocessing injars outjars libraryjars'
  ).split(' '),
);

/** Lint a proguard-rules.pro file for rules that undo R8 or hide problems. */
export function lintRules(text: string): LintFinding[] {
  const out: LintFinding[] = [];
  const seen = new Map<string, number>();
  // Join braces so multi-line rules are one entry.
  const lines = text.split('\n');
  let buf = '';
  let start = 0;
  const entries: { line: number; text: string }[] = [];
  lines.forEach((raw, i) => {
    const l = raw.replace(/#.*$/, '').trim();
    if (!l) return;
    if (!buf) start = i + 1;
    buf += (buf ? ' ' : '') + l;
    if ((buf.match(/\{/g) ?? []).length <= (buf.match(/\}/g) ?? []).length) {
      entries.push({ line: start, text: buf.replace(/\s+/g, ' ') });
      buf = '';
    }
  });
  if (buf) entries.push({ line: start, text: buf });

  for (const { line, text: e } of entries) {
    const d = e.match(/^-(\w+)/)?.[1];
    if (!d) {
      out.push({ level: 'error', line, message: `Not a rule: "${e.slice(0, 50)}". Rules start with a dash, like -keep.` });
      continue;
    }
    if (!DIRECTIVES.has(d)) out.push({ level: 'error', line, message: `Unknown option -${d}.` });
    const norm = e.replace(/\s/g, '');
    if (seen.has(norm)) out.push({ level: 'info', line, message: `Same rule as line ${seen.get(norm)}.` });
    else seen.set(norm, line);

    if (d === 'dontshrink') out.push({ level: 'error', line, message: '-dontshrink keeps every class and method, so R8 removes nothing.' });
    if (d === 'dontobfuscate') out.push({ level: 'warning', line, message: '-dontobfuscate makes the app bigger and easier to reverse engineer. Keep only what reflection needs instead.' });
    if (d === 'dontoptimize') out.push({ level: 'warning', line, message: '-dontoptimize turns off R8’s optimisations, making the app bigger and slower.' });
    if (d === 'ignorewarnings') out.push({ level: 'warning', line, message: '-ignorewarnings hides missing classes that can crash at runtime. Use a targeted -dontwarn for each reported class.' });
    if (d === 'dontwarn' && /^-dontwarn\s+(\*\*?|\*\*\.\*)?$/.test(e)) out.push({ level: 'warning', line, message: 'A blanket -dontwarn hides every missing class. Name the packages instead (R8 writes suggestions to build/outputs/mapping/<variant>/missing_rules.txt).' });
    if (d === 'keepattributes' && /\s\*\s*$/.test(e)) out.push({ level: 'warning', line, message: '-keepattributes * keeps every attribute, including debug data. List the ones you need.' });
    if (/^-keep(classmembers|classeswithmembers|names)?(,[\w,]+)?\s+(class|interface|enum)\s+(\*|\*\*|\*\*\.\*|\*\.\*)\s*(\{\s*\*;\s*\})?$/.test(e))
      out.push({ level: 'error', line, message: 'Keeps every class, so R8 can’t shrink or obfuscate anything.' });
    else if (/^-keep(,[\w,]+)?\s+class\s+[\w.]+\.\*\*\s*\{\s*\*;\s*\}/.test(e))
      out.push({ level: 'warning', line, message: 'Keeps everything in a whole package. Narrow it to the classes and members that are used by reflection.' });
  }
  return out;
}
