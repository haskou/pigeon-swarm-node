import { applicationRoutes } from '@app/apps/ApplicationRoutes';
import NodeReadiness from '@app/apps/NodeReadiness';
import NodeRepository from '@app/contexts/nodes/domain/repositories/NodeRepository';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import { Route } from '@haskou/ddd-kernel/adapters/ui';
import { Server } from 'http';
import { AddressInfo } from 'net';
import { createExpressServer } from 'routing-controllers';

describe('Node readiness route', () => {
  let server: Server;
  let baseUrl: string;
  let replicatedStateOpen: boolean;
  let configurationEmpty: boolean;
  let readiness: NodeReadiness;

  beforeAll(async () => {
    replicatedStateOpen = false;
    configurationEmpty = false;
    readiness = new NodeReadiness(
      {
        hasNetworks: () => false,
        isOpen: () => replicatedStateOpen,
      } as unknown as OrbitDBReplicatedStateRegistry,
      {
        isLocalNodeConfigurationEmpty: async () => configurationEmpty,
      } as unknown as NodeRepository,
    );
    jest.spyOn(Route.prototype, 'get').mockImplementation(() => readiness);

    const app = createExpressServer({
      controllers: applicationRoutes.filter(
        (route) => route.name === 'GetNodeReadinessRoute',
      ),
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

  it('answers ready only once startup has finished and the node is open or has no networks', async () => {
    const notStarted = await fetch(`${baseUrl}/api/node/readiness`);
    expect(notStarted.status).toBe(503);
    expect(await notStarted.json()).toEqual({ status: 'not_ready' });

    replicatedStateOpen = true;
    const openButNotStarted = await fetch(`${baseUrl}/api/node/readiness`);
    expect(openButNotStarted.status).toBe(503);
    expect(await openButNotStarted.json()).toEqual({ status: 'not_ready' });

    readiness.markStarted();
    const ready = await fetch(`${baseUrl}/api/node/readiness`);
    expect(ready.status).toBe(200);
    expect(ready.headers.get('cache-control')).toBe('no-store');
    expect(ready.headers.get('content-type')).toContain('application/json');
    expect(await ready.json()).toEqual({ status: 'ready' });

    replicatedStateOpen = false;
    expect((await fetch(`${baseUrl}/api/node/readiness`)).status).toBe(503);

    configurationEmpty = true;
    const freshNode = await fetch(`${baseUrl}/api/node/readiness`);
    expect(freshNode.status).toBe(200);
    expect(await freshNode.json()).toEqual({ status: 'ready' });

    configurationEmpty = false;
    expect((await fetch(`${baseUrl}/api/node/readiness`)).status).toBe(503);
    expect((await fetch(`${baseUrl}/node/readiness`)).status).toBe(404);
  });
});
