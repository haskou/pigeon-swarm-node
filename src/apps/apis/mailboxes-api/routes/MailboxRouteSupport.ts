import { MailboxConflictError } from '@app/contexts/mailboxes/domain/errors/MailboxConflictError';
import { MailboxEnvelopeInvalidError } from '@app/contexts/mailboxes/domain/errors/MailboxEnvelopeInvalidError';
import { MailboxFullError } from '@app/contexts/mailboxes/domain/errors/MailboxFullError';
import { MailboxLimitReachedError } from '@app/contexts/mailboxes/domain/errors/MailboxLimitReachedError';
import { MailboxNotFoundError } from '@app/contexts/mailboxes/domain/errors/MailboxNotFoundError';
import { Route } from '@haskou/ddd-kernel/adapters/ui';
import { Request } from 'express';
import { BadRequestError, HttpError, NotFoundError } from 'routing-controllers';

/**
 * Mailbox capabilities travel in the Authorization header, never in the URL,
 * so they stay out of access logs. A missing or wrong capability is
 * indistinguishable from an unknown mailbox. Requests carry no identity.
 */
export abstract class MailboxRouteSupport extends Route {
  protected static readonly MAILBOX_ID = /^[A-Za-z0-9_-]{43}$/;

  protected bearerToken(request: Request): string {
    const header = request.header('authorization') ?? '';
    const match = /^Bearer ([A-Za-z0-9_-]{20,128})$/.exec(header);

    if (!match) {
      throw new NotFoundError('Mailbox not found.');
    }

    return match[1];
  }

  protected mailboxId(raw: string): string {
    if (!MailboxRouteSupport.MAILBOX_ID.test(raw)) {
      throw new NotFoundError('Mailbox not found.');
    }

    return raw;
  }

  protected translate(error: unknown): never {
    if (error instanceof MailboxNotFoundError) {
      throw new NotFoundError(error.message);
    }

    if (error instanceof MailboxEnvelopeInvalidError) {
      throw new BadRequestError(error.message);
    }

    if (error instanceof MailboxLimitReachedError) {
      throw new HttpError(429, error.message);
    }

    if (
      error instanceof MailboxFullError ||
      error instanceof MailboxConflictError
    ) {
      throw new HttpError(409, error.message);
    }

    throw error;
  }
}
