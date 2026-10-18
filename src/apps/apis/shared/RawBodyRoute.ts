/**
 * A route that reads its body as raw bytes instead of JSON. Its path is
 * relative to the route prefix. Only these routes may receive a non-JSON body;
 * any other route rejects it with 415. Adding a raw route requires listing it
 * here, so a new one fails closed until it is declared.
 */
export type RawBodyRoute = {
  method: 'POST' | 'PUT';
  path: RegExp;
};
