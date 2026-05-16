import { ApiSwaggerFactory } from '@app/apps/apis/ApiSwaggerFactory';
import { DeleteCallParticipantRoute } from '@app/apps/apis/calls-api/routes/DeleteCallParticipantRoute';
import { DeleteCallRoute } from '@app/apps/apis/calls-api/routes/DeleteCallRoute';
import { GetCallHistoryRoute } from '@app/apps/apis/calls-api/routes/GetCallHistoryRoute';
import { GetCallIceServersRoute } from '@app/apps/apis/calls-api/routes/GetCallIceServersRoute';
import { GetCallRoute } from '@app/apps/apis/calls-api/routes/GetCallRoute';
import { GetCallsRoute } from '@app/apps/apis/calls-api/routes/GetCallsRoute';
import { PostCallParticipantRoute } from '@app/apps/apis/calls-api/routes/PostCallParticipantRoute';
import { PostCallRoute } from '@app/apps/apis/calls-api/routes/PostCallRoute';
import { PostCallSignalRoute } from '@app/apps/apis/calls-api/routes/PostCallSignalRoute';
import { CommunityMessageReactionRoute } from '@app/apps/apis/communities-api/routes/CommunityChannelMessageReactionRoute';
import { DeleteCommunityChannelMessageRoute } from '@app/apps/apis/communities-api/routes/DeleteCommunityChannelMessageRoute';
import { DeleteCommunityChannelRoute } from '@app/apps/apis/communities-api/routes/DeleteCommunityChannelRoute';
import { DeleteCommunityMemberRoute } from '@app/apps/apis/communities-api/routes/DeleteCommunityMemberRoute';
import { GetCommunitiesRoute } from '@app/apps/apis/communities-api/routes/GetCommunitiesRoute';
import { GetCommunityChannelMessagesRoute } from '@app/apps/apis/communities-api/routes/GetCommunityChannelMessagesRoute';
import { GetCommunityChannelsRoute } from '@app/apps/apis/communities-api/routes/GetCommunityChannelsRoute';
import { GetCommunityMembersRoute } from '@app/apps/apis/communities-api/routes/GetCommunityMembersRoute';
import { GetCommunityRoute } from '@app/apps/apis/communities-api/routes/GetCommunityRoute';
import { PatchCommunityChannelRoute } from '@app/apps/apis/communities-api/routes/PatchCommunityChannelRoute';
import { PatchCommunityRoute } from '@app/apps/apis/communities-api/routes/PatchCommunityRoute';
import { PostCommunityChannelMessageRoute } from '@app/apps/apis/communities-api/routes/PostCommunityChannelMessageRoute';
import { PostCommunityMemberRoute } from '@app/apps/apis/communities-api/routes/PostCommunityMemberRoute';
import { PostCommunityRoute } from '@app/apps/apis/communities-api/routes/PostCommunityRoute';
import { PostCommunityTextChannelRoute } from '@app/apps/apis/communities-api/routes/PostCommunityTextChannelRoute';
import { PostCommunityVoiceChannelRoute } from '@app/apps/apis/communities-api/routes/PostCommunityVoiceChannelRoute';
import { ConversationMessageReactionRoute } from '@app/apps/apis/conversations-api/routes/ConversationMessageReactionRoute';
import { DeleteConversationMessageRoute } from '@app/apps/apis/conversations-api/routes/DeleteConversationMessageRoute';
import { GetConversationMessagesRoute } from '@app/apps/apis/conversations-api/routes/GetConversationMessagesRoute';
import { GetConversationsRoute } from '@app/apps/apis/conversations-api/routes/GetConversationsRoute';
import { PostConversationMessageRoute } from '@app/apps/apis/conversations-api/routes/PostConversationMessageRoute';
import { PostConversationRoute } from '@app/apps/apis/conversations-api/routes/PostConversationRoute';
import { PutConversationMessagesReadUntilRoute } from '@app/apps/apis/conversations-api/routes/PutConversationMessagesReadUntilRoute';
import { GetIdentityRoute } from '@app/apps/apis/identities-api/routes/GetIdentityRoute';
import { PostIdentityRoute } from '@app/apps/apis/identities-api/routes/PostIdentityRoute';
import { PutIdentityRoute } from '@app/apps/apis/identities-api/routes/PutIdentityRoute';
import { GetIPFSContentRoute } from '@app/apps/apis/ipfs-api/routes/GetIPFSContentRoute';
import { PostPrivateIPFSContentRoute } from '@app/apps/apis/ipfs-api/routes/PostPrivateIPFSContentRoute';
import { PostPublicIPFSContentRoute } from '@app/apps/apis/ipfs-api/routes/PostPublicIPFSContentRoute';
import { GetKeychainRoute } from '@app/apps/apis/keychains-api/routes/GetKeychainRoute';
import { PostKeychainRoute } from '@app/apps/apis/keychains-api/routes/PostKeychainRoute';
import { GetNodeNetworksRoute } from '@app/apps/apis/nodes-api/routes/GetNodeNetworksRoute';
import { GetNodeRoute } from '@app/apps/apis/nodes-api/routes/GetNodeRoute';
import { GetPeersRoute } from '@app/apps/apis/nodes-api/routes/GetPeersRoute';
import { PostNodeNetworkRoute } from '@app/apps/apis/nodes-api/routes/PostNodeNetworkRoute';
import { PostNodeSyncRoute } from '@app/apps/apis/nodes-api/routes/PostNodeSyncRoute';
import { PutNodeOwnerRoute } from '@app/apps/apis/nodes-api/routes/PutNodeOwnerRoute';
import { GetNotificationsRoute } from '@app/apps/apis/notifications-api/routes/GetNotificationsRoute';
import { PatchNotificationRoute } from '@app/apps/apis/notifications-api/routes/PatchNotificationRoute';
import { PostNotificationRoute } from '@app/apps/apis/notifications-api/routes/PostNotificationRoute';
import * as express from 'express';
import * as shttp from 'http';
import { createExpressServer } from 'routing-controllers';

import { ServerNotRunningError } from '../errors/ServerNotRunningError';
import ConsumeDlxRoute from '../ui/routes/ConsumeDlxRoute';
import HealthRoute from '../ui/routes/HealthRoute';
import { WebSocketRealtimeServer } from '../websocket/WebSocketRealtimeServer';
import { HttpErrorHandler } from './HttpErrorHandler';
import { PublicStaticContent } from './PublicStaticContent';
import { RoutePrefix } from './RoutePrefix';

type HttpApp = express.Application;
type HttpServer = shttp.Server;
type SwaggerRouteMap = Record<string, string>;

export default class Server {
  private _app: HttpApp | undefined;
  private _server: HttpServer | undefined;
  private readonly webSocketRealtimeServer = new WebSocketRealtimeServer();

  private buildSwaggerHtml(
    routePrefix: string,
    swaggerRoutes: SwaggerRouteMap,
  ): string {
    const swaggerUrls = [
      {
        name: 'all-apis',
        url: `${routePrefix}/swagger/open-api.yaml`,
      },
      ...Object.entries(swaggerRoutes).map(([apiName, url]) => ({
        name: apiName,
        url,
      })),
    ];

    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Pigeon-swarm Swagger</title>
    <link
      rel="stylesheet"
      href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css"
    />
    <style>
      body {
        margin: 0;
        background: #f5f7fb;
      }

      .topbar {
        display: none;
      }

      .swagger-ui .information-container {
        padding-bottom: 0;
      }
    </style>
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-standalone-preset.js"></script>
    <script>
      window.ui = SwaggerUIBundle({
        dom_id: '#swagger-ui',
        layout: 'StandaloneLayout',
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset,
        ],
        urls: ${JSON.stringify(swaggerUrls)},
        "urls.primaryName": 'all-apis',
        docExpansion: 'list',
        deepLinking: true,
        displayRequestDuration: true,
        tryItOutEnabled: false,
      });
    </script>
  </body>
</html>`;
  }

  public get app(): HttpApp {
    if (!this._app) {
      throw new ServerNotRunningError();
    }

    return this._app;
  }

  public get server(): HttpServer {
    if (!this._server) {
      throw new ServerNotRunningError();
    }

    return this._server;
  }

  public run(): Promise<void> {
    return new Promise((resolve) => {
      const routePrefix = RoutePrefix.fromEnvironment(process.env.ROUTE_PREFIX);
      const routePrefixValue = routePrefix.toString();
      const swaggerFactory = new ApiSwaggerFactory();
      const swaggerByApi = swaggerFactory.createByApi();
      const aggregatedSwagger = swaggerFactory.createAggregatedSpec();
      const swaggerRoutes = swaggerFactory.createRouteByApi(routePrefixValue);
      const swaggerHtml = this.buildSwaggerHtml(
        routePrefixValue,
        swaggerRoutes,
      );

      this._app = createExpressServer({
        controllers: [
          HealthRoute,
          ConsumeDlxRoute,
          GetCallsRoute,
          GetCallHistoryRoute,
          GetCallIceServersRoute,
          GetCallRoute,
          PostCallRoute,
          PostCallParticipantRoute,
          DeleteCallParticipantRoute,
          DeleteCallRoute,
          PostCallSignalRoute,
          GetIdentityRoute,
          PostIdentityRoute,
          PutIdentityRoute,
          GetKeychainRoute,
          PostKeychainRoute,
          PostConversationRoute,
          GetConversationsRoute,
          PostConversationMessageRoute,
          ConversationMessageReactionRoute,
          DeleteConversationMessageRoute,
          PutConversationMessagesReadUntilRoute,
          GetConversationMessagesRoute,
          GetIPFSContentRoute,
          PostPrivateIPFSContentRoute,
          PostPublicIPFSContentRoute,
          GetNodeRoute,
          GetNodeNetworksRoute,
          PostNodeNetworkRoute,
          PostNodeSyncRoute,
          PutNodeOwnerRoute,
          GetPeersRoute,
          GetNotificationsRoute,
          PostNotificationRoute,
          PatchNotificationRoute,
          GetCommunitiesRoute,
          PostCommunityRoute,
          GetCommunityRoute,
          PatchCommunityRoute,
          GetCommunityMembersRoute,
          PostCommunityMemberRoute,
          DeleteCommunityMemberRoute,
          GetCommunityChannelsRoute,
          PostCommunityTextChannelRoute,
          PostCommunityVoiceChannelRoute,
          PatchCommunityChannelRoute,
          DeleteCommunityChannelRoute,
          GetCommunityChannelMessagesRoute,
          PostCommunityChannelMessageRoute,
          CommunityMessageReactionRoute,
          DeleteCommunityChannelMessageRoute,
        ],
        cors: true,
        defaultErrorHandler: false,
        middlewares: [HttpErrorHandler],
        routePrefix: routePrefixValue,
      });

      this.app.get(
        `${routePrefixValue}/swagger/open-api.yaml`,
        (_request, response) => {
          return response.type('application/yaml').send(aggregatedSwagger);
        },
      );

      this.app.get(`${routePrefixValue}/swagger`, (_request, response) => {
        return response.type('text/html').send(swaggerHtml);
      });

      for (const [apiName, swaggerSpec] of Object.entries(swaggerByApi)) {
        this.app.get(swaggerRoutes[apiName], (_request, response) => {
          return response.type('application/yaml').send(swaggerSpec);
        });
      }

      new PublicStaticContent(routePrefix).register(this.app);

      this._server = this.app.listen(process.env.API_PORT || 8080, () => {
        resolve();
      });
      this.webSocketRealtimeServer.attach(
        this._server,
        `${routePrefixValue}/ws`,
      );
    });
  }
}
