import { applicationRoutes } from '@app/apps/ApplicationRoutes';
import NodeReadiness from '@app/apps/NodeReadiness';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import { Route } from '@haskou/ddd-kernel/adapters/ui';
import { Server } from 'http';
import { AddressInfo } from 'net';
import { createExpressServer } from 'routing-controllers';

describe('Node readiness route', () => {
  let server: Server;
  let baseUrl: string;
  let replicatedStateOpen: boolean;
  let readiness: NodeReadiness;

  beforeAll(async () => {
    replicatedStateOpen = false;
    readiness = new NodeReadiness({
      isOpen: () => replicatedStateOpen,
    } as unknown as OrbitDBReplicatedStateRegistry);
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

  it('answers ready only once startup has finished and the replicated state is open', async () => {
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
    expect((await fetch(`${baseUrl}/node/readiness`)).status).toBe(404);
  });
});
