import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

describe('Kademlia routing table dependency patch', () => {
  it('preserves traversal order and terminates when the table contains a cycle', () => {
    const moduleUrl = pathToFileURL(
      path.join(
        process.cwd(),
        'node_modules/@libp2p/kad-dht/dist/src/routing-table/k-bucket.js',
      ),
    ).href;
    const verification = `
      import assert from 'node:assert/strict'
      import { KBucket } from ${JSON.stringify(moduleUrl)}

      // A loaded machine can hold this process for over a second before the
      // traversal runs; the outcome must not depend on that delay.
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1_200)

      // Bound the traversal by bucket reads instead of time: a traversal that
      // keeps revisiting a cyclic bucket keeps reading it, with or without
      // yielding peers, so it exhausts this budget instead of hanging.
      const maxBucketReads = 64
      let bucketReads = 0
      const bucket = fields => new Proxy(fields, {
        get(target, property, receiver) {
          bucketReads += 1
          if (bucketReads > maxBucketReads) {
            throw new Error('Traversal read more than ' + maxBucketReads + ' buckets')
          }
          return Reflect.get(target, property, receiver)
        }
      })
      const traverse = root => {
        const kBucket = Object.create(KBucket.prototype)
        kBucket.root = root
        bucketReads = 0
        return [...kBucket.toIterable()]
      }
      const first = { peerId: 'first' }
      const second = { peerId: 'second' }
      const left = bucket({ peers: [first] })
      const right = bucket({ peers: [second] })

      assert.deepEqual(traverse(bucket({ left, right })), [first, second])

      const cyclicRoot = bucket({ left })
      cyclicRoot.right = cyclicRoot
      assert.deepEqual(traverse(cyclicRoot), [first])
    `;

    expect(() =>
      execFileSync(process.execPath, [
        '--input-type=module',
        '--eval',
        verification,
      ]),
    ).not.toThrow();
  });

  it('fails installation when the Kademlia runtime file is missing', () => {
    const installationRoot = mkdtempSync(
      path.join(tmpdir(), 'pigeon-kad-dht-patch-'),
    );
    const patchScript = path.join(
      process.cwd(),
      'scripts/patch-libp2p-kad-dht-routing-table.js',
    );

    try {
      expect(() =>
        execFileSync(process.execPath, [patchScript], {
          cwd: installationRoot,
          stdio: 'pipe',
        }),
      ).toThrow(/Unable to find Kademlia runtime file/);
    } finally {
      rmSync(installationRoot, { force: true, recursive: true });
    }
  });
});
