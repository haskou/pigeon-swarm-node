import { NodeBlockPublication } from '../NodeBlockPublication';
import NodeOwnerSettingsReset from './NodeOwnerSettingsReset';

/** Whether the own block list is published; resetting its owner settings turns it off. */
export default abstract class NodeBlockPublicationRepository extends NodeOwnerSettingsReset {
  public abstract find(): Promise<NodeBlockPublication>;
  public abstract save(publication: NodeBlockPublication): Promise<void>;
}
