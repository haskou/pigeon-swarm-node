import { NextFunction, Request, Response } from 'express';

import { UnsupportedMediaTypeError } from './errors/UnsupportedMediaTypeError';
import { RAW_BODY_ROUTES } from './RawBodyRoutes';
import { RegisteredRoute } from './RegisteredRoute';
import { registeredRoutes } from './RegisteredRoutes';

/**
 * Rejects a request to a registered route that carries a body but is not
 * declared as JSON, with 415, before routing. Bodyless requests, unknown paths
 * (which keep their 404) and raw-body routes pass. The guard only reads headers
 * and never consumes the stream, so signed-body verification still sees the
 * original bytes.
 */
export class JsonBodyContentTypeGuard {
  private routes?: RegisteredRoute[];

  public constructor(
    private readonly routePrefix: string,
    private readonly loadRoutes: () => RegisteredRoute[] = registeredRoutes,
  ) {}

  private carriesBody(request: Request): boolean {
    const contentLength = Number(request.get('content-length') ?? 0);

    return contentLength > 0 || request.get('transfer-encoding') !== undefined;
  }

  private isJson(request: Request): boolean {
    return Boolean(request.is('application/json'));
  }

  private relativePath(request: Request): string {
    return request.path.startsWith(this.routePrefix)
      ? request.path.slice(this.routePrefix.length)
      : request.path;
  }

  private isRegisteredRoute(request: Request, path: string): boolean {
    this.routes ??= this.loadRoutes();

    return this.routes.some(
      (route) => route.method === request.method && route.path.test(path),
    );
  }

  private isRawBodyRoute(request: Request, path: string): boolean {
    return RAW_BODY_ROUTES.some(
      (route) => route.method === request.method && route.path.test(path),
    );
  }

  public middleware = (
    request: Request,
    _response: Response,
    next: NextFunction,
  ): void => {
    if (!this.carriesBody(request) || this.isJson(request)) {
      next();

      return;
    }

    const path = this.relativePath(request);

    if (
      !this.isRegisteredRoute(request, path) ||
      this.isRawBodyRoute(request, path)
    ) {
      next();

      return;
    }

    next(new UnsupportedMediaTypeError());
  };
}
