export type SignedHttpRequest = {
  body?: unknown;
  header(header: string): string | string[] | undefined;
  method: string;
  path: string;
};
