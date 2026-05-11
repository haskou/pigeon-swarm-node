import IdentityCreator from '@app/contexts/identities/application/create/IdentityCreator';
import IdentityFinder from '@app/contexts/identities/application/find/IdentityFinder';
import { IdentityFinderMessage } from '@app/contexts/identities/application/find/messages/IdentityFinderMessage';
import IdentityPublisher from '@app/contexts/identities/application/publish/IdentityPublisher';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import Route from '@app/shared/infrastructure/ui/routes/Route';
import { Response } from 'express';
import { Body, JsonController, Post, Res } from 'routing-controllers';

import { PostIdentityBody } from '../bodies/PostIdentityBody';
import { PostIdentityRequest } from '../requests/PostIdentityRequest';
import { IdentityViewModel } from '../view-model/IdentityViewModel';

// TODO: Test
@JsonController('/identities')
export class PostIdentityRoute extends Route {
  private readonly identityCreator: IdentityCreator =
    this.get<IdentityCreator>(IdentityCreator);

  private readonly identityPublisher: IdentityPublisher =
    this.get<IdentityPublisher>(IdentityPublisher);

  private readonly identityFinder: IdentityFinder =
    this.get<IdentityFinder>(IdentityFinder);

  @Post('/')
  public async createIdentity(
    @Body({ options: { limit: '10mb' } }) body: PostIdentityBody,
    @Res() response: Response,
  ): Promise<Response> {
    const request = new PostIdentityRequest(body);
    const identity = request.isClientSignedIdentity()
      ? await this.identityPublisher.publish(
          request.getIdentityPublishMessage(),
        )
      : await this.identityCreator.create(request.getIdentityCreateMessage());
    const candidate = await this.identityFinder.findCandidate(
      new IdentityFinderMessage(identity.toPrimitives().id),
    );

    const viewModel = new IdentityViewModel(
      candidate.identity,
      candidate.externalIdentifier,
    );

    return response.status(HttpRouteStatusEnum.OK).send(viewModel.toResource());
  }
}
