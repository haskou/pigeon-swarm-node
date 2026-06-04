import Kernel from '@app/Kernel';
import { DomainError } from '@haskou/value-objects';
import { Request, Response, NextFunction } from 'express';
import {
  HttpError,
  ExpressErrorMiddlewareInterface,
  Middleware,
} from 'routing-controllers';

import CustomHttpError from '../errors/CustomHttpError';
import { HttpRouteStatusEnum } from '../ui/routes/HttpRouteStatusEnum';
import { ErrorExplanation } from './ErrorExplanation';
import { ErrorResponseHandler } from './ErrorResponseHandler';
import { FormattedValidationError } from './FormattedValidationError';
import { PayloadTooLargeError } from './PayloadTooLargeError';
import { ValidationError } from './ValidationError';

@Middleware({ type: 'after' })
export class HttpErrorHandler implements ExpressErrorMiddlewareInterface {
  private readonly OUTPUT_ERROR_LOG_ENVS = ['local', 'test'];

  private formatValidationErrors(
    errors: ValidationError[],
  ): FormattedValidationError[] {
    const formattedErrors: FormattedValidationError[] = [];

    errors.forEach((error) => {
      if (error.children?.length > 0) {
        formattedErrors.push(...this.formatValidationErrors(error.children));
      } else {
        formattedErrors.push({
          details: error.constraints,
          property: error.property,
          value: error.value,
        });
      }
    });

    return formattedErrors;
  }

  private isPayloadTooLargeError(error: PayloadTooLargeError): boolean {
    return (
      error.type === 'entity.too.large' ||
      error.status === HttpRouteStatusEnum.PAYLOAD_TOO_LARGE ||
      error.statusCode === HttpRouteStatusEnum.PAYLOAD_TOO_LARGE
    );
  }

  private logUnhandledError(error: Error): void {
    const message = `Unhandled error: ${error.message}`;
    const stackTrace = error.stack || 'No stack trace available';

    if (Kernel.logger) {
      Kernel.logger.error(message);
      Kernel.logger.info(stackTrace);

      return;
    }

    process.stderr.write(`${message}\n`);
    process.stdout.write(`${stackTrace}\n`);
  }

  private handleSyntaxError(error: Error, response: Response): boolean {
    if (!(error instanceof SyntaxError)) {
      return false;
    }

    response.status(HttpRouteStatusEnum.BAD_REQUEST).json({
      code: 'SyntaxError',
      message: 'Malformed JSON',
    });

    return true;
  }

  private handlePayloadTooLargeError(
    error: Error,
    response: Response,
  ): boolean {
    if (!this.isPayloadTooLargeError(error)) {
      return false;
    }

    response.status(HttpRouteStatusEnum.PAYLOAD_TOO_LARGE).json({
      code: 'PayloadTooLargeError',
      httpStatus: HttpRouteStatusEnum.PAYLOAD_TOO_LARGE,
      message: 'Request entity too large.',
    });

    return true;
  }

  private handleDomainError(error: Error, response: Response): boolean {
    if (!(error instanceof DomainError)) {
      return false;
    }

    response.status(HttpRouteStatusEnum.CONFLICT).json({
      code: error.constructor.name,
      message: error.message,
    });

    return true;
  }

  private handleCustomHttpError(error: Error, response: Response): boolean {
    if (!(error instanceof CustomHttpError)) {
      return false;
    }

    response.status(error.httpCode).json({
      code: error.code,
      httpStatus: error.httpCode,
      message: error.message,
    });

    return true;
  }

  private handleHttpError(error: Error, response: Response): boolean {
    if (!(error instanceof HttpError)) {
      return false;
    }

    response.status(error.httpCode).json({
      code: error.name,
      errors: this.formatValidationErrors(
        (error as ErrorExplanation).errors || [],
      ),
      message: error.message,
    });

    return true;
  }

  private handleUnhandledError(
    error: Error,
    response: Response,
    next: NextFunction,
  ): void {
    if (this.OUTPUT_ERROR_LOG_ENVS.includes(process.env.NODE_ENV || '')) {
      this.logUnhandledError(error);
    }

    response.status(HttpRouteStatusEnum.INTERNAL_SERVER_ERROR).json({
      code:
        error.constructor?.name || HttpRouteStatusEnum.INTERNAL_SERVER_ERROR,
      message: error.message || 'Unknown error',
    });

    next(error);
  }

  public error(
    error: Error,
    _request: Request,
    response: Response,
    next: NextFunction,
  ): void {
    const handlers: ErrorResponseHandler[] = [
      this.handleSyntaxError.bind(this),
      this.handlePayloadTooLargeError.bind(this),
      this.handleDomainError.bind(this),
      this.handleCustomHttpError.bind(this),
      this.handleHttpError.bind(this),
    ];

    if (handlers.some((handler) => handler(error, response))) {
      return;
    }

    this.handleUnhandledError(error, response, next);
  }
}
