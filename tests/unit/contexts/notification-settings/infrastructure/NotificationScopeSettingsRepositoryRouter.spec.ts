import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import PrivateCommunityPublicStorageGuard from '@app/contexts/communities/infrastructure/PrivateCommunityPublicStorageGuard';
import { NotificationScopeSettings } from '@app/contexts/notification-settings/domain/NotificationScopeSettings';
import { NotificationScopeSettingsPreferences } from '@app/contexts/notification-settings/domain/NotificationScopeSettingsPreferences';
import NotificationScopeAccessAuthorizer from '@app/contexts/notification-settings/domain/services/NotificationScopeAccessAuthorizer';
import { NotificationSettingScope } from '@app/contexts/notification-settings/domain/value-objects/NotificationSettingScope';
import NotificationScopeSettingsRepositoryRouter from '@app/contexts/notification-settings/infrastructure/NotificationScopeSettingsRepositoryRouter';
import LocalNotificationScopeSettingsRepository from '@app/contexts/notification-settings/infrastructure/local-db/LocalNotificationScopeSettingsRepository';
import OrbitDBNotificationScopeSettingsRepository from '@app/contexts/notification-settings/infrastructure/orbitdb/OrbitDBNotificationScopeSettingsRepository';
import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { generateKeyPairSync } from 'node:crypto';

describe('NotificationScopeSettingsRepositoryRouter', () => {
  const identityId = validIdentityId();
  const proof = {} as PublicMutationProof;
  const privateScope = NotificationSettingScope.community(
    new CommunityId('private-community'),
  );
  const publicScope = NotificationSettingScope.community(
    new CommunityId('public-community'),
  );
  const privateChannelScope = NotificationSettingScope.communityChannel(
    new CommunityId('private-community'),
    new CommunityChannelId('private-channel'),
  );
  let publicRepository: jest.Mocked<OrbitDBNotificationScopeSettingsRepository>;
  let privateRepository: jest.Mocked<LocalNotificationScopeSettingsRepository>;
  let guard: jest.Mocked<PrivateCommunityPublicStorageGuard>;
  let privateScopeAccess: jest.Mocked<NotificationScopeAccessAuthorizer>;
  let repository: NotificationScopeSettingsRepositoryRouter;

  beforeEach(() => {
    publicRepository = {
      delete: jest.fn(),
      findByIdentityId: jest.fn().mockResolvedValue([]),
      findByScope: jest.fn(),
      save: jest.fn(),
    } as unknown as jest.Mocked<OrbitDBNotificationScopeSettingsRepository>;
    privateRepository = {
      delete: jest.fn(),
      findByIdentityId: jest.fn().mockResolvedValue([]),
      findByScope: jest.fn(),
      save: jest.fn(),
    } as unknown as jest.Mocked<LocalNotificationScopeSettingsRepository>;
    guard = {
      filterPublic: jest.fn().mockImplementation(
        async <T>(
          values: T[],
          communityId: (value: T) => CommunityId,
        ) => {
          const decisions = await Promise.all(
            values.map((value) => guard.isProtected(communityId(value))),
          );

          return values.filter((_value, index) => !decisions[index]);
        },
      ),
      isProtected: jest
        .fn()
        .mockImplementation(
          async (communityId: CommunityId) =>
            communityId.valueOf() === 'private-community',
        ),
      runWhilePublic: jest
        .fn()
        .mockImplementation(
          async (_communityId: CommunityId, action: () => Promise<unknown>) =>
            action(),
        ),
    } as unknown as jest.Mocked<PrivateCommunityPublicStorageGuard>;
    privateScopeAccess = {
      authorize: jest.fn(),
    } as jest.Mocked<NotificationScopeAccessAuthorizer>;
    repository = new NotificationScopeSettingsRepositoryRouter(
      publicRepository,
      privateRepository,
      guard,
      privateScopeAccess,
    );
  });

  it('stores private community settings only in local storage', async () => {
    const settings = NotificationScopeSettings.create(
      identityId,
      privateScope,
      NotificationScopeSettingsPreferences.defaults(),
    );

    await repository.save(settings, proof);

    expect(privateScopeAccess.authorize).toHaveBeenCalledWith(
      identityId,
      privateScope,
    );
    expect(privateRepository.save).toHaveBeenCalledWith(settings);
    expect(publicRepository.save).not.toHaveBeenCalled();
  });

  it('validates protected channel access before storing settings', async () => {
    const settings = NotificationScopeSettings.create(
      identityId,
      privateChannelScope,
      NotificationScopeSettingsPreferences.defaults(),
    );

    await repository.save(settings, proof);

    expect(privateScopeAccess.authorize).toHaveBeenCalledWith(
      identityId,
      privateChannelScope,
    );
    expect(privateRepository.save).toHaveBeenCalledWith(settings);
  });

  it('rejects protected settings when the local community projection is absent', async () => {
    privateScopeAccess.authorize.mockRejectedValue(new Error('denied'));
    const settings = NotificationScopeSettings.create(
      identityId,
      privateScope,
      NotificationScopeSettingsPreferences.defaults(),
    );

    await expect(repository.save(settings, proof)).rejects.toThrow();
    expect(privateRepository.save).not.toHaveBeenCalled();
  });

  it('guards public community writes against concurrent protection', async () => {
    const settings = NotificationScopeSettings.create(
      identityId,
      publicScope,
      NotificationScopeSettingsPreferences.defaults(),
    );

    await repository.save(settings, proof);

    expect(guard.runWhilePublic).toHaveBeenCalledWith(
      new CommunityId('public-community'),
      expect.any(Function),
    );
    expect(publicRepository.save).toHaveBeenCalledWith(settings, proof);
    expect(privateRepository.save).not.toHaveBeenCalled();
  });

  it('reads private community settings only from local storage', async () => {
    await repository.findByScope(identityId, privateScope);

    expect(privateRepository.findByScope).toHaveBeenCalledWith(
      identityId,
      privateScope,
    );
    expect(publicRepository.findByScope).not.toHaveBeenCalled();
  });

  it('deletes private community settings only from local storage', async () => {
    await repository.delete(identityId, privateScope, proof);

    expect(privateRepository.delete).toHaveBeenCalledWith(
      identityId,
      privateScope,
    );
    expect(publicRepository.delete).not.toHaveBeenCalled();
  });

  it('filters protected public collisions and gives local settings precedence', async () => {
    const protectedPublic = NotificationScopeSettings.defaultForScope(
      identityId,
      privateScope,
    );
    const protectedLocal = NotificationScopeSettings.defaultForScope(
      identityId,
      privateScope,
    );
    const publicSettings = NotificationScopeSettings.defaultForScope(
      identityId,
      publicScope,
    );
    publicRepository.findByIdentityId.mockResolvedValue([
      protectedPublic,
      publicSettings,
    ]);
    privateRepository.findByIdentityId.mockResolvedValue([protectedLocal]);

    await expect(repository.findByIdentityId(identityId)).resolves.toEqual([
      publicSettings,
      protectedLocal,
    ]);
    expect(guard.filterPublic).toHaveBeenCalled();
  });
});

function validIdentityId(): IdentityId {
  return new IdentityId(
    generateKeyPairSync('ed25519')
      .publicKey.export({ format: 'pem', type: 'spki' })
      .toString(),
  );
}
