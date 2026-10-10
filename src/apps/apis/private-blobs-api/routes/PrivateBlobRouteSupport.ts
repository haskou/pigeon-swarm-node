import { PrivateBlobNotFoundError } from '@app/contexts/private-blobs/domain/errors/PrivateBlobNotFoundError';
import { PrivateBlobQuotaExceededError } from '@app/contexts/private-blobs/domain/errors/PrivateBlobQuotaExceededError';
import { PrivateBlobSizeInvalidError } from '@app/contexts/private-blobs/domain/errors/PrivateBlobSizeInvalidError';
import { PrivateBlobUploadClosedError } from '@app/contexts/private-blobs/domain/errors/PrivateBlobUploadClosedError';
import { PrivateBlobUploadInProgressError } from '@app/contexts/private-blobs/domain/errors/PrivateBlobUploadInProgressError';
import { PrivateBlobUploadSizeMismatchError } from '@app/contexts/private-blobs/domain/errors/PrivateBlobUploadSizeMismatchError';
import { Route } from '@haskou/ddd-kernel/adapters/ui';
import { Request } from 'express';
import { BadRequestError, HttpError, NotFoundError } from 'routing-controllers';

/**
 * Blob capabilities travel in the Authorization header, never in the URL, so
 * they stay out of access logs, referrers and link previews. A missing or wrong
 * capability is indistinguishable from an unknown blob.
 */
export abstract class PrivateBlobRouteSupport extends Route {
  protected bearerToken(request: Request): string {
    const header = request.header('authorization') ?? '';
    const match = /^Bearer ([A-Za-z0-9_-]{20,128})$/.exec(header);

    if (!match) {
      throw new NotFoundError('Private blob not found.');
    }

    return match[1];
  }

  protected translate(error: unknown): never {
    if (error instanceof PrivateBlobNotFoundError) {
      throw new NotFoundError(error.message);
    }

    if (error instanceof PrivateBlobQuotaExceededError) {
      throw new HttpError(413, error.message);
    }

    if (
      error instanceof PrivateBlobSizeInvalidError ||
      error instanceof PrivateBlobUploadSizeMismatchError
    ) {
      throw new BadRequestError(error.message);
    }

    if (
      error instanceof PrivateBlobUploadClosedError ||
      error instanceof PrivateBlobUploadInProgressError
    ) {
      throw new HttpError(409, error.message);
    }

    throw error;
  }
}
