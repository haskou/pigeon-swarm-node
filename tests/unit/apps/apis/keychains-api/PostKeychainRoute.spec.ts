import type { Express } from 'express';

import { PostKeychainRoute } from '@app/apps/apis/keychains-api/routes/PostKeychainRoute';
import SignedHttpRequestAuthenticator from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import KeychainPublisher from '@app/contexts/keychains/application/publish/KeychainPublisher';
import { KeychainOwnerAlreadyHasKeychainError } from '@app/contexts/keychains/domain/errors/KeychainOwnerAlreadyHasKeychainError';
import { KeychainOwnershipUnverifiedError } from '@app/contexts/keychains/domain/errors/KeychainOwnershipUnverifiedError';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import {
  handleCustomHttpError,
  handleDomainError,
} from '@app/shared/infrastructure/express/PigeonHttpErrorResponseHandlers';
import { HttpErrorHandler, Route } from '@haskou/ddd-kernel/adapters/ui';
import { generateKeyPairSync } from 'crypto';
import { Server } from 'http';
import { AddressInfo } from 'net';
import { createExpressServer } from 'routing-controllers';

describe('Post keychain route owner check answers', () => {
  let server: Server;
  let baseUrl: string;
  let publish: jest.Mock;

  beforeAll(async () => {
    const { publicKey } = generateKeyPairSync('ed25519');
    const ownerIdentityId = publicKey
      .export({ format: 'pem', type: 'spki' })
      .toString()
      .replace(/-----[^-]+-----|\s/g, '');

    publish = jest.fn();

    const services = new Map<unknown, unknown>([
      [KeychainPublisher, { publish }],
      [
        SignedHttpRequestAuthenticator,
        {
          authenticate: () => Promise.resolve(new IdentityId(ownerIdentityId)),
        },
      ],
    ]);
    jest
      .spyOn(Route.prototype, 'get')
      .mockImplementation(((service: unknown) =>
        services.get(service)) as never);

    // Mirrors the application's error pipeline (the domain and HTTP error
    // handlers, not routing-controllers' default) so clients get the same
    // status and body.
    const app = createExpressServer({
      controllers: [PostKeychainRoute],
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

  const postFirstVersion = () =>
    fetch(`${baseUrl}/api/keychains`, {
      body: JSON.stringify({
        encryptedPayload: 'encrypted-payload',
        signature: Buffer.alloc(64, 1).toString('base64'),
        timestamp: 1,
        version: 1,
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });

  it('answers 503 with the replicated-state code when the owner keychain cannot be verified', async () => {
    publish.mockRejectedValueOnce(
      new KeychainOwnershipUnverifiedError(new Error('document not found')),
    );

    const response = await postFirstVersion();
    const body = (await response.json()) as { code: number; message: string };

    expect(response.status).toBe(503);
    expect(body.code).toBe(503020);
    expect(body.message).not.toContain('document not found');
  });

  it('keeps answering 409 when the owner already has a keychain', async () => {
    publish.mockRejectedValueOnce(new KeychainOwnerAlreadyHasKeychainError());

    const response = await postFirstVersion();
    const body = (await response.json()) as { code: string };

    expect(response.status).toBe(409);
    expect(body.code).toBe('KeychainOwnerAlreadyHasKeychainError');
  });
});
