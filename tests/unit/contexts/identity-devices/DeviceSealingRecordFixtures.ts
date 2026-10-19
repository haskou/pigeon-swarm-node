import {
  DeviceSealingRecord,
  DeviceSealingRecordFields,
  DeviceSealingRecordPrimitives,
} from '@app/contexts/identity-devices/domain/DeviceSealingRecord';
import IPFSNetworkRegistry from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkRegistry';
import { OrbitDBPrivateNetworkStores } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBPrivateNetworkStores';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';

import { credentialOf } from './DeviceSealedSecretFixtures';

export const TODAY = '2026-05-02';
export const YESTERDAY = '2026-05-01';
export const NOW = new Date('2026-05-02T12:00:00.000Z');

export const PRIVATE_NETWORK = '550e8400-e29b-41d4-a716-446655440000';
export const PUBLIC_NETWORK = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

export function sealingPublicKeyOf(seed: number): string {
  return Buffer.alloc(32, seed).toString('base64url');
}

export interface SealingRecordInput {
  identityId: string;
  signer: KeyPair;
  deviceCredential?: string;
  utcDay?: string;
  sealingPublicKey?: string;
}

export function fieldsOf(input: SealingRecordInput): DeviceSealingRecordFields {
  return {
    deviceCredential: input.deviceCredential ?? credentialOf(input.signer),
    identityId: input.identityId,
    sealingPublicKey: input.sealingPublicKey ?? sealingPublicKeyOf(1),
    utcDay: input.utcDay ?? TODAY,
  };
}

export function signedRecordPrimitives(
  input: SealingRecordInput,
): DeviceSealingRecordPrimitives {
  const record = fieldsOf(input);

  return {
    record,
    signature: input.signer
      .sign(DeviceSealingRecord.signingContent(record))
      .valueOf(),
  };
}

export function sealingRecordOf(input: SealingRecordInput): DeviceSealingRecord {
  const record = DeviceSealingRecord.fromStored(signedRecordPrimitives(input));
  if (!record) {
    throw new Error('fixture sealing record is malformed');
  }

  return record;
}

export function networkRegistryOf(): IPFSNetworkRegistry {
  return {
    getAll: () => [
      { getId: () => PRIVATE_NETWORK, isPrivate: () => true },
      { getId: () => PUBLIC_NETWORK, isPrivate: () => false },
    ],
  } as unknown as IPFSNetworkRegistry;
}

function storeOf() {
  const entries = new Map<string, unknown>();

  return {
    all: jest.fn(async (): Promise<unknown[]> => []),
    events: { on: jest.fn() },
    get: jest.fn(async (key: string) => entries.get(key)),
    put: jest.fn(
      async (
        keyOrDocument: string | Record<string, unknown>,
        value?: unknown,
      ) => {
        if (typeof keyOrDocument === 'string') {
          entries.set(keyOrDocument, value);

          return keyOrDocument;
        }
        const key = String(keyOrDocument.id);
        entries.set(key, keyOrDocument);

        return key;
      },
    ),
    query: jest.fn(async (): Promise<unknown[]> => []),
  };
}

export function registryStoresOf(): OrbitDBPrivateNetworkStores {
  return {
    calls: storeOf(),
    communityOperations: storeOf(),
    contentReplication: storeOf(),
    conversationOperations: storeOf(),
    getSynchronizationStores: (): unknown[] => [],
    heads: storeOf(),
    identities: storeOf(),
    keychains: storeOf(),
    messages: storeOf(),
    notifications: storeOf(),
    reactions: storeOf(),
    requests: storeOf(),
    stop: jest.fn(async (): Promise<void> => undefined),
  } as unknown as OrbitDBPrivateNetworkStores;
}
