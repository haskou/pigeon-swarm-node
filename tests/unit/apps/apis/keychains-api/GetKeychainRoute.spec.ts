import SignedHttpRequestAuthenticator from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import { GetKeychainRoute } from '@app/apps/apis/keychains-api/routes/GetKeychainRoute';
import NodeReadiness from '@app/apps/NodeReadiness';
import CurrentKeychainFinder from '@app/contexts/keychains/application/find-current/CurrentKeychainFinder';
import { KeychainNotFoundError } from '@app/contexts/keychains/domain/errors/KeychainNotFoundError';
import { NodeMetadataIsUnreadableError } from '@app/contexts/nodes/domain/errors/NodeMetadataIsUnreadableError';
import NodeRepository from '@app/contexts/nodes/domain/repositories/NodeRepository';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import {
  handleCustomHttpError,
  handleDomainError,
} from '@app/shared/infrastructure/express/PigeonHttpErrorResponseHandlers';
import { HttpErrorHandler, Route } from '@haskou/ddd-kernel/adapters/ui';
import { generateKeyPairSync } from 'crypto';
import type { Express } from 'express';
import { Server } from 'http';
import { mock } from 'jest-mock-extended';
import { AddressInfo } from 'net';
import { createExpressServer } from 'routing-controllers';

describe('Get keychain route readiness gate', () => {
  let server: Server;
  let baseUrl: string;
  let replicatedStateOpen: boolean;
  let networksRegistered: boolean;
  let configuration: 'configured' | 'empty' | 'unreadable';
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
    networksRegistered = false;
    configuration = 'empty';
    const nodeRepository = mock<NodeRepository>();
    nodeRepository.isLocalNodeConfigurationEmpty.mockImplementation(
      async () => {
        if (configuration === 'unreadable') {
          throw new NodeMetadataIsUnreadableError();
        }

        return configuration === 'empty';
      },
    );
    readiness = new NodeReadiness(
      {
        isOpen: () => replicatedStateOpen,
        hasNetworks: () => networksRegistered,
      } as unknown as OrbitDBReplicatedStateRegistry,
      nodeRepository,
    );
    find = jest.fn();

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

    // Mirrors the application's error pipeline so clients get the same status
    // and body as production.
    const app = createExpressServer({
      controllers: [GetKeychainRoute],
      defaultErrorHandler: false,
      routePrefix: '/api',
    }) as Express;
    app.use(
      new HttpErrorHandler({
        handlers: [handleDomainError, handleCustomHttpError],
      }).handle,
    );
    server = await new Promise<Server>((resolve) => {
      const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  beforeEach(() => {
    find.mockClear();
  });

  const getKeychain = () =>
    fetch(`${baseUrl}/api/keychains/${encodeURIComponent(ownerIdentityId)}`);

  afterAll(async () => {
    jest.restoreAllMocks();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it('answers 503020 until startup has finished and the replicated state is open', async () => {
    networksRegistered = true;
    replicatedStateOpen = true;
    const notStarted = await getKeychain();

    expect(notStarted.status).toBe(503);
    await expect(notStarted.json()).resolves.toMatchObject({ code: 503020 });
    expect(find).not.toHaveBeenCalled();

    readiness.markStarted();
    replicatedStateOpen = false;
    const replaying = await getKeychain();

    expect(replaying.status).toBe(503);
    await expect(replaying.json()).resolves.toMatchObject({ code: 503020 });
    expect(find).not.toHaveBeenCalled();

    replicatedStateOpen = true;
    find.mockRejectedValueOnce(
      new KeychainNotFoundError(new IdentityId(ownerIdentityId)),
    );
    const absent = await getKeychain();

    expect(absent.status).toBe(409);
    await expect(absent.json()).resolves.toMatchObject({
      code: 'KeychainNotFoundError',
    });
    expect(find).toHaveBeenCalledTimes(1);
  });

  it('answers 409 for a fresh node with no network instead of 503020', async () => {
    networksRegistered = false;
    replicatedStateOpen = false;
    configuration = 'empty';
    const response = await getKeychain();

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: 'KeychainNotFoundError',
    });
    expect(find).not.toHaveBeenCalled();
  });

  it('answers 503020 for a configured node whose network is not registered yet', async () => {
    networksRegistered = false;
    replicatedStateOpen = false;
    configuration = 'configured';
    const response = await getKeychain();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ code: 503020 });
    expect(find).not.toHaveBeenCalled();
  });

  it('answers 503020 when the stored node configuration cannot be read', async () => {
    networksRegistered = false;
    replicatedStateOpen = false;
    configuration = 'unreadable';
    const response = await getKeychain();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ code: 503020 });
    expect(find).not.toHaveBeenCalled();
  });
});
