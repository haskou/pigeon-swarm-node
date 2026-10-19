import SignedHttpRequestAuthenticator from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import KeychainPublisher from '@app/contexts/keychains/application/publish/KeychainPublisher';
import { KeychainOwnershipUnverifiedError } from '@app/contexts/keychains/domain/errors/KeychainOwnershipUnverifiedError';
import ReplicatedStateNotReadyError from '@app/contexts/shared/infrastructure/orbitdb/ReplicatedStateNotReadyError';
import { Route } from '@haskou/ddd-kernel/adapters/ui';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import { Body, JsonController, Post, Req, Res } from 'routing-controllers';

import { PostKeychainBody } from '../bodies/PostKeychainBody';
import { PostKeychainRequest } from '../requests/PostKeychainRequest';
import { KeychainPublicationResource } from '../resources/KeychainPublicationResource';

@JsonController('/keychains')
export class PostKeychainRoute extends Route {
  private readonly keychainPublisher: KeychainPublisher =
    this.get<KeychainPublisher>(KeychainPublisher);

  private readonly signedRequestAuthenticator =
    this.get<SignedHttpRequestAuthenticator>(SignedHttpRequestAuthenticator);

  @Post()
  public async publishKeychain(
    @Body() body: PostKeychainBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const ownerIdentityId =
      await this.signedRequestAuthenticator.authenticate(request);
    const publishRequest = new PostKeychainRequest(body, ownerIdentityId);
    const externalIdentifier = await this.keychainPublisher
      .publish(publishRequest.getKeychainPublishMessage())
      .catch((error: unknown) => {
        // The owner's keychain could not be verified, so the first version is
        // neither accepted nor refused. Answer the retryable replicated-state
        // code rather than a conflict. Every other failure is unchanged.
        if (error instanceof KeychainOwnershipUnverifiedError) {
          throw new ReplicatedStateNotReadyError();
        }

        throw error;
      });
    const resource: KeychainPublicationResource = {
      keychainExternalIdentifier: externalIdentifier.valueOf(),
      ownerIdentityId: ownerIdentityId.valueOf(),
      version: body.version,
    };

    return response.status(HttpRouteStatusEnum.OK).send(resource);
  }
}
