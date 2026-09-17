const fs = require('fs');
const path = require('path');

const files = [
  {
    relativePath: 'node_modules/@orbitdb/core/src/oplog/log.js',
    patches: [
      {
        search: '  const joinQueue = new PQueue({ concurrency: 1 })',
        replacement:
          '  const joinQueue = new PQueue({ concurrency: 1 })\n  const replicationController = new AbortController()\n  const cancelReplication = () => replicationController.abort()',
      },
      {
        search:
          '  const heads = async () => {\n    const heads_ = await oplogStore.heads()',
        replacement:
          '  const heads = async (signal) => {\n    const heads_ = await oplogStore.heads(signal)',
      },
      {
        search: '  const get = async (hash) => {',
        replacement: '  const get = async (hash, signal) => {',
      },
      {
        search: '    return oplogStore.get(hash)',
        replacement: '    return oplogStore.get(hash, signal)',
      },
      {
        search:
          '  const joinEntry = async (entry) => {\n    const task = async () => {',
        replacement:
          '  const joinEntry = async (entry) => {\n    const task = async () => {\n      const signal = replicationController.signal\n      signal.throwIfAborted()',
      },
      {
        search: '      const headsHashes = (await heads()).map(e => e.hash)',
        replacement:
          '      const headsHashes = (await heads(signal)).map(e => e.hash)',
      },
      {
        search: 'Array.from(hashesToGet.values()).filter(has).map(get)',
        replacement:
          'Array.from(hashesToGet.values()).filter(has).map(hash => get(hash, signal))',
      },
      {
        search: '      await traverseAndVerify()\n\n      /* 4.',
        replacement:
          '      await traverseAndVerify()\n      signal.throwIfAborted()\n\n      /* 4.',
      },
      {
        search: '    joinEntry,',
        replacement: '    joinEntry,\n    cancelReplication,',
      },
    ],
  },
  {
    relativePath: 'node_modules/@orbitdb/core/src/oplog/oplog-store.js',
    patches: [
      {
        search:
          '  const get = async (hash) => {\n    const bytes = await _entries.get(hash)',
        replacement:
          '  const get = async (hash, signal) => {\n    const bytes = await _entries.get(hash, signal)',
      },
      {
        search: '  const heads = async () => {',
        replacement: '  const heads = async (signal) => {',
      },
      {
        search: '      const head = await get(hash)',
        replacement: '      const head = await get(hash, signal)',
      },
    ],
  },
  {
    relativePath: 'node_modules/@orbitdb/core/src/storage/ipfs-block.js',
    patches: [
      {
        search: `  const get = async (hash, signal) => {
    const cid = CID.parse(hash, base58btc)
    const combinedSignal = anySignal([
      shutDownController.signal,
      AbortSignal.timeout(timeout ?? DefaultTimeout),
      signal
    ])

    try {
      const chunks = []
      for await (const chunk of ipfs.blockstore.get(cid, { signal: combinedSignal })) {
        chunks.push(chunk)
      }

      if (chunks.length > 0) {
        return uint8ArrayConcat(chunks)
      }
    } finally {
      combinedSignal.clear()
    }
  }`,
        replacement: `  const get = async (hash, signal) => {
    const cid = CID.parse(hash, base58btc)
    const combinedSignal = anySignal([
      shutDownController.signal,
      AbortSignal.timeout(timeout ?? DefaultTimeout),
      signal
    ])
    const providers = (ipfs.libp2p?.getPeers?.() || []).map(peer => peer.toCID())

    try {
      const chunks = []
      for await (const chunk of ipfs.blockstore.get(cid, {
        ...(providers.length > 0 ? { providers } : {}),
        signal: combinedSignal
      })) {
        chunks.push(chunk)
      }

      if (chunks.length > 0) {
        return uint8ArrayConcat(chunks)
      }
    } finally {
      combinedSignal.clear()
    }
  }`,
      },
    ],
  },
  {
    relativePath: 'node_modules/@orbitdb/core/src/sync.js',
    patches: [
      {
        search: [
          `          const stream = await libp2p.dialProtocol(remotePeer, headsSyncAddress, { signal })`,
          `          const stream = await libp2p.dialProtocol(remotePeer, headsSyncAddress, {
            runOnLimitedConnection: true,
            signal
          })`,
        ],
        replacement: `          const existingConnection = libp2p.getConnections?.(remotePeer)?.[0]
          const stream = existingConnection != null
            ? await existingConnection.newStream([headsSyncAddress], {
              runOnLimitedConnection: true,
              signal
            })
            : await libp2p.dialProtocol(remotePeer, headsSyncAddress, {
              runOnLimitedConnection: true,
              signal
            })`,
      },
      {
        search: `      await libp2p.handle(headsSyncAddress, handleReceiveHeads)`,
        replacement: `      await libp2p.handle(headsSyncAddress, handleReceiveHeads, {
        runOnLimitedConnection: true
      })`,
      },
    ],
  },
];

for (const { relativePath, patches } of files) {
  const filePath = path.join(process.cwd(), relativePath);

  if (!fs.existsSync(filePath)) {
    continue;
  }

  const current = fs.readFileSync(filePath, 'utf8');
  let next = current;

  for (const { search, replacement } of patches) {
    if (next.includes(replacement)) {
      continue;
    }

    const searches = Array.isArray(search) ? search : [search];
    const matchingSearch = searches.find((candidate) =>
      next.includes(candidate),
    );

    if (!matchingSearch) {
      throw new Error(`Unable to patch ${relativePath}`);
    }

    next = next.replace(matchingSearch, replacement);
  }

  if (next === current) {
    continue;
  }

  fs.writeFileSync(filePath, next);
  console.log(`Patched ${relativePath}`);
}
