import axios from 'axios';
import * as https from 'https';

import { Requester } from './Requester';

export interface BaseResponse<R> {
  data: R;
  status: number;
  statusText: string;
}

export const HttpMethod = {
  DELETE: 'DELETE',
  GET: 'GET',
  HEAD: 'HEAD',
  OPTIONS: 'OPTIONS',
  PATCH: 'PATCH',
  POST: 'POST',
  PUT: 'PUT',
} as const;

export type HttpMethod = (typeof HttpMethod)[keyof typeof HttpMethod];

export interface BaseResponse<R> {
  data: R;
  status: number;
  statusText: string;
}

export type BaseHeaders = Record<string, string | number | boolean>;

export const responses = {
  ARRAYBUFFER: 'arraybuffer',
  DOCUMENT: 'document',
  JSON: 'json',
  STREAM: 'stream',
  TEXT: 'text',
} as const;

export type ResponseType = (typeof responses)[keyof typeof responses];

export interface BaseOptions {
  url: string;
  method: HttpMethod;
  headers?: BaseHeaders;
  data?: Record<string, unknown>;
  params?: Record<string, unknown>;
  timeout?: number;
  httpsAgent?: https.Agent;
  responseType?: ResponseType;
  maxContentLength?: number;
  maxBodyLength?: number;
}

export class BaseRequester implements Requester {
  constructor(
    private readonly url: string,
    private readonly debug: boolean = false,
    private readonly addRejectUnauthorizedAgent: boolean = false,
    private readonly responseType: ResponseType = responses.JSON,
  ) {
    this.url = url;
  }

  public async request<R = unknown>(
    route: string,
    method: HttpMethod,
    headers?: BaseHeaders,
    qs?: Record<string, unknown>,
    body?: Record<string, unknown>,
  ): Promise<BaseResponse<R>> {
    let routeUrl = route !== '' ? `/${route}` : route;
    routeUrl = routeUrl.replace(/\/\//g, '/');
    const url = `${this.url}${routeUrl}`;
    const requestConfig: BaseOptions = {
      data: body,
      headers,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      method,
      params: qs,
      responseType: this.responseType,
      url,
    };

    if (this.debug) {
      // Kernel.info(`Requester Config`, { requestConfig });
    }

    if (this.addRejectUnauthorizedAgent) {
      requestConfig.httpsAgent = new https.Agent({
        rejectUnauthorized: false,
      });
    }

    try {
      return await axios.request<R>(requestConfig);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        // Return the error response instead of throwing
        return {
          data: error.response.data as R,
          status: error.response.status,
          statusText: error.response.statusText,
        };
      }
      // For network errors or other non-response errors, still throw
      throw error;
    }
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
