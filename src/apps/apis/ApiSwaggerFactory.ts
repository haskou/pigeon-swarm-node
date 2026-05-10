import fs from 'fs';
import path from 'path';

type SwaggerSpec = string;

const swaggerFileByApi: Record<string, string> = {
  'conversations-api': 'conversations-api/swagger.yaml',
  'identities-api': 'identities-api/swagger.yaml',
  'ipfs-api': 'ipfs-api/swagger.yaml',
  'keychains-api': 'keychains-api/swagger.yaml',
  'nodes-api': 'nodes-api/swagger.yaml',
};

export class ApiSwaggerFactory {
  private readSwaggerFile(relativePath: string): SwaggerSpec {
    const filePath = path.resolve(process.cwd(), 'src/apps/apis', relativePath);

    return fs.readFileSync(filePath, 'utf-8');
  }

  public createByApi(): Record<string, SwaggerSpec> {
    return Object.fromEntries(
      Object.entries(swaggerFileByApi).map(([apiName, filePath]) => [
        apiName,
        this.readSwaggerFile(filePath),
      ]),
    );
  }

  public createAggregatedSpec(): SwaggerSpec {
    return this.readSwaggerFile('open-api.yaml');
  }

  public createRouteByApi(routePrefix: string = ''): Record<string, string> {
    return Object.fromEntries(
      Object.entries(swaggerFileByApi).map(([apiName, filePath]) => [
        apiName,
        `${routePrefix}/swagger/${filePath}`,
      ]),
    );
  }
}
