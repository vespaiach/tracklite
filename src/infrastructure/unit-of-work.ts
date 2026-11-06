import "server-only";
import type { UnitOfWork } from "../application/shared/unit-of-work";
import type { AggregateRoot } from "../domain/shared/aggregate-root";
import { db } from "./db";
import { publishAll } from "./events";
import type { Transaction } from "./transaction";

export type TransactionScope = { tx: Transaction; saved: (aggregate: AggregateRoot) => void };

export function unitOfWork<R>(repositoriesOn: (scope: TransactionScope) => R): UnitOfWork<R> {
  return {
    run: (work) =>
      db.transaction(async (tx) => {
        const saved = new Set<AggregateRoot>();
        const result = await work(repositoriesOn({ tx, saved: (aggregate) => saved.add(aggregate) }));

        await publishAll(
          tx,
          [...saved].flatMap((aggregate) => aggregate.pullEvents()),
        );
        return result;
      }),
  };
}