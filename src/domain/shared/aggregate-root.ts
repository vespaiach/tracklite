import type { DomainEvent } from "./events";

export abstract class AggregateRoot {
  #events: DomainEvent[] = [];

  protected record(event: DomainEvent) {
    this.#events.push(event);
  }

  pullEvents() {
    const events = this.#events;
    this.#events = [];
    return events;
  }
}