import { PageCursor } from '@app/apps/apis/shared/pagination/PageCursor';
import NodeReadiness from '@app/apps/NodeReadiness';
import CommunitiesFinder from '@app/contexts/communities/application/find-communities/CommunitiesFinder';
import ReplicatedStateNotReadyError from '@app/contexts/shared/infrastructure/orbitdb/ReplicatedStateNotReadyError';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import { Get, JsonController, QueryParam, Req, Res } from 'routing-controllers';

import { GetCommunitiesRequest } from '../requests/GetCommunitiesRequest';
import { CommunitiesViewModel } from '../view-model/CommunitiesViewModel';
import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/communities')
export class GetCommunitiesRoute extends CommunityRouteSupport {
  private readonly finder = this.get<CommunitiesFinder>(CommunitiesFinder);

  private readonly readiness: NodeReadiness =
    this.get<NodeReadiness>(NodeReadiness);

  // Checked before the read and again after it: readiness can drop while the
  // page is read, and a page read across that change is not verified.
  private async assertReady(): Promise<void> {
    if (!(await this.readiness.isReady())) {
      throw new ReplicatedStateNotReadyError();
    }
  }

  @Get()
  public async getCommunities(
    @QueryParam('limit') limit: string | undefined,
    @QueryParam('cursor') cursor: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const identityId = await this.authenticate(request);

    // Not ready means startup has not finished or replicated state is still
    // replaying, so an empty list cannot yet be told apart from a real one.
    await this.assertReady();

    const pageRequest = new GetCommunitiesRequest(
      identityId.valueOf(),
      cursor,
      limit,
    );
    const page = await this.finder.find(pageRequest.getMessage());
    // The page was read across a possible readiness change, so it is answered
    // only if readiness still holds.
    await this.assertReady();
    const nextPosition = page.getNextPosition();

    return response.status(HttpRouteStatusEnum.OK).send(
      new CommunitiesViewModel(
        page.getItems(),
        nextPosition === undefined
          ? null
          : PageCursor.encode({
              position: nextPosition,
              resource: pageRequest.scope(),
            }),
      ).toResource(),
    );
  }
}
