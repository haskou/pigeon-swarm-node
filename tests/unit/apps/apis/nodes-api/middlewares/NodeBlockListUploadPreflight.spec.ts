import { NodeBlockListUploadInProgressError } from '@app/apps/apis/nodes-api/errors/NodeBlockListUploadInProgressError';
import { NodeBlockListUploadPreflight } from '@app/apps/apis/nodes-api/middlewares/NodeBlockListUploadPreflight';
import { EventEmitter } from 'events';
import { Request, Response } from 'express';

const request = (): Request =>
  Object.assign(new EventEmitter(), {
    headers: {},
    method: 'PUT',
  }) as unknown as Request;

const response = (): Response => new EventEmitter() as unknown as Response;

const settled = (): Promise<void> =>
  new Promise((resolve) => setImmediate(resolve));

describe('NodeBlockListUploadPreflight', () => {
  beforeEach(() => {
    jest
      .spyOn(
        NodeBlockListUploadPreflight.prototype as never,
        'assertClaimsCurrentOwner' as never,
      )
      .mockResolvedValue(undefined as never);
  });

  afterEach(() => jest.restoreAllMocks());

  it('should refuse a second upload while one is in flight', async () => {
    const preflight = new NodeBlockListUploadPreflight();
    const first = response();
    const second = jest.fn();

    preflight.use(request(), first, jest.fn());
    await settled();
    preflight.use(request(), response(), second);
    await settled();

    expect(second).toHaveBeenCalledWith(
      expect.any(NodeBlockListUploadInProgressError),
    );
    (first as unknown as EventEmitter).emit('close');
  });

  it('should accept the next upload once the previous response closes', async () => {
    const preflight = new NodeBlockListUploadPreflight();
    const first = response();
    const second = jest.fn();

    preflight.use(request(), first, jest.fn());
    await settled();
    (first as unknown as EventEmitter).emit('close');
    preflight.use(request(), response(), second);
    await settled();

    expect(second).not.toHaveBeenCalledWith(
      expect.any(NodeBlockListUploadInProgressError),
    );
  });

  it('should hand a synchronous failure after the owner check to next', async () => {
    const preflight = new NodeBlockListUploadPreflight();
    const next = jest.fn();
    const failingResponse = {
      once: () => {
        throw new Error('broken response');
      },
    } as unknown as Response;

    preflight.use(request(), failingResponse, next);
    await settled();

    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});
