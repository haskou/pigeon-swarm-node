import MailboxRemover from '@app/contexts/mailboxes/application/MailboxRemover';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { Request, Response } from 'express';
import { Delete, JsonController, Param, Req, Res } from 'routing-controllers';

import { MailboxRouteSupport } from './MailboxRouteSupport';

@JsonController('/mailboxes')
export class DeleteMailboxRoute extends MailboxRouteSupport {
  private readonly remover = this.get<MailboxRemover>(MailboxRemover);

  @Delete('/:mailboxId')
  public async request(
    @Param('mailboxId') mailboxId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    const id = this.mailboxId(mailboxId);
    const token = this.bearerToken(request);

    try {
      await this.remover.remove(id, token);

      return response.status(HttpRouteStatusEnum.NO_CONTENT).send();
    } catch (error: unknown) {
      return this.translate(error);
    }
  }
}
