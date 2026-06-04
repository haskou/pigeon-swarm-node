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
