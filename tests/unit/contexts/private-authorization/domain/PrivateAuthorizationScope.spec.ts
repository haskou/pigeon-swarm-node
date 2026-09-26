import { PrivateAuthorizationCheckpoint } from '@app/contexts/private-authorization/domain/PrivateAuthorizationCheckpoint';
import { PrivateAuthorizationScope } from '@app/contexts/private-authorization/domain/PrivateAuthorizationScope';
import { PrivateControlOperation } from '@app/contexts/private-authorization/domain/PrivateControlOperation';
import { PrivateAuthorizationConflictError } from '@app/contexts/private-authorization/domain/errors/PrivateAuthorizationConflictError';
import { InvalidPrivateAuthorizationError } from '@app/contexts/private-authorization/domain/errors/InvalidPrivateAuthorizationError';
import { PrivatePendingCapacityExceededError } from '@app/contexts/private-authorization/domain/errors/PrivatePendingCapacityExceededError';
import { PrivateAuthorizationScopeWasFrozenEvent } from '@app/contexts/private-authorization/domain/events/PrivateAuthorizationScopeWasFrozenEvent';
import { PrivateAuthorizationScopeWasPinnedEvent } from '@app/contexts/private-authorization/domain/events/PrivateAuthorizationScopeWasPinnedEvent';
import { PrivateControlOperationWasAcceptedEvent } from '@app/contexts/private-authorization/domain/events/PrivateControlOperationWasAcceptedEvent';

describe('PrivateAuthorizationScope', () => {
  const scopeId = 'scope';
  const ownerKey = 'owner-key';
  const memberKey = 'member-key';
  const genesis = () =>
    PrivateAuthorizationCheckpoint.genesis({
      admittedDeviceKeys: [ownerKey, memberKey],
      authorityKeys: [ownerKey],
      controlCheckpointJson: '{}',
      freshnessAuthorityKey: ownerKey,
      headHash: 'head-0',
      scopeId,
    });
  const operation = (
    change: Partial<
      ReturnType<PrivateControlOperation['toPrimitives']>
    > = {},
  ): PrivateControlOperation =>
    PrivateControlOperation.fromPrimitives({
      authorDeviceKey: ownerKey,
      authorizationRevision: 0,
      byteSize: 512,
      digest: 'digest-proposal',
      id: 'proposal',
      kind: 'membership.propose',
      mutation: { targetIdentityId: 'member', type: 'member.ban' },
      previousOperationIds: [],
      proposalOperationId: undefined,
      scopeId,
      ...change,
    });
  const successor = (
    change: Partial<
      ReturnType<PrivateAuthorizationCheckpoint['toPrimitives']>
    > = {},
  ): PrivateAuthorizationCheckpoint =>
    PrivateAuthorizationCheckpoint.fromPrimitives({
      admittedDeviceKeys: [ownerKey],
      authorityKeys: [ownerKey],
      controlCheckpointJson: '{}',
      freshnessAuthorityKey: ownerKey,
      headHash: 'head-1',
      parentHeadHash: 'head-0',
      revision: 1,
      revokedDeviceKeys: [memberKey],
      scopeId,
      ...change,
    });

  it('pins genesis once and emits a scope event', () => {
    const scope = PrivateAuthorizationScope.pin(genesis(), 'genesis-hash');

    expect(scope.toPrimitives()).toMatchObject({
      genesisHash: 'genesis-hash',
      status: 'active',
      checkpoint: { headHash: 'head-0', revision: 0, scopeId },
    });
    expect(scope.pullDomainEvents()).toEqual([
      expect.any(PrivateAuthorizationScopeWasPinnedEvent),
    ]);
    expect(() => scope.pinGenesis(genesis(), 'other-genesis')).toThrow(
      PrivateAuthorizationConflictError,
    );
    expect(scope.toPrimitives().status).toBe('frozen');
  });

  it('accepts a proposal once and treats an identical replay as a duplicate', () => {
    const scope = PrivateAuthorizationScope.pin(genesis(), 'genesis-hash');
    scope.pullDomainEvents();
    const proposal = operation();

    expect(scope.acceptProposal(proposal)).toBe('accepted');
    expect(scope.acceptProposal(proposal)).toBe('duplicate');
    expect(scope.toPrimitives().acceptedOperations).toHaveLength(1);
    expect(scope.pullDomainEvents()).toEqual([
      expect.any(PrivateControlOperationWasAcceptedEvent),
    ]);
  });

  it('freezes when an operation identifier is reused with another digest', () => {
    const scope = PrivateAuthorizationScope.pin(genesis(), 'genesis-hash');
    scope.acceptProposal(operation());
    scope.pullDomainEvents();

    expect(() =>
      scope.acceptProposal(operation({ digest: 'different-digest' })),
    ).toThrow(PrivateAuthorizationConflictError);
    expect(scope.toPrimitives().status).toBe('frozen');
    expect(scope.pullDomainEvents()).toEqual([
      expect.any(PrivateAuthorizationScopeWasFrozenEvent),
    ]);
  });

  it.each([
    ['wrong scope', { scopeId: 'other-scope' }],
    ['old revision', { authorizationRevision: -1 }],
    ['unknown author', { authorDeviceKey: 'unknown-key' }],
    ['unsupported kind', { kind: 'message.create' }],
  ])('rejects %s without changing accepted state', (_label, change) => {
    const scope = PrivateAuthorizationScope.pin(genesis(), 'genesis-hash');

    expect(() => scope.acceptProposal(operation(change))).toThrow(
      InvalidPrivateAuthorizationError,
    );
    expect(scope.toPrimitives().acceptedOperations).toEqual([]);
  });

  it('queues future revisions and missing causal predecessors', () => {
    const scope = PrivateAuthorizationScope.pin(genesis(), 'genesis-hash');
    const future = operation({
      authorizationRevision: 1,
      digest: 'future-digest',
      id: 'future',
    });
    const orphan = operation({
      digest: 'orphan-digest',
      id: 'orphan',
      previousOperationIds: ['missing'],
    });

    expect(scope.acceptProposal(future)).toBe('pending');
    expect(scope.acceptProposal(orphan)).toBe('pending');
    expect(scope.toPrimitives().pendingOperations).toHaveLength(2);
  });

  it('commits the exact proposed mutation with an exact successor checkpoint', () => {
    const scope = PrivateAuthorizationScope.pin(genesis(), 'genesis-hash');
    const proposal = operation();
    scope.acceptProposal(proposal);
    const commit = operation({
      digest: 'digest-commit',
      id: 'commit',
      kind: 'membership.commit',
      previousOperationIds: ['proposal'],
      proposalOperationId: 'proposal',
    });

    expect(scope.commitTransition(commit, successor())).toBe('accepted');
    expect(scope.toPrimitives()).toMatchObject({
      checkpoint: { headHash: 'head-1', revision: 1 },
      acceptedOperations: [{ id: 'proposal' }, { id: 'commit' }],
    });
  });

  it.each([
    ['missing proposal', { proposalOperationId: 'missing' }, {}],
    [
      'different mutation',
      {},
      { mutation: { targetIdentityId: 'other', type: 'member.ban' } },
    ],
    ['skipped revision', {}, { checkpoint: { revision: 2 } }],
    ['wrong parent', {}, { checkpoint: { parentHeadHash: 'other-head' } }],
    ['wrong scope', {}, { checkpoint: { scopeId: 'other-scope' } }],
  ])(
    'rejects transition with %s',
    (
      _label,
      operationChange: Record<string, unknown>,
      transitionChange: {
        checkpoint?: Record<string, unknown>;
        mutation?: Record<string, unknown>;
      },
    ) => {
      const scope = PrivateAuthorizationScope.pin(genesis(), 'genesis-hash');
      scope.acceptProposal(operation());
      const commit = operation({
        digest: 'digest-commit',
        id: 'commit',
        kind: 'membership.commit',
        mutation:
          transitionChange.mutation ?? operation().toPrimitives().mutation,
        previousOperationIds: ['proposal'],
        proposalOperationId: 'proposal',
        ...operationChange,
      });

      expect(() =>
        scope.commitTransition(
          commit,
          successor(transitionChange.checkpoint ?? {}),
        ),
      ).toThrow(InvalidPrivateAuthorizationError);
    },
  );

  it('revokes an admitted device only with the matching successor policy', () => {
    const scope = PrivateAuthorizationScope.pin(genesis(), 'genesis-hash');
    const revocation = operation({
      digest: 'digest-revoke',
      id: 'revoke',
      kind: 'device.revoke',
      mutation: { deviceKey: memberKey, type: 'device.revoke' },
    });

    expect(scope.revokeDevice(revocation, successor())).toBe('accepted');
    expect(() =>
      scope.acceptProposal(
        operation({
          authorDeviceKey: memberKey,
          authorizationRevision: 1,
          digest: 'revoked-author',
          id: 'revoked-author',
        }),
      ),
    ).toThrow(InvalidPrivateAuthorizationError);
  });

  it('rejects revocation when the candidate still admits the device', () => {
    const scope = PrivateAuthorizationScope.pin(genesis(), 'genesis-hash');
    const revocation = operation({
      digest: 'digest-revoke',
      id: 'revoke',
      kind: 'device.revoke',
      mutation: { deviceKey: memberKey, type: 'device.revoke' },
    });

    expect(() =>
      scope.revokeDevice(
        revocation,
        successor({
          admittedDeviceKeys: [ownerKey, memberKey],
          revokedDeviceKeys: [],
        }),
      ),
    ).toThrow(InvalidPrivateAuthorizationError);
  });

  it('returns retryable pending operations in deterministic operation-id order', () => {
    const scope = PrivateAuthorizationScope.pin(genesis(), 'genesis-hash');
    scope.acceptProposal(
      operation({
        digest: 'digest-z',
        id: 'z',
        previousOperationIds: ['dependency'],
      }),
    );
    scope.acceptProposal(
      operation({
        digest: 'digest-a',
        id: 'a',
        previousOperationIds: ['dependency'],
      }),
    );
    scope.acceptProposal(
      operation({ digest: 'dependency-digest', id: 'dependency' }),
    );

    expect(
      scope.retryable().map((pending) => pending.toPrimitives().id),
    ).toEqual(['a', 'z']);
  });

  it('promotes an identical pending operation once its predecessors are accepted', () => {
    const scope = PrivateAuthorizationScope.pin(genesis(), 'genesis-hash');
    const dependent = operation({
      digest: 'dependent-digest',
      id: 'dependent',
      previousOperationIds: ['dependency'],
    });

    expect(scope.acceptProposal(dependent)).toBe('pending');
    expect(
      scope.acceptProposal(
        operation({ digest: 'dependency-digest', id: 'dependency' }),
      ),
    ).toBe('accepted');
    expect(scope.acceptProposal(dependent)).toBe('accepted');
    expect(scope.toPrimitives().pendingOperations).toEqual([]);
  });

  it('enforces both pending queue bounds without acknowledging overflow', () => {
    const countBound = PrivateAuthorizationScope.pin(
      genesis(),
      'genesis-hash',
    );
    for (let index = 0; index < 128; index++) {
      expect(
        countBound.acceptProposal(
          operation({
            authorizationRevision: 1,
            byteSize: 1,
            digest: `digest-${index}`,
            id: `pending-${index}`,
          }),
        ),
      ).toBe('pending');
    }
    expect(() =>
      countBound.acceptProposal(
        operation({
          authorizationRevision: 1,
          byteSize: 1,
          digest: 'overflow-count',
          id: 'overflow-count',
        }),
      ),
    ).toThrow(PrivatePendingCapacityExceededError);

    const byteBound = PrivateAuthorizationScope.pin(genesis(), 'genesis-hash');
    expect(
      byteBound.acceptProposal(
        operation({
          authorizationRevision: 1,
          byteSize: 1024 * 1024,
          digest: 'full-bytes',
          id: 'full-bytes',
        }),
      ),
    ).toBe('pending');
    expect(() =>
      byteBound.acceptProposal(
        operation({
          authorizationRevision: 1,
          byteSize: 1,
          digest: 'overflow-bytes',
          id: 'overflow-bytes',
        }),
      ),
    ).toThrow(PrivatePendingCapacityExceededError);
  });

  it('hydrates without inventing domain events', () => {
    const original = PrivateAuthorizationScope.pin(genesis(), 'genesis-hash');
    original.acceptProposal(operation());

    const hydrated = PrivateAuthorizationScope.fromPrimitives(
      original.toPrimitives(),
    );

    expect(hydrated.toPrimitives()).toEqual(original.toPrimitives());
    expect(hydrated.pullDomainEvents()).toEqual([]);
  });
});
