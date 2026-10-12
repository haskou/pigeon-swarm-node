import { MailboxAppendRateLimitedError } from '@app/contexts/mailboxes/domain/errors/MailboxAppendRateLimitedError';
import { MailboxConflictError } from '@app/contexts/mailboxes/domain/errors/MailboxConflictError';
import { MailboxEnvelopeInvalidError } from '@app/contexts/mailboxes/domain/errors/MailboxEnvelopeInvalidError';
import { MailboxFullError } from '@app/contexts/mailboxes/domain/errors/MailboxFullError';
import { MailboxLastReaderError } from '@app/contexts/mailboxes/domain/errors/MailboxLastReaderError';
import { MailboxLimitReachedError } from '@app/contexts/mailboxes/domain/errors/MailboxLimitReachedError';
import { MailboxNotFoundError } from '@app/contexts/mailboxes/domain/errors/MailboxNotFoundError';
import { MailboxReaderLimitReachedError } from '@app/contexts/mailboxes/domain/errors/MailboxReaderLimitReachedError';
import { MailboxReaderNotFoundError } from '@app/contexts/mailboxes/domain/errors/MailboxReaderNotFoundError';
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
  protected static readonly READER_HASH = /^[0-9a-f]{64}$/;

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

  protected readerHash(raw: string): string {
    if (!MailboxRouteSupport.READER_HASH.test(raw)) {
      throw new NotFoundError('Reader not found.');
    }

    return raw;
  }

  protected translate(error: unknown): never {
    if (
      error instanceof MailboxNotFoundError ||
      error instanceof MailboxReaderNotFoundError
    ) {
      throw new NotFoundError(error.message);
    }

    if (error instanceof MailboxEnvelopeInvalidError) {
      throw new BadRequestError(error.message);
    }

    if (
      error instanceof MailboxLimitReachedError ||
      error instanceof MailboxAppendRateLimitedError
    ) {
      throw new HttpError(429, error.message);
    }

    return this.translateConflict(error);
  }

  protected translateConflict(error: unknown): never {
    if (
      error instanceof MailboxFullError ||
      error instanceof MailboxConflictError ||
      error instanceof MailboxLastReaderError ||
      error instanceof MailboxReaderLimitReachedError
    ) {
      throw new HttpError(409, error.message);
    }

    throw error;
  }
}
