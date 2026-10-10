import MailboxAppender from '@app/contexts/mailboxes/application/MailboxAppender';
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

import { PostMailboxEnvelopeBody } from '../bodies/PostMailboxEnvelopeBody';
import { MailboxRouteSupport } from './MailboxRouteSupport';

@JsonController('/mailboxes')
export class PostMailboxEnvelopeRoute extends MailboxRouteSupport {
  private readonly appender = this.get<MailboxAppender>(MailboxAppender);

  @Post('/:mailboxId/envelopes')
  public async request(
    @Param('mailboxId') mailboxId: string,
    @Body({
      options: { limit: '128kb' },
      validate: { forbidNonWhitelisted: true, whitelist: true },
    })
    body: PostMailboxEnvelopeBody,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const id = this.mailboxId(mailboxId);
    const token = this.bearerToken(request);

    try {
      const result = await this.appender.append(
        id,
        token,
        body.envelopeId,
        body.body,
      );

      return response
        .status(
          result.created ? HttpRouteStatusEnum.CREATED : HttpRouteStatusEnum.OK,
        )
        .json({ cursor: result.cursor });
    } catch (error: unknown) {
      return this.translate(error);
    }
  }
}
