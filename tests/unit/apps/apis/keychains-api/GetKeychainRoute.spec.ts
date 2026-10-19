import SignedHttpRequestAuthenticator from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import { GetKeychainRoute } from '@app/apps/apis/keychains-api/routes/GetKeychainRoute';
import NodeReadiness from '@app/apps/NodeReadiness';
import CurrentKeychainFinder from '@app/contexts/keychains/application/find-current/CurrentKeychainFinder';
import NodeRepository from '@app/contexts/nodes/domain/repositories/NodeRepository';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import { Route } from '@haskou/ddd-kernel/adapters/ui';
import { generateKeyPairSync } from 'crypto';
import { Server } from 'http';
import { mock } from 'jest-mock-extended';
import { AddressInfo } from 'net';
import { createExpressServer } from 'routing-controllers';

describe('Get keychain route readiness gate', () => {
  let server: Server;
  let baseUrl: string;
  let replicatedStateOpen: boolean;
  let readiness: NodeReadiness;
  let find: jest.Mock;
  let ownerIdentityId: string;

  beforeAll(async () => {
    const { publicKey } = generateKeyPairSync('ed25519');
    ownerIdentityId = publicKey
      .export({ format: 'pem', type: 'spki' })
      .toString()
      .replace(/-----[^-]+-----|\s/g, '');

    replicatedStateOpen = false;
    const nodeRepository = mock<NodeRepository>();
    nodeRepository.isLocalNodeConfigurationEmpty.mockResolvedValue(true);
    readiness = new NodeReadiness(
      {
        isOpen: () => replicatedStateOpen,
        hasNetworks: () => false,
      } as unknown as OrbitDBReplicatedStateRegistry,
      nodeRepository,
    );
    find = jest.fn().mockRejectedValue(new Error('finder reached'));

    const services = new Map<unknown, unknown>([
      [NodeReadiness, readiness],
      [CurrentKeychainFinder, { find }],
      [
        SignedHttpRequestAuthenticator,
        { authenticate: async () => new IdentityId(ownerIdentityId) },
      ],
    ]);
    jest
      .spyOn(Route.prototype, 'get')
      .mockImplementation(((service: unknown) => services.get(service)) as never);

    const app = createExpressServer({
      controllers: [GetKeychainRoute],
      routePrefix: '/api',
    });
    server = await new Promise<Server>((resolve) => {
      const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it('does not look the keychain up until startup has finished and the replicated state is open', async () => {
    const getKeychain = () =>
      fetch(`${baseUrl}/api/keychains/${encodeURIComponent(ownerIdentityId)}`);

    replicatedStateOpen = false;
    expect((await getKeychain()).status).toBe(503);

    replicatedStateOpen = true;
    expect((await getKeychain()).status).toBe(503);
    expect(find).not.toHaveBeenCalled();

    readiness.markStarted();
    expect((await getKeychain()).status).not.toBe(503);
    expect(find).toHaveBeenCalledTimes(1);

    // A started fresh node is ready for probes even while its replicated state
    // is closed. Keychain reads must still wait for the open state.
    replicatedStateOpen = false;
    await expect(readiness.isReady()).resolves.toBe(true);
    expect((await getKeychain()).status).toBe(503);
    expect(find).toHaveBeenCalledTimes(1);
  });
});
