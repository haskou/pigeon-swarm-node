import SignedHttpRequestAuthenticator from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import NotificationUpdater from '@app/contexts/notifications/application/update/NotificationUpdater';
import { Route } from '@haskou/ddd-kernel/adapters/ui';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import {
  Body,
  JsonController,
  Param,
  Patch,
  Req,
  Res,
} from 'routing-controllers';

import { PatchNotificationBody } from '../bodies/PatchNotificationBody';
import { PatchNotificationRequest } from '../requests/PatchNotificationRequest';
import { NotificationViewModel } from '../view-model/NotificationViewModel';

@JsonController('/notifications')
export class PatchNotificationRoute extends Route {
  private readonly updater: NotificationUpdater =
    this.get<NotificationUpdater>(NotificationUpdater);

  private readonly signedRequestAuthenticator =
    this.get<SignedHttpRequestAuthenticator>(SignedHttpRequestAuthenticator);

  @Patch('/:notificationId')
  public async patchNotification(
    @Param('notificationId') notificationId: string,
    @Body() body: PatchNotificationBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const recipientIdentityId =
      await this.signedRequestAuthenticator.authenticate(request);
    const notification = await this.updater.update(
      new PatchNotificationRequest(
        notificationId,
        recipientIdentityId,
        body,
      ).getMessage(),
    );

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new NotificationViewModel(notification).toResource());
  }
}
