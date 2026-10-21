import 'reflect-metadata';
import 'module-alias/register';
import {
  heliaRuntimeAdapter,
  HeliaInstance,
} from '@app/contexts/shared/infrastructure/ipfs/helia/adapters/HeliaRuntimeAdapter';
import { HeliaIPFS } from '@app/contexts/shared/infrastructure/ipfs/helia/HeliaIPFS';
import ReplicatedStateNotReadyError from '@app/contexts/shared/infrastructure/orbitdb/ReplicatedStateNotReadyError';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const RECORD_KEY = 'record-key';

async function createIpfs(directory: string): Promise<HeliaIPFS> {
  const datastore = await heliaRuntimeAdapter.createFsDatastore(directory);
  const heliaCore = {
    datastore,
    libp2p: {
      addEventListener: (): void => undefined,
      getPeers: (): unknown[] => [],
      services: {},
    },
  } as unknown as HeliaInstance;

  return new (class extends HeliaIPFS {})(heliaCore, {
    distributedHashTableEnabled: false,
    storageLocation: directory,
  });
}

async function main(): Promise<void> {
  const directory = await mkdtemp(path.join(tmpdir(), 'pigeon-fs-datastore-'));

  try {
    const ipfs = await createIpfs(directory);

    assert.equal(
      await ipfs.getRecord(RECORD_KEY),
      undefined,
      'a missing record file reads as absence on a DHT-disabled network',
    );

    await ipfs.putRecord(RECORD_KEY, 'value');
    assert.equal(await ipfs.getRecord(RECORD_KEY), 'value');

    const aborted = new AbortController();

    aborted.abort();
    await assert.rejects(
      ipfs.getRecord(RECORD_KEY, aborted.signal),
      ReplicatedStateNotReadyError,
      'an aborted local read is not absence',
    );

    // A directory where the record file belongs makes readFile fail with
    // EISDIR: a local read failure that is not a missing file.
    const failing = 'failing-record-key';

    await mkdir(path.join(directory, 'records', `${failing}.data`), {
      recursive: true,
    });
    await assert.rejects(
      ipfs.getRecord(failing),
      ReplicatedStateNotReadyError,
      'a local I/O failure is not absence',
    );

    console.info(
      'PASS fs datastore record absence: only a missing file is absence',
    );
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

main().then(
  () => process.exit(0),
  (error: unknown) => {
    console.error(error);
    process.exit(1);
  },
);
