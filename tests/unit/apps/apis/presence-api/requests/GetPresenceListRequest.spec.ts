import { GetPresenceListRequest } from '@app/apps/apis/presence-api/requests/GetPresenceListRequest';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { KeyPair } from '@haskou/value-objects';

describe('GetPresenceListRequest', () => {
  it('accepts repeated identityIds query params', async () => {
    const firstIdentityId = await identityId();
    const secondIdentityId = await identityId();
    const message = new GetPresenceListRequest('viewer-id', [
      firstIdentityId,
      secondIdentityId,
    ]).getMessage();

    expect(message.identityIds).toEqual([firstIdentityId, secondIdentityId]);
  });

  it('accepts comma-separated identityIds query params', async () => {
    const firstIdentityId = await identityId();
    const secondIdentityId = await identityId();
    const message = new GetPresenceListRequest(
      'viewer-id',
      `${firstIdentityId}, ${secondIdentityId}`,
    ).getMessage();

    expect(message.identityIds).toEqual([firstIdentityId, secondIdentityId]);
  });

  it('accepts mixed repeated and comma-separated identityIds query params', async () => {
    const firstIdentityId = await identityId();
    const secondIdentityId = await identityId();
    const thirdIdentityId = await identityId();
    const message = new GetPresenceListRequest('viewer-id', [
      `${firstIdentityId}, ${secondIdentityId}`,
      thirdIdentityId,
    ]).getMessage();

    expect(message.identityIds).toEqual([
      firstIdentityId,
      secondIdentityId,
      thirdIdentityId,
    ]);
  });

  it('ignores invalid identityIds in list requests', async () => {
    const validIdentityId = await identityId();
    const message = new GetPresenceListRequest('viewer-id', [
      validIdentityId,
      'unknown',
    ]).getMessage();

    expect(message.identityIds).toEqual([validIdentityId]);
  });
});

async function identityId(): Promise<string> {
  const keyPair = await KeyPair.generate();

  return new IdentityId(keyPair.toPrimitives().publicKey).valueOf();
}
