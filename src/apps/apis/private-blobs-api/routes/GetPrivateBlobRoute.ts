import PrivateBlobReader from '@app/contexts/private-blobs/application/PrivateBlobReader';
import { PrivateBlobRangeNotSatisfiableError } from '@app/contexts/private-blobs/domain/errors/PrivateBlobRangeNotSatisfiableError';
import { Request, Response } from 'express';
import { Get, JsonController, Param, Req, Res } from 'routing-controllers';
import { pipeline } from 'stream/promises';

import { PrivateBlobRouteSupport } from './PrivateBlobRouteSupport';

@JsonController('/private-blobs')
export class GetPrivateBlobRoute extends PrivateBlobRouteSupport {
  private readonly reader = this.get<PrivateBlobReader>(PrivateBlobReader);

  @Get('/:blobId')
  public async request(
    @Param('blobId') blobId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    try {
      const download = await this.reader.open(
        blobId,
        this.bearerToken(request),
        request.header('range'),
      );
      const { range, size, stream } = download;
      const length = range ? range.end - range.start + 1 : size;

      response
        .status(range ? 206 : 200)
        .setHeader('Accept-Ranges', 'bytes')
        .setHeader('Cache-Control', 'no-store')
        .setHeader('Content-Length', length)
        .setHeader('Content-Type', 'application/octet-stream')
        .setHeader('Referrer-Policy', 'no-referrer')
        .setHeader('X-Content-Type-Options', 'nosniff');

      if (range) {
        response.setHeader(
          'Content-Range',
          `bytes ${range.start}-${range.end}/${size}`,
        );
      }

      await pipeline(stream, response);

      return response;
    } catch (error: unknown) {
      if (error instanceof PrivateBlobRangeNotSatisfiableError) {
        return response
          .status(416)
          .setHeader('Content-Range', `bytes */${error.size}`)
          .send();
      }

      return this.translate(error);
    }
  }
}
