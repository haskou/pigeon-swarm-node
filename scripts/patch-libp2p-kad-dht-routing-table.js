const fs = require('fs');
const path = require('path');

const runtimeFile =
  'node_modules/@libp2p/kad-dht/dist/src/routing-table/k-bucket.js';
const files = [
  runtimeFile,
  'node_modules/@libp2p/kad-dht/src/routing-table/k-bucket.ts',
];

const recursiveTraversal = `    *toIterable() {
        function* iterate(bucket) {
            if (isLeafBucket(bucket)) {
                yield* bucket.peers;
                return;
            }
            yield* iterate(bucket.left);
            yield* iterate(bucket.right);
        }
        yield* iterate(this.root);
    }`;

const guardedTraversal = `    *toIterable() {
        const pending = [this.root];
        const visited = new Set();
        while (pending.length > 0) {
            const bucket = pending.pop();
            if (bucket == null || visited.has(bucket)) {
                continue;
            }
            visited.add(bucket);
            if (isLeafBucket(bucket)) {
                yield* bucket.peers;
                continue;
            }
            pending.push(bucket.right);
            pending.push(bucket.left);
        }
    }`;

const recursiveTypeScriptTraversal = `  * toIterable (): Generator<Peer, void, undefined> {
    function * iterate (bucket: Bucket): Generator<Peer, void, undefined> {
      if (isLeafBucket(bucket)) {
        yield * bucket.peers
        return
      }

      yield * iterate(bucket.left)
      yield * iterate(bucket.right)
    }

    yield * iterate(this.root)
  }`;

const guardedTypeScriptTraversal = `  * toIterable (): Generator<Peer, void, undefined> {
    const pending: Bucket[] = [this.root]
    const visited = new Set<Bucket>()

    while (pending.length > 0) {
      const bucket = pending.pop()

      if (bucket == null || visited.has(bucket)) {
        continue
      }

      visited.add(bucket)

      if (isLeafBucket(bucket)) {
        yield * bucket.peers
        continue
      }

      pending.push(bucket.right)
      pending.push(bucket.left)
    }
  }`;

let runtimeFileWasFound = false;

for (const relativePath of files) {
  const filePath = path.join(process.cwd(), relativePath);

  if (!fs.existsSync(filePath)) {
    continue;
  }

  if (relativePath === runtimeFile) {
    runtimeFileWasFound = true;
  }

  const current = fs.readFileSync(filePath, 'utf8');

  if (
    current.includes(guardedTraversal) ||
    current.includes(guardedTypeScriptTraversal)
  ) {
    continue;
  }

  let next = current;

  if (current.includes(recursiveTraversal)) {
    next = current.replace(recursiveTraversal, guardedTraversal);
  } else if (current.includes(recursiveTypeScriptTraversal)) {
    next = current.replace(
      recursiveTypeScriptTraversal,
      guardedTypeScriptTraversal,
    );
  }

  if (next === current) {
    throw new Error(`Unable to patch ${relativePath}`);
  }

  fs.writeFileSync(filePath, next);
  console.log(`Patched ${relativePath}`);
}

if (!runtimeFileWasFound) {
  throw new Error(`Unable to find Kademlia runtime file: ${runtimeFile}`);
}
