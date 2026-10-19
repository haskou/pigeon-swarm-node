import type { Express } from 'express';

import { PostConversationRequest } from '@app/apps/apis/conversations-api/requests/PostConversationRequest';
import { PostConversationRoute } from '@app/apps/apis/conversations-api/routes/PostConversationRoute';
import SignedHttpRequestAuthenticator from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import ConversationCreator from '@app/contexts/conversations/application/create-conversation/ConversationCreator';
import { InvalidKeychainCandidateError } from '@app/contexts/keychains/domain/errors/InvalidKeychainCandidateError';
import { KeychainOwnershipUnverifiedError } from '@app/contexts/keychains/domain/errors/KeychainOwnershipUnverifiedError';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import {
  handleCustomHttpError,
  handleDomainError,
} from '@app/shared/infrastructure/express/PigeonHttpErrorResponseHandlers';
import { HttpErrorHandler, Route } from '@haskou/ddd-kernel/adapters/ui';
import { Server } from 'http';
import { AddressInfo } from 'net';
import { createExpressServer } from 'routing-controllers';

import { IdentityMother } from '../../../mothers/IdentityMother';

describe('Post conversation route answers', () => {
  let server: Server;
  let baseUrl: string;
  let create: jest.Mock;

  beforeAll(async () => {
    create = jest.fn();

    const services = new Map<unknown, unknown>([
      [ConversationCreator, { create }],
      [
        SignedHttpRequestAuthenticator,
        {
          authenticate: () =>
            Promise.resolve(new IdentityId(new IdentityMother().id.valueOf())),
        },
      ],
    ]);
    jest
      .spyOn(Route.prototype, 'get')
      .mockImplementation(((service: unknown) =>
        services.get(service)) as never);
    // The creator is the unit under test's collaborator: the request body is
    // only checked for shape here, not for a valid signed genesis operation.
    jest
      .spyOn(PostConversationRequest.prototype, 'getMessage')
      .mockReturnValue({} as never);

    // Mirrors the application's error pipeline (the domain and HTTP error
    // handlers, not routing-controllers' default) so clients get the same
    // status and body.
    const app = createExpressServer({
      controllers: [PostConversationRoute],
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

  const postConversation = () =>
    fetch(`${baseUrl}/api/conversations`, {
      body: JSON.stringify({
        keychainExternalIdentifier: 'keychain-external-identifier',
        networkId: 'network-id',
        operation: { createdAt: 1, mutation: {}, parents: [] },
        participantIds: [new IdentityMother().id.valueOf()],
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });

  it('answers 503 with the replicated-state code when the owner keychain cannot be verified', async () => {
    create.mockRejectedValueOnce(
      new KeychainOwnershipUnverifiedError(new Error('document not found')),
    );

    const response = await postConversation();
    const body = (await response.json()) as { code: number; message: string };

    expect(response.status).toBe(503);
    expect(body.code).toBe(503020);
    expect(body.message).not.toContain('document not found');
  });

  it('keeps answering 409 when the keychain candidate is invalid', async () => {
    create.mockRejectedValueOnce(new InvalidKeychainCandidateError());

    const response = await postConversation();
    const body = (await response.json()) as { code: string };

    expect(response.status).toBe(409);
    expect(body.code).toBe('InvalidKeychainCandidateError');
  });
});
