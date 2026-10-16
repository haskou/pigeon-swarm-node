import { SignedNodeBlockList } from '@app/contexts/nodes/domain/SignedNodeBlockList';
import { KeyPair } from '@haskou/pigeon-swarm-crypto';

import { NodeBlockListMother } from '../../../mothers/NodeBlockListMother';

describe('SignedNodeBlockList', () => {
  let owner: KeyPair;
  let mother: NodeBlockListMother;

  beforeAll(async () => {
    owner = await KeyPair.generate();
  });

  beforeEach(() => {
    mother = new NodeBlockListMother(owner).withVersion(3);
  });

  it('should verify the bytes its owner signed under the block list domain', () => {
    expect(mother.signed().isSignedBy(mother.ownerIdentityId())).toBe(true);
  });

  it('should verify bytes that are not even JSON without reading them', () => {
    expect(
      mother.signing('not json').isSignedBy(mother.ownerIdentityId()),
    ).toBe(true);
  });

  it('should refuse another signer', async () => {
    expect(
      mother.signed().isSignedBy(await NodeBlockListMother.identityId()),
    ).toBe(false);
  });

  it('should refuse one changed byte', () => {
    const content = mother.content();
    const tampered = Buffer.from(content);

    tampered[tampered.length - 2] = tampered[tampered.length - 2] + 1;

    expect(
      new SignedNodeBlockList(
        tampered,
        mother.signed().getIdentitySignature(),
      ).isSignedBy(mother.ownerIdentityId()),
    ).toBe(false);
  });

  it('should refuse a signature made outside the block list domain', () => {
    const content = mother.content();

    expect(
      new SignedNodeBlockList(content, owner.sign(content)).isSignedBy(
        mother.ownerIdentityId(),
      ),
    ).toBe(false);
  });

  it('should be equal only for the same bytes and signature', () => {
    const signed = mother.signed();

    expect(signed.isEqual(mother.signed())).toBe(true);
    expect(signed.isEqual(mother.withVersion(4).signed())).toBe(false);
    expect(signed.isEqual(mother.content())).toBe(false);
  });
});
