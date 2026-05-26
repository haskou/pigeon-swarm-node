import { SignedHttpRequestAuthenticator } from '@app/apps/apis/shared/SignedHttpRequestAuthenticator';
import NodeLoader from '@app/contexts/nodes/application/load/NodeLoader';
import { NodeNetworkRemoverMessage } from '@app/contexts/nodes/application/remove-network/messages/NodeNetworkRemoverMessage';
import NodeNetworkRemover from '@app/contexts/nodes/application/remove-network/NodeNetworkRemover';
import NodeLoaderService from '@app/contexts/nodes/domain/services/NodeLoaderService';
import NodeSaverService from '@app/contexts/nodes/domain/services/NodeSaverService';
import { MongoNodeNetworkDataCleaner } from '@app/contexts/nodes/infrastructure/mongo/MongoNodeNetworkDataCleaner';
import IPFSNetworkRegistry from '@app/contexts/shared/infrastructure/ipfs/networks/IPFSNetworkRegistry';
import DomainEventPublisher from '@app/shared/domain/events/DomainEventPublisher';
import MessageBus from '@app/shared/infrastructure/messageBus/MessageBus';
import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';
import { HttpRouteStatusEnum } from '@app/shared/infrastructure/ui/routes/HttpRouteStatusEnum';
import Route from '@app/shared/infrastructure/ui/routes/Route';
import { Request, Response } from 'express';
import { Delete, JsonController, Param, Req, Res } from 'routing-controllers';

import { AuthenticatedIdentityIsNotNodeOwnerError } from '../errors/AuthenticatedIdentityIsNotNodeOwnerError';
import { NetworksViewModel } from '../view-model/NetworksViewModel';

@JsonController('/node/networks')
export class DeleteNodeNetworkRoute extends Route {
  private readonly loader: NodeLoader = this.get<NodeLoader>(NodeLoader);

  private readonly remover = new NodeNetworkRemover(
    this.get<NodeLoaderService>(NodeLoaderService),
    this.get<NodeSaverService>(NodeSaverService),
    new MongoNodeNetworkDataCleaner(
      this.get<MongoDB>(MongoDB),
      this.get<IPFSNetworkRegistry>(IPFSNetworkRegistry),
    ),
    this.get<MessageBus>(MessageBus) as DomainEventPublisher,
  );

  private readonly signedRequestAuthenticator =
    this.get<SignedHttpRequestAuthenticator>(SignedHttpRequestAuthenticator);

  private async assertCanManageNetworks(request: Request): Promise<void> {
    const node = await this.loader.loadNode();

    if (!node.hasOwner()) {
      return;
    }

    const authenticatedIdentityId =
      await this.signedRequestAuthenticator.authenticate(request);

    if (!node.isOwnedBy(authenticatedIdentityId)) {
      throw new AuthenticatedIdentityIsNotNodeOwnerError();
    }
  }

  @Delete('/:networkId')
  public async deleteNetwork(
    @Param('networkId') networkId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<Response> {
    await this.assertCanManageNetworks(request);
    await this.remover.remove(new NodeNetworkRemoverMessage(networkId));

    const node = await this.loader.loadNode();

    return response
      .status(HttpRouteStatusEnum.OK)
      .send(new NetworksViewModel(node).toResource());
  }
}
