import { HttpApp } from '@haskou/ddd-kernel/adapters/ui';

import { ApiSwaggerFactory } from './ApiSwaggerFactory';
import { ApiSwaggerHtml } from './ApiSwaggerHtml';
import { ApiSwaggerHtmlBuilder } from './ApiSwaggerHtmlBuilder';
import { ApiSwaggerSpecs } from './ApiSwaggerSpecs';

export class ApiSwaggerRegistrar {
  constructor(
    private readonly swaggerFactory: ApiSwaggerSpecs = new ApiSwaggerFactory(),
    private readonly swaggerHtml: ApiSwaggerHtmlBuilder = new ApiSwaggerHtml(),
  ) {}

  public register(app: HttpApp, routePrefix: string): void {
    const swaggerByApi = this.swaggerFactory.createByApi();
    const aggregatedSwagger = this.swaggerFactory.createAggregatedSpec();
    const swaggerRoutes = this.swaggerFactory.createRouteByApi(routePrefix);
    const swaggerHtml = this.swaggerHtml.build(routePrefix, swaggerRoutes);

    app.get(`${routePrefix}/swagger/open-api.yaml`, (_request, response) => {
      return response.type('application/yaml').send(aggregatedSwagger);
    });

    app.get(`${routePrefix}/swagger`, (_request, response) => {
      return response.type('text/html').send(swaggerHtml);
    });

    for (const [apiName, swaggerSpec] of Object.entries(swaggerByApi)) {
      app.get(swaggerRoutes[apiName], (_request, response) => {
        return response.type('application/yaml').send(swaggerSpec);
      });
    }
  }
}
