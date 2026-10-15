import { Notification } from '@app/contexts/notifications/domain/Notification';
import { PendingGroupInvitationLimits } from '@app/contexts/notifications/domain/PendingGroupInvitationLimits';
import PendingGroupInvitationCaps from '@app/contexts/notifications/domain/services/PendingGroupInvitationCaps';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { GroupInvitationNotificationMother as Letters } from '../../../../mothers/GroupInvitationNotificationMother';

describe('PendingGroupInvitationCaps', () => {
  const caps = new PendingGroupInvitationCaps(
    new PendingGroupInvitationLimits(
      PendingGroupInvitationLimits.DEFAULT_PER_PAIR,
      PendingGroupInvitationLimits.DEFAULT_PER_RECIPIENT,
    ),
  );
  let identities: IdentityId[];
  let recipient: IdentityId;
  let inviter: IdentityId;

  const listedIds = (
    notifications: Notification[],
    selection = caps,
  ): string[] =>
    Letters.ascending(Letters.idsOf(selection.listed(notifications)));

  const withState = (letter: Notification, state: string): Notification =>
    Notification.fromPrimitives({
      ...letter.toPrimitives(),
      state,
      status: 'read',
    });

  beforeAll(async () => {
    identities = await Letters.identities(28);
    [recipient, inviter] = identities;
  });

  it('defaults to 4 per pair and 100 per recipient', () => {
    expect(PendingGroupInvitationLimits.DEFAULT_PER_PAIR).toBe(4);
    expect(PendingGroupInvitationLimits.DEFAULT_PER_RECIPIENT).toBe(100);
  });

  it('lists the 4 lowest record ids of 5 pending letters from one inviter', () => {
    const letters = Letters.letters(inviter, recipient, 5);
    const ascending = Letters.ascending(Letters.idsOf(letters));

    expect(listedIds(letters)).toEqual(ascending.slice(0, 4));
  });

  it.each(['accepted', 'declined'])(
    'lists the held-back 5th letter once the recipient signs %s on a listed one',
    (state) => {
      const letters = Letters.letters(inviter, recipient, 5);
      const [lowest] = Letters.ascending(Letters.idsOf(letters));
      const handled = letters.map((letter) =>
        letter.getId().valueOf() === lowest ? withState(letter, state) : letter,
      );

      expect(listedIds(handled)).toEqual(
        Letters.ascending(Letters.idsOf(letters)),
      );
    },
  );

  it('keeps a letter with only a read mark pending', () => {
    const letters = Letters.letters(inviter, recipient, 5).map((letter) =>
      Notification.fromPrimitives({ ...letter.toPrimitives(), status: 'read' }),
    );

    expect(listedIds(letters)).toHaveLength(4);
  });

  it('lists the 100 lowest record ids of 26 inviters with 4 letters each', () => {
    const letters = identities
      .slice(1, 27)
      .flatMap((sender) => Letters.letters(sender, recipient, 4));
    const ascending = Letters.ascending(Letters.idsOf(letters));

    expect(letters).toHaveLength(104);
    expect(listedIds(letters)).toEqual(ascending.slice(0, 100));
  });

  it('applies the pair cap before the recipient cap', () => {
    const narrow = new PendingGroupInvitationCaps(
      new PendingGroupInvitationLimits(2, 3),
    );
    const [, first, second] = identities;
    const flood = Letters.letters(first, recipient, 6);
    const other = Letters.letters(second, recipient, 2, 100);
    const floodIds = Letters.ascending(Letters.idsOf(flood));
    const otherIds = Letters.ascending(Letters.idsOf(other));
    const expected = Letters.ascending([
      ...floodIds.slice(0, 2),
      ...otherIds,
    ]).slice(0, 3);

    expect(listedIds([...flood, ...other], narrow)).toEqual(expected);
  });

  it('counts each recipient on its own', () => {
    const narrow = new PendingGroupInvitationCaps(
      new PendingGroupInvitationLimits(1, 1),
    );
    const [, first, second] = identities;

    expect(
      narrow.listed([
        ...Letters.letters(inviter, first, 2),
        ...Letters.letters(inviter, second, 2),
      ]),
    ).toHaveLength(2);
  });

  it('never caps handled group letters or other notification types', () => {
    const narrow = new PendingGroupInvitationCaps(
      new PendingGroupInvitationLimits(1, 1),
    );
    const handled = Letters.letters(inviter, recipient, 3).map(
      (letter, index) =>
        withState(letter, index % 2 === 0 ? 'accepted' : 'declined'),
    );
    const conversations = Array.from({ length: 3 }, (_, index) =>
      Letters.letter(
        inviter,
        recipient,
        index,
        'pending',
        'conversation_invitation',
      ),
    );
    const callId = '5b0f8a2e-6d1c-4c3b-9a7e-2f4d8c1b0e93';
    const missedCall = Notification.fromPrimitives({
      id: `missed-call:${callId}:${recipient.valueOf()}`,
      payload: {
        callerIdentityId: inviter.valueOf(),
        callId,
        networkId: '9c3e1f7a-2b4d-4e6f-8a1c-3d5b7e9f0a24',
        recipientIdentityId: recipient.valueOf(),
      },
      recipientIdentityId: recipient.valueOf(),
      state: 'pending',
      status: 'unread',
      type: 'missed_call',
    });
    const all = [...handled, ...conversations, missedCall];

    expect(listedIds(all, narrow)).toEqual(
      Letters.ascending(Letters.idsOf(all)),
    );
  });

  it('lists the same letters whatever order the records arrived in', () => {
    const letters = identities
      .slice(1, 28)
      .flatMap((sender, index) =>
        Letters.letters(sender, recipient, 3 + (index % 4)),
      );
    const reversed = [...letters].reverse();
    const interleaved = [
      ...letters.filter((_, index) => index % 2 === 1),
      ...letters.filter((_, index) => index % 2 === 0),
    ];
    const expected = listedIds(letters);

    expect(expected).toHaveLength(100);
    expect(listedIds(reversed)).toEqual(expected);
    expect(listedIds(interleaved)).toEqual(expected);
  });
});
