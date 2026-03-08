import { Request, Response, NextFunction } from 'express';
import {
  HttpError,
  ExpressErrorMiddlewareInterface,
  Middleware,
} from 'routing-controllers';
import CustomHttpError from '../errors/CustomHttpError';
import { HttpRouteStatusEnum } from '../ui/routes/HttpRouteStatusEnum';
import Kernel from '@app/Kernel';
import { DomainError } from '@haskou/value-objects';

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
          property: error.property,
          value: error.value,
          details: error.constraints,
        });
      }
    });

    return formattedErrors;
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

    if (error instanceof DomainError) {
      response.status(HttpRouteStatusEnum.CONFLICT).json({
        code: error.constructor.name,
        message: error.message,
      });

      return;
    } else if (error instanceof CustomHttpError) {
      response.status(error.httpCode).json({
        code: error.code,
        message: error.message,
        httpStatus: error.httpCode,
      });

      return;
    } else if (error instanceof HttpError) {
      response.status(error.httpCode).json({
        code: error.name,
        message: error.message,
        errors: this.formatValidationErrors(
          (error as ErrorExplanation).errors || [],
        ),
      });

      return;
    } else {
      if (this.OUTPUT_ERROR_LOG_ENVS.includes(process.env.NODE_ENV || '')) {
        Kernel.logger.error(`Unhandled error: ${error.message}`);
        Kernel.logger.info(error.stack || 'No stack trace available');
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
