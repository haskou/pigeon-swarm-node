const fs = require('fs');
const path = require('path');

const files = [
  'node_modules/@helia/bitswap/dist/src/network.js',
  'node_modules/@helia/bitswap/src/network.ts',
];

const sendQueueSearch = `    }, {
      peerId,
      signal: options?.signal,
      message
    })`;

const sendQueueReplacement = `    }, {
      peerId,
      runOnLimitedConnection: this.runOnLimitedConnections,
      signal: options?.signal,
      message
    })`;

const jsSendQueueSearch = `        }, {
            peerId,
            signal: options?.signal,
            message
        });`;

const jsSendQueueReplacement = `        }, {
            peerId,
            runOnLimitedConnection: this.runOnLimitedConnections,
            signal: options?.signal,
            message
        });`;

const sendQueueWithProgressSearch = `    }, {
      onProgress: options?.onProgress,
      peerId,
      signal: options?.signal ?? AbortSignal.timeout(this.messageSendTimeout),
      message
    })`;

const sendQueueWithProgressReplacement = `    }, {
      onProgress: options?.onProgress,
      peerId,
      runOnLimitedConnection: this.runOnLimitedConnections,
      signal: options?.signal ?? AbortSignal.timeout(this.messageSendTimeout),
      message
    })`;

const jsSendQueueWithProgressSearch = `        }, {
            onProgress: options?.onProgress,
            peerId,
            signal: options?.signal ?? AbortSignal.timeout(this.messageSendTimeout),
            message
        });`;

const jsSendQueueWithProgressReplacement = `        }, {
            onProgress: options?.onProgress,
            peerId,
            runOnLimitedConnection: this.runOnLimitedConnections,
            signal: options?.signal ?? AbortSignal.timeout(this.messageSendTimeout),
            message
        });`;

const dialSearch = `      this.libp2p.dial(peer, options),`;

const dialReplacement = `      this.libp2p.dial(peer, {
        ...options,
        runOnLimitedConnection: this.runOnLimitedConnections
      }),`;

const jsDialSearch = `            this.libp2p.dial(peer, options),`;

const jsDialReplacement = `            this.libp2p.dial(peer, {
                ...options,
                runOnLimitedConnection: this.runOnLimitedConnections
            }),`;

const existingConnectionSearch = `        options?.onProgress?.(new CustomProgressEvent('bitswap:network:dial', peer));
        // dial and wait for identify - this is to avoid opening a protocol stream`;

const existingConnectionReplacement = `        options?.onProgress?.(new CustomProgressEvent('bitswap:network:dial', peer));
        if (typeof peer?.equals === 'function') {
            const existingConnection = this.libp2p.getConnections(peer)[0];

            if (existingConnection != null) {
                this.safeDispatchEvent('peer:connected', {
                    detail: peer
                });

                return existingConnection;
            }
        }
        // dial and wait for identify - this is to avoid opening a protocol stream`;

const tsExistingConnectionSearch = `    options?.onProgress?.(new CustomProgressEvent<PeerId | Multiaddr | Multiaddr[]>('bitswap:network:dial', peer))

    // dial and wait for identify - this is to avoid opening a protocol stream`;

const tsExistingConnectionReplacement = `    options?.onProgress?.(new CustomProgressEvent<PeerId | Multiaddr | Multiaddr[]>('bitswap:network:dial', peer))
    if (typeof peer?.equals === 'function') {
      const existingConnection = this.libp2p.getConnections(peer)[0]

      if (existingConnection != null) {
        this.safeDispatchEvent('peer:connected', {
          detail: peer
        })

        return existingConnection
      }
    }

    // dial and wait for identify - this is to avoid opening a protocol stream`;

const connectToSearch = `    options?.onProgress?.(new CustomProgressEvent<PeerId | Multiaddr | Multiaddr[]>('bitswap:dial', peer))

    // dial and wait for identify - this is to avoid opening a protocol stream`;

const connectToReplacement = `    options?.onProgress?.(new CustomProgressEvent<PeerId | Multiaddr | Multiaddr[]>('bitswap:dial', peer))
    if (typeof peer?.equals === 'function') {
      const existingConnection = this.libp2p.getConnections(peer)[0]

      if (existingConnection != null) {
        this.safeDispatchEvent('peer:connected', {
          detail: peer
        })

        return existingConnection
      }
    }

    // dial and wait for identify - this is to avoid opening a protocol stream`;

const jsConnectToSearch = `        options?.onProgress?.(new CustomProgressEvent('bitswap:dial', peer));
        // dial and wait for identify - this is to avoid opening a protocol stream`;

const jsConnectToReplacement = `        options?.onProgress?.(new CustomProgressEvent('bitswap:dial', peer));
        if (typeof peer?.equals === 'function') {
            const existingConnection = this.libp2p.getConnections(peer)[0];
            if (existingConnection != null) {
                this.safeDispatchEvent('peer:connected', {
                    detail: peer
                });
                return existingConnection;
            }
        }
        // dial and wait for identify - this is to avoid opening a protocol stream`;

const existingConnectionWithoutDispatch = `            if (existingConnection != null) {
                return existingConnection;
            }`;

const existingConnectionWithDispatch = `            if (existingConnection != null) {
                this.safeDispatchEvent('peer:connected', {
                    detail: peer
                });

                return existingConnection;
            }`;

const tsExistingConnectionWithoutDispatch = `      if (existingConnection != null) {
        return existingConnection
      }`;

const tsExistingConnectionWithDispatch = `      if (existingConnection != null) {
        this.safeDispatchEvent('peer:connected', {
          detail: peer
        })

        return existingConnection
      }`;

const topologySearch = `        const topology = {
            onConnect: (peerId) => {`;

const topologyReplacement = `        const topology = {
            notifyOnLimitedConnection: this.runOnLimitedConnections,
            onConnect: (peerId) => {`;

const tsTopologySearch = `    const topology: Topology = {
      onConnect: (peerId: PeerId) => {`;

const tsTopologyReplacement = `    const topology: Topology = {
      notifyOnLimitedConnection: this.runOnLimitedConnections,
      onConnect: (peerId: PeerId) => {`;

for (const relativePath of files) {
  const filePath = path.join(process.cwd(), relativePath);

  if (!fs.existsSync(filePath)) {
    continue;
  }

  const current = fs.readFileSync(filePath, 'utf8');
  const hasSendQueuePatch =
    current.includes('runOnLimitedConnection: this.runOnLimitedConnections,\n      signal: options?.signal') ||
    current.includes('runOnLimitedConnection: this.runOnLimitedConnections,\n            signal: options?.signal');
  const hasDialPatch =
    current.includes(dialReplacement) || current.includes(jsDialReplacement);
  const hasExistingConnectionPatch = current.includes(
    'const existingConnection = this.libp2p.getConnections(peer)[0]',
  );
  const hasTopologyPatch =
    current.includes(topologyReplacement) ||
    current.includes(tsTopologyReplacement);

  let next = current;

  if (
    hasSendQueuePatch &&
    hasDialPatch &&
    hasExistingConnectionPatch &&
    hasTopologyPatch
  ) {
    continue;
  }

  if (!hasSendQueuePatch) {
    next = next.includes(sendQueueSearch)
      ? next.replace(sendQueueSearch, sendQueueReplacement)
      : next.includes(jsSendQueueSearch)
        ? next.replace(jsSendQueueSearch, jsSendQueueReplacement)
        : next.includes(sendQueueWithProgressSearch)
          ? next.replace(
              sendQueueWithProgressSearch,
              sendQueueWithProgressReplacement,
            )
          : next.replace(
              jsSendQueueWithProgressSearch,
              jsSendQueueWithProgressReplacement,
            );
  }

  if (!hasDialPatch) {
    next = next.includes(dialSearch)
      ? next.replace(dialSearch, dialReplacement)
      : next.replace(jsDialSearch, jsDialReplacement);
  }

  if (!hasExistingConnectionPatch) {
    next = next.includes(existingConnectionWithoutDispatch)
      ? next.replace(
          existingConnectionWithoutDispatch,
          existingConnectionWithDispatch,
        )
      : next.includes(tsExistingConnectionWithoutDispatch)
        ? next.replace(
            tsExistingConnectionWithoutDispatch,
            tsExistingConnectionWithDispatch,
          )
        : next.includes(connectToSearch)
        ? next.replace(connectToSearch, connectToReplacement)
        : next.includes(jsConnectToSearch)
        ? next.replace(jsConnectToSearch, jsConnectToReplacement)
        : next.includes(existingConnectionSearch)
      ? next.replace(existingConnectionSearch, existingConnectionReplacement)
      : next.replace(tsExistingConnectionSearch, tsExistingConnectionReplacement);
  }

  if (!hasTopologyPatch) {
    next = next.includes(topologySearch)
      ? next.replace(topologySearch, topologyReplacement)
      : next.replace(tsTopologySearch, tsTopologyReplacement);
  }

  if (next === current) {
    throw new Error(`Unable to patch ${relativePath}`);
  }

  fs.writeFileSync(filePath, next);
  console.log(`Patched ${relativePath}`);
}
