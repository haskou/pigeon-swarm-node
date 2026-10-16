const fs = require('fs');
const path = require('path');

// Let bitswap send blocks and learn of peers over limited (relayed)
// connections when it is configured to run on them. Each patch is applied
// once: a file that already carries it is left as it is, so the script can
// run again on an installed tree.
const files = [
  {
    relativePath: 'node_modules/@helia/bitswap/dist/src/network.js',
    patches: [
      {
        search: `        }, {
            onProgress: options?.onProgress,
            peerId,
            signal: options?.signal ?? AbortSignal.timeout(this.messageSendTimeout),
            message
        });`,
        replacement: `        }, {
            onProgress: options?.onProgress,
            peerId,
            runOnLimitedConnection: this.runOnLimitedConnections,
            signal: options?.signal ?? AbortSignal.timeout(this.messageSendTimeout),
            message
        });`,
      },
      {
        search: `        const topology = {
            onConnect: (peerId) => {`,
        replacement: `        const topology = {
            notifyOnLimitedConnection: this.runOnLimitedConnections,
            onConnect: (peerId) => {`,
      },
    ],
  },
  {
    relativePath: 'node_modules/@helia/bitswap/src/network.ts',
    patches: [
      {
        search: `    }, {
      onProgress: options?.onProgress,
      peerId,
      signal: options?.signal ?? AbortSignal.timeout(this.messageSendTimeout),
      message
    })`,
        replacement: `    }, {
      onProgress: options?.onProgress,
      peerId,
      runOnLimitedConnection: this.runOnLimitedConnections,
      signal: options?.signal ?? AbortSignal.timeout(this.messageSendTimeout),
      message
    })`,
      },
      {
        search: `    const topology: Topology = {
      onConnect: (peerId: PeerId) => {`,
        replacement: `    const topology: Topology = {
      notifyOnLimitedConnection: this.runOnLimitedConnections,
      onConnect: (peerId: PeerId) => {`,
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

    if (!next.includes(search)) {
      throw new Error(`Unable to patch ${relativePath}`);
    }

    next = next.replace(search, replacement);
  }

  if (next === current) {
    continue;
  }

  fs.writeFileSync(filePath, next);
  console.log(`Patched ${relativePath}`);
}
