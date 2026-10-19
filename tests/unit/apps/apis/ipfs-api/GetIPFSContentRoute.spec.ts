import 'reflect-metadata';
import { GetIPFSContentRoute } from '@app/apps/apis/ipfs-api/routes/GetIPFSContentRoute';
import { ContentGetResult } from '@app/contexts/content-replication/application/get-content/ContentGetResult';
import { ReplicatedContentNotFoundError } from '@app/contexts/content-replication/domain/errors/ReplicatedContentNotFoundError';
import { ContentId } from '@app/contexts/content-replication/domain/value-objects/ContentId';
import ReplicatedStateNotReadyError from '@app/contexts/shared/infrastructure/orbitdb/ReplicatedStateNotReadyError';
import { HttpRouteStatusEnum } from '@haskou/ddd-kernel/contracts/ui';
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

describe('GetIPFSContentRoute errors', () => {
  it('rethrows unavailable content so the error handler answers 503020', async () => {
    const { response } = responseDouble();
    const route = Object.create(GetIPFSContentRoute.prototype) as {
      getter: unknown;
    };

    route.getter = {
      get: jest.fn().mockRejectedValue(new ReplicatedStateNotReadyError()),
    };

    await expect(
      (route as unknown as GetIPFSContentRoute).request('cid', response),
    ).rejects.toBeInstanceOf(ReplicatedStateNotReadyError);
    expect(response.status).not.toHaveBeenCalled();
  });

  it('answers 404 only when the getter reports content absent on every network', async () => {
    // Characterization: the racer's all-network NotFound is the only path to 404.
    const { response } = responseDouble();
    const route = Object.create(GetIPFSContentRoute.prototype) as {
      getter: unknown;
    };

    route.getter = {
      get: jest
        .fn()
        .mockRejectedValue(new ReplicatedContentNotFoundError(new ContentId('cid'))),
    };

    await (route as unknown as GetIPFSContentRoute).request('cid', response);

    expect(response.status).toHaveBeenCalledWith(HttpRouteStatusEnum.NOT_FOUND);
    expect(response.json).toHaveBeenCalledWith({
      error: 'CID not found in any network',
    });
  });
});
