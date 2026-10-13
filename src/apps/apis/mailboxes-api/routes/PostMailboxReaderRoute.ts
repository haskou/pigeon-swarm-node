import MailboxReaderAdder from '@app/contexts/mailboxes/application/add-reader/MailboxReaderAdder';
import { MailboxReaderAddMessage } from '@app/contexts/mailboxes/application/add-reader/messages/MailboxReaderAddMessage';
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

import { PostMailboxReaderBody } from '../bodies/PostMailboxReaderBody';
import { MailboxRouteSupport } from './MailboxRouteSupport';

@JsonController('/mailboxes')
export class PostMailboxReaderRoute extends MailboxRouteSupport {
  private readonly adder = this.get<MailboxReaderAdder>(MailboxReaderAdder);

  @Post('/:mailboxId/readers')
  public async request(
    @Param('mailboxId') mailboxId: string,
    @Body({ validate: { forbidNonWhitelisted: true, whitelist: true } })
    body: PostMailboxReaderBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const id = this.mailboxId(mailboxId);
    const token = this.bearerToken(request);

    try {
      const added = await this.adder.add(
        new MailboxReaderAddMessage(id, token, body.readTokenHash),
      );

      return response
        .status(added ? HttpRouteStatusEnum.CREATED : HttpRouteStatusEnum.OK)
        .send();
    } catch (error: unknown) {
      return this.translate(error);
    }
  }
}
