import { applicationRoutes } from '@app/apps/ApplicationRoutes';
import { Server } from 'http';
import { AddressInfo } from 'net';
import { createExpressServer } from 'routing-controllers';

describe('Client contract route', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = createExpressServer({
      controllers: applicationRoutes.filter(
        (route) => route.name === 'GetClientContractRoute',
      ),
      routePrefix: '/api',
    });
    server = await new Promise<Server>((resolve) => {
      const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it('serves only the declarative compatibility contract at the configured prefix', async () => {
    const response = await fetch(`${baseUrl}/api/client-contract`);

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.json()).toEqual({
      protocol: 'pigeon-swarm',
      apiVersion: 1,
    });
    expect((await fetch(`${baseUrl}/client-contract`)).status).toBe(404);
  });
});
