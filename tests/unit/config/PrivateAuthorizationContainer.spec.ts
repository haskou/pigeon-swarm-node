import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

type ServiceDefinition = {
  arguments?: string[];
  class?: string;
  parent?: string;
};

describe('private authorization container wiring', () => {
  it('resolves scope provisioning through the application service', () => {
    const document = YAML.parse(
      fs.readFileSync(
        path.resolve(process.cwd(), 'config/container/services.yaml'),
        'utf8',
      ),
    ) as { services: Record<string, ServiceDefinition> };
    const definitions = Object.values(document.services);

    expect(
      definitions.some((definition) =>
        definition.class?.endsWith(
          '/private-authorization/application/provision-scope/PrivateAuthorizationScopeProvisioner',
        ),
      ),
    ).toBe(true);
    expect(
      definitions.some((definition) =>
        definition.class?.endsWith(
          '/apps/services/PigeonPrivateAuthorizationScopeProvisioner',
        ),
      ),
    ).toBe(false);
  });

  it('shares one storage coordinator across protection and public storage', () => {
    const document = YAML.parse(
      fs.readFileSync(
        path.resolve(process.cwd(), 'config/container/services.yaml'),
        'utf8',
      ),
    ) as { services: Record<string, ServiceDefinition> };
    const entries = Object.entries(document.services);
    const service = (className: string) => {
      const entry = entries.find(([, definition]) =>
        definition.class?.endsWith(`/${className}`),
      );

      expect(entry).toBeDefined();

      return entry!;
    };
    const [coordinatorId] = service(
      'private-authorization/infrastructure/PrivateAuthorizationStorageCoordinator',
    );
    const [guardId, guard] = service(
      'communities/infrastructure/PrivateCommunityPublicStorageGuard',
    );
    const [, authorizationRepository] = service(
      'private-authorization/infrastructure/local-db/LocalPrivateAuthorizationRepository',
    );
    const [, callRepository] = service(
      'calls/infrastructure/orbitdb/OrbitDBCallRepository',
    );
    const [, callProjection] = service(
      'calls/infrastructure/orbitdb/OrbitDBCallProjection',
    );
    const [, communityRepository] = service(
      'communities/infrastructure/orbitdb/OrbitDBCommunityRepository',
    );
    const [, communityProjection] = service(
      'communities/infrastructure/orbitdb/OrbitDBCommunityReplicaProjection',
    );

    expect(guard.arguments).toContain(`@${coordinatorId}`);
    expect(authorizationRepository.arguments).toContain(`@${coordinatorId}`);
    expect(callRepository.arguments).toContain(`@${guardId}`);
    expect(callProjection.arguments).toContain(`@${guardId}`);
    expect(communityRepository.arguments).toContain(`@${guardId}`);
    expect(communityProjection.arguments).toContain(`@${guardId}`);
  });

  it('routes protected notification settings to local storage', () => {
    const document = YAML.parse(
      fs.readFileSync(
        path.resolve(process.cwd(), 'config/container/services.yaml'),
        'utf8',
      ),
    ) as { services: Record<string, ServiceDefinition> };
    const entries = Object.entries(document.services);
    const service = (className: string) => {
      const entry = entries.find(([, definition]) =>
        definition.class?.endsWith(`/${className}`),
      );

      expect(entry).toBeDefined();

      return entry!;
    };
    const [guardId] = service(
      'communities/infrastructure/PrivateCommunityPublicStorageGuard',
    );
    const [localRepositoryId] = service(
      'notification-settings/infrastructure/local-db/LocalNotificationScopeSettingsRepository',
    );
    const [, scopeAccessAuthorizer] = service(
      'notification-settings/infrastructure/CommunityNotificationScopeAccessAuthorizer',
    );
    const [, router] = service(
      'notification-settings/infrastructure/NotificationScopeSettingsRepositoryRouter',
    );

    expect(router.arguments).toContain(`@${guardId}`);
    expect(router.arguments).toContain(`@${localRepositoryId}`);
    expect(scopeAccessAuthorizer.parent).toBeDefined();
    expect(router.arguments).toContain(`@${scopeAccessAuthorizer.parent}`);
  });
});
