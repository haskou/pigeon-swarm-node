import { AuthenticatedIdentityIsNotNodeOwnerError } from '@app/apps/apis/nodes-api/errors/AuthenticatedIdentityIsNotNodeOwnerError';
import { NodeBlockListUploadInProgressError } from '@app/apps/apis/nodes-api/errors/NodeBlockListUploadInProgressError';
import { NodeBlockListUploadPreflight } from '@app/apps/apis/nodes-api/NodeBlockListUploadPreflight';
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
const UPLOADED = { type: 'pigeon-node-block-list' };

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

// The parsed body on success, the thrown error otherwise.
const outcome = async (
  preflight: NodeBlockListUploadPreflight,
  request: UploadRequest,
  upload: Response,
): Promise<unknown> => {
  try {
    return await preflight.read(request, upload);
  } catch (error: unknown) {
    return error;
  }
};

describe('NodeBlockListUploadPreflight', () => {
  let owner: KeyPair;
  let stranger: KeyPair;
  let nodeLoader: MockProxy<NodeLoader>;
  let previousMaxBytes: string | undefined;

  const signedUpload = ({
    body = jsonBytes(UPLOADED),
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
    expect(
      await outcome(new NodeBlockListUploadPreflight(), request, response()),
    ).toBeInstanceOf(InvalidSignedRequestError);
    expectNoBodyByteRead(request, body);
    expect(nodeLoader.loadNode).not.toHaveBeenCalled();
  });

  it('should refuse a signed non-owner before reading any body byte', async () => {
    const body = Buffer.alloc(MAX_BYTES * 2, 'x');
    const request = signedUpload({ body, signer: stranger });
    expect(
      await outcome(new NodeBlockListUploadPreflight(), request, response()),
    ).toBeInstanceOf(AuthenticatedIdentityIsNotNodeOwnerError);
    expectNoBodyByteRead(request, body);
  });

  it('should refuse a declared oversize body before reading any body byte', async () => {
    const body = Buffer.alloc(MAX_BYTES + 1, 'x');
    const request = signedUpload({ body, signer: owner });
    expect(
      await outcome(new NodeBlockListUploadPreflight(), request, response()),
    ).toBeInstanceOf(SignedRequestBodyIsTooLargeError);
    expectNoBodyByteRead(request, body);
  });

  it('should abort a streamed oversize body before parsing it', async () => {
    const request = signedUpload({
      body: Buffer.alloc(MAX_BYTES + 1, '{'),
      sendsLength: false,
      signer: owner,
    });
    expect(
      await outcome(new NodeBlockListUploadPreflight(), request, response()),
    ).toBeInstanceOf(SignedRequestBodyIsTooLargeError);
  });

  it('should refuse a body that does not match the signed hash before parsing it', async () => {
    const request = signedUpload({
      body: Buffer.from('{not json'),
      declaredBody: jsonBytes({ type: 'pigeon-node-block-list' }),
      signer: owner,
    });
    expect(
      await outcome(new NodeBlockListUploadPreflight(), request, response()),
    ).toBeInstanceOf(InvalidSignedRequestError);
  });

  it('should refuse a replayed upload', async () => {
    const preflight = new NodeBlockListUploadPreflight();
    const request = signedUpload({ signer: owner });
    const first = response();
    expect(await outcome(preflight, request, first)).toEqual(UPLOADED);
    first.emit('close');

    const replayed = Object.assign(new PassThrough(), {
      header: request.header,
      method: 'PUT',
      path: PATH,
    }) as unknown as UploadRequest;
    expect(await outcome(preflight, replayed, response())).toBeInstanceOf(
      InvalidSignedRequestError,
    );
  });

  it('should hand the parsed body to the route without any parser flag', async () => {
    const document = { type: 'pigeon-node-block-list', version: 1 };
    const request = signedUpload({ body: jsonBytes(document), signer: owner });
    const upload = response();
    expect(
      await outcome(new NodeBlockListUploadPreflight(), request, upload),
    ).toEqual(document);
    expect(request).not.toHaveProperty('_body');
    upload.emit('close');
  });

  it('should refuse a second upload while one is in flight', async () => {
    const preflight = new NodeBlockListUploadPreflight();
    const first = signedUpload({ signer: owner });
    const firstResponse = response();

    expect(await outcome(preflight, first, firstResponse)).toEqual(UPLOADED);

    expect(
      await outcome(preflight, signedUpload({ signer: owner }), response()),
    ).toBeInstanceOf(NodeBlockListUploadInProgressError);
    firstResponse.emit('close');
  });

  it('should accept the next upload once the previous response closes', async () => {
    const preflight = new NodeBlockListUploadPreflight();
    const firstResponse = response();

    expect(
      await outcome(preflight, signedUpload({ signer: owner }), firstResponse),
    ).toEqual(UPLOADED);
    firstResponse.emit('close');

    const secondResponse = response();
    expect(
      await outcome(preflight, signedUpload({ signer: owner }), secondResponse),
    ).toEqual(UPLOADED);
    secondResponse.emit('close');
  });

  it('should time out a slow upload and free the slot before its response closes', async () => {
    process.env.NODE_BLOCK_LIST_BODY_TIMEOUT_MS = '20';
    const preflight = new NodeBlockListUploadPreflight();
    const stalled = signedUpload({ signer: owner, stalls: true });
    expect(await outcome(preflight, stalled, response())).toBeInstanceOf(
      SignedRequestBodyReadTimeoutError,
    );

    expect(
      await outcome(preflight, signedUpload({ signer: owner }), response()),
    ).toEqual(UPLOADED);
  });

  it('should free the slot when the client aborts the upload', async () => {
    const preflight = new NodeBlockListUploadPreflight();
    const aborted = signedUpload({ signer: owner, stalls: true });
    const refused = outcome(preflight, aborted, response());

    await setImmediate();
    aborted.destroy();

    expect(await refused).toBeInstanceOf(InvalidSignedRequestError);

    expect(
      await outcome(preflight, signedUpload({ signer: owner }), response()),
    ).toEqual(UPLOADED);
  });
});
