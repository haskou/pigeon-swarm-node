import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Node 24 ships V8 13.6, whose Sparkplug baseline prologue can leave a stale
 * slot that a full garbage collection dereferences (nodejs/node#62393). A jest
 * worker then dies with SIGSEGV in whichever suite it happens to be running.
 * Every jest script starts node with `--no-sparkplug`; jest-worker forks its
 * workers with the parent's `execArgv`, so they inherit it.
 */
const flaggedJest = 'node --no-sparkplug node_modules/jest/bin/jest.js';
const jestCommand = /(^|[\s;&|])jest(\s|$)|jest\.js/;

function packageScripts(): Record<string, string> {
  const manifest = JSON.parse(
    readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'),
  ) as { scripts: Record<string, string> };

  return manifest.scripts;
}

describe('jest runtime', () => {
  it('runs the specs with Sparkplug disabled', () => {
    expect(process.execArgv).toContain('--no-sparkplug');
  });

  it('starts every jest script through the flagged entry point', () => {
    const unflagged = Object.entries(packageScripts())
      .filter(([, command]) => jestCommand.test(command))
      .filter(([, command]) => !command.startsWith(flaggedJest))
      .map(([name]) => name);

    expect(unflagged).toEqual([]);
  });
});
