export type ApiSwaggerHtmlBuilder = {
  build(routePrefix: string, swaggerRoutes: Record<string, string>): string;
};
