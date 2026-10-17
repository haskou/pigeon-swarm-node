import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Node 24 releases before 24.22.0 ship a V8 whose Sparkplug baseline prologue
 * can leave a stale slot that a full garbage collection dereferences
 * (nodejs/node#62393). A jest worker then dies with SIGSEGV in whichever suite
 * it happens to be running. Node 24.22.0 carries the V8 fix, so the repository
 * requires it instead of disabling Sparkplug.
 */
const minimumNode = [24, 22, 0];

function engineRange(): string | undefined {
  const manifest = JSON.parse(
    readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'),
  ) as { engines?: { node?: string } };

  return manifest.engines?.node;
}

function isAtLeast(version: number[], minimum: number[]): boolean {
  const index = version.findIndex((part, i) => part !== minimum[i]);

  return index === -1 || version[index] > minimum[index];
}

describe('jest runtime', () => {
  it('should declare the first Node 24 release with the Sparkplug GC fix', () => {
    expect(engineRange()).toBe(`>=${minimumNode.join('.')}`);
  });

  it('should run the specs on a Node release with the Sparkplug GC fix', () => {
    const version = process.versions.node.split('.').map(Number);

    expect(isAtLeast(version, minimumNode)).toBe(true);
  });
});
