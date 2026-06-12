import { AsyncLocalStorage } from 'async_hooks';
import { Request } from 'express';

export type HttpRequestContextState = {
  method: string;
  originalUrl: string;
  path: string;
};

export default class HttpRequestContext {
  private static readonly storage =
    new AsyncLocalStorage<HttpRequestContextState>();

  public static current(): HttpRequestContextState | undefined {
    return this.storage.getStore();
  }

  public static run<T>(request: Request, callback: () => T): T {
    return this.storage.run(
      {
        method: request.method,
        originalUrl: request.originalUrl || request.url,
        path: request.path,
      },
      callback,
    );
  }
}
