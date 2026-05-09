import { SignedHttpRequestVerifier } from '@app/apps/apis/shared/SignedHttpRequestVerifier';
import KeychainPublisher from '@app/contexts/keychains/application/publish/KeychainPublisher';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import Route from '@app/shared/infrastructure/ui/routes/Route';
import { Request, Response } from 'express';
import { Body, JsonController, Post, Req, Res } from 'routing-controllers';

import { PostKeychainBody } from '../bodies/PostKeychainBody';
import { PostKeychainRequest } from '../requests/PostKeychainRequest';
import { KeychainPublicationResource } from '../resources/KeychainPublicationResource';

@JsonController('/keychains')
export class PostKeychainRoute extends Route {
  private readonly keychainPublisher: KeychainPublisher =
    this.get<KeychainPublisher>(KeychainPublisher);

  private readonly signedRequestVerifier = new SignedHttpRequestVerifier();

  @Post('/')
  public async publishKeychain(
    @Body() body: PostKeychainBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const ownerIdentityId = this.signedRequestVerifier.verify(request);
    const publishRequest = new PostKeychainRequest(body, ownerIdentityId);
    const externalIdentifier = await this.keychainPublisher.publish(
      publishRequest.getKeychainPublishMessage(),
    );
    const resource: KeychainPublicationResource = {
      keychainExternalIdentifier: externalIdentifier.valueOf(),
      ownerIdentityId: ownerIdentityId.valueOf(),
      version: body.version,
    };

    return response.status(HttpRouteStatusEnum.OK).send(resource);
  }
}
