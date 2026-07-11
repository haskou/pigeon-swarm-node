import { BaseHeaders } from './BaseHeaders';
import { BaseResponse } from './BaseResponse';
import { HttpMethod } from './HttpMethod';
import { Requester } from './Requester';
import { ResponseType, responses } from './ResponseType';

export class BaseRequester implements Requester {
  constructor(
    private readonly url: string,
    private readonly responseType: ResponseType = responses.JSON,
  ) {
    this.url = url;
  }

  private buildUrl(route: string, qs?: Record<string, unknown>): URL {
    let routeUrl = route !== '' ? `/${route}` : route;
    routeUrl = routeUrl.replace(/\/\//g, '/');
    const url = new URL(routeUrl, this.url);

    for (const [key, value] of Object.entries(qs || {})) {
      url.searchParams.set(key, String(value));
    }

    return url;
  }

  private buildHeaders(
    headers: BaseHeaders | undefined,
    hasBody: boolean,
  ): Headers {
    const requestHeaders = new Headers();

    for (const [key, value] of Object.entries(headers || {})) {
      requestHeaders.set(key, String(value));
    }

    if (hasBody) {
      requestHeaders.set('content-type', 'application/json');
    }

    return requestHeaders;
  }

  private async parseResponse(response: Response): Promise<unknown> {
    if (this.responseType === responses.ARRAYBUFFER) {
      return response.arrayBuffer();
    }

    const text = await response.text();

    if (this.responseType === responses.JSON && text.length > 0) {
      return JSON.parse(text);
    }

    return text;
  }

  public async request<R = unknown>(
    route: string,
    method: HttpMethod,
    headers?: BaseHeaders,
    qs?: Record<string, unknown>,
    body?: Record<string, unknown>,
  ): Promise<BaseResponse<R>> {
    const url = this.buildUrl(route, qs);
    const response = await fetch(url, {
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: this.buildHeaders(headers, body !== undefined),
      method,
    });

    return {
      data: (await this.parseResponse(response)) as R,
      status: response.status,
      statusText: response.statusText,
    };
  }

  public async get<R = unknown>(
    route: string,
    headers?: BaseHeaders,
    qs?: Record<string, unknown>,
  ): Promise<BaseResponse<R>> {
    return await this.request<R>(route, HttpMethod.GET, headers, qs);
  }

  public async post<R = unknown>(
    route: string,
    body?: Record<string, unknown>,
    headers?: BaseHeaders,
    qs?: Record<string, unknown>,
  ): Promise<BaseResponse<R>> {
    return await this.request<R>(route, HttpMethod.POST, headers, qs, body);
  }

  public async patch<R = unknown>(
    route: string,
    body?: Record<string, unknown>,
    headers?: BaseHeaders,
    qs?: Record<string, unknown>,
  ): Promise<BaseResponse<R>> {
    return await this.request<R>(route, HttpMethod.PATCH, headers, qs, body);
  }

  public async put<R = unknown>(
    route: string,
    body?: Record<string, unknown>,
    headers?: BaseHeaders,
    qs?: Record<string, unknown>,
  ): Promise<BaseResponse<R>> {
    return await this.request<R>(route, HttpMethod.PUT, headers, qs, body);
  }

  public async delete<R = unknown>(
    route: string,
    headers?: BaseHeaders,
    qs?: Record<string, unknown>,
  ): Promise<BaseResponse<R>> {
    return await this.request<R>(route, HttpMethod.DELETE, headers, qs);
  }

  public async options<R = unknown>(
    route: string,
    headers?: BaseHeaders,
    qs?: Record<string, unknown>,
  ): Promise<BaseResponse<R>> {
    return await this.request<R>(route, HttpMethod.OPTIONS, headers, qs);
  }

  public async head<R = unknown>(
    route: string,
    headers?: BaseHeaders,
    qs?: Record<string, unknown>,
  ): Promise<BaseResponse<R>> {
    return await this.request<R>(route, HttpMethod.HEAD, headers, qs);
  }
}

export const requester = (url: string): BaseRequester => new BaseRequester(url);
