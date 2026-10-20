import {
  ErrorResponseHandler,
  HttpErrorHandler,
} from '@haskou/ddd-kernel/adapters/ui';
import { HttpError } from 'routing-controllers';

import CustomHttpError from '../errors/CustomHttpError';
import { Log } from '../logs/Log';
import {
  handleCustomHttpError,
  handleDomainError,
} from './PigeonHttpErrorResponseHandlers';

const PLAIN_ERROR_NAME = /^[A-Za-z][A-Za-z0-9_$]{0,63}$/;

interface StatusCarrier {
  readonly httpCode?: unknown;
  readonly status?: unknown;
  readonly statusCode?: unknown;
}

// The kernel answers any error that carries an HTTP status itself; everything
// else reaches its unhandled branch, which is the only one that stays silent
// in production.
function carriesHttpStatus(error: Error): boolean {
  const carrier = error as Error & StatusCarrier;

  return (
    error instanceof HttpError ||
    Boolean(carrier.httpCode ?? carrier.statusCode ?? carrier.status)
  );
}

function describeUnhandledError(error: Error): string {
  const name = PLAIN_ERROR_NAME.test(error.name) ? error.name : 'Error';
  const { errno } = error as NodeJS.ErrnoException;

  return Number.isInteger(errno)
    ? `Unhandled error: name=${name} errno=${errno}`
    : `Unhandled error: name=${name}`;
}

/**
 * Logs an unhandled error in every environment with its class name and, when
 * it has one, its numeric errno. The message, stack, paths and any other
 * property can hold identifiers or payloads, so they are never logged.
 */
function logUnhandledError(logger: Log): ErrorResponseHandler {
  return (error) => {
    if (!(error instanceof CustomHttpError) && !carriesHttpStatus(error)) {
      logger.error(describeUnhandledError(error));
    }

    return false;
  };
}

export function createPigeonHttpErrorHandler(logger: Log): HttpErrorHandler {
  return new HttpErrorHandler({
    // The kernel logs the message of an unhandled error where it is listed.
    exposeUnhandledErrorsIn: [],
    handlers: [
      handleDomainError,
      handleCustomHttpError,
      logUnhandledError(logger),
    ],
  });
}
