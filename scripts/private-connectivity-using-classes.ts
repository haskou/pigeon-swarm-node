// timeout 90s tsx "scripts/private-connectivity-using-classes.ts"
// TODO: Create cucumber test like this
import { PrivateKey } from '@haskou/value-objects';
import * as fs from 'fs/promises';

import Kernel from '../src/Kernel';
import IPFS from '../src/contexts/shared/infrastructure/ipfs/IPFS';
import IPFSContentRacer from '../src/contexts/shared/infrastructure/ipfs/helia/IPFSContentRacer';
import { IPFSConnection } from '../src/contexts/shared/infrastructure/ipfs/helia/IPFSConnection';
import { IPFSNetworkConfig } from '../src/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkConfig';
import IPFSNetworkRegistry from '../src/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkRegistry';
import { PrivateIPFS } from '../src/contexts/shared/infrastructure/ipfs/networks/PrivateIPFS';
import { PublicIPFS } from '../src/contexts/shared/infrastructure/ipfs/networks/PublicIPFS';

type InternalHeliaIPFSConnection = IPFSConnection & {
  heliaCore?: {
    stop: () => Promise<void>;
    libp2p: {
      dial: (
        address: Array<{ toString(): string }> | { toString(): string },
      ) => Promise<void>;
      getMultiaddrs: () => Array<{ toString(): string }>;
    };
  };
};

type InternalIPFSNetwork = {
  connection?: IPFSConnection;
};

async function waitForPeerConnection(
  node: IPFSConnection,
  timeoutMs: number,
): Promise<boolean> {
  const startAt = Date.now();

  while (Date.now() - startAt < timeoutMs) {
    if (node.getPeers().length > 0) {
      return true;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  return false;
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timeoutHandle: NodeJS.Timeout | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(`${label} timed out after ${timeoutMs}ms.`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

async function expectFailure<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<Error> {
  const unexpectedSuccessMessage = `${label} unexpectedly succeeded.`;

  try {
    await withTimeout(promise, timeoutMs, label);
    throw new Error(unexpectedSuccessMessage);
  } catch (error: unknown) {
    const resolvedError = error as Error;

    if (resolvedError.message === unexpectedSuccessMessage) {
      throw resolvedError;
    }

    return resolvedError;
  }
}

async function stopNode(node: IPFSConnection): Promise<void> {
  const internalNode = node as InternalHeliaIPFSConnection;

  if (internalNode.heliaCore) {
    await internalNode.heliaCore.stop();
  }
}

async function connectNodes(
  source: IPFSConnection,
  target: IPFSConnection,
): Promise<void> {
  const sourceNode = source as InternalHeliaIPFSConnection;
  const targetNode = target as InternalHeliaIPFSConnection;

  if (!sourceNode.heliaCore || !targetNode.heliaCore) {
    throw new Error('Cannot access Helia core to connect nodes.');
  }

  const targetAddresses = targetNode.heliaCore.libp2p.getMultiaddrs();

  if (targetAddresses.length === 0) {
    throw new Error('Target node has no multiaddrs to dial.');
  }

  await sourceNode.heliaCore.libp2p.dial(targetAddresses);
}

async function main(): Promise<void> {
  (Kernel as unknown as { _logs: unknown })._logs = {
    error: (...args: unknown[]): void => {
      console.error(...args);
    },
    info: (...args: unknown[]): void => {
      console.log(...args);
    },
    warn: (...args: unknown[]): void => {
      console.warn(...args);
    },
  };

  const testId = Date.now();
  const node1Path = `./tmp/private-ipfs-node-1-${testId}`;
  const node2Path = `./tmp/private-ipfs-node-2-${testId}`;
  const node3Path = `./tmp/private-ipfs-node-3-${testId}`;
  const publicNodePath = `./tmp/public-ipfs-node-${testId}`;

  await fs.mkdir('./tmp', { recursive: true });
  await fs.rm(node1Path, { force: true, recursive: true });
  await fs.rm(node2Path, { force: true, recursive: true });
  await fs.rm(node3Path, { force: true, recursive: true });
  await fs.rm(publicNodePath, { force: true, recursive: true });

  const networkPem =
    '-----BEGIN PRIVATE KEY-----\n' +
    'MC4CAQAwBQYDK2VwBCIEIOQZ/Tt+5x5FIMXjz2/x1VOSQRVcSF0opaFDdeyMqJXa\n' +
    '-----END PRIVATE KEY-----\n';
  const networkKey = PrivateKey.fromPEM(networkPem);

  const previousStoragePath = process.env.IPFS_STORAGE_PATH;

  let node1: IPFSConnection | undefined;
  let node2: IPFSConnection | undefined;
  let node3: IPFSConnection | undefined;
  let publicNode: IPFSConnection | undefined;

  try {
    node2 = await PrivateIPFS.create({
      key: networkKey,
      name: 'local-private-check',
      storageLocation: node2Path,
    });

    node1 = await PrivateIPFS.create({
      key: networkKey,
      name: 'local-private-check',
      storageLocation: node1Path,
    });

    process.env.IPFS_STORAGE_PATH = node3Path;

    publicNode = await PublicIPFS.create({
      storageLocation: publicNodePath,
    });

    const ipfs = new IPFS(new IPFSNetworkRegistry(), new IPFSContentRacer());
    await ipfs.initialize();
    await ipfs.registerNetwork(
      new IPFSNetworkConfig('local-private-check', networkKey),
    );

    const ipfsNetworkName = 'local-private-check';

    const ipfsPrivateNetwork = await ipfs.getNetwork(ipfsNetworkName);
    node3 = (ipfsPrivateNetwork as unknown as InternalIPFSNetwork)
      .connection as IPFSConnection;

    await connectNodes(node1, node2);
    await connectNodes(node3, node1);
    await connectNodes(node2, node3);

    const connected = await waitForPeerConnection(node1, 15000);
    const node2Connected = await waitForPeerConnection(node2, 15000);
    const node3Connected = await waitForPeerConnection(node3, 15000);

    console.log('node1 peerId:', node1.getPeerId());
    console.log('node2 peerId:', node2.getPeerId());
    console.log('node3 peerId:', ipfsPrivateNetwork.getPeerId());
    console.log('node1 peers:', node1.getPeers());
    console.log('node2 peers:', node2.getPeers());
    console.log('node3 peers:', ipfsPrivateNetwork.getPeers());

    if (!connected) {
      throw new Error(
        'Nodes did not connect in private network within timeout.',
      );
    }

    if (!node3Connected) {
      throw new Error(
        'IPFS class network did not connect in private network within timeout.',
      );
    }

    if (!node2Connected) {
      throw new Error(
        'Node2 did not connect in private network within timeout.',
      );
    }

    const payload = {
      message: 'private-ipfs-from-node2',
      time: new Date().toISOString(),
    };

    console.log('Step: add JSON on node1...');
    const cid = await node1.addJSON(payload);

    console.log('Step: fetch JSON from IPFS class private network...');
    const fetched = await withTimeout(
      ipfs.getJSONFromNetwork<typeof payload>(cid, ipfsNetworkName),
      20000,
      'IPFS class getJSONFromNetwork',
    );

    console.log('Step: verify public network cannot fetch private JSON...');
    const publicToPrivateError = await expectFailure(
      publicNode.getJSON<typeof payload>(cid),
      10000,
      'public network getJSON for private CID',
    );

    console.log(
      'expected public -> private failure:',
      publicToPrivateError.message,
    );

    const payloadFromIpfs = {
      message: 'private-ipfs-from-ipfs-class',
      time: new Date().toISOString(),
    };

    console.log('Step: add JSON through IPFS class...');
    const cidFromIpfs = await withTimeout(
      ipfs.addJSON(payloadFromIpfs, ipfsNetworkName),
      20000,
      'IPFS class addJSON',
    );

    console.log('Step: fetch JSON from node2...');
    const fetchedFromNode2 = await withTimeout(
      node2.getJSON<typeof payloadFromIpfs>(cidFromIpfs),
      20000,
      'node2 getJSON',
    );

    const publicPayload = {
      message: 'public-ipfs-from-public-node',
      time: new Date().toISOString(),
    };

    console.log('Step: add JSON on public node...');
    const publicCid = await publicNode.addJSON(publicPayload);

    console.log('Step: verify private network cannot fetch public JSON...');
    const privateToPublicError = await expectFailure(
      ipfs.getJSONFromNetwork<typeof publicPayload>(publicCid, ipfsNetworkName),
      10000,
      'private network getJSON for public CID',
    );

    console.log(
      'expected private -> public failure:',
      privateToPublicError.message,
    );

    console.log('cid:', cid.valueOf());
    console.log('fetched payload:', fetched);
    console.log('cid from ipfs class:', cidFromIpfs.valueOf());
    console.log('fetched from node2:', fetchedFromNode2);
    console.log('public cid:', publicCid.valueOf());

    if (fetched.message !== payload.message) {
      throw new Error('Fetched payload does not match the published payload.');
    }

    if (fetchedFromNode2.message !== payloadFromIpfs.message) {
      throw new Error(
        'Fetched payload from node2 does not match the IPFS class payload.',
      );
    }

    console.log(
      'OK: private nodes exchange content end-to-end and public/private networks remain isolated in both directions.',
    );
  } finally {
    console.log('Checkpoint: cleanup starting...');

    if (previousStoragePath !== undefined) {
      process.env.IPFS_STORAGE_PATH = previousStoragePath;
    } else {
      delete process.env.IPFS_STORAGE_PATH;
    }

    if (node1) {
      await withTimeout(stopNode(node1), 5000, 'stop node1').catch((error) => {
        console.warn((error as Error).message);
      });
    }

    if (node2) {
      await withTimeout(stopNode(node2), 5000, 'stop node2').catch((error) => {
        console.warn((error as Error).message);
      });
    }

    if (node3) {
      await withTimeout(stopNode(node3), 5000, 'stop node3').catch((error) => {
        console.warn((error as Error).message);
      });
    }

    if (publicNode) {
      await withTimeout(stopNode(publicNode), 5000, 'stop public node').catch(
        (error) => {
          console.warn((error as Error).message);
        },
      );
    }

    console.log('Checkpoint: cleanup finished.');
  }
}

void main()
  .then(() => {
    process.exit(0);
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
