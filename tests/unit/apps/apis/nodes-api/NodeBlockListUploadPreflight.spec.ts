import { AuthenticatedIdentityIsNotNodeOwnerError } from '@app/apps/apis/nodes-api/errors/AuthenticatedIdentityIsNotNodeOwnerError';
import { NodeBlockListUploadInProgressError } from '@app/apps/apis/nodes-api/errors/NodeBlockListUploadInProgressError';
import { NodeBlockListUploadPreflight } from '@app/apps/apis/nodes-api/middlewares/NodeBlockListUploadPreflight';
import { InvalidSignedRequestError } from '@app/apps/apis/shared/errors/InvalidSignedRequestError';
import { SignedRequestBodyIsTooLargeError } from '@app/apps/apis/shared/errors/SignedRequestBodyIsTooLargeError';
import { SignedRequestBodyReadTimeoutError } from '@app/apps/apis/shared/errors/SignedRequestBodyReadTimeoutError';
import SignedHttpRequestAuthenticator from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import NodeLoader from '@app/contexts/nodes/application/load/NodeLoader';
import { Node } from '@app/contexts/nodes/domain/Node';
import NodeBlockPolicy from '@app/contexts/nodes/domain/services/NodeBlockPolicy';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Kernel } from '@haskou/ddd-kernel';
import {
  KeyPair,
  SignedHttpRequestSignature,
} from '@haskou/pigeon-swarm-crypto';
import { createHash } from 'crypto';
import { EventEmitter } from 'events';
import { Request, Response } from 'express';
import { mock, MockProxy } from 'jest-mock-extended';
import { PassThrough } from 'stream';
import { setImmediate } from 'timers/promises';

type UploadRequest = Request & PassThrough;

const PATH = '/node/blocks/';
const MAX_BYTES = 1024;

const hashOf = (bytes: Buffer): string =>
  createHash('sha256').update(bytes).digest('hex');

const identityOf = (keyPair: KeyPair): IdentityId =>
  new IdentityId(keyPair.toPrimitives().publicKey);

const jsonBytes = (value: unknown): Buffer =>
  Buffer.from(JSON.stringify(value));

const responses: EventEmitter[] = [];

const response = (): Response & EventEmitter => {
  const created = new EventEmitter();
  responses.push(created);

  return created as unknown as Response & EventEmitter;
};

const nextCall = (): {
  next: jest.Mock;
  settled: Promise<unknown>;
} => {
  const { promise, resolve } = Promise.withResolvers<unknown>();

  return { next: jest.fn(resolve), settled: promise };
};

describe('NodeBlockListUploadPreflight', () => {
  let owner: KeyPair;
  let stranger: KeyPair;
  let nodeLoader: MockProxy<NodeLoader>;
  let previousMaxBytes: string | undefined;

  const signedUpload = ({
    body = jsonBytes({ type: 'pigeon-node-block-list' }),
    declaredBody = body,
    identityId,
    sendsLength = true,
    signer,
    stalls = false,
  }: {
    body?: Buffer;
    declaredBody?: Buffer;
    identityId?: IdentityId;
    sendsLength?: boolean;
    signer: KeyPair;
    stalls?: boolean;
  }): UploadRequest => {
    const timestamp = String(Date.now());
    const bodyHash = hashOf(declaredBody);
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-body-hash': bodyHash,
      'x-identity-id': (identityId ?? identityOf(signer)).valueOf(),
      'x-signature': signer
        .sign(
          SignedHttpRequestSignature.signingContent({
            body: bodyHash,
            method: 'PUT',
            path: PATH,
            timestamp: Number(timestamp),
          }),
        )
        .valueOf(),
      'x-timestamp': timestamp,
    };

    if (sendsLength) {
      headers['content-length'] = String(body.length);
    }

    const stream = new PassThrough();

    if (stalls) {
      // Sends one byte, then nothing: a client that never finishes the body.
      stream.write(body.subarray(0, 1));
    } else {
      stream.end(body);
    }

    return Object.assign(stream, {
      header: (name: string) => headers[name.toLowerCase()],
      headers,
      method: 'PUT',
      path: PATH,
    }) as unknown as UploadRequest;
  };

  const expectNoBodyByteRead = (request: UploadRequest, body: Buffer): void => {
    expect(request.readableFlowing).toBeNull();
    expect(request.listenerCount('data')).toBe(0);
    expect(request.readableLength).toBe(body.length);
    expect(request.body).toBeUndefined();
  };

  beforeAll(async () => {
    owner = await KeyPair.generate();
    stranger = await KeyPair.generate();
  });

  beforeEach(() => {
    previousMaxBytes = process.env.NODE_BLOCK_LIST_MAX_BYTES;
    process.env.NODE_BLOCK_LIST_MAX_BYTES = String(MAX_BYTES);

    const blockPolicy = mock<NodeBlockPolicy>();
    blockPolicy.isIdentityBlocked.mockResolvedValue(false);
    const node = mock<Node>();
    node.isOwnedBy.mockImplementation((identityId) =>
      identityId.isEqual(identityOf(owner)),
    );
    nodeLoader = mock<NodeLoader>();
    nodeLoader.loadNode.mockResolvedValue(node);

    const services = new Map<unknown, unknown>([
      [NodeLoader, nodeLoader],
      [
        SignedHttpRequestAuthenticator,
        new SignedHttpRequestAuthenticator(blockPolicy),
      ],
    ]);
    new Kernel({
      di: { getService: (service: unknown) => services.get(service) } as never,
    });
  });

  afterEach(() => {
    responses.splice(0).forEach((created) => created.emit('close'));
    delete process.env.NODE_BLOCK_LIST_BODY_TIMEOUT_MS;

    if (previousMaxBytes === undefined) {
      delete process.env.NODE_BLOCK_LIST_MAX_BYTES;
    } else {
      process.env.NODE_BLOCK_LIST_MAX_BYTES = previousMaxBytes;
    }
  });

  it('should refuse a forged owner id with a bad signature before reading any body byte', async () => {
    const body = Buffer.alloc(MAX_BYTES * 2, 'x');
    const request = signedUpload({
      body,
      identityId: identityOf(owner),
      signer: stranger,
    });
    const { next, settled } = nextCall();

    new NodeBlockListUploadPreflight().use(request, response(), next);

    expect(await settled).toBeInstanceOf(InvalidSignedRequestError);
    expectNoBodyByteRead(request, body);
    expect(nodeLoader.loadNode).not.toHaveBeenCalled();
  });

  it('should refuse a signed non-owner before reading any body byte', async () => {
    const body = Buffer.alloc(MAX_BYTES * 2, 'x');
    const request = signedUpload({ body, signer: stranger });
    const { next, settled } = nextCall();

    new NodeBlockListUploadPreflight().use(request, response(), next);

    expect(await settled).toBeInstanceOf(
      AuthenticatedIdentityIsNotNodeOwnerError,
    );
    expectNoBodyByteRead(request, body);
  });

  it('should refuse a declared oversize body before reading any body byte', async () => {
    const body = Buffer.alloc(MAX_BYTES + 1, 'x');
    const request = signedUpload({ body, signer: owner });
    const { next, settled } = nextCall();

    new NodeBlockListUploadPreflight().use(request, response(), next);

    expect(await settled).toBeInstanceOf(SignedRequestBodyIsTooLargeError);
    expectNoBodyByteRead(request, body);
  });

  it('should abort a streamed oversize body before parsing it', async () => {
    const request = signedUpload({
      body: Buffer.alloc(MAX_BYTES + 1, '{'),
      sendsLength: false,
      signer: owner,
    });
    const { next, settled } = nextCall();

    new NodeBlockListUploadPreflight().use(request, response(), next);

    expect(await settled).toBeInstanceOf(SignedRequestBodyIsTooLargeError);
    expect(request.body).toBeUndefined();
  });

  it('should refuse a body that does not match the signed hash before parsing it', async () => {
    const request = signedUpload({
      body: Buffer.from('{not json'),
      declaredBody: jsonBytes({ type: 'pigeon-node-block-list' }),
      signer: owner,
    });
    const { next, settled } = nextCall();

    new NodeBlockListUploadPreflight().use(request, response(), next);

    expect(await settled).toBeInstanceOf(InvalidSignedRequestError);
    expect(request.body).toBeUndefined();
  });

  it('should refuse a replayed upload', async () => {
    const preflight = new NodeBlockListUploadPreflight();
    const request = signedUpload({ signer: owner });
    const first = response();
    const accepted = nextCall();

    preflight.use(request, first, accepted.next);
    expect(await accepted.settled).toBeUndefined();
    first.emit('close');

    const replayed = Object.assign(new PassThrough(), {
      header: request.header,
      method: 'PUT',
      path: PATH,
    }) as unknown as UploadRequest;
    const refused = nextCall();
    preflight.use(replayed, response(), refused.next);

    expect(await refused.settled).toBeInstanceOf(InvalidSignedRequestError);
  });

  it('should hand the parsed body to the route without any parser flag', async () => {
    const document = { type: 'pigeon-node-block-list', version: 1 };
    const request = signedUpload({ body: jsonBytes(document), signer: owner });
    const upload = response();
    const { next, settled } = nextCall();

    new NodeBlockListUploadPreflight().use(request, upload, next);

    expect(await settled).toBeUndefined();
    expect(request.body).toEqual(document);
    expect(request).not.toHaveProperty('_body');
    upload.emit('close');
  });

  it('should refuse a second upload while one is in flight', async () => {
    const preflight = new NodeBlockListUploadPreflight();
    const first = signedUpload({ signer: owner });
    const firstResponse = response();
    const accepted = nextCall();

    preflight.use(first, firstResponse, accepted.next);
    await accepted.settled;

    const refused = nextCall();
    preflight.use(signedUpload({ signer: owner }), response(), refused.next);

    expect(await refused.settled).toBeInstanceOf(
      NodeBlockListUploadInProgressError,
    );
    firstResponse.emit('close');
  });

  it('should accept the next upload once the previous response closes', async () => {
    const preflight = new NodeBlockListUploadPreflight();
    const firstResponse = response();
    const first = nextCall();

    preflight.use(signedUpload({ signer: owner }), firstResponse, first.next);
    await first.settled;
    firstResponse.emit('close');

    const secondResponse = response();
    const second = nextCall();
    preflight.use(signedUpload({ signer: owner }), secondResponse, second.next);

    expect(await second.settled).toBeUndefined();
    secondResponse.emit('close');
  });

  it('should time out a slow upload and free the slot before its response closes', async () => {
    process.env.NODE_BLOCK_LIST_BODY_TIMEOUT_MS = '20';
    const preflight = new NodeBlockListUploadPreflight();
    const stalled = signedUpload({ signer: owner, stalls: true });
    const timedOut = nextCall();

    preflight.use(stalled, response(), timedOut.next);

    expect(await timedOut.settled).toBeInstanceOf(
      SignedRequestBodyReadTimeoutError,
    );
    expect(stalled.body).toBeUndefined();

    const next = nextCall();
    preflight.use(signedUpload({ signer: owner }), response(), next.next);

    expect(await next.settled).toBeUndefined();
  });

  it('should free the slot when the client aborts the upload', async () => {
    const preflight = new NodeBlockListUploadPreflight();
    const aborted = signedUpload({ signer: owner, stalls: true });
    const refused = nextCall();

    preflight.use(aborted, response(), refused.next);
    await setImmediate();
    aborted.destroy();

    expect(await refused.settled).toBeInstanceOf(InvalidSignedRequestError);

    const next = nextCall();
    preflight.use(signedUpload({ signer: owner }), response(), next.next);

    expect(await next.settled).toBeUndefined();
  });
});
