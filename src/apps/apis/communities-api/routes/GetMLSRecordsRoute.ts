import { MLSRecordsFindMessage } from '@app/contexts/communities/application/find-mls-records/messages/MLSRecordsFindMessage';
import MLSRecordsFinder from '@app/contexts/communities/application/find-mls-records/MLSRecordsFinder';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import {
  Get,
  JsonController,
  Param,
  QueryParam,
  Req,
  Res,
} from 'routing-controllers';

import { MLSRecordViewModel } from '../view-model/MLSRecordViewModel';
import { CommunityRouteSupport } from './CommunityRouteSupport';

@JsonController('/communities')
export class GetMLSRecordsRoute extends CommunityRouteSupport {
  private readonly finder = this.get<MLSRecordsFinder>(MLSRecordsFinder);

  @Get('/:communityId/mls/records')
  public async listRecords(
    @Param('communityId') communityId: string,
    @QueryParam('groupId', { required: true }) groupId: string,
    @QueryParam('kind') kind: string | undefined,
    @QueryParam('afterEpoch') afterEpoch: number | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const actorIdentityId = await this.authenticate(request);
    const records = await this.finder.find(
      new MLSRecordsFindMessage(
        actorIdentityId.valueOf(),
        communityId,
        groupId,
        kind,
        afterEpoch,
      ),
    );

    return response.status(HttpRouteStatusEnum.OK).send({
      communityId,
      groupId,
      records: records.map((record) =>
        new MLSRecordViewModel(record).toResource(),
      ),
    });
  }
}
