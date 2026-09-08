import { createHmac } from 'crypto';
import { CallRelayCredentialIssuer } from '@app/apps/apis/calls-api/CallRelayCredentialIssuer';

describe('CallRelayCredentialIssuer', () => {
  it('issues temporary credentials with the owner secret and an opaque stable subject', () => {
    const owner = 'a'.repeat(64),
      stranger = 'b'.repeat(64);
    const issuer = new CallRelayCredentialIssuer();
    const first = issuer.issue(
      'private-peer',
      ['turn:relay.test:4101'],
      owner,
      1000000,
    );
    expect(first.credential).toBe(
      createHmac('sha1', owner).update(first.username).digest('base64'),
    );
    expect(first.credential).not.toBe(
      createHmac('sha1', stranger).update(first.username).digest('base64'),
    );
    expect(first.username).not.toContain('private-peer');
    expect(first.username).toMatch(/^1600:[a-f0-9]{32}$/);
    const next = issuer.issue(
      'private-peer',
      ['turn:relay.test:4101'],
      owner,
      1001000,
    );
    expect(next.username.split(':')[1]).toBe(first.username.split(':')[1]);
  });
  it('limits issuance per peer and across peers', () => {
    const issuer = new CallRelayCredentialIssuer();
    for (let i = 0; i < 10; i++)
      issuer.issue('peer', ['turn:relay.test'], 'a'.repeat(64), 1000000);
    expect(() =>
      issuer.issue('peer', ['turn:relay.test'], 'a'.repeat(64), 1000000),
    ).toThrow('TURN credential request rejected');
    expect(() =>
      issuer.issue('peer', ['turn:relay.test'], 'a'.repeat(64), 1060000),
    ).not.toThrow();
    for (let i = 0; i < 99; i++)
      issuer.issue('peer-' + i, ['turn:relay.test'], 'a'.repeat(64), 1060000);
    expect(() =>
      issuer.issue('extra', ['turn:relay.test'], 'a'.repeat(64), 1060000),
    ).toThrow('TURN credential request rejected');
  });
  it('rejects missing owner configuration', () => {
    const issuer = new CallRelayCredentialIssuer();
    expect(() => issuer.issue('peer', [], 'a'.repeat(64))).toThrow();
    expect(() => issuer.issue('peer', ['turn:relay.test'], '')).toThrow();
  });
});
