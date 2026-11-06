import { describe, expect, it } from 'vitest';
import { generateAgentsMd, normalizeModules } from './index.ts';

describe('normalizeModules', () => {
  it('adds colons, trims, drops blanks and duplicates', () => {
    expect(normalizeModules([' app', ':core:data', '', ':app'])).toEqual([':app', ':core:data']);
  });
});

describe('generateAgentsMd', () => {
  it('produces a sensible default Android file', () => {
    const md = generateAgentsMd({ projectName: 'Shop' });
    expect(md.startsWith('# AGENTS.md — Shop\n')).toBe(true);
    expect(md).toContain('Android app written in Kotlin.');
    expect(md).toContain('`./gradlew :app:assembleDebug`');
    expect(md).toContain('`./gradlew testDebugUnitTest && ./gradlew :app:lintDebug`');
    expect(md).toContain('@HiltViewModel');
    expect(md).toContain('fallbackToDestructiveMigration');
    expect(md).toContain('## Android CLI');
    expect(md).not.toContain('commonMain');
    expect(md.endsWith('\n')).toBe(true);
    expect(md).not.toMatch(/\n{3,}/);
  });

  it('switches to KMP commands and rules', () => {
    const md = generateAgentsMd({
      projectType: 'kmp',
      targets: ['android', 'ios', 'desktop'],
      ui: 'compose-multiplatform',
      di: 'koin',
      persistence: ['sqldelight'],
      networking: 'ktor',
      modules: ['composeApp', 'shared'],
      appModule: 'composeApp',
    });
    expect(md).toContain('targeting Android, iOS, Desktop (JVM)');
    expect(md).toContain('`./gradlew allTests`');
    expect(md).toContain('`./gradlew iosSimulatorArm64Test`');
    expect(md).not.toContain('testDebugUnitTest');
    expect(md).toContain('`./gradlew :composeApp:assembleDebug`');
    expect(md).toContain('`commonMain`');
    expect(md).toContain('Swift');
    expect(md).toContain('Koin');
    expect(md).toContain('.sqm');
    expect(md).not.toContain('Retrofit');
  });

  it('omits Android-only commands for KMP without an Android target', () => {
    const md = generateAgentsMd({ projectType: 'kmp', targets: ['ios', 'server'], androidCli: true });
    expect(md).not.toContain('assembleDebug');
    expect(md).not.toContain('## Android CLI');
    expect(md).not.toContain('lintDebug');
  });

  it('includes optional linters and notes', () => {
    const md = generateAgentsMd({ linters: ['ktlint', 'detekt', 'spotless'], notes: 'Use Turbine for Flow tests.' });
    expect(md).toContain('`./gradlew ktlintCheck`');
    expect(md).toContain('`./gradlew detekt`');
    expect(md).toContain('`./gradlew spotlessCheck`');
    expect(md).toContain('## Project notes\n\nUse Turbine for Flow tests.');
  });

  it('titles the file after the chosen agent file', () => {
    expect(generateAgentsMd({ file: 'CLAUDE.md', projectName: 'X' })).toMatch(/^# CLAUDE\.md — X/);
  });

  it('handles Views projects', () => {
    const md = generateAgentsMd({ ui: 'views' });
    expect(md).toContain('ViewBinding');
    expect(md).not.toContain('@Preview');
  });
});
