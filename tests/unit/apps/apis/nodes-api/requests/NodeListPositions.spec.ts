import { NodeListPositions } from '@app/apps/apis/nodes-api/requests/NodeListPositions';
import { IdentityIdMother } from '../../../../mothers/IdentityIdMother';

describe(NodeListPositions.name, () => {
  it('accepts a canonical identity id', () => {
    const identityId = IdentityIdMother.canonical().valueOf();

    expect(NodeListPositions.identityId(identityId).valueOf()).toBe(
      identityId,
    );
  });

  it('refuses an identity id that is not a public key', () => {
    expect(() => NodeListPositions.identityId('not-a-key')).toThrow();
  });

  it('accepts a node id', () => {
    const nodeId = '550e8400-e29b-41d4-a716-446655440012';

    expect(NodeListPositions.nodeId(nodeId).valueOf()).toBe(nodeId);
  });

  it('refuses a node id that is not a uuid', () => {
    expect(() => NodeListPositions.nodeId('not-a-node')).toThrow();
  });

  it('accepts a node peer id in base58', () => {
    const peerId = '12D3KooWD3eckifWpRJ5FeAexqhKVVaBmACPdBCeQ8oTdHxZBJaP';

    expect(NodeListPositions.nodePeerId(peerId).valueOf()).toBe(peerId);
  });

  it('refuses a node peer id outside base58', () => {
    expect(() =>
      NodeListPositions.nodePeerId('0OIl0OIl0OIl0OIl0OIl0OIl0OIl0OIl0OIl0OIl0OIl'),
    ).toThrow();
  });

  it('accepts a registration code id', () => {
    const codeId = '550e8400-e29b-41d4-a716-446655440031';

    expect(NodeListPositions.registrationCodeId(codeId).valueOf()).toBe(
      codeId,
    );
  });

  it('refuses a registration code id that is not a uuid', () => {
    expect(() => NodeListPositions.registrationCodeId('not-a-code')).toThrow();
  });
});
