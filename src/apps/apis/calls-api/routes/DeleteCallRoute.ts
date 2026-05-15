import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import { Request, Response } from 'express';
import { Delete, JsonController, Param, Req, Res } from 'routing-controllers';

import { CallViewModel } from '../view-model/CallViewModel';
import { CallRouteSupport } from './CallRouteSupport';

@JsonController('/calls')
export class DeleteCallRoute extends CallRouteSupport {
  @Delete('/:callId')
  public async endCall(
    @Param('callId') callId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const participantIdentityId = await this.authenticate(request);
    const call = await this.findCall(callId);

    call.end(participantIdentityId);
    await this.callRepository().save(call);
    await this.eventPublisher.publish(call.pullDomainEvents());

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new CallViewModel(call).toResource());
  }
}
