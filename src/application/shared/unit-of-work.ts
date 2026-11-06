export type UnitOfWork<R> = {
  run<T>(work: (repositories: R) => Promise<T>): Promise<T>;
};