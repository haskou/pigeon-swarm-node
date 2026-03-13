interface Persistence {
  sync(force: boolean): Promise<void>;
  authenticate(): Promise<void>;
}
export default Persistence;
