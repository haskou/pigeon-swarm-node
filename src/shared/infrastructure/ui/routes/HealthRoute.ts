import { Route } from '@haskou/ddd-kernel/adapters/ui';
import { Response } from 'express';
import {
  Get as get,
  JsonController as jsonController,
  Res,
} from 'routing-controllers';

@jsonController()
export default class HealthRoute extends Route {
  @get('/health')
  public health(@Res() res: Response): object {
    return res.status(200).send().end();
  }

  @get('/')
  public index(): object {
    return {};
  }
}
