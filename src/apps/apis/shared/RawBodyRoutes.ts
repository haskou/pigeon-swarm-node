import { RawBodyRoute } from './RawBodyRoute';

export const RAW_BODY_ROUTES: readonly RawBodyRoute[] = [
  { method: 'POST', path: /^\/ipfs\/contents$/ },
  { method: 'PUT', path: /^\/node\/blocks$/ },
  { method: 'PUT', path: /^\/private-blobs\/[^/]+$/ },
];
