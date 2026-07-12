import type { HttpRequest } from './HttpRequest';

export type { HttpRequest } from './HttpRequest';

export interface HttpClient {
  baseUrl: string;
  headers: Record<string, string>;

  client(data?: Record<string, unknown>): HttpRequest;
  addHeaders(headers: Record<string, string>): void;
}
