import type { OrbitDBDatabase } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBDatabase';

import {
  heliaRuntimeAdapter,
  HeliaInstance,
} from '@app/contexts/shared/infrastructure/ipfs/helia/adapters/HeliaRuntimeAdapter';
import { HeliaIPFS } from '@app/contexts/shared/infrastructure/ipfs/helia/HeliaIPFS';
import { IPFSId } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSId';
import { OrbitDBMutationGate } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBMutationGate';
import { OrbitDBPrivateNetworkStores } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBPrivateNetworkStores';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import WinstonLogger from '@app/shared/infrastructure/logs/WinstonLogger';
import Kernel from '@haskou/ddd-kernel';
import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import { mock } from 'jest-mock-extended';
import os from 'os';
import path from 'path';
import winston from 'winston';

const IDENTITY_ID = 'f'.repeat(64);
const HEAD_KEY = `identity:${IDENTITY_ID}`;
const HEAD_CID = 'bafyPRIVATEHEADCID';
const CONTENT_CID = 'bafyPRIVATECONTENTCID';
const DAG_PB_CODEC_CODE = 0x70;

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

/**
 * Replicated head keys embed identity ids, handles and keychain owners, and
 * content identifiers name the stored content. Diagnostics on these paths
 * keep only fixed labels.
 */
describe('Replicated state and content log privacy with the real logger', () => {
  let captured: Array<{ level: string; message: unknown }>;
  let directory: string;
  let previous: Record<string, string | undefined>;
  const environmentKeys = ['LOG_LEVEL', 'LOG_URL', 'SERVICE_NAME'];

  function expectLoggedWithout(message: string, values: string[]): void {
    const text = JSON.stringify(captured);

    expect(captured).toContainEqual(expect.objectContaining({ message }));
    for (const value of values) {
      expect(text).not.toContain(value);
    }
  }

  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'pigeon-content-log-'));
    previous = Object.fromEntries(
      environmentKeys.map((key) => [key, process.env[key]]),
    );
    Object.assign(process.env, {
      LOG_LEVEL: 'debug',
      LOG_URL: '.',
      SERVICE_NAME: 'content-privacy',
    });
    captured = [];
    jest.spyOn(Kernel, 'rootDirectory', 'get').mockReturnValue(directory);
    jest
      .spyOn(winston.transports.Console.prototype, 'log')
      .mockImplementation((info, callback) => {
        captured.push(info as { level: string; message: unknown });

        if (typeof callback === 'function') callback();
      });
    jest.spyOn(Kernel, 'logger', 'get').mockReturnValue(new WinstonLogger());
  });

  afterEach(async () => {
    for (const key of environmentKeys) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
    await fs.rm(directory, { force: true, recursive: true });
    jest.restoreAllMocks();
  });

  it('does not log the head key or its identity when a mutation gate rejects a replicated head', async () => {
    const events = new EventEmitter();
    const heads = mock<OrbitDBDatabase>({
      all: () => Promise.resolve([]),
      events,
    });
    const gate = mock<OrbitDBMutationGate>();
    const registry = new OrbitDBReplicatedStateRegistry();

    gate.governs.mockReturnValue(false);
    gate.governsHead.mockReturnValue(true);
    gate.acceptsHead.mockRejectedValue(
      new Error(`unsigned head ${HEAD_KEY} ${HEAD_CID}`),
    );
    registry.addMutationGate(gate);
    await registry.register(
      'network-1',
      mock<OrbitDBPrivateNetworkStores>({ heads }),
    );
    events.emit('update', {
      payload: {
        key: HEAD_KEY,
        value: {
          cid: HEAD_CID,
          ownerIdentityId: IDENTITY_ID,
          receivedAt: 200,
          version: 1,
        },
      },
    });
    await flushPromises();
    await flushPromises();

    await expect(registry.findHead(HEAD_KEY)).resolves.toBeUndefined();
    expectLoggedWithout('Rejected unauthenticated replicated head', [
      IDENTITY_ID,
      HEAD_CID,
      'identity:',
    ]);
  });

  it('does not log the content identifier when DAG traversal fails during block deletion', async () => {
    const parsedCid = {
      code: DAG_PB_CODEC_CODE,
      toString: () => CONTENT_CID,
    };
    const heliaCore = {
      blockstore: {
        delete: jest.fn().mockResolvedValue(undefined),
        get: jest.fn().mockRejectedValue(new Error(`${CONTENT_CID} missing`)),
        has: jest.fn().mockResolvedValue(true),
      },
      libp2p: { addEventListener: jest.fn(), services: {} },
      pins: { isPinned: jest.fn().mockResolvedValue(false) },
    } as unknown as HeliaInstance;
    const ipfs = new (class extends HeliaIPFS {})(heliaCore, {
      storageLocation: 'memory',
    });

    jest
      .spyOn(heliaRuntimeAdapter, 'parseCid')
      .mockResolvedValue(parsedCid as never);

    await ipfs.removeJSON(new IPFSId(CONTENT_CID));

    expect(heliaCore.blockstore.delete).toHaveBeenCalledWith(
      parsedCid,
      expect.anything(),
    );
    expectLoggedWithout('Skipped IPFS DAG traversal for block deletion', [
      CONTENT_CID,
      'PRIVATECONTENT',
    ]);
  });
});
