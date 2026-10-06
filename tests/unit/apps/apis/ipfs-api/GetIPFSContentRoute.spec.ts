import 'reflect-metadata';
import { GetIPFSContentRoute } from '@app/apps/apis/ipfs-api/routes/GetIPFSContentRoute';
import { ContentGetResult } from '@app/contexts/content-replication/application/get-content/ContentGetResult';
import { Response } from 'express';

function responseDouble(): {
  headers: Record<string, string>;
  response: Response;
} {
  const headers: Record<string, string> = {};
  const response = {
    json: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
    setHeader: jest.fn((name: string, value: string) => {
      headers[name] = value;

      return response;
    }),
    status: jest.fn().mockReturnThis(),
    type: jest.fn((value: string) => {
      headers['Content-Type'] = value;

      return response;
    }),
  } as unknown as Response;

  return { headers, response };
}

function routeServing(result: ContentGetResult): GetIPFSContentRoute {
  const route = Object.create(GetIPFSContentRoute.prototype) as {
    getter: unknown;
  };

  route.getter = { get: jest.fn().mockResolvedValue(result) };

  return route as unknown as GetIPFSContentRoute;
}

describe('GetIPFSContentRoute headers', () => {
  it('serves allowlisted media inline with its sniffed type and nosniff', async () => {
    const { headers, response } = responseDouble();
    const route = routeServing(
      ContentGetResult.binary({
        bytes: Buffer.from([1]),
        contentType: 'image/png',
        inline: true,
      }),
    );

    await route.request('cid', response);

    expect(headers['Content-Type']).toBe('image/png');
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['Content-Disposition']).toBeUndefined();
  });

  it('serves anything else as an attachment with nosniff', async () => {
    const { headers, response } = responseDouble();
    const route = routeServing(
      ContentGetResult.binary({
        bytes: Buffer.from('<script>'),
        contentType: 'application/octet-stream',
        inline: false,
      }),
    );

    await route.request('cid', response);

    expect(headers['Content-Type']).toBe('application/octet-stream');
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['Content-Disposition']).toBe('attachment');
  });
});
