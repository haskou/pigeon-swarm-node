import CallRelayCredentialIssuer from '@app/apps/apis/calls-api/CallRelayCredentialIssuer';
import vectors from '@haskou/pigeon-swarm-crypto/vectors/turn-credentials.json';

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
    const strangers = issuer.issue(
      'private-peer',
      ['turn:relay.test:4101'],
      stranger,
      1000000,
    );
    expect(first.credential).not.toBe(strangers.credential);
    expect(first.username).not.toBe(strangers.username);
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
  it('issues the shared relay peer subject vector byte for byte', () => {
    const [subject] = vectors.peerSubjects;
    const expected = vectors.credentials.find(
      (vector) => vector.name === 'relay_peer_subject',
    )!;
    const credential = new CallRelayCredentialIssuer().issue(
      subject.peerId,
      ['turn:relay.test:4101'],
      subject.sharedSecret,
      (expected.expiresAtSeconds - 600) * 1000,
    );

    expect(credential).toEqual({
      credential: expected.credential,
      urls: ['turn:relay.test:4101'],
      username: expected.username,
    });
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
