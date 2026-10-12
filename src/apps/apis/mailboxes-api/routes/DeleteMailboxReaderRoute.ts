import MailboxReaderRevoker from '@app/contexts/mailboxes/application/MailboxReaderRevoker';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import { Delete, JsonController, Param, Req, Res } from 'routing-controllers';

import { MailboxRouteSupport } from './MailboxRouteSupport';

@JsonController('/mailboxes')
export class DeleteMailboxReaderRoute extends MailboxRouteSupport {
  private readonly revoker = this.get<MailboxReaderRevoker>(
    MailboxReaderRevoker,
  );

  @Delete('/:mailboxId/readers/:readTokenHash')
  public async request(
    @Param('mailboxId') mailboxId: string,
    @Param('readTokenHash') readTokenHash: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const id = this.mailboxId(mailboxId);
    const hash = this.readerHash(readTokenHash);
    const token = this.bearerToken(request);

    try {
      await this.revoker.revoke(id, token, hash);

      return response.status(HttpRouteStatusEnum.NO_CONTENT).send();
    } catch (error: unknown) {
      return this.translate(error);
    }
  }
}
