import PrivateCommunityControlApplier from '@app/contexts/communities/application/apply-private-control/PrivateCommunityControlApplier';
import { Community } from '@app/contexts/communities/domain/Community';
import { PrivateOperationAcceptMessage } from '@app/contexts/private-authorization/application/accept-operation/messages/PrivateOperationAcceptMessage';
import PrivateOperationAcceptor from '@app/contexts/private-authorization/application/accept-operation/PrivateOperationAcceptor';
import { PrivateAuthorizationCheckpoint } from '@app/contexts/private-authorization/domain/PrivateAuthorizationCheckpoint';
import { PrivateAuthorizationScope } from '@app/contexts/private-authorization/domain/PrivateAuthorizationScope';
import PrivateControlOperationContract from '@app/contexts/private-authorization/infrastructure/contracts/PrivateControlOperationContract';
import LegacyIdentityDeviceBinding from '@app/contexts/private-authorization/infrastructure/crypto/LegacyIdentityDeviceBinding';
import PrivateControlTransitionVerifier from '@app/contexts/private-authorization/infrastructure/crypto/PrivateControlTransitionVerifier';
import PrivateFreshnessVerifier from '@app/contexts/private-authorization/infrastructure/crypto/PrivateFreshnessVerifier';
import PrivateMlsPolicyVerifier from '@app/contexts/private-authorization/infrastructure/crypto/PrivateMlsPolicyVerifier';
import PrivateOperationVerifier from '@app/contexts/private-authorization/infrastructure/crypto/PrivateOperationVerifier';
import VerifiedPrivateControlTransitionProcessor from '@app/contexts/private-authorization/infrastructure/crypto/VerifiedPrivateControlTransitionProcessor';
import InMemoryPrivateFreshnessGate from '@app/contexts/private-authorization/infrastructure/freshness/InMemoryPrivateFreshnessGate';
import LocalPrivateAuthorizationRepository from '@app/contexts/private-authorization/infrastructure/local-db/LocalPrivateAuthorizationRepository';
import PrivateAuthorizationStorageCoordinator from '@app/contexts/private-authorization/infrastructure/PrivateAuthorizationStorageCoordinator';
import LocalPrivateOperationUnitOfWork from '@app/contexts/private-authorization/infrastructure/local-db/LocalPrivateOperationUnitOfWork';
import { PrivateAuthorizationLocalNamespaces } from '@app/contexts/private-authorization/infrastructure/local-db/PrivateAuthorizationLocalNamespaces';
import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';
import {
  PrivateFreshnessProof,
  PrivateKey,
  PrivateOperationSignature,
} from '@haskou/pigeon-swarm-crypto';
import canonicalize from 'canonicalize';
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign,
} from 'crypto';
import fs from 'fs-extra';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';

interface ControlPolicy {
  authorityKeys: string[];
  devices: Array<{ deviceKey: string; mlsCredentialHash: string }>;
  freshnessAuthorityKey: string;
  leaseRevocationHpkeKey: string;
  leaseRevocationKey: string;
  sequencerKey: string;
  threshold: number;
  version: number;
}

class AuthorizationNode {
  public readonly acceptor: PrivateOperationAcceptor;
  public readonly database: EmbeddedLocalDatabase;
  public readonly repository: LocalPrivateAuthorizationRepository;

  public constructor(public readonly databasePath: string) {
    process.env.PIGEON_LOCAL_DB_PATH = databasePath;
    this.database = new EmbeddedLocalDatabase();
    const storageCoordinator = new PrivateAuthorizationStorageCoordinator();
    this.repository = new LocalPrivateAuthorizationRepository(
      this.database,
      storageCoordinator,
    );
    const binding = new LegacyIdentityDeviceBinding();
    this.acceptor = new PrivateOperationAcceptor(
      this.repository,
      new LocalPrivateOperationUnitOfWork(
        this.database,
        this.repository,
        storageCoordinator,
      ),
      new PrivateOperationVerifier(),
      new PrivateControlOperationContract(),
      new InMemoryPrivateFreshnessGate(new PrivateFreshnessVerifier()),
      new VerifiedPrivateControlTransitionProcessor(
        new PrivateControlTransitionVerifier(),
        new PrivateMlsPolicyVerifier(),
        binding,
      ),
      new PrivateCommunityControlApplier(binding),
    );
  }

  public async initialize(
    checkpoint: PrivateAuthorizationCheckpoint,
    projection: Record<string, unknown>,
    protectedState: string,
  ): Promise<void> {
    const scopeId = checkpoint.toPrimitives().scopeId;
    await this.repository.saveScope(
      PrivateAuthorizationScope.pin(checkpoint, hash(checkpoint.toPrimitives())),
    );
    await this.repository.saveProjection(scopeId, projection);
    await this.database.save(
      PrivateAuthorizationLocalNamespaces.mls,
      scopeId,
      { state: protectedState },
    );
  }

  public async accept(
    signedOperationJson: string,
    signer: PrivateKey,
    controlFrame?: {
      encryptedMlsState: string;
      mlsMessage: string;
      signedTransitionJson: string;
    },
  ): Promise<'accepted' | 'duplicate' | 'pending'> {
    const requestJson = await this.acceptor.challenge(signedOperationJson);
    const request = JSON.parse(requestJson) as Record<string, unknown>;
    const signerKey = rawDeviceKey(signer);
    const proof = PrivateFreshnessProof.sign(
      JSON.stringify({
        batchCommitment: request.batchCommitment,
        headHash: request.expectedHeadHash,
        nonce: request.nonce,
        revision: request.expectedRevision,
        scopeId: request.scopeId,
        signerKey,
        version: 1,
      }),
      signer,
    );

    return (
      await this.acceptor.accept(
        new PrivateOperationAcceptMessage(
          signedOperationJson,
          proof,
          controlFrame,
        ),
      )
    ).status;
  }

  public close(): Promise<void> {
    return this.database.close();
  }
}

const encoded = (bytes: number, fill: number): string =>
  Buffer.alloc(bytes, fill).toString('base64url');

const hash = (value: unknown): string =>
  createHash('sha256').update(canonicalize(value)!).digest('base64url');

const nodePrivateKey = (fill: number) =>
  createPrivateKey({
    format: 'der',
    key: Buffer.concat([
      Buffer.from('302e020100300506032b657004220420', 'hex'),
      Buffer.alloc(32, fill),
    ]),
    type: 'pkcs8',
  });

const cryptoPrivateKey = (fill: number): PrivateKey =>
  PrivateKey.fromPEM(
    nodePrivateKey(fill).export({ format: 'pem', type: 'pkcs8' }).toString(),
  );

const rawDeviceKey = (key: PrivateKey): string => {
  const publicKey = key.getPublicKey().valueOf();
  const spki = createPublicKey(publicKey).export({
    format: 'der',
    type: 'spki',
  });

  return spki.subarray(-32).toString('base64url');
};

const identityId = (key: PrivateKey): string =>
  createPublicKey(key.getPublicKey().valueOf())
    .export({ format: 'der', type: 'spki' })
    .toString('base64');

const signedControlTransition = (
  ownerFill: number,
  current: { headHash: string; mlsEpoch: number; revision: number },
  scopeId: string,
  policy: ControlPolicy,
  mlsMessage: Buffer,
  protectedState: Buffer,
) => {
  const head = {
    mlsContextHash: createHash('sha256')
      .update(protectedState)
      .digest('base64url'),
    mlsEpoch: current.mlsEpoch + 1,
    parentHeadHash: current.headHash,
    policyHash: hash(policy),
    revision: current.revision + 1,
    scopeId,
  };
  const unsigned = {
    ...head,
    headHash: hash(head),
    mlsMessageHash: createHash('sha256')
      .update(mlsMessage)
      .digest('base64url'),
    policy,
  };
  const ownerKey = rawDeviceKey(cryptoPrivateKey(ownerFill));

  return {
    headHash: unsigned.headHash,
    mlsMessageHash: unsigned.mlsMessageHash,
    signedJson: JSON.stringify({
      ...unsigned,
      signatures: {
        [ownerKey]: sign(
          null,
          Buffer.from(
            `pigeon.private-control.v1\0${canonicalize(unsigned)}`,
          ),
          nodePrivateKey(ownerFill),
        ).toString('base64url'),
      },
    }),
  };
};

const signedOperation = (
  owner: PrivateKey,
  value: Record<string, unknown>,
): string => PrivateOperationSignature.sign(JSON.stringify(value), owner);

async function main(): Promise<void> {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), 'pigeon-private-authorization-'),
  );
  const owner = cryptoPrivateKey(1);
  const target = cryptoPrivateKey(2);
  const spare = cryptoPrivateKey(3);
  const ownerDeviceKey = rawDeviceKey(owner);
  const targetDeviceKey = rawDeviceKey(target);
  const spareDeviceKey = rawDeviceKey(spare);
  const ownerIdentityId = identityId(owner);
  const targetIdentityId = identityId(target);
  const scopeId = encoded(32, 3);
  const policy: ControlPolicy = {
    authorityKeys: [ownerDeviceKey],
    devices: [ownerDeviceKey, targetDeviceKey, spareDeviceKey].map(
      (deviceKey, index) => ({
        deviceKey,
        mlsCredentialHash: encoded(32, 10 + index),
      }),
    ),
    freshnessAuthorityKey: ownerDeviceKey,
    leaseRevocationHpkeKey: encoded(32, 8),
    leaseRevocationKey: ownerDeviceKey,
    sequencerKey: ownerDeviceKey,
    threshold: 1,
    version: 1,
  };
  const initialControl = {
    headHash: encoded(32, 4),
    mlsEpoch: 0,
    policy,
    revision: 0,
    scopeId,
  };
  const checkpoint = PrivateAuthorizationCheckpoint.genesis({
    admittedDeviceKeys: [ownerDeviceKey, targetDeviceKey, spareDeviceKey],
    authorityKeys: [ownerDeviceKey],
    controlCheckpointJson: JSON.stringify(initialControl),
    freshnessAuthorityKey: ownerDeviceKey,
    headHash: initialControl.headHash,
    scopeId,
  });
  const projection = Community.fromPrimitives({
    autoJoinEnabled: false,
    avatar: undefined,
    bannedMemberIds: [],
    banner: undefined,
    createdAt: 1,
    description: 'Private authorization E2E',
    discoverable: false,
    id: scopeId,
    memberIds: [ownerIdentityId, targetIdentityId],
    memberRoles: [],
    name: 'Private authorization E2E',
    networkId: '550e8400-e29b-41d4-a716-446655440000',
    ownerIdentityId,
    roles: [],
    textChannels: [],
    visibility: 'private',
    voiceChannels: [],
  }).toPrimitives();
  const nodes = [0, 1, 2].map(
    (index) => new AuthorizationNode(path.join(root, `node-${index}`)),
  );

  try {
    await Promise.all(
      nodes.map((node) =>
        node.initialize(
          checkpoint,
          projection,
          Buffer.from('state-0').toString('base64url'),
        ),
      ),
    );
    const proposalId = encoded(16, 20);
    const mutation = { targetIdentityId, type: 'member.ban' };
    const proposal = signedOperation(owner, {
      authorDeviceKey: ownerDeviceKey,
      authorizationRevision: 0,
      kind: 'membership.propose',
      operationId: proposalId,
      payload: {
        change: mutation,
        parentHeadHash: initialControl.headHash,
        proposalId,
      },
      previousOperationIds: [],
      scopeId,
      version: 1,
    });
    const message = Buffer.from('ban-control-message');
    const nextState = Buffer.from('state-1');
    const nextPolicy = {
      ...policy,
      devices: policy.devices.filter(
        (device) => device.deviceKey !== targetDeviceKey,
      ),
    };
    const transition = signedControlTransition(
      1,
      initialControl,
      scopeId,
      nextPolicy,
      message,
      nextState,
    );
    const commit = signedOperation(owner, {
      authorDeviceKey: ownerDeviceKey,
      authorizationRevision: 0,
      kind: 'membership.commit',
      operationId: encoded(16, 21),
      payload: {
        change: mutation,
        mlsMessageHash: transition.mlsMessageHash,
        proposalOperationId: proposalId,
        resultingHeadHash: transition.headHash,
      },
      previousOperationIds: [proposalId],
      scopeId,
      version: 1,
    });
    const frame = {
      encryptedMlsState: nextState.toString('base64url'),
      mlsMessage: message.toString('base64url'),
      signedTransitionJson: transition.signedJson,
    };

    assert.equal(await nodes[2].accept(commit, owner, frame), 'pending');
    assert.equal(await nodes[2].accept(proposal, owner), 'accepted');
    assert.equal(await nodes[2].accept(commit, owner, frame), 'accepted');
    for (const node of nodes.slice(0, 2)) {
      assert.equal(await node.accept(proposal, owner), 'accepted');
      assert.equal(await node.accept(commit, owner, frame), 'accepted');
    }

    const revocationMessage = Buffer.from('revocation-control-message');
    const revokedState = Buffer.from('state-2');
    const revocationPolicy = {
      ...nextPolicy,
      devices: nextPolicy.devices.filter(
        (device) => device.deviceKey !== spareDeviceKey,
      ),
    };
    const revocationTransition = signedControlTransition(
      1,
      { headHash: transition.headHash, mlsEpoch: 1, revision: 1 },
      scopeId,
      revocationPolicy,
      revocationMessage,
      revokedState,
    );
    const revocationId = encoded(16, 24);
    const revocation = signedOperation(owner, {
      authorDeviceKey: ownerDeviceKey,
      authorizationRevision: 1,
      kind: 'device.revoke',
      operationId: revocationId,
      payload: {
        deviceKey: spareDeviceKey,
        resultingHeadHash: revocationTransition.headHash,
      },
      previousOperationIds: [],
      scopeId,
      version: 1,
    });
    const revocationFrame = {
      encryptedMlsState: revokedState.toString('base64url'),
      mlsMessage: revocationMessage.toString('base64url'),
      signedTransitionJson: revocationTransition.signedJson,
    };

    for (const node of nodes) {
      assert.equal(
        await node.accept(revocation, owner, revocationFrame),
        'accepted',
      );
    }

    for (const node of nodes) {
      const storedProjection = await node.repository.findProjection(scopeId);
      const storedScope = await node.repository.findScope(scopeId);
      assert.ok(storedProjection);
      assert.ok(storedScope);
      assert.deepEqual(storedProjection.bannedMemberIds, [targetIdentityId]);
      assert.deepEqual(storedProjection.memberIds, [ownerIdentityId]);
      assert.equal(storedScope.toPrimitives().checkpoint.revision, 2);
      assert.ok(
        storedScope
          .toPrimitives()
          .checkpoint.revokedDeviceKeys.includes(spareDeviceKey),
      );
      assert.equal(
        (await node.repository.findPending(scopeId)).length,
        0,
      );
      assert.deepEqual(await node.database.find('communities'), []);
    }

    await nodes[1].close();
    const restarted = new AuthorizationNode(nodes[1].databasePath);
    nodes[1] = restarted;
    assert.equal(
      (
        await restarted.acceptor.accept(
          new PrivateOperationAcceptMessage(revocation, '', revocationFrame),
        )
      ).status,
      'duplicate',
    );
    assert.equal(
      (await restarted.repository.findScope(scopeId))?.toPrimitives()
        .checkpoint.revision,
      2,
    );

    const removedOperation = signedOperation(target, {
      authorDeviceKey: targetDeviceKey,
      authorizationRevision: 1,
      kind: 'membership.propose',
      operationId: encoded(16, 22),
      payload: {
        change: { targetIdentityId: ownerIdentityId, type: 'member.remove' },
        parentHeadHash: transition.headHash,
        proposalId: encoded(16, 22),
      },
      previousOperationIds: [],
      scopeId,
      version: 1,
    });
    await assert.rejects(() => nodes[0].accept(removedOperation, target));

    const revokedDeviceOperation = signedOperation(spare, {
      authorDeviceKey: spareDeviceKey,
      authorizationRevision: 2,
      kind: 'membership.propose',
      operationId: encoded(16, 25),
      payload: {
        change: { targetIdentityId: ownerIdentityId, type: 'member.remove' },
        parentHeadHash: revocationTransition.headHash,
        proposalId: encoded(16, 25),
      },
      previousOperationIds: [],
      scopeId,
      version: 1,
    });
    await assert.rejects(() =>
      nodes[0].accept(revokedDeviceOperation, spare),
    );

    const wrongScope = signedOperation(owner, {
      authorDeviceKey: ownerDeviceKey,
      authorizationRevision: 2,
      kind: 'membership.propose',
      operationId: encoded(16, 23),
      payload: {
        change: { targetIdentityId, type: 'member.remove' },
        parentHeadHash: revocationTransition.headHash,
        proposalId: encoded(16, 23),
      },
      previousOperationIds: [],
      scopeId: encoded(32, 99),
      version: 1,
    });
    await assert.rejects(() => nodes[0].accept(wrongScope, owner));

    const equivocation = signedOperation(owner, {
      authorDeviceKey: ownerDeviceKey,
      authorizationRevision: 1,
      kind: 'device.revoke',
      operationId: revocationId,
      payload: {
        deviceKey: spareDeviceKey,
        resultingHeadHash: encoded(32, 98),
      },
      previousOperationIds: [],
      scopeId,
      version: 1,
    });
    for (const node of nodes) {
      await assert.rejects(() => node.accept(equivocation, owner));
      assert.equal(
        (await node.repository.findScope(scopeId))?.toPrimitives().status,
        'frozen',
      );
    }

    process.stdout.write(
      'PASS: three private authorization replicas recovered causal delivery, enforced revocation, converged or froze on conflict, and survived restart.\n',
    );
  } finally {
    await Promise.all(nodes.map((node) => node.close()));
    await fs.remove(root);
  }
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : error}\n`);
  process.exitCode = 1;
});
