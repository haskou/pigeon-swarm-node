import { ExplicitServiceClass } from './ExplicitServiceClass';

export default interface ExplicitServiceDefinition {
  readonly dependencyClasses?: readonly unknown[];
  readonly serviceClass: ExplicitServiceClass;
  readonly sourcePath: string;
}
