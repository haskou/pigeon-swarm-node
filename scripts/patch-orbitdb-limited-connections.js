const fs = require('fs');
const path = require('path');

const files = [
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
    const providers = ipfs.libp2p?.getPeers?.() || []

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
    const matchingSearch = searches.find((candidate) => next.includes(candidate));

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
