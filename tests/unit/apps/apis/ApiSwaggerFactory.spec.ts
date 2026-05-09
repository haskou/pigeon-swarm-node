import { ApiSwaggerFactory } from '../../../../src/apps/apis/ApiSwaggerFactory';

describe('ApiSwaggerFactory', () => {
  let factory: ApiSwaggerFactory;

  beforeEach(() => {
    factory = new ApiSwaggerFactory();
  });

  describe('createByApi', () => {
    it('should load one yaml document per api folder', () => {
      const specs = factory.createByApi();

      expect(Object.keys(specs)).toEqual([
        'conversations-api',
        'identities-api',
        'ipfs-api',
      ]);
      expect(specs['conversations-api']).toContain('/conversations/1to1:');
      expect(specs['identities-api']).toContain('/identities/:');
      expect(specs['ipfs-api']).toContain('/ipfs/{cid}:');
    });
  });

  describe('createAggregatedSpec', () => {
    it('should load the aggregated yaml document', () => {
      const spec = factory.createAggregatedSpec();

      expect(spec).toContain('title: Pigeon-swarm APIs');
      expect(spec).toContain(
        "$ref: './conversations-api/swagger.yaml#/paths/~1conversations~11to1'",
      );
      expect(spec).toContain(
        "$ref: './identities-api/swagger.yaml#/paths/~1identities~1'",
      );
      expect(spec).toContain(
        "$ref: './ipfs-api/swagger.yaml#/paths/~1ipfs~1{cid}'",
      );
    });
  });

  describe('createRouteByApi', () => {
    it('should create routes for each api swagger file', () => {
      const routes = factory.createRouteByApi('/api');

      expect(routes).toEqual({
        'conversations-api': '/api/swagger/conversations-api/swagger.yaml',
        'identities-api': '/api/swagger/identities-api/swagger.yaml',
        'ipfs-api': '/api/swagger/ipfs-api/swagger.yaml',
      });
    });
  });
});
