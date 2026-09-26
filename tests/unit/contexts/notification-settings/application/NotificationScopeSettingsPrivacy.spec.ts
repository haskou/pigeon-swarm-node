import { NotificationScopeSettingsResetMessage } from '@app/contexts/notification-settings/application/reset/messages/NotificationScopeSettingsResetMessage';
import NotificationScopeSettingsResetter from '@app/contexts/notification-settings/application/reset/NotificationScopeSettingsResetter';
import { NotificationScopeSettingsUpdateMessage } from '@app/contexts/notification-settings/application/update/messages/NotificationScopeSettingsUpdateMessage';
import NotificationScopeSettingsUpdater from '@app/contexts/notification-settings/application/update/NotificationScopeSettingsUpdater';
import NotificationScopeSettingsRepository from '@app/contexts/notification-settings/domain/repositories/NotificationScopeSettingsRepository';
import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';
import { generateKeyPairSync } from 'node:crypto';

describe('Notification scope settings privacy', () => {
  const identityId = generateKeyPairSync('ed25519')
    .publicKey.export({ format: 'pem', type: 'spki' })
    .toString();
  let repository: jest.Mocked<NotificationScopeSettingsRepository>;
  let publisher: jest.Mocked<DomainEventPublisher>;

  beforeEach(() => {
    repository = {
      delete: jest.fn(),
      findByIdentityId: jest.fn(),
      findByScope: jest.fn(),
      isPrivateScope: jest.fn().mockResolvedValue(true),
      save: jest.fn(),
    } as unknown as jest.Mocked<NotificationScopeSettingsRepository>;
    publisher = {
      publish: jest.fn(),
    } as unknown as jest.Mocked<DomainEventPublisher>;
  });

  it('does not publish updates for private community scopes', async () => {
    const updater = new NotificationScopeSettingsUpdater(repository, publisher);

    await updater.update(
      new NotificationScopeSettingsUpdateMessage(
        identityId,
        { communityId: 'private-community', type: 'community' },
        {
          hideMutedChannels: false,
          mobilePushEnabled: true,
          notificationLevel: 'all',
          suppressEveryoneAndHere: false,
          suppressRoleMentions: false,
        },
      ),
    );

    expect(repository.save).toHaveBeenCalledTimes(1);
    expect(publisher.publish).not.toHaveBeenCalled();
  });

  it('does not publish resets for private community scopes', async () => {
    const resetter = new NotificationScopeSettingsResetter(
      repository,
      publisher,
    );

    await resetter.reset(
      new NotificationScopeSettingsResetMessage(identityId, {
        channelId: 'private-channel',
        communityId: 'private-community',
        type: 'community_channel',
      }),
    );

    expect(repository.delete).toHaveBeenCalledTimes(1);
    expect(publisher.publish).not.toHaveBeenCalled();
  });

  it('continues publishing settings for public scopes', async () => {
    repository.isPrivateScope.mockResolvedValue(false);
    const updater = new NotificationScopeSettingsUpdater(repository, publisher);

    await updater.update(
      new NotificationScopeSettingsUpdateMessage(
        identityId,
        { communityId: 'public-community', type: 'community' },
        {
          hideMutedChannels: false,
          mobilePushEnabled: true,
          notificationLevel: 'all',
          suppressEveryoneAndHere: false,
          suppressRoleMentions: false,
        },
      ),
    );

    expect(publisher.publish).toHaveBeenCalledTimes(1);
  });
});
