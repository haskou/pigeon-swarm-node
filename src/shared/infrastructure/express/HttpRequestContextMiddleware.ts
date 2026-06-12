import { NextFunction, Request, Response } from 'express';
import {
  ExpressMiddlewareInterface as MiddlewareInterface,
  Middleware,
} from 'routing-controllers';

import HttpRequestContext from './HttpRequestContext';

@Middleware({ type: 'before' })
export class HttpRequestContextMiddleware implements MiddlewareInterface {
  public use(request: Request, _response: Response, next: NextFunction): void {
    HttpRequestContext.run(request, next);
  }
}
