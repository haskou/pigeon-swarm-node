import { CommunityInvite } from '@app/contexts/communities/domain/CommunityInvite';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { EncryptedCommunityInviteKey } from '@app/contexts/communities/domain/value-objects/EncryptedCommunityInviteKey';
import { CommunityInviteMaxUses } from '@app/contexts/communities/domain/value-objects/CommunityInviteMaxUses';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Timestamp } from '@haskou/value-objects';

describe('CommunityInvite', () => {
  const communityId = CommunityId.generate();
  const creatorIdentityId = new IdentityId(
    'MCowBQYDK2VwAyEAFuQGsm0WcnE4FhQecwAFGeTfQCZzEMuhE73CyTUxOio=',
  );

  it('consumes invite uses when accepted', () => {
    const invite = CommunityInvite.create(communityId, creatorIdentityId);

    invite.accept();

    expect(invite.toPrimitives().uses).toBe(1);
  });

  it('rejects exhausted invites', () => {
    const invite = CommunityInvite.create(communityId, creatorIdentityId);

    invite.accept();

    expect(() => invite.accept()).toThrow(
      'Community invite maximum uses exceeded',
    );
  });

  it('rejects expired invites', () => {
    const invite = CommunityInvite.create(
      communityId,
      creatorIdentityId,
      new Timestamp(1770000000000),
      new CommunityInviteMaxUses(1),
    );

    expect(() => invite.accept(new Timestamp(1770000000001))).toThrow(
      'Community invite has expired',
    );
  });

  it('keeps encrypted community key material opaque', () => {
    const encryptedCommunityKey = EncryptedCommunityInviteKey.fromPrimitives({
      algorithm: 'AES-GCM',
      ciphertext: 'ciphertext',
      nonce: 'nonce',
      version: 1,
    });
    const invite = CommunityInvite.create(
      communityId,
      creatorIdentityId,
      undefined,
      new CommunityInviteMaxUses(1),
      encryptedCommunityKey,
    );

    expect(invite.toPrimitives().encryptedCommunityKey).toEqual({
      algorithm: 'AES-GCM',
      ciphertext: 'ciphertext',
      nonce: 'nonce',
      version: 1,
    });
  });

  it('rejects unsupported encrypted community key algorithms', () => {
    expect(() =>
      EncryptedCommunityInviteKey.fromPrimitives({
        algorithm: 'plain',
        ciphertext: 'ciphertext',
        nonce: 'nonce',
        version: 1,
      }),
    ).toThrow('Unsupported encrypted community invite key algorithm');
  });
});
