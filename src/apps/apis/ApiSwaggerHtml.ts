import { SwaggerRouteMap } from '../../shared/infrastructure/express/SwaggerRouteMap';

export class ApiSwaggerHtml {
  public build(routePrefix: string, swaggerRoutes: SwaggerRouteMap): string {
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
}
