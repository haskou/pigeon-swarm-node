import fs from 'fs';
import path from 'path';

type SwaggerSpec = string;

const swaggerFileByApi: Record<string, string> = {
  'calls-api': 'calls-api/swagger.yaml',
  'communities-api': 'communities-api/swagger.yaml',
  'conversations-api': 'conversations-api/swagger.yaml',
  'identities-api': 'identities-api/swagger.yaml',
  'ipfs-api': 'ipfs-api/swagger.yaml',
  'keychains-api': 'keychains-api/swagger.yaml',
  'link-previews-api': 'link-previews-api/swagger.yaml',
  'nodes-api': 'nodes-api/swagger.yaml',
  'notifications-api': 'notifications-api/swagger.yaml',
  'presence-api': 'presence-api/swagger.yaml',
  'polls-api': 'polls-api/swagger.yaml',
  'push-api': 'push-api/swagger.yaml',
  'stickers-api': 'stickers-api/swagger.yaml',
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
