import { InvalidPresenceIdentityIdsError } from '@app/apps/apis/presence-api/errors/InvalidPresenceIdentityIdsError';
import { GetPresenceListRequest } from '@app/apps/apis/presence-api/requests/GetPresenceListRequest';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';

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

  it('accepts up to 100 distinct identityIds', async () => {
    const identityIds = await identityIdsOf(100);
    const message = new GetPresenceListRequest(
      'viewer-id',
      identityIds.join(','),
    ).getMessage();

    expect(message.identityIds).toEqual(identityIds);
  });

  it('counts repeated identityIds once toward the cap', async () => {
    const identityIds = await identityIdsOf(100);
    const message = new GetPresenceListRequest('viewer-id', [
      ...identityIds,
      identityIds[0],
    ]).getMessage();

    expect(message.identityIds).toEqual(identityIds);
  });

  it('refuses more than 100 distinct identityIds', async () => {
    const identityIds = await identityIdsOf(101);

    expect(() =>
      new GetPresenceListRequest(
        'viewer-id',
        identityIds.join(','),
      ).getMessage(),
    ).toThrow(InvalidPresenceIdentityIdsError);
  });

  it('refuses a non-canonical identityId instead of dropping it', async () => {
    const [validIdentityId] = await identityIdsOf(1);

    expect(() =>
      new GetPresenceListRequest('viewer-id', [
        validIdentityId,
        'unknown',
      ]).getMessage(),
    ).toThrow(InvalidPresenceIdentityIdsError);
  });

  it('refuses blank items in identityIds', async () => {
    const [identityId] = await identityIdsOf(1);

    expect(() =>
      new GetPresenceListRequest('viewer-id', `${identityId},`).getMessage(),
    ).toThrow(InvalidPresenceIdentityIdsError);
    expect(() =>
      new GetPresenceListRequest('viewer-id', '').getMessage(),
    ).toThrow(InvalidPresenceIdentityIdsError);
  });

  it('answers no identities when identityIds is absent', () => {
    const message = new GetPresenceListRequest('viewer-id').getMessage();

    expect(message.identityIds).toEqual([]);
  });
});

async function identityId(): Promise<string> {
  const [id] = await identityIdsOf(1);

  return id;
}

async function identityIdsOf(count: number): Promise<string[]> {
  return Promise.all(
    Array.from({ length: count }, async () => {
      const keyPair = await KeyPair.generate();

      return new IdentityId(keyPair.toPrimitives().publicKey).valueOf();
    }),
  );
}
