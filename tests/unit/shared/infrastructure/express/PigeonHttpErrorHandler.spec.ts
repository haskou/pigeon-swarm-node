import { CallSignalMismatchError } from '@app/contexts/calls/domain/errors/CallSignalMismatchError';
import { createPigeonHttpErrorHandler } from '@app/shared/infrastructure/express/PigeonHttpErrorHandler';
import { Log } from '@app/shared/infrastructure/logs/Log';
import { mock, MockProxy } from 'jest-mock-extended';
import { HttpError } from 'routing-controllers';

const SECRET_PATH = '/data/private_blobs/bafySecretCid/topic-xyz.part';

class BrokenThing extends Error {}

function respondTo(
  error: Error,
  logger: Log,
): { body: unknown; status: number } {
  const captured: { body: unknown; status: number } = {
    body: undefined,
    status: 0,
  };
  const response = {
    json: (body: unknown) => {
      captured.body = body;

      return response;
    },
    status: (status: number) => {
      captured.status = status;

      return response;
    },
  };

  createPigeonHttpErrorHandler(logger).handle(
    error,
    {} as never,
    response as never,
    jest.fn(),
  );

  return captured;
}

function filesystemError(): NodeJS.ErrnoException {
  const error: NodeJS.ErrnoException = new Error(
    `EACCES: permission denied, open '${SECRET_PATH}'`,
  );
  error.code = 'EACCES';
  error.errno = -13;
  error.path = SECRET_PATH;
  error.stack = `Error: leak\n    at ${SECRET_PATH}`;

  return error;
}

describe('createPigeonHttpErrorHandler', () => {
  const originalEnvironment = process.env.NODE_ENV;
  let logger: MockProxy<Log>;

  beforeEach(() => {
    logger = mock<Log>();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnvironment;
  });

  it.each(['production', 'test', 'local', ''])(
    'logs only the error name and errno of an unhandled error when NODE_ENV is %p',
    (environment) => {
      process.env.NODE_ENV = environment;

      respondTo(filesystemError(), logger);

      expect(logger.error).toHaveBeenCalledTimes(1);
      expect(logger.error).toHaveBeenCalledWith(
        'Unhandled error: name=Error errno=-13',
      );
      expect(logger.warn).not.toHaveBeenCalled();
      expect(logger.info).not.toHaveBeenCalled();
      expect(logger.debug).not.toHaveBeenCalled();
    },
  );

  it('logs the name alone when the error has no numeric errno', () => {
    process.env.NODE_ENV = 'production';
    const error = new BrokenThing(`failed for ${SECRET_PATH}`);
    error.name = 'BrokenThing';

    respondTo(error, logger);

    expect(logger.error).toHaveBeenCalledWith(
      'Unhandled error: name=BrokenThing',
    );
  });

  it('never logs a name that is not a plain identifier', () => {
    process.env.NODE_ENV = 'production';
    const error = new Error('x');
    error.name = `Evil ${SECRET_PATH}\nforged line`;

    respondTo(error, logger);

    expect(logger.error).toHaveBeenCalledWith('Unhandled error: name=Error');
  });

  it.each(['production', 'test', 'local', ''])(
    'answers an unhandled error with a fixed generic body when NODE_ENV is %p',
    (environment) => {
      process.env.NODE_ENV = environment;

      const response = respondTo(filesystemError(), logger);

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        code: 'InternalServerError',
        httpStatus: 500,
        message: 'Internal server error.',
      });
      expect(JSON.stringify(response.body)).not.toContain(SECRET_PATH);
    },
  );

  it('does not reveal the class name of a custom unhandled error', () => {
    const response = respondTo(new BrokenThing('boom'), logger);

    expect(response.body).toEqual({
      code: 'InternalServerError',
      httpStatus: 500,
      message: 'Internal server error.',
    });
  });

  it('keeps the documented message of a domain error', () => {
    const response = respondTo(new CallSignalMismatchError(), logger);

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      code: 'CallSignalMismatchError',
      message: 'Call signal does not match the request or the call.',
    });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it.each([
    ['500 stamped by http-errors', 500, true],
    ['404 stamped by http-errors and not exposable', 404, false],
  ])(
    'answers a file system error with status %s with the generic body',
    (_label, status, expose) => {
      const error = Object.assign(filesystemError(), {
        expose,
        status,
        statusCode: status,
      });

      const response = respondTo(error, logger);

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        code: 'InternalServerError',
        httpStatus: 500,
        message: 'Internal server error.',
      });
      expect(logger.error).toHaveBeenCalledWith(
        'Unhandled error: name=Error errno=-13',
      );
    },
  );

  it('does not log an error that carries an HTTP status', () => {
    process.env.NODE_ENV = 'production';

    const response = respondTo(new HttpError(404, 'Not here'), logger);

    expect(response.status).toBe(404);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('does not log a malformed JSON body', () => {
    process.env.NODE_ENV = 'production';
    const error = Object.assign(new SyntaxError('Unexpected token'), {
      body: '{',
      status: 400,
    });

    const response = respondTo(error, logger);

    expect(response.status).toBe(400);
    expect(logger.error).not.toHaveBeenCalled();
  });
});
