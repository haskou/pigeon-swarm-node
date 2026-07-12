import 'reflect-metadata';
import 'module-alias/register';

import Kernel from '@haskou/ddd-kernel';
import { IPFSConnection } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSConnection';
import { PrivateIPFS } from '@app/contexts/shared/infrastructure/ipfs/networks/PrivateIPFS';
import { PrivateKey } from '@haskou/value-objects';
import { generateKeyPairSync, randomBytes } from 'crypto';
import fs from 'fs-extra';
import path from 'path';

const ROOT = path.resolve(__dirname, '../../..');
const TMP_ROOT = path.join(ROOT, '.tmp', 'two-private-ipfs-relay-e2e');
const WAIT_TIMEOUT_MS = 30000;
const FETCH_TIMEOUT_MS = Number(
  process.env.PRIVATE_IPFS_RELAY_E2E_FETCH_TIMEOUT_MS || 10000,
);
const NETWORK_NAME = 'private-ipfs-relay-e2e';

type PrivateIPFSNode = {
  connection: IPFSConnection;
  name: string;
};

async function main(): Promise<void> {
  await fs.remove(TMP_ROOT);
  configureTestLogger();

  const networkKey = new PrivateKey(generateNetworkKey());
  const relay = await createNode('relay', networkKey, {
    enableRelayServer: true,
    listenAddresses: ['/ip4/127.0.0.1/tcp/0'],
    relayDataLimitBytes: 16 * 1024 * 1024,
  });
  let provider: PrivateIPFSNode | undefined;
  let requester: PrivateIPFSNode | undefined;

  try {
    const relayAddress = await waitForMultiaddr(
      relay.connection,
      (multiaddr) =>
        multiaddr.includes('/ip4/127.0.0.1/tcp/') &&
        !multiaddr.includes('/p2p-circuit'),
      'relay direct multiaddr',
    );

    provider = await createNode('provider', networkKey, {
      listenAddresses: [`${relayAddress}/p2p-circuit`],
    });
    requester = await createNode('requester', networkKey, {
      listenAddresses: [`${relayAddress}/p2p-circuit`],
    });

    await provider.connection.dial(relayAddress);
    await requester.connection.dial(relayAddress);

    const providerCircuitAddress = await waitForMultiaddr(
      provider.connection,
      (multiaddr) => multiaddr.includes('/p2p-circuit'),
      'provider circuit relay multiaddr',
    );
    const requesterCircuitAddress = await waitForMultiaddr(
      requester.connection,
      (multiaddr) => multiaddr.includes('/p2p-circuit'),
      'requester circuit relay multiaddr',
    );

    await requester.connection.dial(providerCircuitAddress);
    await provider.connection.dial(requesterCircuitAddress);
    await waitForPeer(requester.connection, provider.connection.getPeerId());
    await waitForPeer(provider.connection, requester.connection.getPeerId());

    await assertRemoteFetch(provider.connection, requester.connection, 64 * 1024);
    await assertRemoteFetch(
      provider.connection,
      requester.connection,
      1024 * 1024 + 1,
    );

    console.info(
      JSON.stringify(
        {
          providerPeerId: provider.connection.getPeerId(),
          requesterPeerId: requester.connection.getPeerId(),
          result: 'PASS',
          transportDsn: 'private-ipfs-circuit-relay://',
        },
        null,
        2,
      ),
    );
  } finally {
    await Promise.allSettled([
      requester?.connection.stop(),
      provider?.connection.stop(),
      relay.connection.stop(),
    ]);
    await fs.remove(TMP_ROOT);
  }
}

function configureTestLogger(): void {
  const noop = (): void => undefined;

  new Kernel({
    logger: {
      debug: noop,
      error: (message: string): void => console.error(message),
      info: noop,
      warn: (message: string): void => console.warn(message),
    },
  });
}

async function createNode(
  name: string,
  networkKey: PrivateKey,
  options: {
    enableRelayServer?: boolean;
    listenAddresses: string[];
    relayDataLimitBytes?: number;
  },
): Promise<PrivateIPFSNode> {
  return {
    connection: await PrivateIPFS.create({
      key: networkKey,
      name: NETWORK_NAME,
      storageLocation: path.join(TMP_ROOT, name, 'ipfs'),
      ...options,
    }),
    name,
  };
}

function generateNetworkKey(): string {
  const { privateKey } = generateKeyPairSync('ed25519');

  return privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
}

async function assertRemoteFetch(
  provider: IPFSConnection,
  requester: IPFSConnection,
  sizeBytes: number,
): Promise<void> {
  const bytes = randomBytes(sizeBytes);
  const cid = await provider.addBytes(bytes);
  const fetched = await withTimeout(
    (signal) => requester.getBytes(cid, signal),
    FETCH_TIMEOUT_MS,
    `fetch ${cid.valueOf()} ${JSON.stringify({
      provider: describeConnection(provider),
      requester: describeConnection(requester),
      sizeBytes,
    })}`,
  );

  if (!Buffer.from(bytes).equals(fetched)) {
    throw new Error(`Fetched bytes mismatch for ${cid.valueOf()}`);
  }
}

function describeConnection(connection: IPFSConnection): {
  multiaddrs: string[];
  peerId: string;
  peers: string[];
} {
  return {
    multiaddrs: connection.getMultiaddrs(),
    peerId: connection.getPeerId(),
    peers: connection.getPeers(),
  };
}

async function waitForMultiaddr(
  connection: IPFSConnection,
  predicate: (multiaddr: string) => boolean,
  label: string,
): Promise<string> {
  return waitFor(() => connection.getMultiaddrs().find(predicate), label);
}

async function waitForPeer(
  connection: IPFSConnection,
  peerId: string,
): Promise<void> {
  await waitFor(
    () =>
      connection
        .getPeers()
        .find((connectedPeerId) => connectedPeerId === peerId),
    `peer ${peerId}`,
  );
}

async function waitFor<T>(
  getter: () => T | undefined,
  label: string,
): Promise<T> {
  const deadline = Date.now() + WAIT_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const result = getter();

    if (result !== undefined) {
      return result;
    }

    await sleep(250);
  }

  throw new Error(`Timed out waiting for ${label}`);
}

async function withTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout>;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(new Error(`Timed out waiting for ${label}`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([
      operation(controller.signal),
      timeoutPromise,
    ]);
  } finally {
    clearTimeout(timeout!);
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
