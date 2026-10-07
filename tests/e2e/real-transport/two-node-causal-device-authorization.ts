import 'reflect-metadata';
import IdentityRepository from '@app/contexts/identities/domain/repositories/IdentityRepository';
import { DeviceCredential } from '@app/contexts/identities/domain/value-objects/DeviceCredential';
import { IdentityExternalIdentifier } from '@app/contexts/identities/domain/value-objects/IdentityExternalIdentifier';
import { IdentityVersion } from '@app/contexts/identities/domain/value-objects/IdentityVersion';
import { RecoveryAuthority } from '@app/contexts/identities/domain/value-objects/RecoveryAuthority';
import { DeviceAuthorization } from '@app/contexts/identity-devices/domain/DeviceAuthorization';
import { DeviceAuthorizationTransition } from '@app/contexts/identity-devices/domain/DeviceAuthorizationTransition';
import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import PublicMutationVerifier from '@app/contexts/public-mutations/domain/services/PublicMutationVerifier';
import DeviceAuthorizationPublicMutationAuthorization from '@app/contexts/public-mutations/infrastructure/DeviceAuthorizationPublicMutationAuthorization';
import DeviceAuthorizationPolicy from '@app/contexts/identity-devices/domain/services/DeviceAuthorizationPolicy';
import { DeviceAuthorizationOperationId } from '@app/contexts/identity-devices/domain/value-objects/DeviceAuthorizationOperationId';
import { DeviceAuthorizationRevision } from '@app/contexts/identity-devices/domain/value-objects/DeviceAuthorizationRevision';
import { PairingAuthorization } from '@app/contexts/identity-devices/domain/value-objects/PairingAuthorization';
import { PairingExpiration } from '@app/contexts/identity-devices/domain/value-objects/PairingExpiration';
import { PairingId } from '@app/contexts/identity-devices/domain/value-objects/PairingId';
import OrbitDBDeviceAuthorizationRepository from '@app/contexts/identity-devices/infrastructure/orbitdb/OrbitDBDeviceAuthorizationRepository';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import {
  HeliaInstance,
  heliaRuntimeAdapter,
} from '@app/contexts/shared/infrastructure/ipfs/helia/adapters/HeliaRuntimeAdapter';
import { HeliaIPFS } from '@app/contexts/shared/infrastructure/ipfs/helia/HeliaIPFS';
import IPFSNetworkRegistry from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkRegistry';
import { OrbitDBDatabase } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBDatabase';
import { OrbitDBInstance } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBInstance';
import { OrbitDBPrivateNetworkStores } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBPrivateNetworkStores';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import { orbitDBRuntimeAdapter } from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBRuntimeAdapter';
import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';
import Kernel from '@haskou/ddd-kernel';
import { KeyPair, PrivateKey } from '@haskou/pigeon-swarm-crypto';
import { Timestamp } from '@haskou/value-objects';
import assert from 'node:assert/strict';
import { generateKeyPairSync, randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { teardownAndExit } from './RealTransportTeardown';

interface Replica {
  helia: HeliaInstance;
  name: string;
  orbitdb?: OrbitDBInstance;
  registry?: OrbitDBReplicatedStateRegistry;
  repository?: OrbitDBDeviceAuthorizationRepository;
  stores?: { heads: OrbitDBDatabase; identities: OrbitDBDatabase };
}

const networkId = randomUUID();
const nodes: Replica[] = [];
const now = new Timestamp(1_800_000_000_000);
let root: string;
let stage = 'setup';

const pause = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function until(
  label: string,
  condition: () => boolean | Promise<boolean>,
): Promise<void> {
  const deadline = Date.now() + 25_000;

  while (Date.now() < deadline) {
    if (await condition()) return;
    await pause(100);
  }

  throw new Error(`Timed out: ${label}`);
}

async function open(replica: Replica): Promise<void> {
  replica.orbitdb = await orbitDBRuntimeAdapter.createOrbitDB({
    directory: path.join(root, replica.name, 'orbitdb'),
    id: replica.name,
    ipfs: replica.helia,
  });
  const AccessController =
    await orbitDBRuntimeAdapter.createPrivateNetworkAccessController();
  replica.stores = {
    heads: await replica.orbitdb.open(`${networkId}/heads`, {
      AccessController,
      sync: false,
      type: 'keyvalue',
    }),
    identities: await replica.orbitdb.open(`${networkId}/identities`, {
      AccessController,
      Database: await orbitDBRuntimeAdapter.createDocumentsDatabase(),
      sync: false,
      type: 'documents',
    }),
  };
  for (const store of Object.values(replica.stores))
    store.events.on('error', () => undefined);
  replica.registry = new OrbitDBReplicatedStateRegistry();
  process.env.PIGEON_LOCAL_DB_PATH = path.join(root, replica.name, 'local');
  const localDatabase = new EmbeddedLocalDatabase();

  replica.repository = new OrbitDBDeviceAuthorizationRepository(
    replica.registry,
    new DeviceAuthorizationPolicy(),
    {} as IdentityRepository,
    {
      getAll: () => [
        {
          getId: () => networkId,
          isPrivate: () => true,
        },
      ],
    } as IPFSNetworkRegistry,
    localDatabase,
  );
  await replica.registry.register(
    networkId,
    replica.stores as unknown as OrbitDBPrivateNetworkStores,
  );
}

async function connect(): Promise<void> {
  const address = nodes[1].helia.libp2p
    .getMultiaddrs()
    .find((value) => value.toString().startsWith('/ip4/127.0.0.1/tcp/'));
  assert.ok(address, 'The second fixture peer must listen on loopback');
  const target = await heliaRuntimeAdapter.createMultiaddr(address.toString());
  await until('private peers connect', async () => {
    try {
      await nodes[0].helia.libp2p.dial(target);

      return true;
    } catch {
      return false;
    }
  });
}

async function startSynchronization(): Promise<void> {
  for (const node of nodes)
    for (const store of Object.values(node.stores!)) {
      assert.ok(store.sync, 'Real OrbitDB synchronization is required');
      await store.sync.start();
    }
}

async function verifyExchange(): Promise<void> {
  await until('OrbitDB peers join', () =>
    nodes.every((node) =>
      Object.values(node.stores!).every(
        (store) => (store.peers?.size ?? 0) > 0,
      ),
    ),
  );
  for (let index = 0; index < nodes.length; index += 1) {
    const key = `fixture-exchange:${randomUUID()}:${index}`;
    const sentinel = { id: key, nonce: randomUUID() };
    await nodes[index].stores!.heads.put!(key, sentinel);
    await nodes[index].stores!.identities.put!(sentinel);
    await until('OrbitDB stores exchange', async () => {
      for (const node of nodes) {
        if (!isDeepStrictEqual(await node.stores!.heads.get!(key), sentinel))
          return false;
        const identities = await node.stores!.identities.query!(
          (record) => record.id === key,
        );

        if (!identities.some((record) => isDeepStrictEqual(record, sentinel)))
          return false;
      }

      return true;
    });
  }
}

function enrollment(
  identityId: IdentityId,
  owner: KeyPair,
  target: KeyPair,
  operationId: string,
  pairingId: string,
  previousRevision = DeviceAuthorizationRevision.initial(),
): DeviceAuthorizationTransition {
  const unsigned = DeviceAuthorizationTransition.enrollment(
    identityId,
    new DeviceAuthorizationOperationId(operationId),
    previousRevision,
    DeviceCredential.fromString(owner.toPrimitives().publicKey),
    DeviceCredential.fromString(target.toPrimitives().publicKey),
    new PairingAuthorization(
      new PairingId(pairingId),
      new PairingExpiration(now.valueOf() + 60_000),
      now,
    ),
  );

  const proven = unsigned.provePossession(
    target.sign(unsigned.getProofOfPossessionPayload()),
  );

  return proven.authorize(owner.sign(proven.getSigningPayload()));
}

function revocation(
  identityId: IdentityId,
  owner: KeyPair,
  target: KeyPair,
  operationId: string,
  previousRevision: number,
): DeviceAuthorizationTransition {
  const unsigned = DeviceAuthorizationTransition.revocation(
    identityId,
    new DeviceAuthorizationOperationId(operationId),
    new DeviceAuthorizationRevision(previousRevision),
    DeviceCredential.fromString(owner.toPrimitives().publicKey),
    DeviceCredential.fromString(target.toPrimitives().publicKey),
  );

  return unsigned.authorize(owner.sign(unsigned.getSigningPayload()));
}

function proofOf(
  identityId: IdentityId,
  device: KeyPair,
  authorizationRevision: number,
  operation: string,
): {
  expectation: Parameters<PublicMutationVerifier['verify']>[1];
  proof: PublicMutationProof;
} {
  const payload = {
    authorIdentityId: identityId.valueOf(),
    id: `fixture:${operation}`,
    scopeType: 'causal_authorization_fixture',
  };
  const body = {
    author: {
      authorizationRevision,
      deviceCredential: device.toPrimitives().publicKey,
      identityId: identityId.valueOf(),
    },
    kind: 'put' as const,
    operationId: randomBytes(16).toString('base64url'),
    payloadDigest: PublicMutationProof.digestOf(payload),
    predecessor: null,
    recordId: payload.id,
    sequence: 0,
    store: 'fixtures',
    version: 2 as const,
  };

  return {
    expectation: {
      authorIdentityId: identityId.valueOf(),
      payload,
      recordId: payload.id,
      store: 'fixtures',
    },
    proof: PublicMutationProof.signed(
      body,
      device.sign(PublicMutationProof.signingContentOf(body)),
    ),
  };
}

async function verdict(
  node: Replica,
  identityId: IdentityId,
  device: KeyPair,
  authorizationRevision: number,
): Promise<boolean> {
  const { expectation, proof } = proofOf(
    identityId,
    device,
    authorizationRevision,
    `claim${authorizationRevision}${device.toPrimitives().publicKey.slice(-8)}`,
  );
  const verifier = new PublicMutationVerifier(
    new DeviceAuthorizationPublicMutationAuthorization(node.repository!),
  );

  try {
    await verifier.verify(proof, expectation);

    return true;
  } catch {
    return false;
  }
}

async function expectVerdicts(
  label: string,
  node: Replica,
  identityId: IdentityId,
  cases: Array<[string, KeyPair, number, boolean]>,
): Promise<void> {
  for (const [name, device, revision, expected] of cases) {
    assert.equal(
      await verdict(node, identityId, device, revision),
      expected,
      `${label}: ${name} claiming revision ${revision} must be ${expected ? 'accepted' : 'refused'}`,
    );
  }
}

async function restart(
  replica: Replica,
  genesis: DeviceAuthorization,
): Promise<void> {
  await replica.registry!.clear();
  for (const store of Object.values(replica.stores!)) await store.close();
  await replica.orbitdb!.stop();
  await open(replica);
  await replica.repository!.provision(
    genesis,
    new IdentityVersion(1),
    new IdentityExternalIdentifier('bafy-genesis'),
  );
}

async function main(): Promise<void> {
  root = await mkdtemp(path.join(tmpdir(), 'pigeon-causal-authorization-'));
  process.env.NODE_ENV = 'test';
  process.env.PIGEON_PUBLIC_BOOTSTRAP_ENABLED = 'false';
  const noop = (): void => undefined;
  new Kernel({ logger: { debug: noop, error: noop, info: noop, warn: noop } });
  const swarmKey = new PrivateKey(
    generateKeyPairSync('ed25519')
      .privateKey.export({ format: 'pem', type: 'pkcs8' })
      .toString(),
  );

  for (const name of ['first', 'second']) {
    const helia = await HeliaIPFS.createPrivateHeliaCore(
      {
        contentRoutingEnabled: false,
        distributedHashTableEnabled: false,
        listenAddresses: ['/ip4/127.0.0.1/tcp/0'],
        localPeerDiscoveryEnabled: false,
        manualRelayMultiaddrs: [],
        publicRelayDiscoveryEnabled: false,
        storageLocation: path.join(root, name, 'ipfs'),
      },
      swarmKey,
      networkId,
    );
    const replica = { helia, name };
    nodes.push(replica);
    await open(replica);
  }

  const identity = await KeyPair.generate();
  const owner = await KeyPair.generate();
  const recovery = await KeyPair.generate();
  const phone = await KeyPair.generate();
  const laptop = await KeyPair.generate();
  const identityId = new IdentityId(identity.toPrimitives().publicKey);
  const genesis = DeviceAuthorization.genesis(
    identityId,
    [new NetworkId(networkId)],
    DeviceCredential.fromString(owner.toPrimitives().publicKey),
    RecoveryAuthority.fromString(recovery.toPrimitives().publicKey),
  );
  await Promise.all(
    nodes.map((node) =>
      node.repository!.provision(
        genesis,
        new IdentityVersion(1),
        new IdentityExternalIdentifier('bafy-genesis'),
      ),
    ),
  );

  stage = 'partitioned authorization history';
  const [first, second] = nodes;

  // revision 0: owner. 1: + phone. 2: phone revoked. 3: + laptop.
  await first.repository!.compareAndApply(
    enrollment(
      identityId,
      owner,
      phone,
      '00000000-0000-4000-8000-000000000011',
      '10000000-0000-4000-8000-000000000011',
    ),
  );
  await first.repository!.compareAndApply(
    revocation(
      identityId,
      owner,
      phone,
      '00000000-0000-4000-8000-000000000012',
      1,
    ),
  );
  await first.repository!.compareAndApply(
    enrollment(
      identityId,
      owner,
      laptop,
      '00000000-0000-4000-8000-000000000013',
      '10000000-0000-4000-8000-000000000013',
      new DeviceAuthorizationRevision(2),
    ),
  );

  await expectVerdicts('author node', first, identityId, [
    ['phone before revocation', phone, 1, true],
    ['phone backdating at the revocation revision', phone, 2, false],
    ['phone claiming the current head', phone, 3, false],
    ['phone claiming an unknown future revision', phone, 4, false],
    ['laptop not yet enrolled', laptop, 2, false],
    ['laptop at its enrolment', laptop, 3, true],
    ['owner at every revision', owner, 2, true],
  ]);
  await expectVerdicts('partitioned node', second, identityId, [
    ['owner at the only known revision', owner, 0, true],
    ['phone record signed at revision 1, not replicated yet', phone, 1, false],
    ['owner claiming an unreplicated revision', owner, 3, false],
  ]);

  stage = 'real OrbitDB convergence';
  await connect();
  await startSynchronization();
  await verifyExchange();
  await until('the partitioned replica reaches the head', async () => {
    const authorization = await second.repository!.find(identityId);

    return authorization?.toPrimitives().revision === 3;
  });

  stage = 'revocation then late delivery';
  const afterHeal: Array<[string, KeyPair, number, boolean]> = [
    [
      'phone record signed before the revocation, delivered late',
      phone,
      1,
      true,
    ],
    ['phone backdating at the revocation revision', phone, 2, false],
    ['phone claiming the current head', phone, 3, false],
    ['phone claiming an unknown future revision', phone, 4, false],
    ['laptop not yet enrolled', laptop, 2, false],
    ['laptop at its enrolment', laptop, 3, true],
    ['owner at the head', owner, 3, true],
  ];
  await expectVerdicts('healed node', second, identityId, afterHeal);
  await expectVerdicts('author node after heal', first, identityId, afterHeal);

  stage = 'restart recovery';
  await restart(second, genesis);
  await expectVerdicts('restarted node', second, identityId, afterHeal);

  console.log(
    'PASS causal device authorization: two real private Helia/OrbitDB replicas evaluated signed records at the claimed authorization revision (late delivery honoured, backdating past the revocation refused, unreplicated revisions refused until healed, identical verdicts after a restart). Local loopback transport only; no external NAT claim.',
  );
}

const watchdog = setTimeout(() => {
  console.error(`FAIL causal device authorization during ${stage}`);
  process.exit(1);
}, 180_000);

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(`FAIL causal device authorization during ${stage}`);
    process.exitCode = 1;
  })
  .finally(() => {
    clearTimeout(watchdog);

    return teardownAndExit(nodes, root);
  });
