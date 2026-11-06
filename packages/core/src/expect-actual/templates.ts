import { TARGETS, type GeneratedFile, type Target } from './index.ts';

/** kotlinx.browser is built into Kotlin/JS but is a separate library for Wasm. */
export const KOTLINX_BROWSER = 'org.jetbrains.kotlinx:kotlinx-browser:0.5.0';
const wasmBrowser = { wasmJs: [KOTLINX_BROWSER] };

/** A ready-made expect/actual pair with working code for each target. */
export interface Template {
  id: string;
  name: string;
  summary: string;
  fileName: string;
  /** Declarations for commonMain, without the package line. */
  common: string;
  actual: Record<Target, { imports?: string[]; code: string }>;
  /** Gradle dependencies a target's code needs, e.g. kotlinx-browser for Wasm. */
  dependencies?: Partial<Record<Target, string[]>>;
  /** True when it uses an expect class (Beta: compiler warning unless -Xexpect-actual-classes). */
  expectClass?: boolean;
  note?: string;
}

export const TEMPLATES: Template[] = [
  {
    id: 'platform-name',
    dependencies: wasmBrowser,
    name: 'Platform name',
    summary: 'OS name and version, for logs, analytics or a “running on” label.',
    fileName: 'Platform',
    common: 'expect fun platformName(): String',
    actual: {
      android: { imports: ['android.os.Build'], code: 'actual fun platformName(): String = "Android ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})"' },
      ios: { imports: ['platform.UIKit.UIDevice'], code: 'actual fun platformName(): String = UIDevice.currentDevice.systemName() + " " + UIDevice.currentDevice.systemVersion' },
      jvm: { code: 'actual fun platformName(): String = "${System.getProperty("os.name")} ${System.getProperty("os.version")}, Java ${System.getProperty("java.version")}"' },
      js: { imports: ['kotlinx.browser.window'], code: 'actual fun platformName(): String = "Web (${window.navigator.userAgent})"' },
      wasmJs: { imports: ['kotlinx.browser.window'], code: 'actual fun platformName(): String = "Web, Wasm (${window.navigator.userAgent})"' },
    },
  },
  {
    id: 'logger',
    name: 'Debug log',
    summary: 'Writes to Logcat, the Apple unified log (Console.app and Xcode), stdout or the browser console.',
    fileName: 'Log',
    common: 'expect fun logDebug(tag: String, message: String)',
    actual: {
      android: {
        imports: ['android.util.Log'],
        code: 'actual fun logDebug(tag: String, message: String) {\n    Log.d(tag, message)\n}',
      },
      ios: {
        imports: ['platform.Foundation.NSLog'],
        // Passing Kotlin strings as NSLog's variadic arguments crashed the test process on the
        // iOS simulator (signal 10), so the message is built in Kotlin and % is escaped instead.
        code: '// Goes through the unified log, so it shows in Console.app and in Xcode for device builds.\nactual fun logDebug(tag: String, message: String) {\n    NSLog("[$tag] $message".replace("%", "%%"))\n}',
      },
      jvm: { code: 'actual fun logDebug(tag: String, message: String) {\n    println("[$tag] $message")\n}' },
      js: { code: 'actual fun logDebug(tag: String, message: String) {\n    console.log("[$tag] $message")\n}' },
      wasmJs: { code: 'actual fun logDebug(tag: String, message: String) {\n    println("[$tag] $message")\n}' },
    },
    note: 'On Wasm, println writes to the browser console.',
  },
  {
    id: 'language',
    dependencies: wasmBrowser,
    name: 'Language tag',
    summary: 'The user’s preferred language as a BCP 47 tag such as en-US, for formatting or picking content.',
    fileName: 'Language',
    common: 'expect fun preferredLanguageTag(): String',
    actual: {
      android: { imports: ['java.util.Locale'], code: 'actual fun preferredLanguageTag(): String = Locale.getDefault().toLanguageTag()' },
      ios: {
        imports: ['platform.Foundation.NSLocale', 'platform.Foundation.preferredLanguages'],
        code: '// preferredLanguages gives BCP 47 tags such as "en-US"; NSLocale.currentLocale.localeIdentifier would give "en_US".\nactual fun preferredLanguageTag(): String = NSLocale.preferredLanguages.firstOrNull() as? String ?: "en"',
      },
      jvm: { imports: ['java.util.Locale'], code: 'actual fun preferredLanguageTag(): String = Locale.getDefault().toLanguageTag()' },
      js: { imports: ['kotlinx.browser.window'], code: 'actual fun preferredLanguageTag(): String = window.navigator.language' },
      wasmJs: { imports: ['kotlinx.browser.window'], code: 'actual fun preferredLanguageTag(): String = window.navigator.language' },
    },
  },
  {
    id: 'key-value',
    dependencies: wasmBrowser,
    name: 'Key-value store',
    summary: 'Small settings: SharedPreferences, NSUserDefaults, java.util.prefs and localStorage.',
    fileName: 'KeyValueStore',
    expectClass: true,
    common: `/** Create one per platform (Android needs a Context) and pass it to shared code. */
expect class KeyValueStore {
    fun getString(key: String): String?
    fun putString(key: String, value: String)
    fun remove(key: String)
}`,
    actual: {
      android: {
        imports: ['android.content.Context'],
        code: `actual class KeyValueStore(context: Context, name: String = "settings") {
    private val prefs = context.getSharedPreferences(name, Context.MODE_PRIVATE)

    actual fun getString(key: String): String? = prefs.getString(key, null)

    actual fun putString(key: String, value: String) {
        prefs.edit().putString(key, value).apply()
    }

    actual fun remove(key: String) {
        prefs.edit().remove(key).apply()
    }
}`,
      },
      ios: {
        imports: ['platform.Foundation.NSUserDefaults'],
        code: `actual class KeyValueStore(private val defaults: NSUserDefaults = NSUserDefaults.standardUserDefaults) {
    actual fun getString(key: String): String? = defaults.stringForKey(key)

    actual fun putString(key: String, value: String) {
        defaults.setObject(value, forKey = key)
    }

    actual fun remove(key: String) {
        defaults.removeObjectForKey(key)
    }
}`,
      },
      jvm: {
        imports: ['java.util.prefs.Preferences'],
        code: `actual class KeyValueStore(node: String = "settings") {
    private val prefs = Preferences.userRoot().node(node)

    actual fun getString(key: String): String? = prefs.get(key, null)

    actual fun putString(key: String, value: String) {
        prefs.put(key, value)
    }

    actual fun remove(key: String) {
        prefs.remove(key)
    }
}`,
      },
      js: {
        imports: ['kotlinx.browser.localStorage'],
        code: `actual class KeyValueStore {
    actual fun getString(key: String): String? = localStorage.getItem(key)

    actual fun putString(key: String, value: String) {
        localStorage.setItem(key, value)
    }

    actual fun remove(key: String) {
        localStorage.removeItem(key)
    }
}`,
      },
      wasmJs: {
        imports: ['kotlinx.browser.localStorage'],
        code: `actual class KeyValueStore {
    actual fun getString(key: String): String? = localStorage.getItem(key)

    actual fun putString(key: String, value: String) {
        localStorage.setItem(key, value)
    }

    actual fun remove(key: String) {
        localStorage.removeItem(key)
    }
}`,
      },
    },
    note: 'Each actual class picks its own constructor; the expect class declares none, so common code receives an instance instead of creating one.',
  },
  {
    id: 'open-url',
    dependencies: wasmBrowser,
    name: 'Open a URL',
    summary: 'Opens a link in the browser: an Intent, UIApplication, java.awt.Desktop or a new tab.',
    fileName: 'UrlOpener',
    expectClass: true,
    common: `expect class UrlOpener {
    fun open(url: String)
}`,
    actual: {
      android: {
        imports: ['android.content.Context', 'android.content.Intent', 'android.net.Uri'],
        code: `actual class UrlOpener(private val context: Context) {
    actual fun open(url: String) {
        // NEW_TASK so it also works with an application Context.
        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
}`,
      },
      ios: {
        imports: ['platform.Foundation.NSURL', 'platform.UIKit.UIApplication'],
        code: `actual class UrlOpener {
    actual fun open(url: String) {
        val nsUrl = NSURL.URLWithString(url) ?: return
        UIApplication.sharedApplication.openURL(nsUrl, options = emptyMap<Any?, Any>(), completionHandler = null)
    }
}`,
      },
      jvm: {
        imports: ['java.awt.Desktop', 'java.net.URI'],
        code: `actual class UrlOpener {
    actual fun open(url: String) {
        if (Desktop.isDesktopSupported()) Desktop.getDesktop().browse(URI(url))
    }
}`,
      },
      js: { imports: ['kotlinx.browser.window'], code: 'actual class UrlOpener {\n    actual fun open(url: String) {\n        window.open(url, "_blank")\n    }\n}' },
      wasmJs: { imports: ['kotlinx.browser.window'], code: 'actual class UrlOpener {\n    actual fun open(url: String) {\n        window.open(url, "_blank")\n    }\n}' },
    },
  },
];

/** Gradle lines for the source-set dependencies a set of templates needs. */
export function dependencyBlock(templates: Template[], targets: Target[]): string {
  const bySet = new Map<string, Set<string>>();
  for (const t of templates)
    for (const [target, deps] of Object.entries(t.dependencies ?? {}) as [Target, string[]][]) {
      if (!targets.includes(target)) continue;
      const set = TARGETS.find((x) => x.id === target)!.sourceSet;
      for (const d of deps) bySet.set(set, (bySet.get(set) ?? new Set()).add(d));
    }
  if (!bySet.size) return '';
  const lines = [...bySet].map(([set, deps]) => `        ${set}.dependencies {\n${[...deps].map((d) => `            implementation("${d}")`).join('\n')}\n        }`);
  return `kotlin {\n    sourceSets {\n${lines.join('\n')}\n    }\n}`;
}

/** Needs that the Kotlin standard library already covers in commonMain, so no expect/actual is needed. */
export const NO_EXPECT_NEEDED: { need: string; use: string; code: string }[] = [
  { need: 'Random UUID', use: 'kotlin.uuid.Uuid', code: 'kotlin.uuid.Uuid.random().toString()' },
  { need: 'Current time', use: 'kotlin.time.Clock', code: 'kotlin.time.Clock.System.now().toEpochMilliseconds()' },
];

export function templateFiles(t: Template, packageName: string, module: string, targets: Target[]): GeneratedFile[] {
  const dir = (sourceSet: string) => `${module}/src/${sourceSet}/kotlin/${packageName ? `${packageName.replace(/\./g, '/')}/` : ''}`;
  const pkg = packageName ? `package ${packageName}\n\n` : '';
  const files: GeneratedFile[] = [{ path: `${dir('commonMain')}${t.fileName}.kt`, sourceSet: 'commonMain', content: `${pkg}${t.common}\n` }];
  for (const target of TARGETS.filter((x) => targets.includes(x.id))) {
    const a = t.actual[target.id];
    const imports = a.imports?.length ? `${a.imports.map((i) => `import ${i}`).join('\n')}\n\n` : '';
    files.push({ path: `${dir(target.sourceSet)}${t.fileName}.${target.suffix}.kt`, sourceSet: target.sourceSet, content: `${pkg}${imports}${a.code}\n` });
  }
  return files;
}
