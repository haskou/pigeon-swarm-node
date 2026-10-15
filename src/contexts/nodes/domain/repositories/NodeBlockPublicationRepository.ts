import { NodeBlockPublication } from '../NodeBlockPublication';

export default abstract class NodeBlockPublicationRepository {
  public abstract find(): Promise<NodeBlockPublication>;
  public abstract save(publication: NodeBlockPublication): Promise<void>;
}
