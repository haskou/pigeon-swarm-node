import {
  ErrorResponseHandler,
  HttpErrorHandler,
} from '@haskou/ddd-kernel/adapters/ui';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { HttpError } from 'routing-controllers';

import CustomHttpError from '../errors/CustomHttpError';
import { Log } from '../logs/Log';
import {
  handleCustomHttpError,
  handleDomainError,
} from './PigeonHttpErrorResponseHandlers';

const UNHANDLED_ERROR_CODE = 'InternalServerError';
const UNHANDLED_ERROR_MESSAGE = 'Internal server error.';
const PLAIN_ERROR_NAME = /^[A-Za-z][A-Za-z0-9_$]{0,63}$/;

interface StatusCarrier {
  readonly expose?: unknown;
  readonly httpCode?: unknown;
  readonly status?: unknown;
  readonly statusCode?: unknown;
}

const FIRST_CLIENT_ERROR = 400;
const LAST_CLIENT_ERROR = 499;

// The kernel sends the message of any error that carries an HTTP status, and
// http-errors (used by send and serve-static) stamps a status on the file
// system error it wraps while keeping its path message. Only routing-controllers
// errors and client errors that were not flagged as not exposable keep that
// path; every other error, 5xx statuses included, is answered by this module.
function carriesHttpStatus(error: Error): boolean {
  if (error instanceof HttpError) {
    return true;
  }

  const carrier = error as Error & StatusCarrier;
  const status = carrier.httpCode ?? carrier.statusCode ?? carrier.status;

  return (
    carrier.expose !== false &&
    Number.isInteger(status) &&
    (status as number) >= FIRST_CLIENT_ERROR &&
    (status as number) <= LAST_CLIENT_ERROR
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
 * Answers an unhandled error with a fixed body and logs it in every
 * environment with its class name and, when it has one, its numeric errno. The
 * message, stack, paths, class name and any other property can hold
 * identifiers, payloads or the file system layout, so they are neither logged
 * nor sent to the caller.
 */
function answerUnhandledError(logger: Log): ErrorResponseHandler {
  return (error, response) => {
    if (error instanceof CustomHttpError || carriesHttpStatus(error)) {
      return false;
    }

    logger.error(describeUnhandledError(error));
    response.status(HttpRouteStatusEnum.INTERNAL_SERVER_ERROR).json({
      code: UNHANDLED_ERROR_CODE,
      httpStatus: HttpRouteStatusEnum.INTERNAL_SERVER_ERROR,
      message: UNHANDLED_ERROR_MESSAGE,
    });

    return true;
  };
}

export function createPigeonHttpErrorHandler(logger: Log): HttpErrorHandler {
  return new HttpErrorHandler({
    // The kernel logs the message of an unhandled error where it is listed.
    exposeUnhandledErrorsIn: [],
    handlers: [
      handleDomainError,
      handleCustomHttpError,
      answerUnhandledError(logger),
    ],
  });
}
