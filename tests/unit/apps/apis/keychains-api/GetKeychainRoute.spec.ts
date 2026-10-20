import type { Express } from 'express';

import SignedHttpRequestAuthenticator from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import { GetKeychainRoute } from '@app/apps/apis/keychains-api/routes/GetKeychainRoute';
import NodeReadiness from '@app/apps/NodeReadiness';
import CurrentKeychainFinder from '@app/contexts/keychains/application/find-current/CurrentKeychainFinder';
import { KeychainOwnershipUnverifiedError } from '@app/contexts/keychains/domain/errors/KeychainOwnershipUnverifiedError';
import NodeRepository from '@app/contexts/nodes/domain/repositories/NodeRepository';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import {
  handleCustomHttpError,
  handleDomainError,
} from '@app/shared/infrastructure/express/PigeonHttpErrorResponseHandlers';
import { HttpErrorHandler, Route } from '@haskou/ddd-kernel/adapters/ui';
import { generateKeyPairSync } from 'crypto';
import { Server } from 'http';
import { mock } from 'jest-mock-extended';
import { AddressInfo } from 'net';
import { createExpressServer } from 'routing-controllers';

describe('Get keychain route readiness gate', () => {
  let server: Server;
  let baseUrl: string;
  let replicatedStateOpen: boolean;
  let networksRegistered: boolean;
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
    networksRegistered = true;
    const nodeRepository = mock<NodeRepository>();
    nodeRepository.isLocalNodeConfigurationEmpty.mockResolvedValue(true);
    readiness = new NodeReadiness(
      {
        isOpen: () => replicatedStateOpen,
        hasNetworks: () => networksRegistered,
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

    // Mirrors the application's error pipeline (the domain and HTTP error
    // handlers, not routing-controllers' default) so clients get the same
    // status and body.
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

  afterAll(async () => {
    jest.restoreAllMocks();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it('answers 503020 until startup has finished and a registered network has opened its replicated state', async () => {
    const getKeychain = () =>
      fetch(`${baseUrl}/api/keychains/${encodeURIComponent(ownerIdentityId)}`);

    replicatedStateOpen = false;
    const beforeStart = await getKeychain();
    expect(beforeStart.status).toBe(503);
    await expect(beforeStart.json()).resolves.toMatchObject({ code: 503020 });

    replicatedStateOpen = true;
    expect((await getKeychain()).status).toBe(503);
    expect(find).not.toHaveBeenCalled();

    readiness.markStarted();
    replicatedStateOpen = false;
    const replaying = await getKeychain();
    expect(replaying.status).toBe(503);
    await expect(replaying.json()).resolves.toMatchObject({ code: 503020 });
    expect(find).not.toHaveBeenCalled();

    // The keychain could not be verified: answer the retryable code, never 409.
    replicatedStateOpen = true;
    find.mockRejectedValueOnce(
      new KeychainOwnershipUnverifiedError(new Error('index unavailable')),
    );
    const unverified = await getKeychain();
    expect(unverified.status).toBe(503);
    await expect(unverified.json()).resolves.toMatchObject({ code: 503020 });
    expect(find).toHaveBeenCalledTimes(1);

    // A node that stores no network has nothing to replay, so a missing
    // keychain is genuine and is answered without a lookup.
    networksRegistered = false;
    replicatedStateOpen = false;
    expect((await getKeychain()).status).toBe(409);
    expect(find).toHaveBeenCalledTimes(1);
  });
});
