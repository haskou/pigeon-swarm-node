import { SwaggerSpec } from './SwaggerSpec';

export type ApiSwaggerSpecs = {
  createAggregatedSpec(): SwaggerSpec;
  createByApi(): Record<string, SwaggerSpec>;
  createRouteByApi(routePrefix: string): Record<string, string>;
};
