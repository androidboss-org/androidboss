import type { Cheatsheet } from './types.ts';

const SIGN = 'https://developer.android.com/studio/publish/app-signing';
const APKSIGNER = 'https://developer.android.com/tools/apksigner';
const ZIPALIGN = 'https://developer.android.com/tools/zipalign';
const BUNDLETOOL = 'https://developer.android.com/tools/bundletool';
const APKANALYZER = 'https://developer.android.com/tools/apkanalyzer';
const BUNDLETOOL_NOTE = 'bundletool isn’t part of the SDK: download bundletool-all.jar from github.com/google/bundletool and run it with java -jar. Flags checked against the bundletool docs.';

export const signing: Cheatsheet = {
  slug: 'signing',
  title: 'APK signing and bundles cheatsheet',
  tagline: 'Keystores, signing, 16 KB alignment, App Bundle testing and APK inspection: keytool, apksigner, zipalign, bundletool.',
  intro:
    'Commands for signing and checking release builds: create and inspect keystores, sign and verify APKs, check 16 KB page alignment, turn an App Bundle into installable APKs, and look inside an APK. Checked with build-tools 36.1.0 and JDK 21.',
  tool: { name: 'keytool, apksigner, zipalign, bundletool, apkanalyzer', version: 'build-tools 37.0.0, bundletool 1.18.3', checkedOn: '2026-11-07', docs: SIGN },
  variables: [
    { key: 'keystore', label: 'Keystore', example: 'upload-keystore.jks' },
    { key: 'alias', label: 'Key alias', example: 'upload' },
    { key: 'apk', label: 'APK', example: 'app-release.apk' },
    { key: 'aab', label: 'App bundle', example: 'app/build/outputs/bundle/release/app-release.aab' },
    { key: 'apks', label: 'APK set', example: 'app.apks' },
    { key: 'package', label: 'Package', example: 'com.example.app' },
  ],
  related: ['/tools/apk-analyzer/', '/tools/app-links/', '/tools/keep-rules/', '/cheatsheets/gradle/'],
  sections: [
    {
      id: 'keystore',
      title: 'Keystores and certificates',
      entries: [
        { id: 'create-keystore', title: 'Create an upload keystore', command: 'keytool -genkeypair -v -keystore {{keystore}} -alias {{alias}} -keyalg RSA -keysize 2048 -validity 10000', note: 'Back it up. With Play App Signing, this is your upload key, which Google can reset if lost.', tags: ['keystore', 'create', 'upload key'], verify: 'help', docs: SIGN },
        { id: 'list-keystore', title: 'Show a keystore’s keys and SHA-256 fingerprints', command: 'keytool -list -v -keystore {{keystore}}', tags: ['keystore', 'sha256', 'fingerprint'], verify: 'help' },
        { id: 'debug-sha', title: 'Show the debug key’s fingerprints', command: 'keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android', note: 'For Firebase, Google Sign-In and Maps keys on debug builds.', tags: ['debug', 'sha1', 'sha256', 'firebase'], verify: 'help' },
        { id: 'export-cert', title: 'Export the upload certificate as PEM', command: 'keytool -exportcert -rfc -keystore {{keystore}} -alias {{alias}} -file upload_certificate.pem', note: 'Play Console asks for this when you reset an upload key.', tags: ['certificate', 'pem', 'play'], verify: 'help', docs: 'https://support.google.com/googleplay/android-developer/answer/9842756' },
      ],
    },
    {
      id: 'apksigner',
      title: 'Sign and verify APKs',
      entries: [
        { id: 'sign', title: 'Sign an APK', command: 'apksigner sign --ks {{keystore}} --ks-key-alias {{alias}} --out app-release-signed.apk {{apk}}', note: 'Run zipalign before apksigner; signing after changes invalidates the signature.', tags: ['sign', 'release'], verify: 'help', docs: APKSIGNER },
        { id: 'verify', title: 'Verify a signature and print the certificates', command: 'apksigner verify --verbose --print-certs {{apk}}', tags: ['verify', 'certificate', 'fingerprint'], verify: 'help', docs: APKSIGNER },
        { id: 'verify-min-sdk', title: 'Check the signature works on older Android versions', command: 'apksigner verify --min-sdk-version 24 {{apk}}', tags: ['verify', 'minSdk', 'v1', 'v2'], verify: 'help', docs: APKSIGNER },
        { id: 'device-apk-cert', title: 'Check the certificate of an app on a device', command: 'adb pull $(adb shell pm path {{package}} | head -1 | cut -d: -f2) installed.apk\napksigner verify --print-certs installed.apk', note: 'Useful to confirm a Play-installed app is signed with the app signing key.', tags: ['installed', 'play', 'certificate'], verify: 'help' },
      ],
    },
    {
      id: 'alignment',
      title: 'Alignment and 16 KB pages',
      entries: [
        { id: 'check-16kb', title: 'Check native libraries are 16 KB aligned', command: 'zipalign -c -P 16 -v 4 {{apk}}', since: 'Required for Play since Nov 2025', note: 'Every .so must also be built with 16 KB ELF alignment; the APK analyzer tool checks both.', tags: ['16kb', 'page size', 'native', 'so'], verify: 'help', docs: 'https://developer.android.com/guide/practices/page-sizes' },
        { id: 'align-16kb', title: 'Align an APK for 16 KB page sizes', command: 'zipalign -f -P 16 -v 4 {{apk}} app-aligned.apk', tags: ['16kb', 'align', 'native'], verify: 'help', docs: ZIPALIGN },
        { id: 'check-align', title: 'Check 4-byte alignment', command: 'zipalign -c -v 4 {{apk}}', tags: ['align', 'check'], verify: 'help', docs: ZIPALIGN },
      ],
    },
    {
      id: 'bundles',
      title: 'App Bundles with bundletool',
      entries: [
        { id: 'build-apks', title: 'Turn an App Bundle into an APK set', command: 'bundletool build-apks --bundle={{aab}} --output={{apks}} --ks={{keystore}} --ks-key-alias={{alias}}', note: BUNDLETOOL_NOTE, tags: ['bundle', 'aab', 'apks', 'test'], verify: 'none', docs: BUNDLETOOL },
        { id: 'build-apks-device', title: 'Build only the APKs for the connected device', command: 'bundletool build-apks --connected-device --bundle={{aab}} --output={{apks}}', note: 'Without --ks, bundletool signs with your debug key.', tags: ['bundle', 'device', 'splits'], verify: 'none', docs: BUNDLETOOL },
        { id: 'universal', title: 'Build one universal APK from a bundle', command: 'bundletool build-apks --mode=universal --bundle={{aab}} --output={{apks}}', note: 'The .apks file is a zip; unzip it to get universal.apk for sharing with testers.', tags: ['universal', 'apk', 'share'], verify: 'none', docs: BUNDLETOOL },
        { id: 'install-apks', title: 'Install an APK set on a device', command: 'bundletool install-apks --apks={{apks}}', note: BUNDLETOOL_NOTE, tags: ['install', 'apks', 'device'], verify: 'none', docs: BUNDLETOOL },
        { id: 'device-spec', title: 'Save a device’s configuration', command: 'bundletool get-device-spec --output=device-spec.json', note: BUNDLETOOL_NOTE, tags: ['device spec', 'json'], verify: 'none', docs: BUNDLETOOL },
        { id: 'download-size', title: 'Estimate download size from Play', command: 'bundletool get-size total --apks={{apks}}', note: BUNDLETOOL_NOTE, tags: ['size', 'download', 'play'], verify: 'none', docs: BUNDLETOOL },
      ],
    },
    {
      id: 'inspect',
      title: 'Look inside an APK',
      entries: [
        { id: 'summary', title: 'Show package name and version', command: 'apkanalyzer apk summary {{apk}}', tags: ['version', 'package', 'summary'], verify: 'help', docs: APKANALYZER },
        { id: 'apk-size', title: 'Show file and estimated download size', command: 'apkanalyzer --human-readable apk file-size {{apk}}\napkanalyzer --human-readable apk download-size {{apk}}', tags: ['size', 'download'], verify: 'help', docs: APKANALYZER },
        { id: 'manifest', title: 'Print the merged manifest', command: 'apkanalyzer manifest print {{apk}}', tags: ['manifest', 'xml', 'permissions'], verify: 'help', docs: APKANALYZER },
        { id: 'permissions', title: 'List the permissions an APK requests', command: 'apkanalyzer manifest permissions {{apk}}', tags: ['permissions', 'manifest'], verify: 'help', docs: APKANALYZER },
        { id: 'target-sdk', title: 'Show minSdk and targetSdk', command: 'apkanalyzer manifest min-sdk {{apk}}\napkanalyzer manifest target-sdk {{apk}}', tags: ['targetSdk', 'minSdk'], verify: 'help', docs: APKANALYZER },
        { id: 'dex-packages', title: 'List classes left after R8', command: 'apkanalyzer dex packages {{apk}}', tags: ['dex', 'r8', 'classes'], verify: 'help', docs: APKANALYZER },
        { id: 'compare', title: 'Compare the size of two APKs', command: 'apkanalyzer --human-readable apk compare old.apk {{apk}}', tags: ['compare', 'size', 'diff'], verify: 'help', docs: APKANALYZER },
      ],
    },
  ],
};
