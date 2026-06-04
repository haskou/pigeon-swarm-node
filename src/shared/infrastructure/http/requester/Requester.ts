import { BaseHeaders } from './BaseHeaders';
import { BaseResponse } from './BaseResponse';
import { HttpMethod } from './HttpMethod';

export interface Requester {
  request<R>(
    route: string,
    method: HttpMethod,
    headers?: BaseHeaders,
    qs?: Record<string, unknown>,
    body?: Record<string, unknown>,
  ): Promise<BaseResponse<R>>;
  get<R>(
    route: string,
    headers?: BaseHeaders,
    qs?: Record<string, unknown>,
  ): Promise<BaseResponse<R>>;
  post<R>(
    route: string,
    body?: Record<string, unknown>,
    headers?: BaseHeaders,
    qs?: Record<string, unknown>,
  ): Promise<BaseResponse<R>>;
  patch<R>(
    route: string,
    body?: Record<string, unknown>,
    headers?: BaseHeaders,
    qs?: Record<string, unknown>,
  ): Promise<BaseResponse<R>>;
  put<R>(
    route: string,
    body?: Record<string, unknown>,
    headers?: BaseHeaders,
    qs?: Record<string, unknown>,
  ): Promise<BaseResponse<R>>;
  delete<R>(
    route: string,
    headers?: BaseHeaders,
    qs?: Record<string, unknown>,
  ): Promise<BaseResponse<R>>;
  options<R>(
    route: string,
    headers?: BaseHeaders,
    qs?: Record<string, unknown>,
  ): Promise<BaseResponse<R>>;
  head<R>(
    route: string,
    headers?: BaseHeaders,
    qs?: Record<string, unknown>,
  ): Promise<BaseResponse<R>>;
}
