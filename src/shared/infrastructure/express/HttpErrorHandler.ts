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

type ValidationError = {
  property: string;
  value: string;
  constraints: string[];
  children: ValidationError[];
};

type ErrorExplanation = {
  errors?: Array<ValidationError>;
};

type FormattedValidationError = {
  property: string;
  value: string;
  details: string[];
};

type PayloadTooLargeError = Error & {
  status?: number;
  statusCode?: number;
  type?: string;
};

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

  // eslint-disable-next-line complexity
  public error(
    error: Error,
    _request: Request,
    response: Response,
    next: NextFunction,
  ): void {
    if (error instanceof SyntaxError) {
      response.status(HttpRouteStatusEnum.BAD_REQUEST).json({
        code: 'SyntaxError',
        message: 'Malformed JSON',
      });

      return;
    }

    if (this.isPayloadTooLargeError(error)) {
      response.status(HttpRouteStatusEnum.PAYLOAD_TOO_LARGE).json({
        code: 'PayloadTooLargeError',
        httpStatus: HttpRouteStatusEnum.PAYLOAD_TOO_LARGE,
        message: 'Request entity too large.',
      });

      return;
    }

    if (error instanceof DomainError) {
      response.status(HttpRouteStatusEnum.CONFLICT).json({
        code: error.constructor.name,
        message: error.message,
      });

      return;
    } else if (error instanceof CustomHttpError) {
      response.status(error.httpCode).json({
        code: error.code,
        httpStatus: error.httpCode,
        message: error.message,
      });

      return;
    } else if (error instanceof HttpError) {
      response.status(error.httpCode).json({
        code: error.name,
        errors: this.formatValidationErrors(
          (error as ErrorExplanation).errors || [],
        ),
        message: error.message,
      });

      return;
    } else {
      if (this.OUTPUT_ERROR_LOG_ENVS.includes(process.env.NODE_ENV || '')) {
        this.logUnhandledError(error);
      }

      response.status(HttpRouteStatusEnum.INTERNAL_SERVER_ERROR).json({
        code:
          error.constructor?.name || HttpRouteStatusEnum.INTERNAL_SERVER_ERROR,
        message: error.message || 'Unknown error',
      });

      return next(error);
    }
  }
}
