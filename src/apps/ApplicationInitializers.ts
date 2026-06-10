import { ServiceClass } from '@app/shared/infrastructure/dependencyInjection/ServiceClass';
import { Initializer } from '@app/shared/infrastructure/lifecycle/Initializer';
import MongoIndexInitializer from '@app/shared/infrastructure/mongodb/MongoIndexInitializer';

export const applicationInitializers: ServiceClass<Initializer>[] = [
  MongoIndexInitializer,
];
