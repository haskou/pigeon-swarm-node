import MailboxCreator from '@app/contexts/mailboxes/application/create/MailboxCreator';
import { MailboxCreateMessage } from '@app/contexts/mailboxes/application/create/messages/MailboxCreateMessage';
import { MailboxCreationProofInvalidError } from '@app/contexts/mailboxes/domain/errors/MailboxCreationProofInvalidError';
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
        new MailboxCreateMessage(
          id,
          body.postTokenHash,
          body.readTokenHash,
          body.creationNonce,
        ),
      );

      return response
        .status(created ? HttpRouteStatusEnum.CREATED : HttpRouteStatusEnum.OK)
        .send();
    } catch (error: unknown) {
      if (error instanceof MailboxCreationProofInvalidError) {
        return response.status(HttpRouteStatusEnum.BAD_REQUEST).json({
          code: 'BadRequestError',
          errors: [],
          httpStatus: HttpRouteStatusEnum.BAD_REQUEST,
          message: error.message,
          requiredDifficultyBits: error.requiredDifficultyBits,
        });
      }

      return this.translate(error);
    }
  }
}
