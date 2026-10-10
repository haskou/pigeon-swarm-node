import MailboxCreator from '@app/contexts/mailboxes/application/MailboxCreator';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import {
  Body,
  JsonController,
  Param,
  Put,
  Req,
  Res,
} from 'routing-controllers';

import { PutMailboxBody } from '../bodies/PutMailboxBody';
import MailboxCreationRateLimiter from '../MailboxCreationRateLimiter';
import { MailboxRouteSupport } from './MailboxRouteSupport';

@JsonController('/mailboxes')
export class PutMailboxRoute extends MailboxRouteSupport {
  private readonly creator = this.get<MailboxCreator>(MailboxCreator);

  private readonly rateLimiter = this.get<MailboxCreationRateLimiter>(
    MailboxCreationRateLimiter,
  );

  @Put('/:mailboxId')
  public async request(
    @Param('mailboxId') mailboxId: string,
    @Body({ validate: { forbidNonWhitelisted: true, whitelist: true } })
    body: PutMailboxBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const id = this.mailboxId(mailboxId);

    try {
      this.rateLimiter.consume(request.ip ?? 'unknown');

      const created = await this.creator.create(
        id,
        body.postTokenHash,
        body.readTokenHash,
      );

      return response
        .status(created ? HttpRouteStatusEnum.CREATED : HttpRouteStatusEnum.OK)
        .send();
    } catch (error: unknown) {
      return this.translate(error);
    }
  }
}
