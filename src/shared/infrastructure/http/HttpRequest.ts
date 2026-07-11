export type HttpRequest = (
  path: string,
  init?: RequestInit,
) => Promise<Response>;
