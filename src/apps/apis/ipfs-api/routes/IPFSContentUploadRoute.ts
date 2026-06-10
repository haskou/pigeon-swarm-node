import SignedHttpRequestAuthenticator from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import IPFSContentPublisher from '@app/contexts/ipfs-replication/application/publish-content/IPFSContentPublisher';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import Route from '@app/shared/infrastructure/ui/routes/Route';
import { Request } from 'express';

export abstract class IPFSContentUploadRoute extends Route {
  private readonly signedRequestAuthenticator =
    this.get<SignedHttpRequestAuthenticator>(SignedHttpRequestAuthenticator);

  private readonly contentPublisher =
    this.get<IPFSContentPublisher>(IPFSContentPublisher);

  protected async authenticate(request: Request): Promise<IdentityId> {
    return this.signedRequestAuthenticator.authenticate(request);
  }

  protected bodyFrom(request: Request): Buffer {
    return Buffer.isBuffer(request.body) ? request.body : Buffer.from([]);
  }

  protected publisher(): IPFSContentPublisher {
    return this.contentPublisher;
  }
}
