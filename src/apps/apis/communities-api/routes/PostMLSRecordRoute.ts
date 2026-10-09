import { MLSRecordPublishMessage } from '@app/contexts/communities/application/publish-mls-record/messages/MLSRecordPublishMessage';
import MLSRecordPublisher from '@app/contexts/communities/application/publish-mls-record/MLSRecordPublisher';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import {
  Body,
  JsonController,
  Param,
  Post,
  Req,
  Res,
} from 'routing-controllers';

import { PostMLSRecordBody } from '../bodies/PostMLSRecordBody';
import { MLSRecordViewModel } from '../view-model/MLSRecordViewModel';
import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/communities')
export class PostMLSRecordRoute extends CommunityRouteSupport {
  private readonly publisher = this.get<MLSRecordPublisher>(MLSRecordPublisher);

  @Post('/:communityId/mls/records')
  public async publishRecord(
    @Param('communityId') communityId: string,
    @Body() body: PostMLSRecordBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const actorIdentityId = await this.authenticate(request);
    const record = await this.publisher.publish(
      new MLSRecordPublishMessage({
        ...body,
        authorIdentityId: actorIdentityId.valueOf(),
        communityId,
      }),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new MLSRecordViewModel(record).toResource());
  }
}
