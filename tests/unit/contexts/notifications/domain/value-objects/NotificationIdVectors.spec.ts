import { NotificationId } from '@app/contexts/notifications/domain/value-objects/NotificationId';

import { cryptoVectors } from '../../../../../support/cryptoVectors';

interface Section {
  invalid: { args: [string, string, string, string?]; name: string }[];
  valid: {
    args: [string, string, string, string?];
    id: string;
    name: string;
  }[];
}

const { invitation } = cryptoVectors<Record<string, Section>>('commitment-ids');

describe('NotificationId invitation commitment id vectors', () => {
  it.each(invitation.valid)('derives $name', ({ args, id }) => {
    expect(NotificationId.invitation(...args).valueOf()).toBe(id);
  });

  it.each(invitation.invalid)('rejects $name', ({ args }) => {
    expect(() => NotificationId.invitation(...args)).toThrow();
  });
});
