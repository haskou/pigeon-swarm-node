import Kernel from '@app/Kernel';

export default abstract class Route {
  public get<T>(service: unknown): T {
    return Kernel.di.getService<T>(service);
  }
}
