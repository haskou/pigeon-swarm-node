import { NotificationsFindMessage } from '@app/contexts/notifications/application/find/messages/NotificationsFindMessage';
import NotificationsFinder from '@app/contexts/notifications/application/find/NotificationsFinder';
import { Notification } from '@app/contexts/notifications/domain/Notification';
import { PendingGroupInvitationLimits } from '@app/contexts/notifications/domain/PendingGroupInvitationLimits';
import NotificationRepository from '@app/contexts/notifications/domain/repositories/NotificationRepository';
import PendingGroupInvitationCaps from '@app/contexts/notifications/domain/services/PendingGroupInvitationCaps';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { mock } from 'jest-mock-extended';

import { GroupInvitationNotificationMother as Letters } from '../../../../mothers/GroupInvitationNotificationMother';

describe('NotificationsFinder', () => {
  const repository = mock<NotificationRepository>();
  const finder = new NotificationsFinder(
    repository,
    new PendingGroupInvitationCaps(new PendingGroupInvitationLimits(4, 100)),
  );
  let recipient: IdentityId;
  let inviter: IdentityId;
  let held: Notification[];
  let conversations: Notification[];

  const descending = (ids: string[]): string[] =>
    Letters.ascending(ids).reverse();

  const find = async (limit: number, after?: string): Promise<Notification[]> =>
    (
      await finder.find(
        new NotificationsFindMessage(recipient.valueOf(), limit, after),
      )
    ).items;

  beforeAll(async () => {
    [recipient, inviter] = await Letters.identities(2);
    held = Letters.letters(inviter, recipient, 5);
    conversations = Array.from({ length: 2 }, (_, index) =>
      Letters.letter(
        inviter,
        recipient,
        index,
        'pending',
        'conversation_invitation',
      ),
    );
  });

  beforeEach(() => {
    repository.findByRecipient.mockReset();
    repository.findByRecipient.mockResolvedValue([...held, ...conversations]);
  });

  it('caps pending group letters before paginating, newest record id first', async () => {
    const groupIds = Letters.ascending(Letters.idsOf(held));
    const expected = descending([
      ...groupIds.slice(0, 4),
      ...Letters.idsOf(conversations),
    ]);

    expect(Letters.idsOf(await find(20))).toEqual(expected);
    expect(repository.findByRecipient).toHaveBeenCalledWith(recipient);
  });

  it('pages over the listed letters only', async () => {
    const groupIds = Letters.ascending(Letters.idsOf(held));
    const expected = descending([
      ...groupIds.slice(0, 4),
      ...Letters.idsOf(conversations),
    ]);
    const first = await find(4);
    const second = await find(4, first[first.length - 1].getId().valueOf());

    expect(Letters.idsOf([...first, ...second])).toEqual(expected);
  });

  it('resumes after the position of a held-back letter', async () => {
    const heldBack = Letters.ascending(Letters.idsOf(held))[4];
    const expected = Letters.idsOf(await find(20)).filter(
      (id) => id < heldBack,
    );

    expect(Letters.idsOf(await find(20, heldBack))).toEqual(expected);
  });
});
