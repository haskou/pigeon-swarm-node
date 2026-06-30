import { HttpApp } from '@haskou/ddd-kernel/adapters/ui';

import { ApiSwaggerRegistrar } from '../../../../src/apps/apis/ApiSwaggerRegistrar';

describe('ApiSwaggerRegistrar', () => {
  it('should register the aggregated, html, and api swagger routes', () => {
    const app = {
      get: jest.fn(),
    } as unknown as HttpApp;
    const swaggerFactory = {
      createAggregatedSpec: jest.fn().mockReturnValue('aggregated-yaml'),
      createByApi: jest.fn().mockReturnValue({
        'calls-api': 'calls-yaml',
        'identities-api': 'identities-yaml',
      }),
      createRouteByApi: jest.fn().mockReturnValue({
        'calls-api': '/api/swagger/calls-api/swagger.yaml',
        'identities-api': '/api/swagger/identities-api/swagger.yaml',
      }),
    };
    const swaggerHtml = {
      build: jest.fn().mockReturnValue('swagger-html'),
    };

    new ApiSwaggerRegistrar(swaggerFactory, swaggerHtml).register(app, '/api');

    expect(swaggerFactory.createRouteByApi).toHaveBeenCalledWith('/api');
    expect(swaggerHtml.build).toHaveBeenCalledWith('/api', {
      'calls-api': '/api/swagger/calls-api/swagger.yaml',
      'identities-api': '/api/swagger/identities-api/swagger.yaml',
    });
    expect(app.get).toHaveBeenCalledWith(
      '/api/swagger/open-api.yaml',
      expect.any(Function),
    );
    expect(app.get).toHaveBeenCalledWith('/api/swagger', expect.any(Function));
    expect(app.get).toHaveBeenCalledWith(
      '/api/swagger/calls-api/swagger.yaml',
      expect.any(Function),
    );
    expect(app.get).toHaveBeenCalledWith(
      '/api/swagger/identities-api/swagger.yaml',
      expect.any(Function),
    );
  });
});
