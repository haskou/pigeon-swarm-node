import MailboxReaderLister from '@app/contexts/mailboxes/application/MailboxReaderLister';
import { Request, Response } from 'express';
import { Get, JsonController, Param, Req, Res } from 'routing-controllers';

import { MailboxRouteSupport } from './MailboxRouteSupport';

@JsonController('/mailboxes')
export class GetMailboxReadersRoute extends MailboxRouteSupport {
  private readonly lister = this.get<MailboxReaderLister>(MailboxReaderLister);

  @Get('/:mailboxId/readers')
  public async request(
    @Param('mailboxId') mailboxId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const id = this.mailboxId(mailboxId);
    const token = this.bearerToken(request);

    try {
      const listing = await this.lister.list(id, token);

      return response.setHeader('Cache-Control', 'no-store').json(listing);
    } catch (error: unknown) {
      return this.translate(error);
    }
  }
}
