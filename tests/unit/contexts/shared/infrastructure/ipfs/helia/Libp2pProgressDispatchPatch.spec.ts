import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

describe('libp2p progress dispatch dependency patch', () => {
  it('delivers one progress event once to every joined queue job', () => {
    const moduleUrl = pathToFileURL(
      path.join(process.cwd(), 'node_modules/@libp2p/utils/dist/src/index.js'),
    ).href;
    const verification = `
      import assert from 'node:assert/strict'
      import { Queue } from ${JSON.stringify(moduleUrl)}

      // A loaded machine can hold this process for over a second before the
      // dispatch runs; the outcome must not depend on that delay.
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1_200)

      const jobCount = 28
      const queues = Array.from({ length: jobCount }, () => new Queue())
      const progressDispatchers = []
      const readyResolvers = []
      const ready = Array.from({ length: jobCount }, (_, index) => new Promise(resolve => {
        readyResolvers[index] = resolve
      }))
      let deliveries = 0
      let releaseJobs
      const holdJobs = new Promise(resolve => {
        releaseJobs = resolve
      })
      const jobs = queues.map((queue, index) => queue.add(async ({ onProgress }) => {
        progressDispatchers[index] = onProgress
        readyResolvers[index]()
        await holdJobs
      }, {
        onProgress: event => {
          deliveries += 1
          progressDispatchers[index + 1]?.(event)
          progressDispatchers[index + 2]?.(event)
        }
      }))

      await Promise.all(ready)
      const event = { type: 'single-progress-event' }
      progressDispatchers[0](event)
      assert.equal(deliveries, jobCount)
      progressDispatchers[0](event)
      assert.equal(deliveries, jobCount * 2)
      releaseJobs()
      await Promise.all(jobs)
    `;

    expect(() =>
      execFileSync(process.execPath, [
        '--input-type=module',
        '--eval',
        verification,
      ]),
    ).not.toThrow();
  });

  it('fails installation when the libp2p queue runtime file is missing', () => {
    const installationRoot = mkdtempSync(
      path.join(tmpdir(), 'pigeon-libp2p-progress-patch-'),
    );
    const patchScript = path.join(
      process.cwd(),
      'scripts/patch-libp2p-progress-dispatch.js',
    );

    try {
      expect(() =>
        execFileSync(process.execPath, [patchScript], {
          cwd: installationRoot,
          stdio: 'pipe',
        }),
      ).toThrow(/Unable to find libp2p queue runtime file/);
    } finally {
      rmSync(installationRoot, { force: true, recursive: true });
    }
  });
});
