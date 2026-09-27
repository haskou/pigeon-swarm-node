import { PrivateControlMutationAuthorizer } from '@app/contexts/private-authorization/application/accept-operation/PrivateControlMutationAuthorizer';
import { PrivateControlTransitionProcessor } from '@app/contexts/private-authorization/application/accept-operation/PrivateControlTransitionProcessor';
import { PrivateFreshnessGate } from '@app/contexts/private-authorization/application/accept-operation/PrivateFreshnessGate';
import { PrivateOperationAcceptMessage } from '@app/contexts/private-authorization/application/accept-operation/messages/PrivateOperationAcceptMessage';
import { PrivateOperationChallengeMessage } from '@app/contexts/private-authorization/application/accept-operation/messages/PrivateOperationChallengeMessage';
import PrivateOperationAcceptor from '@app/contexts/private-authorization/application/accept-operation/PrivateOperationAcceptor';
import PrivateOperationAuthorizer from '@app/contexts/private-authorization/application/accept-operation/PrivateOperationAuthorizer';
import { PrivateOperationUnitOfWork } from '@app/contexts/private-authorization/application/PrivateOperationUnitOfWork';
import { PrivateAuthorizationCheckpoint } from '@app/contexts/private-authorization/domain/PrivateAuthorizationCheckpoint';
import { PrivateAuthorizationScope } from '@app/contexts/private-authorization/domain/PrivateAuthorizationScope';
import { PrivateControlTransitionReservation } from '@app/contexts/private-authorization/domain/PrivateControlTransitionReservation';
import { PrivateAuthorizationConflictError } from '@app/contexts/private-authorization/domain/errors/PrivateAuthorizationConflictError';
import { InvalidPrivateAuthorizationError } from '@app/contexts/private-authorization/domain/errors/InvalidPrivateAuthorizationError';
import { PrivateAuthorizationRepository } from '@app/contexts/private-authorization/domain/repositories/PrivateAuthorizationRepository';
import DeviceAuthorizationAccessPolicy from '@app/contexts/identity-devices/domain/services/DeviceAuthorizationAccessPolicy';
import { DeviceCredential } from '@app/contexts/identities/domain/value-objects/DeviceCredential';
import { PrivateDeviceCredentialCodec } from '@app/contexts/private-authorization/domain/services/PrivateDeviceCredentialCodec';
import { PrivateAuthorizationDeviceKey } from '@app/contexts/private-authorization/domain/value-objects/PrivateAuthorizationDeviceKey';
import { AuthenticatedPrivateOperationJson } from '@app/contexts/private-authorization/domain/value-objects/AuthenticatedPrivateOperationJson';
import PrivateControlOperationContract from '@app/contexts/private-authorization/infrastructure/contracts/PrivateControlOperationContract';
import Ed25519PrivateDeviceCredentialCodec from '@app/contexts/private-authorization/infrastructure/crypto/Ed25519PrivateDeviceCredentialCodec';
import PrivateOperationVerifier from '@app/contexts/private-authorization/infrastructure/crypto/PrivateOperationVerifier';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

describe('PrivateOperationAcceptor', () => {
  const encoded = (bytes: number, value: number) =>
    Buffer.alloc(bytes, value).toString('base64url');
  const scopeId = encoded(32, 1);
  const authorKey = encoded(32, 2);
  const deviceCredentialCodec = new Ed25519PrivateDeviceCredentialCodec();
  const identityIdFor = (deviceKey: string) =>
    new IdentityId(
      deviceCredentialCodec.toCredential(
        new PrivateAuthorizationDeviceKey(deviceKey),
      ).valueOf(),
    ).valueOf();
  const authorIdentityId = identityIdFor(authorKey);
  const headHash = encoded(32, 3);
  const operationId = encoded(16, 4);
  const proposalId = encoded(16, 5);
  const checkpoint = () =>
    PrivateAuthorizationCheckpoint.genesis({
      admittedDeviceKeys: [authorKey],
      authorityKeys: [authorKey],
      controlCheckpointJson: '{}',
      deviceIdentities: [{ deviceKey: authorKey, identityId: authorIdentityId }],
      freshnessAuthorityKey: authorKey,
      headHash,
      scopeId,
    });
  const scope = () => PrivateAuthorizationScope.pin(checkpoint(), 'genesis');
  const signed = (changes: Record<string, unknown> = {}) => {
    const defaultPayload = {
      change: { targetIdentityId: 'member', type: 'member.ban' },
      parentHeadHash: headHash,
      proposalId,
    };
    const payload = (changes.payload ?? defaultPayload) as Record<
      string,
      unknown
    >;

    return JSON.stringify({
      authorDeviceKey: authorKey,
      authorizationRevision: 0,
      kind: 'membership.propose',
      operationId,
      previousOperationIds: [],
      scopeId,
      signature: encoded(64, 6),
      version: 1,
      ...changes,
      payload: {
        authorIdentityId,
        identityAuthorizationRevision: 0,
        ...payload,
      },
    });
  };
  const revocation = (changes: Record<string, unknown> = {}) =>
    signed({
      kind: 'device.revoke',
      payload: {
        deviceKey: authorKey,
        resultingHeadHash: encoded(32, 7),
      },
      ...changes,
    });
  const commitment = (changes: Record<string, unknown> = {}) =>
    signed({
      kind: 'membership.commit',
      payload: {
        change: { targetIdentityId: 'member', type: 'member.ban' },
        mlsMessageHash: encoded(32, 8),
        proposalOperationId: proposalId,
        resultingHeadHash: encoded(32, 7),
      },
      ...changes,
    });
  const controlFrame = {
    encryptedMlsState: encoded(32, 15),
    mlsMessage: encoded(32, 16),
    signedTransitionJson: 'transition',
  };

  let repository: jest.Mocked<PrivateAuthorizationRepository>;
  let unitOfWork: jest.Mocked<PrivateOperationUnitOfWork>;
  let verifier: jest.Mocked<PrivateOperationVerifier>;
  let freshness: jest.Mocked<PrivateFreshnessGate>;
  let transitions: jest.Mocked<PrivateControlTransitionProcessor>;
  let mutations: jest.Mocked<PrivateControlMutationAuthorizer>;
  let deviceAuthorization: jest.Mocked<DeviceAuthorizationAccessPolicy>;
  let credentialCodec: jest.Mocked<PrivateDeviceCredentialCodec>;
  let acceptor: PrivateOperationAcceptor;

  beforeEach(() => {
    repository = {
      findOutbox: jest.fn(),
      findPending: jest.fn(),
      findProjection: jest.fn().mockResolvedValue({ members: [] }),
      findProtectedMlsState: jest.fn(),
      findReceipt: jest.fn(),
      findReservation: jest.fn(),
      findReservationAtRevision: jest.fn(),
      findScope: jest.fn().mockResolvedValue(scope()),
      findScopeIds: jest.fn(),
      hasReplayMarker: jest.fn(),
      savePending: jest.fn(),
      saveProjection: jest.fn(),
      saveReceipt: jest.fn(),
      saveReservation: jest.fn(),
      saveScope: jest.fn(),
    };
    unitOfWork = {
      commitGenesis: jest.fn().mockResolvedValue('committed'),
      commitPending: jest.fn().mockResolvedValue('committed'),
      commitAcceptance: jest.fn().mockResolvedValue('committed'),
      quarantine: jest.fn(),
      reserveChild: jest.fn(),
    };
    verifier = {
      verify: jest.fn(
        (value) => new AuthenticatedPrivateOperationJson(value),
      ),
    } as unknown as jest.Mocked<PrivateOperationVerifier>;
    freshness = {
      issue: jest.fn().mockReturnValue('challenge-request'),
      verify: jest.fn().mockResolvedValue({ replayMarkerId: 'challenge' }),
    };
    transitions = { verify: jest.fn() };
    mutations = {
      apply: jest.fn().mockResolvedValue({ members: ['member'] }),
    };
    deviceAuthorization = {
      assertAuthorized: jest.fn(),
    } as unknown as jest.Mocked<DeviceAuthorizationAccessPolicy>;
    credentialCodec = {
      toCredential: jest.fn().mockReturnValue(
        DeviceCredential.fromIdentityId(new IdentityId(authorIdentityId)),
      ),
      toDeviceKey: jest.fn(),
    };
    acceptor = new PrivateOperationAcceptor(
      repository,
      unitOfWork,
      new PrivateOperationAuthorizer(
        repository,
        verifier,
        new PrivateControlOperationContract(),
        deviceAuthorization,
        credentialCodec,
      ),
      freshness,
      transitions,
      mutations,
    );
  });

  it('issues freshness only after verifying the signed operation against local policy', async () => {
    const message = new PrivateOperationChallengeMessage(
      authorIdentityId,
      signed(),
    );

    await expect(acceptor.challenge(message)).resolves.toBe('challenge-request');
    expect(verifier.verify).toHaveBeenCalledWith(signed(), authorKey);
    expect(freshness.issue).toHaveBeenCalled();
  });

  it('rejects freshness requested by an identity other than the operation author', async () => {
    await expect(
      acceptor.challenge(
        new PrivateOperationChallengeMessage(
          authorIdentityId,
          signed({
            authorIdentityId: identityIdFor(
              encoded(32, 9),
            ),
          }),
        ),
      ),
    ).rejects.toThrow(InvalidPrivateAuthorizationError);
    expect(freshness.issue).not.toHaveBeenCalled();
  });

  it('rejects a device absent from the current identity authorization revision', async () => {
    deviceAuthorization.assertAuthorized.mockRejectedValue(
      new Error('revoked device'),
    );

    await expect(
      acceptor.challenge(
        new PrivateOperationChallengeMessage(authorIdentityId, signed()),
      ),
    ).rejects.toThrow('revoked device');
    expect(freshness.issue).not.toHaveBeenCalled();
  });

  it('rejects a device claimed by an identity other than its scope mapping', async () => {
    const claimedIdentityId = identityIdFor(
      encoded(32, 9),
    );

    await expect(
      acceptor.challenge(
        new PrivateOperationChallengeMessage(
          claimedIdentityId,
          signed({
            payload: {
              authorIdentityId: claimedIdentityId,
              change: { targetIdentityId: 'member', type: 'member.ban' },
              identityAuthorizationRevision: 0,
              parentHeadHash: headHash,
              proposalId,
            },
          }),
        ),
      ),
    ).rejects.toThrow(InvalidPrivateAuthorizationError);
    expect(deviceAuthorization.assertAuthorized).not.toHaveBeenCalled();
    expect(freshness.issue).not.toHaveBeenCalled();
  });

  it('rejects freshness challenges for a frozen scope', async () => {
    const frozen = scope();
    frozen.quarantine();
    frozen.pullDomainEvents();
    repository.findScope.mockResolvedValue(frozen);

    await expect(
      acceptor.challenge(
        new PrivateOperationChallengeMessage(authorIdentityId, signed()),
      ),
    ).rejects.toThrow(PrivateAuthorizationConflictError);
    expect(freshness.issue).not.toHaveBeenCalled();
  });

  it('durably reserves a control child before issuing freshness', async () => {
    repository.findProtectedMlsState.mockResolvedValue(encoded(32, 14));
    unitOfWork.reserveChild.mockResolvedValue('reserved');

    await expect(
      acceptor.challenge(
        new PrivateOperationChallengeMessage(
          authorIdentityId,
          revocation(),
          controlFrame,
        ),
      ),
    ).resolves.toBe('challenge-request');

    expect(unitOfWork.reserveChild).toHaveBeenCalledWith(
      expect.any(PrivateControlTransitionReservation),
    );
    const reservation = unitOfWork.reserveChild.mock.calls[0][0];

    expect(reservation.toPrimitives()).toEqual({
      authorDeviceKey: authorKey,
      childHeadHash: encoded(32, 7),
      operationId,
      parentCheckpoint: checkpoint().toPrimitives(),
    });
    expect(transitions.verify.mock.invocationCallOrder[0]).toBeLessThan(
      unitOfWork.reserveChild.mock.invocationCallOrder[0],
    );
    expect(unitOfWork.reserveChild.mock.invocationCallOrder[0]).toBeLessThan(
      freshness.issue.mock.invocationCallOrder[0],
    );
  });

  it('rejects a competing control child before issuing freshness', async () => {
    repository.findProtectedMlsState.mockResolvedValue(encoded(32, 14));
    unitOfWork.reserveChild.mockResolvedValue('conflict');

    await expect(
      acceptor.challenge(
        new PrivateOperationChallengeMessage(
          authorIdentityId,
          revocation(),
          controlFrame,
        ),
      ),
    ).rejects.toThrow(PrivateAuthorizationConflictError);

    expect(freshness.issue).not.toHaveBeenCalled();
  });

  it('does not reserve a control claim without an authenticated transition', async () => {
    repository.findProtectedMlsState.mockResolvedValue(encoded(32, 14));
    transitions.verify.mockRejectedValue(
      new InvalidPrivateAuthorizationError(),
    );

    await expect(
      acceptor.challenge(
        new PrivateOperationChallengeMessage(
          authorIdentityId,
          revocation(),
          controlFrame,
        ),
      ),
    ).rejects.toThrow(InvalidPrivateAuthorizationError);

    expect(unitOfWork.reserveChild).not.toHaveBeenCalled();
    expect(freshness.issue).not.toHaveBeenCalled();
  });

  it('does not reserve a control child whose domain mutation is unauthorized', async () => {
    repository.findProtectedMlsState.mockResolvedValue(encoded(32, 14));
    transitions.verify.mockResolvedValue({
      checkpoint: PrivateAuthorizationCheckpoint.fromPrimitives({
        ...checkpoint().toPrimitives(),
        headHash: encoded(32, 7),
        parentHeadHash: headHash,
        revision: 1,
      }),
      protectedMlsState: encoded(32, 17),
    });
    mutations.apply.mockRejectedValue(new InvalidPrivateAuthorizationError());

    await expect(
      acceptor.challenge(
        new PrivateOperationChallengeMessage(
          authorIdentityId,
          commitment(),
          controlFrame,
        ),
      ),
    ).rejects.toThrow(InvalidPrivateAuthorizationError);

    expect(mutations.apply).toHaveBeenCalled();
    expect(unitOfWork.reserveChild).not.toHaveBeenCalled();
    expect(freshness.issue).not.toHaveBeenCalled();
  });

  it('issues freshness for a historical control child without reserving it against the current checkpoint', async () => {
    const currentCheckpoint = PrivateAuthorizationCheckpoint.fromPrimitives({
      ...checkpoint().toPrimitives(),
      headHash: encoded(32, 8),
      parentHeadHash: headHash,
      revision: 1,
    });
    repository.findScope.mockResolvedValue(
      PrivateAuthorizationScope.pin(currentCheckpoint, 'genesis'),
    );

    await expect(
      acceptor.challenge(
        new PrivateOperationChallengeMessage(authorIdentityId, revocation()),
      ),
    ).resolves.toBe('challenge-request');

    expect(mutations.apply).not.toHaveBeenCalled();
    expect(unitOfWork.reserveChild).not.toHaveBeenCalled();
    expect(freshness.issue).toHaveBeenCalledWith(
      currentCheckpoint,
      expect.anything(),
    );
  });

  it('defers mutation validation for an operation authorized by a future checkpoint', async () => {
    mutations.apply.mockRejectedValue(new InvalidPrivateAuthorizationError());

    await expect(
      acceptor.challenge(
        new PrivateOperationChallengeMessage(
          authorIdentityId,
          signed({ authorizationRevision: 1 }),
        ),
      ),
    ).resolves.toBe('challenge-request');

    expect(mutations.apply).not.toHaveBeenCalled();
    expect(unitOfWork.reserveChild).not.toHaveBeenCalled();
    expect(freshness.issue).toHaveBeenCalled();
  });

  it('verifies and atomically accepts an authorized proposal', async () => {
    await expect(
      acceptor.accept(new PrivateOperationAcceptMessage(signed(), 'proof')),
    ).resolves.toEqual({ status: 'accepted' });

    expect(verifier.verify).toHaveBeenCalledWith(signed(), authorKey);
    expect(freshness.verify).toHaveBeenCalledWith(
      expect.any(PrivateAuthorizationCheckpoint),
      expect.anything(),
      'proof',
    );
    expect(mutations.apply).toHaveBeenCalled();
    expect(unitOfWork.commitAcceptance).toHaveBeenCalledWith(
      scopeId,
      { headHash, revision: 0 },
      expect.objectContaining({
        projection: { members: [] },
        replayMarkerId: 'challenge',
      }),
    );
  });

  it('rejects an author absent from the local checkpoint before signature verification', async () => {
    const attacker = signed({ authorDeviceKey: encoded(32, 9) });

    await expect(
      acceptor.accept(new PrivateOperationAcceptMessage(attacker, 'proof')),
    ).rejects.toThrow(InvalidPrivateAuthorizationError);
    expect(verifier.verify).not.toHaveBeenCalled();
    expect(freshness.verify).not.toHaveBeenCalled();
  });

  it('persists a future revision as pending without applying its mutation', async () => {
    await expect(
      acceptor.accept(
        new PrivateOperationAcceptMessage(
          signed({ authorizationRevision: 1 }),
          'proof',
        ),
      ),
    ).resolves.toEqual({ status: 'pending' });

    expect(unitOfWork.commitPending).toHaveBeenCalled();
    expect(mutations.apply).not.toHaveBeenCalled();
    expect(unitOfWork.commitAcceptance).not.toHaveBeenCalled();
  });

  it('rejects an old authorization revision', async () => {
    const advanced = PrivateAuthorizationCheckpoint.fromPrimitives({
      ...checkpoint().toPrimitives(),
      headHash: encoded(32, 7),
      parentHeadHash: headHash,
      revision: 1,
    });
    repository.findScope.mockResolvedValue(
      PrivateAuthorizationScope.pin(advanced, 'genesis'),
    );

    await expect(
      acceptor.accept(new PrivateOperationAcceptMessage(signed(), 'proof')),
    ).rejects.toThrow(InvalidPrivateAuthorizationError);
    expect(repository.saveScope).not.toHaveBeenCalled();
  });

  it('authenticates a control transition before evaluating the community mutation', async () => {
    repository.findProtectedMlsState.mockResolvedValue(encoded(32, 14));
    transitions.verify.mockRejectedValue(
      new InvalidPrivateAuthorizationError(),
    );

    await expect(
      acceptor.accept(
        new PrivateOperationAcceptMessage(revocation(), 'proof', {
          encryptedMlsState: 'next-state',
          mlsMessage: 'message',
          signedTransitionJson: 'transition',
        }),
      ),
    ).rejects.toThrow(InvalidPrivateAuthorizationError);
    expect(mutations.apply).not.toHaveBeenCalled();
  });

  it('rejects a corrupt stored protected MLS state before transition verification', async () => {
    repository.findProtectedMlsState.mockResolvedValue('not canonical base64');

    await expect(
      acceptor.accept(
        new PrivateOperationAcceptMessage(revocation(), 'proof', controlFrame),
      ),
    ).rejects.toThrow(InvalidPrivateAuthorizationError);
    expect(transitions.verify).not.toHaveBeenCalled();
    expect(mutations.apply).not.toHaveBeenCalled();
  });

  it('redacts community mutation failures as authorization errors', async () => {
    mutations.apply.mockRejectedValue(
      new Error('Secret community member and role details'),
    );

    await expect(
      acceptor.accept(new PrivateOperationAcceptMessage(signed(), 'proof')),
    ).rejects.toMatchObject({ message: 'Invalid private authorization' });
    expect(unitOfWork.commitAcceptance).not.toHaveBeenCalled();
  });

  it('returns a verified identical receipt as a duplicate without reapplying it', async () => {
    const decoded = new PrivateControlOperationContract()
      .decode(signed())
      .toPrimitives();
    repository.findReceipt.mockResolvedValue(decoded);

    await expect(
      acceptor.accept(new PrivateOperationAcceptMessage(signed(), 'proof')),
    ).resolves.toEqual({ status: 'duplicate' });
    expect(freshness.verify).not.toHaveBeenCalled();
    expect(mutations.apply).not.toHaveBeenCalled();
  });

  it('treats a reformatted accepted operation as the same receipt', async () => {
    const compact = signed();
    const receipt = new PrivateControlOperationContract()
      .decode(compact)
      .toPrimitives();
    const formatted = JSON.stringify(JSON.parse(compact), null, 2);
    repository.findReceipt.mockResolvedValue(receipt);

    await expect(
      acceptor.accept(new PrivateOperationAcceptMessage(formatted, 'proof')),
    ).resolves.toEqual({ status: 'duplicate' });
    expect(unitOfWork.quarantine).not.toHaveBeenCalled();
    expect(verifier.verify).not.toHaveBeenCalled();
    expect(freshness.verify).not.toHaveBeenCalled();
  });

  it('acknowledges an identical receipt after its author is revoked', async () => {
    const decoded = new PrivateControlOperationContract()
      .decode(signed())
      .toPrimitives();
    const activeKey = encoded(32, 10);
    const revokedCheckpoint = PrivateAuthorizationCheckpoint.fromPrimitives({
      ...checkpoint().toPrimitives(),
      admittedDeviceKeys: [activeKey],
      authorityKeys: [activeKey],
      deviceIdentities: [
        { deviceKey: activeKey, identityId: 'active-identity' },
      ],
      freshnessAuthorityKey: activeKey,
      revokedDeviceKeys: [authorKey],
    });
    repository.findScope.mockResolvedValue(
      PrivateAuthorizationScope.pin(revokedCheckpoint, 'genesis'),
    );
    repository.findReceipt.mockResolvedValue(decoded);

    await expect(
      acceptor.accept(new PrivateOperationAcceptMessage(signed(), 'proof')),
    ).resolves.toEqual({ status: 'duplicate' });
    expect(verifier.verify).not.toHaveBeenCalled();
    expect(freshness.verify).not.toHaveBeenCalled();
  });

  it('freezes a conflicting receipt signed before its author was revoked', async () => {
    const receipt = new PrivateControlOperationContract()
      .decode(signed())
      .toPrimitives();
    const activeKey = encoded(32, 10);
    const revokedCheckpoint = PrivateAuthorizationCheckpoint.fromPrimitives({
      ...checkpoint().toPrimitives(),
      admittedDeviceKeys: [activeKey],
      authorityKeys: [activeKey],
      deviceIdentities: [
        { deviceKey: activeKey, identityId: 'active-identity' },
      ],
      freshnessAuthorityKey: activeKey,
      revokedDeviceKeys: [authorKey],
    });
    const conflicting = JSON.parse(signed());
    conflicting.payload.change.targetIdentityId = 'different-member';
    const conflictingJson = JSON.stringify(conflicting);
    repository.findScope.mockResolvedValue(
      PrivateAuthorizationScope.pin(revokedCheckpoint, 'genesis'),
    );
    repository.findReceipt.mockResolvedValue(receipt);

    await expect(
      acceptor.accept(
        new PrivateOperationAcceptMessage(conflictingJson, 'proof'),
      ),
    ).rejects.toThrow('Private authorization conflict');
    expect(verifier.verify).toHaveBeenCalledWith(conflictingJson, authorKey);
    expect(unitOfWork.quarantine).toHaveBeenCalledWith(scopeId);
    expect(freshness.verify).not.toHaveBeenCalled();
  });

  it('rechecks a concurrently committed receipt after author revocation', async () => {
    const receipt = new PrivateControlOperationContract()
      .decode(signed())
      .toPrimitives();
    const activeKey = encoded(32, 10);
    const revokedCheckpoint = PrivateAuthorizationCheckpoint.fromPrimitives({
      ...checkpoint().toPrimitives(),
      admittedDeviceKeys: [activeKey],
      authorityKeys: [activeKey],
      deviceIdentities: [
        { deviceKey: activeKey, identityId: 'active-identity' },
      ],
      freshnessAuthorityKey: activeKey,
      revokedDeviceKeys: [authorKey],
    });
    const conflicting = JSON.parse(signed());
    conflicting.payload.change.targetIdentityId = 'different-member';
    const conflictingJson = JSON.stringify(conflicting);
    repository.findScope.mockResolvedValue(
      PrivateAuthorizationScope.pin(revokedCheckpoint, 'genesis'),
    );
    repository.findReceipt
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(receipt);

    await expect(
      acceptor.accept(
        new PrivateOperationAcceptMessage(conflictingJson, 'proof'),
      ),
    ).rejects.toThrow('Private authorization conflict');
    expect(verifier.verify).toHaveBeenCalledWith(conflictingJson, authorKey);
    expect(unitOfWork.quarantine).toHaveBeenCalledWith(scopeId);
  });

  it('rejects a concurrent receipt owned by another admitted author without freezing the scope', async () => {
    const competingAuthorKey = encoded(32, 10);
    const competingIdentityId = identityIdFor(
      competingAuthorKey,
    );
    const competingCheckpoint = PrivateAuthorizationCheckpoint.fromPrimitives({
      ...checkpoint().toPrimitives(),
      admittedDeviceKeys: [authorKey, competingAuthorKey],
      deviceIdentities: [
        { deviceKey: authorKey, identityId: authorIdentityId },
        { deviceKey: competingAuthorKey, identityId: competingIdentityId },
      ],
    });
    const receipt = new PrivateControlOperationContract()
      .decode(signed())
      .toPrimitives();
    const competingOperation = signed({
      authorDeviceKey: competingAuthorKey,
      payload: {
        authorIdentityId: competingIdentityId,
        change: { targetIdentityId: 'different-member', type: 'member.ban' },
        identityAuthorizationRevision: 0,
        parentHeadHash: headHash,
        proposalId,
      },
    });
    repository.findScope.mockResolvedValue(
      PrivateAuthorizationScope.pin(competingCheckpoint, 'genesis'),
    );
    repository.findReceipt
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(receipt);

    await expect(
      acceptor.accept(
        new PrivateOperationAcceptMessage(competingOperation, 'proof'),
      ),
    ).rejects.toThrow(InvalidPrivateAuthorizationError);
    expect(verifier.verify).toHaveBeenCalledWith(
      competingOperation,
      competingAuthorKey,
    );
    expect(unitOfWork.quarantine).not.toHaveBeenCalled();
  });

  it('verifies a retained receipt conflict after its author leaves key history', async () => {
    const receipt = new PrivateControlOperationContract()
      .decode(signed())
      .toPrimitives();
    const activeKey = encoded(32, 10);
    const currentCheckpoint = PrivateAuthorizationCheckpoint.fromPrimitives({
      ...checkpoint().toPrimitives(),
      admittedDeviceKeys: [activeKey],
      authorityKeys: [activeKey],
      deviceIdentities: [
        { deviceKey: activeKey, identityId: 'active-identity' },
      ],
      freshnessAuthorityKey: activeKey,
      revokedDeviceKeys: [],
    });
    const conflicting = JSON.parse(signed());
    conflicting.payload.change.targetIdentityId = 'different-member';
    const conflictingJson = JSON.stringify(conflicting);
    repository.findScope.mockResolvedValue(
      PrivateAuthorizationScope.pin(currentCheckpoint, 'genesis'),
    );
    repository.findReceipt.mockResolvedValue(receipt);

    await expect(
      acceptor.accept(
        new PrivateOperationAcceptMessage(conflictingJson, 'proof'),
      ),
    ).rejects.toThrow('Private authorization conflict');
    expect(verifier.verify).toHaveBeenCalledWith(conflictingJson, authorKey);
    expect(unitOfWork.quarantine).toHaveBeenCalledWith(scopeId);
  });

  it('does not freeze a receipt conflict claimed by an unknown author', async () => {
    const receipt = new PrivateControlOperationContract()
      .decode(signed())
      .toPrimitives();
    const attacker = signed({
      authorDeviceKey: encoded(32, 9),
      payload: {
        change: { targetIdentityId: 'different-member', type: 'member.ban' },
        parentHeadHash: headHash,
        proposalId,
      },
    });
    repository.findReceipt.mockResolvedValue(receipt);

    await expect(
      acceptor.accept(new PrivateOperationAcceptMessage(attacker, 'proof')),
    ).rejects.toThrow(InvalidPrivateAuthorizationError);
    expect(verifier.verify).not.toHaveBeenCalled();
    expect(unitOfWork.quarantine).not.toHaveBeenCalled();
  });

  it('quarantines an authenticated historical child fork', async () => {
    const activeKey = encoded(32, 10);
    const currentCheckpoint = PrivateAuthorizationCheckpoint.fromPrimitives({
      ...checkpoint().toPrimitives(),
      admittedDeviceKeys: [activeKey],
      authorityKeys: [activeKey],
      deviceIdentities: [
        { deviceKey: activeKey, identityId: 'active-identity' },
      ],
      freshnessAuthorityKey: activeKey,
      headHash: encoded(32, 11),
      parentHeadHash: headHash,
      revision: 1,
      revokedDeviceKeys: [authorKey],
    });
    const sibling = revocation({
      payload: {
        deviceKey: authorKey,
        resultingHeadHash: encoded(32, 12),
      },
    });
    repository.findScope.mockResolvedValue(
      PrivateAuthorizationScope.pin(currentCheckpoint, 'genesis'),
    );
    repository.findReservationAtRevision.mockResolvedValue(
      PrivateControlTransitionReservation.fromPrimitives({
        authorDeviceKey: authorKey,
        childHeadHash: encoded(32, 11),
        operationId,
        parentCheckpoint: checkpoint().toPrimitives(),
      }),
    );

    await expect(
      acceptor.accept(
        new PrivateOperationAcceptMessage(sibling, 'proof', controlFrame),
      ),
    ).rejects.toThrow('Private authorization conflict');
    expect(verifier.verify).toHaveBeenCalledWith(sibling, authorKey);
    expect(repository.findReservationAtRevision).toHaveBeenCalledWith(
      expect.objectContaining({ valueOf: expect.any(Function) }),
      expect.objectContaining({ valueOf: expect.any(Function) }),
    );
    const [foundScope, foundRevision] =
      repository.findReservationAtRevision.mock.calls[0];

    expect(foundScope.valueOf()).toBe(scopeId);
    expect(foundRevision.valueOf()).toBe(0);
    const retainedParent = checkpoint();
    expect(transitions.verify).toHaveBeenCalledWith(
      expect.objectContaining({
        toPrimitives: expect.any(Function),
      }),
      expect.anything(),
      expect.any(AuthenticatedPrivateOperationJson),
      controlFrame,
    );
    expect(
      transitions.verify.mock.calls[0][0].toPrimitives(),
    ).toEqual(retainedParent.toPrimitives());
    expect(unitOfWork.quarantine).toHaveBeenCalledWith(scopeId);
    expect(freshness.verify).not.toHaveBeenCalled();
  });

  it('quarantines a historical fork after its author leaves bounded key history', async () => {
    const activeKey = encoded(32, 10);
    const retainedRevocations = Array.from({ length: 128 }, (_value, index) =>
      encoded(32, index + 20),
    );
    const currentCheckpoint = PrivateAuthorizationCheckpoint.fromPrimitives({
      ...checkpoint().toPrimitives(),
      admittedDeviceKeys: [activeKey],
      authorityKeys: [activeKey],
      deviceIdentities: [
        { deviceKey: activeKey, identityId: 'active-identity' },
      ],
      freshnessAuthorityKey: activeKey,
      headHash: encoded(32, 13),
      parentHeadHash: encoded(32, 11),
      revision: 2,
      revokedDeviceKeys: retainedRevocations,
    });
    const sibling = revocation({
      payload: {
        deviceKey: authorKey,
        resultingHeadHash: encoded(32, 12),
      },
    });
    const genesisReservation =
      PrivateControlTransitionReservation.fromPrimitives({
        authorDeviceKey: authorKey,
        childHeadHash: encoded(32, 11),
        operationId,
        parentCheckpoint: checkpoint().toPrimitives(),
      });
    repository.findScope.mockResolvedValue(
      PrivateAuthorizationScope.pin(currentCheckpoint, 'genesis'),
    );
    repository.findReservationAtRevision.mockResolvedValue(
      genesisReservation,
    );

    await expect(
      acceptor.accept(
        new PrivateOperationAcceptMessage(sibling, 'proof', controlFrame),
      ),
    ).rejects.toThrow(PrivateAuthorizationConflictError);
    expect(repository.findReservationAtRevision).toHaveBeenCalledWith(
      expect.objectContaining({ valueOf: expect.any(Function) }),
      expect.objectContaining({ valueOf: expect.any(Function) }),
    );
    const [foundScope, foundRevision] =
      repository.findReservationAtRevision.mock.calls[0];

    expect(foundScope.valueOf()).toBe(scopeId);
    expect(foundRevision.valueOf()).toBe(0);
    expect(transitions.verify).toHaveBeenCalledWith(
      expect.objectContaining({ toPrimitives: expect.any(Function) }),
      expect.anything(),
      expect.any(AuthenticatedPrivateOperationJson),
      controlFrame,
    );
    expect(unitOfWork.quarantine).toHaveBeenCalledWith(scopeId);
    expect(freshness.verify).not.toHaveBeenCalled();
  });

  it('rejects reuse of another operation transition without freezing', async () => {
    const activeKey = encoded(32, 10);
    const currentCheckpoint = PrivateAuthorizationCheckpoint.fromPrimitives({
      ...checkpoint().toPrimitives(),
      admittedDeviceKeys: [activeKey],
      authorityKeys: [activeKey],
      deviceIdentities: [
        { deviceKey: activeKey, identityId: 'active-identity' },
      ],
      freshnessAuthorityKey: activeKey,
      headHash: encoded(32, 11),
      parentHeadHash: headHash,
      revision: 1,
      revokedDeviceKeys: [authorKey],
    });
    const reusedTransition = revocation({
      payload: {
        deviceKey: authorKey,
        resultingHeadHash: encoded(32, 11),
      },
    });
    repository.findScope.mockResolvedValue(
      PrivateAuthorizationScope.pin(currentCheckpoint, 'genesis'),
    );
    repository.findReservationAtRevision.mockResolvedValue(
      PrivateControlTransitionReservation.fromPrimitives({
        authorDeviceKey: authorKey,
        childHeadHash: encoded(32, 11),
        operationId: encoded(16, 12),
        parentCheckpoint: checkpoint().toPrimitives(),
      }),
    );
    transitions.verify.mockRejectedValueOnce(
      new InvalidPrivateAuthorizationError(),
    );

    await expect(
      acceptor.accept(
        new PrivateOperationAcceptMessage(
          reusedTransition,
          'proof',
          controlFrame,
        ),
      ),
    ).rejects.toBeInstanceOf(InvalidPrivateAuthorizationError);
    expect(verifier.verify).toHaveBeenCalledWith(
      reusedTransition,
      authorKey,
    );
    expect(unitOfWork.quarantine).not.toHaveBeenCalled();
    expect(freshness.verify).not.toHaveBeenCalled();
  });

  it('rejects a cross-author claim on a reserved transition without freezing', async () => {
    const activeKey = encoded(32, 10);
    const historicalKey = encoded(32, 13);
    const currentCheckpoint = PrivateAuthorizationCheckpoint.fromPrimitives({
      ...checkpoint().toPrimitives(),
      admittedDeviceKeys: [activeKey],
      authorityKeys: [activeKey],
      deviceIdentities: [
        { deviceKey: activeKey, identityId: 'active-identity' },
      ],
      freshnessAuthorityKey: activeKey,
      headHash: encoded(32, 11),
      parentHeadHash: headHash,
      revision: 1,
      revokedDeviceKeys: [authorKey, historicalKey],
    });
    const claimedTransition = revocation({
      authorDeviceKey: historicalKey,
      payload: {
        deviceKey: historicalKey,
        resultingHeadHash: encoded(32, 11),
      },
    });
    repository.findScope.mockResolvedValue(
      PrivateAuthorizationScope.pin(currentCheckpoint, 'genesis'),
    );
    repository.findReservationAtRevision.mockResolvedValue(
      PrivateControlTransitionReservation.fromPrimitives({
        authorDeviceKey: authorKey,
        childHeadHash: encoded(32, 11),
        operationId: encoded(16, 12),
        parentCheckpoint: checkpoint().toPrimitives(),
      }),
    );
    transitions.verify.mockRejectedValueOnce(
      new InvalidPrivateAuthorizationError(),
    );

    await expect(
      acceptor.accept(
        new PrivateOperationAcceptMessage(
          claimedTransition,
          'proof',
          controlFrame,
        ),
      ),
    ).rejects.toBeInstanceOf(InvalidPrivateAuthorizationError);
    expect(verifier.verify).not.toHaveBeenCalled();
    expect(transitions.verify).not.toHaveBeenCalled();
    expect(unitOfWork.quarantine).not.toHaveBeenCalled();
    expect(freshness.verify).not.toHaveBeenCalled();
  });

  it('rejects a replay identifier carrying a different signed digest', async () => {
    const receipt = new PrivateControlOperationContract()
      .decode(signed())
      .toPrimitives();
    repository.findReceipt.mockResolvedValue({
      ...receipt,
      digest: encoded(32, 8),
    });

    await expect(
      acceptor.accept(new PrivateOperationAcceptMessage(signed(), 'proof')),
    ).rejects.toThrow('Private authorization conflict');
    expect(mutations.apply).not.toHaveBeenCalled();
  });

  it('durably freezes a conflicting queued operation identifier', async () => {
    const pending = new PrivateControlOperationContract().decode(signed());
    repository.findScope.mockResolvedValue(
      PrivateAuthorizationScope.fromPrimitives({
        acceptedOperations: [],
        checkpoint: checkpoint().toPrimitives(),
        genesisHash: 'genesis',
        ownerDeviceKey: 'owner',
        pendingOperations: [pending.toPrimitives()],
        status: 'active',
      }),
    );
    const conflicting = JSON.parse(signed());
    conflicting.payload.change.targetIdentityId = 'different-member';

    await expect(
      acceptor.accept(
        new PrivateOperationAcceptMessage(JSON.stringify(conflicting), 'proof'),
      ),
    ).rejects.toThrow('Private authorization conflict');
    expect(unitOfWork.quarantine).toHaveBeenCalledWith(scopeId);
  });

  it('maps malformed, unsupported and forged inputs to one redacted error', async () => {
    verifier.verify.mockImplementation(() => {
      throw new Error('secret key parser failure');
    });

    await expect(
      acceptor.accept(new PrivateOperationAcceptMessage(signed(), 'proof')),
    ).rejects.toThrow(InvalidPrivateAuthorizationError);
    await expect(
      acceptor.accept(
        new PrivateOperationAcceptMessage('{"version":2}', 'proof'),
      ),
    ).rejects.toThrow(InvalidPrivateAuthorizationError);
  });
});
