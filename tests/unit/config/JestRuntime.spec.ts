/**
 * Node 24 releases before 24.22.0 ship a V8 whose Sparkplug baseline prologue
 * can leave a stale slot that a full garbage collection dereferences
 * (nodejs/node#62393). A jest worker then dies with SIGSEGV in whichever suite
 * it happens to be running. Node 24.22.0 carries the V8 fix, so the specs
 * require it instead of disabling Sparkplug.
 */
const minimumNode = [24, 22, 0];

function isAtLeast(version: number[], minimum: number[]): boolean {
  const index = version.findIndex((part, i) => part !== minimum[i]);

  return index === -1 || version[index] > minimum[index];
}

describe('jest runtime', () => {
  it('should run the specs on a Node release with the Sparkplug GC fix', () => {
    const version = process.versions.node.split('.').map(Number);

    expect(isAtLeast(version, minimumNode)).toBe(true);
  });
});
