import * as https from 'https';

import { BaseHeaders } from './BaseHeaders';
import { HttpMethod } from './HttpMethod';
import { ResponseType } from './ResponseType';

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
