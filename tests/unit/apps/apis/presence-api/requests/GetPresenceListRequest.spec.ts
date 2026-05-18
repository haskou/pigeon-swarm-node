import { GetPresenceListRequest } from '@app/apps/apis/presence-api/requests/GetPresenceListRequest';

describe('GetPresenceListRequest', () => {
  it('accepts repeated identityIds query params', () => {
    const message = new GetPresenceListRequest('viewer-id', [
      'first-id',
      'second-id',
    ]).getMessage();

    expect(message.identityIds).toEqual(['first-id', 'second-id']);
  });

  it('accepts comma-separated identityIds query params', () => {
    const message = new GetPresenceListRequest(
      'viewer-id',
      'first-id, second-id',
    ).getMessage();

    expect(message.identityIds).toEqual(['first-id', 'second-id']);
  });

  it('accepts mixed repeated and comma-separated identityIds query params', () => {
    const message = new GetPresenceListRequest('viewer-id', [
      'first-id, second-id',
      'third-id',
    ]).getMessage();

    expect(message.identityIds).toEqual([
      'first-id',
      'second-id',
      'third-id',
    ]);
  });
});
