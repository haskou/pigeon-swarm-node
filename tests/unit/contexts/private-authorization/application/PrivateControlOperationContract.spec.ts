import { InvalidPrivateAuthorizationError } from '@app/contexts/private-authorization/domain/errors/InvalidPrivateAuthorizationError';
import PrivateControlOperationContract from '@app/contexts/private-authorization/infrastructure/contracts/PrivateControlOperationContract';

describe('PrivateControlOperationContract', () => {
  const encoded = (bytes: number, value: number) =>
    Buffer.alloc(bytes, value).toString('base64url');
  const envelope = (
    kind: 'membership.propose' | 'membership.commit' | 'device.revoke',
    payload: Record<string, unknown>,
  ) =>
    JSON.stringify({
      authorDeviceKey: encoded(32, 3),
      authorizationRevision: 4,
      kind,
      operationId: encoded(16, 1),
      payload: {
        authorIdentityId: 'identity',
        identityAuthorizationEpoch: 'genesis',
        identityAuthorizationRevision: 2,
        ...payload,
      },
      previousOperationIds: [],
      scopeId: encoded(32, 2),
      signature: encoded(64, 4),
      version: 1,
    });
  const change = {
    targetIdentityId: 'identity',
    type: 'member.ban',
  };

  it.each([
    [
      'membership.propose',
      {
        change,
        parentHeadHash: encoded(32, 5),
        proposalId: encoded(16, 6),
      },
      undefined,
    ],
    [
      'membership.commit',
      {
        change,
        mlsMessageHash: encoded(32, 7),
        proposalOperationId: encoded(16, 6),
        resultingHeadHash: encoded(32, 8),
      },
      encoded(16, 6),
    ],
    [
      'device.revoke',
      { deviceKey: encoded(32, 9), resultingHeadHash: encoded(32, 8) },
      undefined,
    ],
  ] as const)('decodes the closed %s payload', (kind, payload, proposalId) => {
    const operation = new PrivateControlOperationContract().decode(
      envelope(kind, payload),
    );

    expect(operation.toPrimitives()).toMatchObject({
      authorizationRevision: 4,
      authorIdentityId: 'identity',
      identityAuthorizationEpoch: 'genesis',
      identityAuthorizationRevision: 2,
      kind,
      proposalOperationId: proposalId,
    });
  });

  it('uses the canonical signed envelope for the operation digest', () => {
    const compact = envelope('membership.propose', {
      change,
      parentHeadHash: encoded(32, 5),
      proposalId: encoded(16, 6),
    });
    const formatted = JSON.stringify(JSON.parse(compact), null, 2);
    const contract = new PrivateControlOperationContract();

    expect(contract.decode(formatted).toPrimitives().digest).toBe(
      contract.decode(compact).toPrimitives().digest,
    );
  });

  it.each([
    ['unknown envelope field', { extra: true }],
    ['unsupported version', { version: 2 }],
    ['unsupported kind', { kind: 'message.create' }],
  ])('rejects %s', (_label, change) => {
    const input = JSON.parse(
      envelope('membership.propose', {
        change: { targetIdentityId: 'identity', type: 'member.ban' },
        parentHeadHash: encoded(32, 5),
        proposalId: encoded(16, 6),
      }),
    );

    expect(() =>
      new PrivateControlOperationContract().decode(
        JSON.stringify({ ...input, ...change }),
      ),
    ).toThrow(InvalidPrivateAuthorizationError);
  });

  it.each([
    ['unknown payload field', { extra: true }],
    ['partial role patch', { change: { addRoleIds: ['role'], targetIdentityId: 'identity', type: 'member.roles.set' } }],
    ['unknown change', { change: { targetIdentityId: 'identity', type: 'owner.replace' } }],
    ['invalid head hash', { parentHeadHash: 'invalid' }],
  ])('rejects proposal with %s', (_label, payloadChange) => {
    const payload = {
      change,
      parentHeadHash: encoded(32, 5),
      proposalId: encoded(16, 6),
      ...payloadChange,
    };

    expect(() =>
      new PrivateControlOperationContract().decode(
        envelope('membership.propose', payload),
      ),
    ).toThrow(InvalidPrivateAuthorizationError);
  });

  it('rejects duplicate and oversized causal operation lists', () => {
    const input = JSON.parse(
      envelope('membership.propose', {
        change,
        parentHeadHash: encoded(32, 5),
        proposalId: encoded(16, 6),
      }),
    );
    const causalId = encoded(16, 7);

    expect(() =>
      new PrivateControlOperationContract().decode(
        JSON.stringify({ ...input, previousOperationIds: [causalId, causalId] }),
      ),
    ).toThrow(InvalidPrivateAuthorizationError);
    expect(() =>
      new PrivateControlOperationContract().decode(
        JSON.stringify({
          ...input,
          previousOperationIds: Array.from({ length: 33 }, (_, index) =>
            encoded(16, index),
          ),
        }),
      ),
    ).toThrow(InvalidPrivateAuthorizationError);
  });

  it('rejects an oversized signed operation before parsing it', () => {
    const oversized = ' '.repeat(262_145);
    const parse = jest.spyOn(JSON, 'parse');

    expect(() => new PrivateControlOperationContract().decode(oversized)).toThrow(
      InvalidPrivateAuthorizationError,
    );
    expect(parse).not.toHaveBeenCalled();

    parse.mockRestore();
  });
});
