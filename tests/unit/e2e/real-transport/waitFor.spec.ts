import ReplicatedStateNotReadyError from '@app/contexts/shared/infrastructure/orbitdb/ReplicatedStateNotReadyError';
import { waitFor } from '../../../e2e/real-transport/two-real-node-gossipsub';

function httpError(status: number, data: unknown): Error {
  return Object.assign(new Error(`HTTP ${status} test`), {
    response: { data, status },
  });
}

function notReady(): Error {
  return httpError(503, { code: ReplicatedStateNotReadyError.CODE });
}

describe('waitFor', () => {
  it('keeps waiting through the not-ready 503020 answer until the predicate holds', async () => {
    let calls = 0;

    await waitFor(
      () => {
        calls += 1;

        if (calls < 3) {
          throw notReady();
        }

        return true;
      },
      'a restarting node',
      5000,
    );

    expect(calls).toBe(3);
  });

  it('times out without the response body when the node stays not ready', async () => {
    const leaked = 'response-body-must-not-leak';

    const error = await waitFor(
      () => {
        throw httpError(503, {
          code: ReplicatedStateNotReadyError.CODE,
          message: leaked,
        });
      },
      'a stuck node',
      1200,
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(
      /^Timed out waiting for a stuck node after 1200 ms/,
    );
    expect((error as Error).message).toContain('503');
    expect((error as Error).message).not.toContain(leaked);
  });

  it('rethrows a 503 whose body is not the not-ready code at once', async () => {
    let calls = 0;
    const started = Date.now();

    const error = await waitFor(
      () => {
        calls += 1;
        throw httpError(503, { code: '503030' });
      },
      'a dropped answer',
      5000,
    ).catch((caught: unknown) => caught);

    expect(calls).toBe(1);
    expect(Date.now() - started).toBeLessThan(1000);
    expect((error as Error).message).toMatch(
      /^Failed while waiting for a dropped answer: HTTP 503 test/,
    );
  });

  it('rethrows any other failure at once', async () => {
    let calls = 0;
    const started = Date.now();

    const error = await waitFor(
      () => {
        calls += 1;
        throw httpError(500, { code: '500000' });
      },
      'a broken node',
      5000,
    ).catch((caught: unknown) => caught);

    expect(calls).toBe(1);
    expect(Date.now() - started).toBeLessThan(1000);
    expect((error as Error).message).toMatch(
      /^Failed while waiting for a broken node: HTTP 500 test/,
    );
  });
});
