import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

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

      const kBucket = Object.create(KBucket.prototype)
      const first = { peerId: 'first' }
      const second = { peerId: 'second' }
      const left = { peers: [first] }
      const right = { peers: [second] }

      kBucket.root = { left, right }
      assert.deepEqual([...kBucket.toIterable()], [first, second])

      kBucket.root = { left }
      kBucket.root.right = kBucket.root
      assert.deepEqual([...kBucket.toIterable()], [first])
    `;

    expect(() =>
      execFileSync(
        process.execPath,
        ['--input-type=module', '--eval', verification],
        {
          timeout: 1_000,
        },
      ),
    ).not.toThrow();
  });
});
