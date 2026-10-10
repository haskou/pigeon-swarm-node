import MailboxAcknowledger from '@app/contexts/mailboxes/application/MailboxAcknowledger';
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

import { PostMailboxAckBody } from '../bodies/PostMailboxAckBody';
import { MailboxRouteSupport } from './MailboxRouteSupport';

@JsonController('/mailboxes')
export class PostMailboxAckRoute extends MailboxRouteSupport {
  private readonly acknowledger =
    this.get<MailboxAcknowledger>(MailboxAcknowledger);

  @Post('/:mailboxId/ack')
  public async request(
    @Param('mailboxId') mailboxId: string,
    @Body({ validate: { forbidNonWhitelisted: true, whitelist: true } })
    body: PostMailboxAckBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const id = this.mailboxId(mailboxId);
    const token = this.bearerToken(request);

    try {
      await this.acknowledger.acknowledge(id, token, body.upTo);

      return response.status(HttpRouteStatusEnum.NO_CONTENT).send();
    } catch (error: unknown) {
      return this.translate(error);
    }
  }
}
