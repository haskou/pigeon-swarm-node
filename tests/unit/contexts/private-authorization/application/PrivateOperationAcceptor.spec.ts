import { PrivateControlMutationAuthorizer } from '@app/contexts/private-authorization/application/accept-operation/PrivateControlMutationAuthorizer';
import { PrivateControlTransitionProcessor } from '@app/contexts/private-authorization/application/accept-operation/PrivateControlTransitionProcessor';
import { PrivateFreshnessGate } from '@app/contexts/private-authorization/application/accept-operation/PrivateFreshnessGate';
import { PrivateOperationAcceptMessage } from '@app/contexts/private-authorization/application/accept-operation/messages/PrivateOperationAcceptMessage';
import PrivateOperationAcceptor from '@app/contexts/private-authorization/application/accept-operation/PrivateOperationAcceptor';
import { PrivateOperationUnitOfWork } from '@app/contexts/private-authorization/application/PrivateOperationUnitOfWork';
import { PrivateAuthorizationCheckpoint } from '@app/contexts/private-authorization/domain/PrivateAuthorizationCheckpoint';
import { PrivateAuthorizationScope } from '@app/contexts/private-authorization/domain/PrivateAuthorizationScope';
import { InvalidPrivateAuthorizationError } from '@app/contexts/private-authorization/domain/errors/InvalidPrivateAuthorizationError';
import { PrivateAuthorizationRepository } from '@app/contexts/private-authorization/domain/repositories/PrivateAuthorizationRepository';
import PrivateControlOperationContract from '@app/contexts/private-authorization/infrastructure/contracts/PrivateControlOperationContract';
import PrivateOperationVerifier from '@app/contexts/private-authorization/infrastructure/crypto/PrivateOperationVerifier';

describe('PrivateOperationAcceptor', () => {
  const encoded = (bytes: number, value: number) =>
    Buffer.alloc(bytes, value).toString('base64url');
  const scopeId = encoded(32, 1);
  const authorKey = encoded(32, 2);
  const headHash = encoded(32, 3);
  const operationId = encoded(16, 4);
  const proposalId = encoded(16, 5);
  const checkpoint = () =>
    PrivateAuthorizationCheckpoint.genesis({
      admittedDeviceKeys: [authorKey],
      authorityKeys: [authorKey],
      controlCheckpointJson: '{}',
      freshnessAuthorityKey: authorKey,
      headHash,
      scopeId,
    });
  const scope = () => PrivateAuthorizationScope.pin(checkpoint(), 'genesis');
  const signed = (changes: Record<string, unknown> = {}) =>
    JSON.stringify({
      authorDeviceKey: authorKey,
      authorizationRevision: 0,
      kind: 'membership.propose',
      operationId,
      payload: {
        change: { targetIdentityId: 'member', type: 'member.ban' },
        parentHeadHash: headHash,
        proposalId,
      },
      previousOperationIds: [],
      scopeId,
      signature: encoded(64, 6),
      version: 1,
      ...changes,
    });
  const revocation = (changes: Record<string, unknown> = {}) =>
    signed({
      kind: 'device.revoke',
      payload: {
        deviceKey: authorKey,
        resultingHeadHash: encoded(32, 7),
      },
      ...changes,
    });

  let repository: jest.Mocked<PrivateAuthorizationRepository>;
  let unitOfWork: jest.Mocked<PrivateOperationUnitOfWork>;
  let verifier: jest.Mocked<PrivateOperationVerifier>;
  let freshness: jest.Mocked<PrivateFreshnessGate>;
  let transitions: jest.Mocked<PrivateControlTransitionProcessor>;
  let mutations: jest.Mocked<PrivateControlMutationAuthorizer>;
  let acceptor: PrivateOperationAcceptor;

  beforeEach(() => {
    repository = {
      findOutbox: jest.fn(),
      findPending: jest.fn(),
      findProjection: jest.fn().mockResolvedValue({ members: [] }),
      findProtectedMlsState: jest.fn(),
      findReceipt: jest.fn(),
      findReservation: jest.fn(),
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
      commitPending: jest.fn().mockResolvedValue('committed'),
      commitAcceptance: jest.fn().mockResolvedValue('committed'),
      quarantine: jest.fn(),
      reserveChild: jest.fn(),
    };
    verifier = {
      verify: jest.fn((value) => value),
    } as unknown as jest.Mocked<PrivateOperationVerifier>;
    freshness = {
      issue: jest.fn().mockReturnValue('challenge-request'),
      verify: jest.fn().mockResolvedValue({ replayMarkerId: 'challenge' }),
    };
    transitions = { verify: jest.fn() };
    mutations = {
      apply: jest.fn().mockResolvedValue({ members: ['member'] }),
    };
    acceptor = new PrivateOperationAcceptor(
      repository,
      unitOfWork,
      verifier,
      new PrivateControlOperationContract(),
      freshness,
      transitions,
      mutations,
    );
  });

  it('issues freshness only after verifying the signed operation against local policy', async () => {
    await expect(acceptor.challenge(signed())).resolves.toBe(
      'challenge-request',
    );
    expect(verifier.verify).toHaveBeenCalledWith(signed(), authorKey);
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
    repository.findProtectedMlsState.mockResolvedValue('protected-state');
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

  it('acknowledges an identical receipt after its author is revoked', async () => {
    const decoded = new PrivateControlOperationContract()
      .decode(signed())
      .toPrimitives();
    const activeKey = encoded(32, 10);
    const revokedCheckpoint = PrivateAuthorizationCheckpoint.fromPrimitives({
      ...checkpoint().toPrimitives(),
      admittedDeviceKeys: [activeKey],
      authorityKeys: [activeKey],
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

  it('rejects a replay identifier carrying a different signed digest', async () => {
    const receipt = new PrivateControlOperationContract()
      .decode(signed())
      .toPrimitives();
    repository.findReceipt.mockResolvedValue({ ...receipt, digest: encoded(32, 8) });

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
        pendingOperations: [pending.toPrimitives()],
        status: 'active',
      }),
    );
    const conflicting = JSON.parse(signed());
    conflicting.payload.change.targetIdentityId = 'different-member';

    await expect(
      acceptor.accept(
        new PrivateOperationAcceptMessage(
          JSON.stringify(conflicting),
          'proof',
        ),
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
      acceptor.accept(new PrivateOperationAcceptMessage('{"version":2}', 'proof')),
    ).rejects.toThrow(InvalidPrivateAuthorizationError);
  });
});
