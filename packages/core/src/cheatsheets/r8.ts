import type { Cheatsheet, Entry } from './types.ts';

const KEEP = 'https://developer.android.com/topic/performance/app-optimization/add-keep-rules';
const SYNTAX = 'https://developer.android.com/topic/performance/app-optimization/keep-rules-syntax';
const ENABLE = 'https://developer.android.com/topic/performance/app-optimization/enable-app-optimization';

const rule = (e: Omit<Entry, 'lang' | 'verify'>): Entry => ({ lang: 'proguard', verify: 'compile', ...e });

/** Every rule is run through real R8 in cheatsheets.tools.test.ts, which fails on syntax errors. */
export const r8: Cheatsheet = {
  slug: 'r8',
  title: 'R8 keep rules cheatsheet',
  tagline: 'R8 and ProGuard rule syntax for Android: keep classes and members, reflection, JSON models, attributes and debugging.',
  intro:
    'The keep rules Android apps actually need, with the syntax explained. Prefer narrow rules: every broad -keep stops R8 from shrinking and optimizing that code. Each rule here was run through R8 from the Android SDK.',
  tool: { name: 'R8', version: 'cmdline-tools latest (AGP 9.5)', checkedOn: '2026-11-08', docs: KEEP },
  variables: [
    { key: 'package', label: 'Your package', example: 'com.example.app' },
    { key: 'model', label: 'Model package', example: 'com.example.app.data.model' },
  ],
  related: ['/tools/keep-rules/', '/tools/r8-retrace/', '/tools/apk-analyzer/', '/cheatsheets/gradle/'],
  sections: [
    {
      id: 'setup',
      title: 'Turn on R8',
      entries: [
        { id: 'enable', title: 'Enable R8 for release builds', lang: 'kts', verify: 'compile', command: 'android {\n    buildTypes {\n        release {\n            isMinifyEnabled = true\n            isShrinkResources = true\n            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")\n        }\n    }\n}', context: 'android', note: 'Goes in the app module’s build.gradle.kts. isShrinkResources also removes unused resources.', tags: ['minify', 'enable', 'shrink resources', 'build.gradle'], docs: ENABLE },
        { id: 'library-rules', title: 'Ship keep rules with a library', lang: 'kts', verify: 'compile', context: 'android-library', command: 'android {\n    defaultConfig {\n        consumerProguardFiles("consumer-rules.pro")\n    }\n}', note: 'Apps that use your library apply these rules automatically. Keep them as narrow as possible: they apply to the whole app.', tags: ['library', 'consumer rules', 'aar'], docs: 'https://developer.android.com/topic/performance/app-optimization/library-optimization' },
      ],
    },
    {
      id: 'keep',
      title: 'Keep classes and members',
      entries: [
        rule({ id: 'keep-class', title: 'Keep one class and all its members', command: '-keep class {{package}}.bridge.NativeBridge { *; }', note: 'The widest keep: nothing in the class is renamed or removed. Use it only when reflection reaches every member.', tags: ['keep', 'class'], docs: SYNTAX }),
        rule({ id: 'keep-names', title: 'Keep a class name but let R8 remove it if unused', command: '-keepnames class {{package}}.plugins.**', note: '-keepnames only stops renaming. Useful for Class.forName(name) on classes that are also referenced in code.', tags: ['keepnames', 'rename', 'forName'], docs: SYNTAX }),
        rule({ id: 'keep-members', title: 'Keep fields of model classes for reflection-based JSON', command: '-keepclassmembers class {{model}}.** {\n    <fields>;\n    <init>(...);\n}', note: 'For Gson, Jackson and reflective Moshi. Kotlin Serialization and Moshi codegen don’t need this.', tags: ['json', 'gson', 'models', 'fields', 'keepclassmembers'], docs: KEEP }),
        rule({ id: 'keep-annotated', title: 'Keep members found by an annotation at runtime', command: '-keepclassmembers class * {\n    @{{package}}.events.Subscribe <methods>;\n}', tags: ['annotation', 'event bus', 'methods'], docs: SYNTAX }),
        rule({ id: 'keep-with-members', title: 'Keep classes that have native methods', command: '-keepclasseswithmembernames class * {\n    native <methods>;\n}', note: 'Keeps the class and method names JNI looks up. Already in proguard-android-optimize.txt.', tags: ['jni', 'native', 'ndk'], docs: SYNTAX }),
        rule({ id: 'keep-js-interface', title: 'Keep a WebView JavaScript interface', command: '-keepclassmembers class {{package}}.web.JsBridge {\n    @android.webkit.JavascriptInterface <methods>;\n}', tags: ['webview', 'javascript', 'JavascriptInterface'], docs: 'https://developer.android.com/develop/ui/views/layout/webapps/webview#BindingJavaScript' }),
        rule({ id: 'keep-enum', title: 'Keep enum names used with valueOf()', command: '-keepclassmembers enum {{package}}.** {\n    public static **[] values();\n    public static ** valueOf(java.lang.String);\n}', tags: ['enum', 'valueOf', 'reflection'], docs: SYNTAX }),
        rule({ id: 'keep-serializable', title: 'Keep Java Serializable classes working', command: '-keepclassmembers class * implements java.io.Serializable {\n    static final long serialVersionUID;\n    private void writeObject(java.io.ObjectOutputStream);\n    private void readObject(java.io.ObjectInputStream);\n    java.lang.Object readResolve();\n}', tags: ['serializable', 'java'], docs: SYNTAX }),
        rule({ id: 'conditional', title: 'Keep something only if another class is kept', command: '-if class {{model}}.**\n-keep class {{model}}.<1>JsonAdapter { *; }', note: '<1> stands for whatever the first wildcard in the -if line matched.', tags: ['if', 'conditional', 'adapter'], docs: SYNTAX }),
        rule({ id: 'allow-obfuscation', title: 'Keep a class but still let R8 rename it', command: '-keep,allowobfuscation class {{package}}.di.** { <init>(); }', note: 'Modifiers loosen a keep: allowobfuscation, allowshrinking and allowoptimization.', tags: ['allowobfuscation', 'modifiers'], docs: SYNTAX }),
      ],
    },
    {
      id: 'syntax',
      title: 'Wildcards',
      entries: [
        rule({ id: 'wildcards', title: 'Match packages, classes and members with wildcards', command: '# * any name part, ** any package depth, *** any type, ... any arguments\n-keep class {{package}}.api.*Request { *** get*(...); }', note: '* doesn’t cross a dot, so com.example.* misses subpackages; use ** for those.', tags: ['wildcards', 'syntax', 'pattern'], docs: SYNTAX }),
        rule({ id: 'subclasses', title: 'Match every subclass or implementation', command: '-keep class * extends {{package}}.plugins.Plugin { <init>(); }', tags: ['extends', 'implements', 'subclass'], docs: SYNTAX }),
      ],
    },
    {
      id: 'attributes',
      title: 'Attributes and stack traces',
      entries: [
        rule({ id: 'line-numbers', title: 'Keep line numbers in crash stack traces', command: '-keepattributes SourceFile,LineNumberTable\n-renamesourcefileattribute SourceFile', note: 'Retrace the traces with mapping.txt from the same build.', tags: ['stack trace', 'line numbers', 'crash', 'retrace'], docs: 'https://developer.android.com/topic/performance/app-optimization/test-and-troubleshoot-the-optimization#retrace' }),
        rule({ id: 'generics', title: 'Keep generic type information for Retrofit or Gson', command: '-keepattributes Signature,InnerClasses,EnclosingMethod\n-keepattributes RuntimeVisibleAnnotations,RuntimeVisibleParameterAnnotations', tags: ['signature', 'generics', 'retrofit', 'annotations'], docs: SYNTAX }),
        rule({ id: 'kotlin-metadata', title: 'Keep Kotlin metadata for kotlin-reflect', command: '-keep class kotlin.Metadata { *; }\n-keepattributes RuntimeVisibleAnnotations', note: 'Only needed if you use kotlin-reflect (KClass.members and similar).', tags: ['kotlin', 'metadata', 'reflection'], docs: SYNTAX }),
      ],
    },
    {
      id: 'cleanup',
      title: 'Remove code and silence warnings',
      entries: [
        rule({ id: 'strip-logs', title: 'Strip debug and verbose logging from release', command: '-assumenosideeffects class android.util.Log {\n    public static int d(...);\n    public static int v(...);\n}', note: 'R8 removes these calls entirely, including their arguments if nothing else uses them.', tags: ['logging', 'Log', 'assumenosideeffects'], docs: SYNTAX }),
        rule({ id: 'dontwarn', title: 'Silence warnings about a missing optional dependency', command: '-dontwarn org.conscrypt.**', note: 'Only for classes that are really optional at runtime. AGP writes suggestions to missing_rules.txt in build/outputs/mapping.', tags: ['dontwarn', 'missing classes', 'warnings'], docs: SYNTAX }),
      ],
    },
    {
      id: 'debug',
      title: 'Debug your configuration',
      entries: [
        rule({ id: 'why-kept', title: 'Find out why a class is kept', command: '-whyareyoukeeping class {{package}}.legacy.OldManager', note: 'R8 prints the chain of rules and references during the build.', tags: ['whyareyoukeeping', 'debug', 'size'], docs: 'https://developer.android.com/topic/performance/app-optimization/troubleshoot-the-optimization' }),
        rule({ id: 'print-config', title: 'Print the merged configuration from every library', command: '-printconfiguration build/outputs/r8-configuration.txt', note: 'Shows every rule R8 used, including those shipped inside AARs. Look here for broad rules from libraries.', tags: ['printconfiguration', 'libraries', 'consumer rules'], docs: 'https://developer.android.com/topic/performance/app-optimization/troubleshoot-the-optimization' }),
        rule({ id: 'print-usage', title: 'List the code R8 removed', command: '-printusage build/outputs/r8-usage.txt', tags: ['printusage', 'removed', 'shrink'], docs: SYNTAX }),
        rule({ id: 'check-discard', title: 'Fail the build if a class is not removed', command: '-checkdiscard class {{package}}.debug.**', note: 'Guards against debug-only code reaching release builds.', tags: ['checkdiscard', 'debug code', 'guard'], docs: SYNTAX }),
      ],
    },
  ],
};
