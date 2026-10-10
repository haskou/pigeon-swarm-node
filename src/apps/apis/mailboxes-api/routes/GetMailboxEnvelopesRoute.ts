import MailboxReader from '@app/contexts/mailboxes/application/MailboxReader';
import MailboxPolicy from '@app/contexts/mailboxes/domain/MailboxPolicy';
import { Request, Response } from 'express';
import {
  Get,
  JsonController,
  Param,
  QueryParam,
  Req,
  Res,
} from 'routing-controllers';

import { MailboxRouteSupport } from './MailboxRouteSupport';

@JsonController('/mailboxes')
export class GetMailboxEnvelopesRoute extends MailboxRouteSupport {
  private readonly reader = this.get<MailboxReader>(MailboxReader);

  @Get('/:mailboxId/envelopes')
  public async request(
    @Param('mailboxId') mailboxId: string,
    @QueryParam('after') after: number = 0,
    @QueryParam('limit') limit: number = MailboxPolicy.MAX_PAGE,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const id = this.mailboxId(mailboxId);
    const token = this.bearerToken(request);

    try {
      const page = await this.reader.read(
        id,
        token,
        Number.isSafeInteger(Number(after)) ? Math.max(Number(after), 0) : 0,
        Number.isSafeInteger(Number(limit))
          ? Number(limit)
          : MailboxPolicy.MAX_PAGE,
      );

      return response.setHeader('Cache-Control', 'no-store').json({
        envelopes: page.envelopes.map(({ body, cursor, envelopeId }) => ({
          body,
          cursor,
          envelopeId,
        })),
        hasMore: page.hasMore,
      });
    } catch (error: unknown) {
      return this.translate(error);
    }
  }
}
