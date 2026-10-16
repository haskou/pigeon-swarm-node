import { LookupAddress } from 'dns';
import http from 'http';
import https from 'https';

import { PublicHttpFetchError } from './PublicHttpFetchError';
import { PublicHttpGetOptions } from './PublicHttpGetOptions';
import { PublicHttpResponse } from './PublicHttpResponse';
import { PublicHttpResponseTooLargeError } from './PublicHttpResponseTooLargeError';
import PublicUrlGuard from './PublicUrlGuard';
import { ResolvedPublicAddress } from './ResolvedPublicAddress';
import { ResolvedPublicUrl } from './ResolvedPublicUrl';

/**
 * One GET to a public URL. The host is resolved and every address is checked
 * by the guard; the connection goes to those checked addresses only, trying
 * each in turn. Redirects are returned,
 * never followed. The whole exchange has one deadline, and the body is
 * streamed and abandoned as soon as it passes `maxBytes`, so a hostile server
 * can neither hold the caller nor make it buffer more than the limit.
 */
export default class PublicHttpGetter {
  constructor(private readonly guard: PublicUrlGuard) {}

  private client(url: URL): typeof http | typeof https {
    return url.protocol === 'https:' ? https : http;
  }

  private redirectLocation(
    response: http.IncomingMessage,
    url: URL,
  ): URL | undefined {
    const statusCode = response.statusCode ?? 0;

    if (statusCode < 300 || statusCode >= 400 || !response.headers.location) {
      return undefined;
    }

    try {
      return new URL(response.headers.location, url);
    } catch {
      throw new PublicHttpFetchError('Redirect location is not valid.');
    }
  }

  private assertContentType(
    response: http.IncomingMessage,
    options: PublicHttpGetOptions,
  ): void {
    const contentType = response.headers['content-type'];

    if (
      typeof contentType === 'string' &&
      !contentType.toLowerCase().includes(options.expectedContentType)
    ) {
      throw new PublicHttpFetchError('Unexpected content type.');
    }
  }

  private assertDeclaredLength(
    response: http.IncomingMessage,
    maxBytes: number,
  ): void {
    const declared = Number(response.headers['content-length']);

    if (Number.isFinite(declared) && declared > maxBytes) {
      throw new PublicHttpResponseTooLargeError();
    }
  }

  private readBody(
    response: http.IncomingMessage,
    maxBytes: number,
  ): Promise<Buffer> {
    const { promise, reject, resolve } = Promise.withResolvers<Buffer>();
    const chunks: Buffer[] = [];
    let size = 0;

    response.on('data', (chunk: Buffer) => {
      size += chunk.length;

      if (size > maxBytes) {
        response.destroy();
        reject(new PublicHttpResponseTooLargeError());

        return;
      }

      chunks.push(chunk);
    });
    response.on('end', () => resolve(Buffer.concat(chunks)));
    response.on('error', () =>
      reject(new PublicHttpFetchError('Response could not be read.')),
    );

    return promise;
  }

  private request(
    url: URL,
    target: ResolvedPublicAddress,
    options: PublicHttpGetOptions,
    signal: AbortSignal,
  ): Promise<http.IncomingMessage> {
    const { promise, reject, resolve } =
      Promise.withResolvers<http.IncomingMessage>();
    const request = this.client(url).request(
      url,
      {
        /** A pooled socket is keyed by host, not by the checked address it reached. */
        agent: false,
        headers: {
          accept: options.accept,
          'accept-encoding': 'identity',
          'user-agent': options.userAgent,
        },
        lookup: (_hostname, lookupOptions, callback) => {
          if (typeof lookupOptions === 'object' && lookupOptions.all) {
            callback(null, [target as LookupAddress]);

            return;
          }

          callback(null, target.address, target.family);
        },
        method: 'GET',
        signal,
      },
      resolve,
    );

    request.on('error', () =>
      reject(new PublicHttpFetchError('Could not fetch URL.')),
    );
    request.end();

    return promise;
  }

  /**
   * Connects to each checked address in resolver order and keeps the first
   * that answers, so one unreachable address family does not fail the fetch.
   */
  private async firstAnswer(
    resolved: ResolvedPublicUrl,
    options: PublicHttpGetOptions,
    signal: AbortSignal,
  ): Promise<http.IncomingMessage> {
    for (const target of resolved.addresses) {
      signal.throwIfAborted();

      try {
        return await this.request(resolved.url, target, options, signal);
      } catch (error) {
        if (!(error instanceof PublicHttpFetchError)) {
          throw error;
        }
      }
    }

    throw new PublicHttpFetchError('Could not fetch URL.');
  }

  private async exchange(
    url: URL,
    options: PublicHttpGetOptions,
    signal: AbortSignal,
  ): Promise<PublicHttpResponse> {
    const resolved = await this.guard.resolve(url);

    signal.throwIfAborted();

    const response = await this.firstAnswer(resolved, options, signal);
    const statusCode = response.statusCode ?? 0;

    if (statusCode < 200 || statusCode >= 300) {
      const redirectLocation = this.redirectLocation(response, url);

      response.destroy();

      return {
        body: Buffer.alloc(0),
        headers: response.headers,
        redirectLocation,
        statusCode,
      };
    }

    try {
      this.assertContentType(response, options);
      this.assertDeclaredLength(response, options.maxBytes);
    } catch (error) {
      response.destroy();
      throw error;
    }

    return {
      body: await this.readBody(response, options.maxBytes),
      headers: response.headers,
      redirectLocation: undefined,
      statusCode,
    };
  }

  /** Throws `UrlIsNotPublicError`, `PublicHttpResponseTooLargeError` or `PublicHttpFetchError`. */
  public async get(
    url: URL,
    options: PublicHttpGetOptions,
  ): Promise<PublicHttpResponse> {
    const controller = new AbortController();
    const deadline = Promise.withResolvers<never>();
    const timer = setTimeout(() => {
      controller.abort();
      deadline.reject(new PublicHttpFetchError('Request timed out.'));
    }, options.timeoutMs);

    try {
      return await Promise.race([
        this.exchange(url, options, controller.signal),
        deadline.promise,
      ]);
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
  }
}
