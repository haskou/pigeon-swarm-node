import { InvalidDeviceAuthorizationTransitionLogRequestError } from '@app/apps/apis/identity-devices-api/errors/InvalidDeviceAuthorizationTransitionLogRequestError';
import { GetDeviceAuthorizationTransitionLogRequest } from '@app/apps/apis/identity-devices-api/requests/GetDeviceAuthorizationTransitionLogRequest';
import { RecoveryAuthority } from '@app/contexts/identities/domain/value-objects/RecoveryAuthority';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';

describe(GetDeviceAuthorizationTransitionLogRequest.name, () => {
  const fixture = async (): Promise<{
    identityId: IdentityId;
    reader: RecoveryAuthority;
  }> => ({
    identityId: new IdentityId(
      (await KeyPair.generate()).toPrimitives().publicKey,
    ),
    reader: RecoveryAuthority.fromString(
      (await KeyPair.generate()).toPrimitives().publicKey,
    ),
  });

  it('reads the whole log when no revision is given', async () => {
    const { identityId, reader } = await fixture();

    const message = new GetDeviceAuthorizationTransitionLogRequest(
      identityId,
      reader,
      undefined,
    ).getMessage();

    expect(message.identityId).toBe(identityId);
    expect(message.reader).toBe(reader);
    expect(message.after.valueOf()).toBe(0);
  });

  it.each([
    ['0', 0],
    ['7', 7],
    ['9007199254740991', Number.MAX_SAFE_INTEGER],
  ])('reads after revision %s', async (after, revision) => {
    const { identityId, reader } = await fixture();

    expect(
      new GetDeviceAuthorizationTransitionLogRequest(identityId, reader, after)
        .getMessage()
        .after.valueOf(),
    ).toBe(revision);
  });

  it.each([
    [''],
    ['01'],
    ['-1'],
    ['1.0'],
    ['1e3'],
    [' 1'],
    ['0x1'],
    ['9007199254740992'],
    [['1']],
    [{ revision: '1' }],
  ])('refuses after revision %j', async (after) => {
    const { identityId, reader } = await fixture();

    expect(() =>
      new GetDeviceAuthorizationTransitionLogRequest(
        identityId,
        reader,
        after,
      ).getMessage(),
    ).toThrow(InvalidDeviceAuthorizationTransitionLogRequestError);
  });
});
