import { ErrorResponseHandler } from '@haskou/ddd-kernel/adapters/ui';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
import { DomainError } from '@haskou/value-objects';

import CustomHttpError from '../errors/CustomHttpError';

export const handleDomainError: ErrorResponseHandler = (error, response) => {
  if (!(error instanceof DomainError)) {
    return false;
  }

  response.status(HttpRouteStatusEnum.CONFLICT).json({
    code: error.constructor.name,
    message: error.message,
  });

  return true;
};

export const handleCustomHttpError: ErrorResponseHandler = (
  error,
  response,
) => {
  if (!(error instanceof CustomHttpError)) {
    return false;
  }

  response.status(error.httpCode).json({
    code: error.code,
    httpStatus: error.httpCode,
    message: error.message,
  });

  return true;
};
