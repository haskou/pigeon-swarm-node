import type { HttpClient, HttpRequest } from './HttpClient';

export default class FetchHttpClient implements HttpClient {
  public baseUrl: string;
  public headers: Record<string, string> = {};

  constructor(baseUrl: string = '') {
    this.baseUrl = baseUrl;
  }

  public addHeaders(headers: Record<string, string>): void {
    this.headers = {
      ...this.headers,
      ...headers,
    };
  }

  public client(data?: Record<string, unknown>): HttpRequest {
    return async (path: string, init: RequestInit = {}): Promise<Response> => {
      const requestHeaders = new Headers(this.headers);

      new Headers(init.headers).forEach((value, key) => {
        requestHeaders.set(key, value);
      });

      const requestBody =
        init.body ?? (data === undefined ? undefined : JSON.stringify(data));

      if (data !== undefined && init.body === undefined) {
        requestHeaders.set('content-type', 'application/json');
      }

      return fetch(new URL(path, this.baseUrl).toString(), {
        ...init,
        body: requestBody,
        headers: requestHeaders,
      });
    };
  }
}
