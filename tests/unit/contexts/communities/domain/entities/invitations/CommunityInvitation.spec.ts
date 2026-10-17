import { CommunityInvitation } from '@app/contexts/communities/domain/entities/invitations/CommunityInvitation';
import { CommunityInvitationUnusableError } from '@app/contexts/communities/domain/errors/CommunityInvitationUnusableError';
import { InvalidCommunityOperationError } from '@app/contexts/communities/domain/errors/InvalidCommunityOperationError';
import { CommunityStateFold } from '@app/contexts/communities/domain/operations/CommunityStateFold';
import { CommunityOperationAction } from '@app/contexts/communities/domain/value-objects/CommunityOperationAction';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { CommunityInvitationConsent } from '@haskou/pigeon-swarm-crypto';

import { cryptoVectors } from '../../../../../../support/cryptoVectors';
import { IdentityIdMother } from '../../../../../mothers/IdentityIdMother';
import {
  alice,
  bob,
  DAY,
  genesis,
  Invitation,
  invitation,
  invitationFieldsOf,
  join,
  mallory,
  operation,
  owner,
  privateKeyOf,
} from '../../operations/CommunityOperationFixtures';

const { invalid } = cryptoVectors<{
  invalid: { invitationKeys: { invitationKey: string; name: string }[] };
}>('community-invitation');

describe('CommunityInvitation', () => {
  const created = genesis();
  const community = CommunityStateFold.fold([created]).community!;

  function issued(
    args: Record<string, unknown> = {},
    createdAt = 1,
  ): Invitation {
    return invitation([created], owner, args, createdAt);
  }

  function proofsOf(invited: Invitation, joiner: IdentityId): [string, string] {
    const fields = invitationFieldsOf(invited.operation, joiner);

    return [
      invited.key.signPossession(fields),
      CommunityInvitationConsent.sign(fields, privateKeyOf(joiner)),
    ];
  }

  describe('fromOperation', () => {
    it('reads the limits, the key and the issuer of an invitation_created', () => {
      const invited = issued({ invitee: alice.valueOf(), maxUses: 1 });
      const read = CommunityInvitation.fromOperation(invited.operation);

      expect(read.toPrimitives(community)).toEqual({
        createdAt: 1,
        expiresAt: 1 + 7 * DAY,
        id: invited.operation.getHash(),
        invitationKey: invited.key.publicKey(),
        invitee: alice.valueOf(),
        issuerIdentityId: owner.valueOf(),
        live: true,
        maxUses: 1,
        revoked: false,
        uses: 0,
      });
    });

    it('admits the longest life and the most uses', () => {
      expect(() =>
        CommunityInvitation.fromOperation(
          issued({
            expiresAt: 1 + CommunityInvitation.MAX_LIFETIME,
            maxUses: CommunityInvitation.MAX_USES,
          }).operation,
        ),
      ).not.toThrow();
    });

    it.each([
      ['no use at all', { maxUses: 0 }],
      ['more uses than the cap', { maxUses: CommunityInvitation.MAX_USES + 1 }],
      ['a fractional maxUses', { maxUses: 1.5 }],
      ['a maxUses written as text', { maxUses: '5' }],
      ['an expiry at its own creation', { expiresAt: 1 }],
      ['an expiry before its creation', { expiresAt: 0 }],
      [
        'a life beyond 30 days',
        { expiresAt: 2 + CommunityInvitation.MAX_LIFETIME },
      ],
      ['a fractional expiresAt', { expiresAt: 1.5 + DAY }],
      ['an invitee on a multi-use invitation', { invitee: alice.valueOf() }],
      ['an invitee that is no identity', { invitee: 'nobody', maxUses: 1 }],
      [
        'an invitee by a non-canonical alias',
        { invitee: IdentityIdMother.aliasPrefix(alice).valueOf(), maxUses: 1 },
      ],
      [
        'an invitee by a re-encoded id',
        { invitee: IdentityIdMother.reencoded(alice).valueOf(), maxUses: 1 },
      ],
      ['a stray argument', { reference: 'request-1' }],
      ['an invitation key that is no key', { invitationKey: 'not-a-key' }],
      ...invalid.invitationKeys.map(
        ({ invitationKey, name }): [string, Record<string, unknown>] => [
          `an invitation key that is ${name}`,
          { invitationKey },
        ],
      ),
    ])('refuses %s', (_name, args) => {
      expect(() =>
        CommunityInvitation.fromOperation(issued(args).operation),
      ).toThrow(InvalidCommunityOperationError);
    });

    it('refuses an invitation without a key', () => {
      const keyless = operation(
        CommunityOperationAction.INVITATION_CREATED,
        owner,
        { expiresAt: 1 + DAY, maxUses: 1 },
        [created],
      );

      expect(() => CommunityInvitation.fromOperation(keyless)).toThrow(
        InvalidCommunityOperationError,
      );
    });
  });

  describe('isAdmission', () => {
    it('tells an admission under an invitation from any other join', () => {
      const invited = issued();
      const [possession, consent] = proofsOf(invited, alice);
      const admitted = operation(
        CommunityOperationAction.MEMBER_JOINED,
        owner,
        {
          consent,
          identityId: alice.valueOf(),
          invitationId: invited.operation.getHash(),
          method: 'invitation',
          possession,
        },
        [invited.operation],
      );

      expect(CommunityInvitation.isAdmission(admitted)).toBe(true);
      expect(CommunityInvitation.isAdmission(join([created], alice))).toBe(
        false,
      );
      expect(CommunityInvitation.isAdmission(invited.operation)).toBe(false);
    });
  });

  describe('isOpenAt', () => {
    it('is open from its creation up to and including its expiry', () => {
      const read = CommunityInvitation.fromOperation(issued({}, 10).operation);

      expect(read.isOpenAt(9)).toBe(false);
      expect(read.isOpenAt(10)).toBe(true);
      expect(read.isOpenAt(10 + 7 * DAY)).toBe(true);
      expect(read.isOpenAt(11 + 7 * DAY)).toBe(false);
    });
  });

  describe('assertAdmits', () => {
    it('admits a joiner with both proofs', () => {
      const invited = issued();
      const read = CommunityInvitation.fromOperation(invited.operation);

      expect(() =>
        read.assertAdmits(community, alice, ...proofsOf(invited, alice)),
      ).not.toThrow();
    });

    it('refuses a joiner other than the invitee', () => {
      const invited = issued({ invitee: alice.valueOf(), maxUses: 1 });
      const read = CommunityInvitation.fromOperation(invited.operation);

      expect(() =>
        read.assertAdmits(community, bob, ...proofsOf(invited, bob)),
      ).toThrow(CommunityInvitationUnusableError);
      expect(() =>
        read.assertAdmits(community, alice, ...proofsOf(invited, alice)),
      ).not.toThrow();
    });

    it('refuses a joiner named by a non-canonical alias', () => {
      const invited = issued();
      const read = CommunityInvitation.fromOperation(invited.operation);
      const alias = IdentityIdMother.aliasPrefix(alice);

      expect(() =>
        read.assertAdmits(community, alias, ...proofsOf(invited, alice)),
      ).toThrow(CommunityInvitationUnusableError);
    });

    it('refuses a second use by the same identity', () => {
      const invited = issued();
      const read = CommunityInvitation.fromOperation(
        invited.operation,
      ).withJoiner(alice.valueOf());

      expect(() =>
        read.assertAdmits(community, alice, ...proofsOf(invited, alice)),
      ).toThrow(CommunityInvitationUnusableError);
    });

    it('refuses once every use is taken', () => {
      const invited = issued({ maxUses: 2 });
      const read = CommunityInvitation.fromOperation(invited.operation)
        .withJoiner(alice.valueOf())
        .withJoiner(bob.valueOf());

      expect(read.toPrimitives(community)).toMatchObject({
        live: false,
        uses: 2,
      });
      expect(() =>
        read.assertAdmits(community, mallory, ...proofsOf(invited, mallory)),
      ).toThrow(CommunityInvitationUnusableError);
    });

    it('counts a repeated joiner once', () => {
      const read = CommunityInvitation.fromOperation(issued().operation)
        .withJoiner(alice.valueOf())
        .withJoiner(alice.valueOf());

      expect(read.toPrimitives(community).uses).toBe(1);
    });

    it.each([
      ['revoked', (read: CommunityInvitation) => read.revoked()],
      ['cut', (read: CommunityInvitation) => read.cut()],
    ])('refuses once %s', (_name, close) => {
      const invited = issued();
      const read = close(CommunityInvitation.fromOperation(invited.operation));

      expect(read.isLiveIn(community)).toBe(false);
      expect(() =>
        read.assertAdmits(community, alice, ...proofsOf(invited, alice)),
      ).toThrow(CommunityInvitationUnusableError);
    });

    it('refuses when the issuer no longer holds create_invites', () => {
      const added = join([created], mallory);
      const invited = invitation([added], mallory);
      const read = CommunityInvitation.fromOperation(invited.operation);

      expect(
        read.isLiveIn(CommunityStateFold.fold([created, added]).community!),
      ).toBe(false);
    });

    it.each([
      [
        'a possession proof of another joiner',
        (invited: Invitation): [string, string] => [
          proofsOf(invited, bob)[0],
          proofsOf(invited, alice)[1],
        ],
      ],
      [
        'a possession proof by another invitation key',
        (invited: Invitation): [string, string] => [
          proofsOf(issued({}, 2), alice)[0],
          proofsOf(invited, alice)[1],
        ],
      ],
      [
        'the consent of another identity',
        (invited: Invitation): [string, string] => [
          proofsOf(invited, alice)[0],
          proofsOf(invited, bob)[1],
        ],
      ],
      [
        'malformed proofs',
        (): [string, string] => ['not-a-proof', 'not-a-proof'],
      ],
    ])('refuses %s', (_name, proofs) => {
      const invited = issued();
      const read = CommunityInvitation.fromOperation(invited.operation);

      expect(() =>
        read.assertAdmits(community, alice, ...proofs(invited)),
      ).toThrow(CommunityInvitationUnusableError);
    });

    it('refuses proofs signed for another invitation of the same key', () => {
      const invited = issued({}, 1);
      const sibling = issued({ maxUses: 4 }, 1);
      const read = CommunityInvitation.fromOperation(invited.operation);

      expect(() =>
        read.assertAdmits(community, alice, ...proofsOf(sibling, alice)),
      ).toThrow(CommunityInvitationUnusableError);
    });
  });
});
