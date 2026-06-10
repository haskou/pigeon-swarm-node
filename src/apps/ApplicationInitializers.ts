import { ServiceClass } from '@app/shared/infrastructure/dependencyInjection/ServiceClass';
import { Initializer } from '@app/shared/infrastructure/lifecycle/Initializer';

export const applicationInitializers: ServiceClass<Initializer>[] = [];
