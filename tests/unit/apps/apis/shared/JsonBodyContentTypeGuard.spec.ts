import { JsonBodyContentTypeGuard } from '@app/apps/apis/shared/JsonBodyContentTypeGuard';
import { RAW_BODY_ROUTES } from '@app/apps/apis/shared/RawBodyRoutes';
import { RegisteredRoute } from '@app/apps/apis/shared/RegisteredRoute';
import { UnsupportedMediaTypeError } from '@app/apps/apis/shared/errors/UnsupportedMediaTypeError';
import { Request, Response } from 'express';

type FakeRequestInit = {
  method: string;
  path: string;
  contentLength?: string;
  contentType?: string;
  transferEncoding?: string;
};

const fakeRequest = (init: FakeRequestInit): Request => {
  const headers: Record<string, string> = {};
  if (init.contentLength !== undefined) {
    headers['content-length'] = init.contentLength;
  }
  if (init.transferEncoding !== undefined) {
    headers['transfer-encoding'] = init.transferEncoding;
  }

  const contentType = init.contentType;

  return {
    get: (name: string) => headers[name.toLowerCase()],
    is: (type: string) =>
      contentType !== undefined && contentType.startsWith(type) ? type : false,
    method: init.method,
    path: init.path,
  } as unknown as Request;
};

const registered: RegisteredRoute[] = [
  { method: 'POST', path: /^\/conversations$/ },
  { method: 'GET', path: /^\/conversations$/ },
  { method: 'PATCH', path: /^\/calls\/[^/]+$/ },
  { method: 'DELETE', path: /^\/node\/blocks$/ },
  { method: 'POST', path: /^\/ipfs\/contents$/ },
  { method: 'PUT', path: /^\/node\/blocks$/ },
  { method: 'PUT', path: /^\/private-blobs\/[^/]+$/ },
];

const run = (guard: JsonBodyContentTypeGuard, request: Request): unknown[] => {
  const calls: unknown[][] = [];
  guard.middleware(request, {} as Response, (...args: unknown[]) => {
    calls.push(args);
  });

  return calls[0] ?? [];
};

describe('JsonBodyContentTypeGuard', () => {
  const guard = new JsonBodyContentTypeGuard('', () => registered);

  it('passes bodyless requests whatever their content type', () => {
    expect(
      run(guard, fakeRequest({ method: 'GET', path: '/conversations' })),
    ).toEqual([]);
    expect(
      run(
        guard,
        fakeRequest({
          contentLength: '0',
          method: 'POST',
          path: '/conversations',
        }),
      ),
    ).toEqual([]);
  });

  it('passes a JSON body', () => {
    expect(
      run(
        guard,
        fakeRequest({
          contentLength: '2',
          contentType: 'application/json; charset=utf-8',
          method: 'POST',
          path: '/conversations',
        }),
      ),
    ).toEqual([]);
  });

  it('rejects a body with a missing content type with 415', () => {
    const [error] = run(
      guard,
      fakeRequest({
        contentLength: '2',
        method: 'POST',
        path: '/conversations',
      }),
    );

    expect(error).toBeInstanceOf(UnsupportedMediaTypeError);
    expect((error as UnsupportedMediaTypeError).httpCode).toBe(415);
    expect((error as UnsupportedMediaTypeError).name).toBe(
      'UnsupportedMediaTypeError',
    );
  });

  it('rejects a chunked body with a non-JSON content type', () => {
    const [error] = run(
      guard,
      fakeRequest({
        contentType: 'text/plain',
        method: 'PATCH',
        path: '/calls/1',
        transferEncoding: 'chunked',
      }),
    );

    expect(error).toBeInstanceOf(UnsupportedMediaTypeError);
  });

  it('lets an unregistered path through so it keeps its 404', () => {
    expect(
      run(
        guard,
        fakeRequest({
          contentLength: '4',
          contentType: 'application/octet-stream',
          method: 'POST',
          path: '/ipfs/api-test-network',
        }),
      ),
    ).toEqual([]);
  });

  it('exempts raw-body routes', () => {
    expect(
      run(
        guard,
        fakeRequest({
          contentLength: '4',
          contentType: 'image/png',
          method: 'POST',
          path: '/ipfs/contents',
        }),
      ),
    ).toEqual([]);
    expect(
      run(
        guard,
        fakeRequest({
          contentLength: '4',
          contentType: 'application/octet-stream',
          method: 'PUT',
          path: '/private-blobs/abc',
        }),
      ),
    ).toEqual([]);
  });

  it('matches routes after the route prefix', () => {
    const prefixed = new JsonBodyContentTypeGuard('/api', () => registered);

    expect(
      run(
        prefixed,
        fakeRequest({
          contentLength: '4',
          contentType: 'text/plain',
          method: 'PUT',
          path: '/api/node/blocks',
        }),
      ),
    ).toEqual([]);
    const [error] = run(
      prefixed,
      fakeRequest({
        contentLength: '4',
        contentType: 'text/plain',
        method: 'PATCH',
        path: '/api/calls/1',
      }),
    );

    expect(error).toBeInstanceOf(UnsupportedMediaTypeError);
  });

  it('does not exempt a raw path under a different method', () => {
    const [error] = run(
      guard,
      fakeRequest({
        contentLength: '4',
        contentType: 'text/plain',
        method: 'DELETE',
        path: '/node/blocks',
      }),
    );

    expect(error).toBeInstanceOf(UnsupportedMediaTypeError);
  });

  it('pins the raw-body route list so a new raw route is declared deliberately', () => {
    expect(
      RAW_BODY_ROUTES.map((route) => `${route.method} ${route.path.source}`),
    ).toEqual([
      'POST ^\\/ipfs\\/contents$',
      'PUT ^\\/node\\/blocks$',
      'PUT ^\\/private-blobs\\/[^/]+$',
    ]);
  });
});
