import { GetIdentityRoute } from '@app/apps/apis/identities-api/routes/GetIdentityRoute';
import NodeReadiness from '@app/apps/NodeReadiness';
import IdentityFinder from '@app/contexts/identities/application/find/IdentityFinder';
import { IdentityNotFoundError } from '@app/contexts/identities/domain/errors/IdentityNotFoundError';
import { NodeMetadataIsUnreadableError } from '@app/contexts/nodes/domain/errors/NodeMetadataIsUnreadableError';
import NodeRepository from '@app/contexts/nodes/domain/repositories/NodeRepository';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import {
  handleCustomHttpError,
  handleDomainError,
} from '@app/shared/infrastructure/express/PigeonHttpErrorResponseHandlers';
import { HttpErrorHandler, Route } from '@haskou/ddd-kernel/adapters/ui';
import type { Express } from 'express';
import { Server } from 'http';
import { mock } from 'jest-mock-extended';
import { AddressInfo } from 'net';
import { createExpressServer } from 'routing-controllers';

describe('Get identity route readiness gate', () => {
  let server: Server;
  let baseUrl: string;
  let replicatedStateOpen: boolean;
  let networksRegistered: boolean;
  let configEmpty: boolean;
  let configUnreadable: boolean;
  let readiness: NodeReadiness;
  let findCandidate: jest.Mock;

  beforeAll(async () => {
    replicatedStateOpen = false;
    networksRegistered = false;
    configEmpty = true;
    configUnreadable = false;
    const nodeRepository = mock<NodeRepository>();
    nodeRepository.isLocalNodeConfigurationEmpty.mockImplementation(
      async () => {
        if (configUnreadable) {
          throw new NodeMetadataIsUnreadableError();
        }
        return configEmpty;
      },
    );
    readiness = new NodeReadiness(
      {
        isOpen: () => replicatedStateOpen,
        hasNetworks: () => networksRegistered,
      } as unknown as OrbitDBReplicatedStateRegistry,
      nodeRepository,
    );
    findCandidate = jest
      .fn()
      .mockRejectedValue(new IdentityNotFoundError('identity-under-test'));

    const services = new Map<unknown, unknown>([
      [NodeReadiness, readiness],
      [IdentityFinder, { findCandidate }],
    ]);
    jest
      .spyOn(Route.prototype, 'get')
      .mockImplementation(((service: unknown) =>
        services.get(service)) as never);

    // Mirrors the application's error pipeline so clients get the same status
    // and body as production.
    const app = createExpressServer({
      controllers: [GetIdentityRoute],
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

  it('answers 503020 while not ready and keeps a genuine miss at 409 once ready', async () => {
    const getIdentity = () =>
      fetch(`${baseUrl}/api/identities/identity-under-test`);

    // Not started yet.
    const beforeStart = await getIdentity();
    expect(beforeStart.status).toBe(503);
    await expect(beforeStart.json()).resolves.toMatchObject({ code: 503020 });
    expect(findCandidate).not.toHaveBeenCalled();

    // Started, but networks are registered and still replaying.
    readiness.markStarted();
    networksRegistered = true;
    const replaying = await getIdentity();
    expect(replaying.status).toBe(503);
    await expect(replaying.json()).resolves.toMatchObject({ code: 503020 });
    expect(findCandidate).not.toHaveBeenCalled();

    // Replicated state open: a miss is genuine.
    replicatedStateOpen = true;
    const genuineMiss = await getIdentity();
    expect(genuineMiss.status).toBe(409);
    expect(findCandidate).toHaveBeenCalledTimes(1);

    // Fresh node: no networks and an empty configuration, so nothing to replay.
    replicatedStateOpen = false;
    networksRegistered = false;
    const freshMiss = await getIdentity();
    expect(freshMiss.status).toBe(409);
    expect(findCandidate).toHaveBeenCalledTimes(2);

    // Configured networks not registered yet (restart before registration).
    configEmpty = false;
    const restarting = await getIdentity();
    expect(restarting.status).toBe(503);
    await expect(restarting.json()).resolves.toMatchObject({ code: 503020 });
    expect(findCandidate).toHaveBeenCalledTimes(2);
  });

  it('answers 503020 when the stored node configuration cannot be read', async () => {
    const getIdentity = () =>
      fetch(`${baseUrl}/api/identities/identity-under-test`);
    readiness.markStarted();
    replicatedStateOpen = false;
    networksRegistered = false;
    configEmpty = true;
    configUnreadable = true;
    findCandidate.mockClear();

    // Unreadable configuration is not a fresh node; a miss is not genuine.
    const unreadable = await getIdentity();
    expect(unreadable.status).toBe(503);
    await expect(unreadable.json()).resolves.toMatchObject({ code: 503020 });
    expect(findCandidate).not.toHaveBeenCalled();
  });

  it('answers 503020 when replicated state closes while a miss is being looked up', async () => {
    const getIdentity = () =>
      fetch(`${baseUrl}/api/identities/identity-under-test`);
    readiness.markStarted();
    configUnreadable = false;
    configEmpty = false;
    networksRegistered = true;
    replicatedStateOpen = true;
    findCandidate.mockClear();
    // The state closes while the lookup runs, so the miss may be a replay gap.
    findCandidate.mockImplementationOnce(async () => {
      replicatedStateOpen = false;
      throw new IdentityNotFoundError('identity-under-test');
    });

    const closedDuringLookup = await getIdentity();
    expect(closedDuringLookup.status).toBe(503);
    await expect(closedDuringLookup.json()).resolves.toMatchObject({
      code: 503020,
    });
    expect(findCandidate).toHaveBeenCalledTimes(1);
  });
});
