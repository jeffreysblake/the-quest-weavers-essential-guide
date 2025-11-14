import { Injectable, Logger } from '@nestjs/common';
import {
  GameEventType,
  IGameEvent,
  EventCallback,
  IEventSubscription,
  EventFilter,
} from './event.interfaces';
import { v4 as uuidv4 } from 'uuid';

interface Subscriber<T = any> {
  id: string;
  callback: EventCallback<T>;
  filter?: EventFilter<T>;
}

@Injectable()
export class EventEmitterService {
  private readonly logger = new Logger(EventEmitterService.name);
  private subscribers: Map<GameEventType, Subscriber[]> = new Map();
  private wildcardSubscribers: Subscriber[] = [];
  private eventHistory: IGameEvent[] = [];
  private maxHistorySize = 1000;

  /**
   * Subscribe to a specific event type
   */
  on<T = any>(
    eventType: GameEventType,
    callback: EventCallback<T>,
    filter?: EventFilter<T>,
  ): IEventSubscription {
    const id = uuidv4();

    const subscriber: Subscriber<T> = {
      id,
      callback,
      filter,
    };

    if (!this.subscribers.has(eventType)) {
      this.subscribers.set(eventType, []);
    }

    this.subscribers.get(eventType)!.push(subscriber);

    this.logger.debug(`Subscriber ${id} registered for event ${eventType}`);

    return {
      id,
      eventType,
      unsubscribe: () => this.off(eventType, id),
    };
  }

  /**
   * Subscribe to all events (wildcard)
   */
  onAny<T = any>(
    callback: EventCallback<T>,
    filter?: EventFilter<T>,
  ): IEventSubscription {
    const id = uuidv4();

    const subscriber: Subscriber<T> = {
      id,
      callback,
      filter,
    };

    this.wildcardSubscribers.push(subscriber);

    this.logger.debug(`Wildcard subscriber ${id} registered`);

    return {
      id,
      eventType: GameEventType.CUSTOM_EVENT, // Placeholder
      unsubscribe: () => this.offAny(id),
    };
  }

  /**
   * Subscribe to an event once (auto-unsubscribe after first trigger)
   */
  once<T = any>(
    eventType: GameEventType,
    callback: EventCallback<T>,
  ): IEventSubscription {
    const subscription = this.on<T>(eventType, async (event) => {
      await callback(event);
      subscription.unsubscribe();
    });

    return subscription;
  }

  /**
   * Unsubscribe from a specific event
   */
  off(eventType: GameEventType, subscriptionId: string): void {
    const subscribers = this.subscribers.get(eventType);

    if (subscribers) {
      const index = subscribers.findIndex((s) => s.id === subscriptionId);
      if (index !== -1) {
        subscribers.splice(index, 1);
        this.logger.debug(
          `Subscriber ${subscriptionId} unsubscribed from ${eventType}`,
        );
      }
    }
  }

  /**
   * Unsubscribe from wildcard events
   */
  private offAny(subscriptionId: string): void {
    const index = this.wildcardSubscribers.findIndex(
      (s) => s.id === subscriptionId,
    );
    if (index !== -1) {
      this.wildcardSubscribers.splice(index, 1);
      this.logger.debug(`Wildcard subscriber ${subscriptionId} unsubscribed`);
    }
  }

  /**
   * Emit an event to all subscribers
   */
  async emit<T = any>(
    eventType: GameEventType,
    data: T,
    gameId?: string,
    metadata?: Record<string, any>,
  ): Promise<void> {
    const event: IGameEvent<T> = {
      type: eventType,
      timestamp: new Date().toISOString(),
      gameId,
      data,
      metadata,
    };

    // Add to history
    this.addToHistory(event);

    this.logger.debug(`Emitting event: ${eventType}`);

    // Notify specific subscribers
    const subscribers = this.subscribers.get(eventType) || [];
    await this.notifySubscribers(subscribers, event);

    // Notify wildcard subscribers
    await this.notifySubscribers(this.wildcardSubscribers, event);
  }

  /**
   * Notify subscribers of an event
   */
  private async notifySubscribers<T>(
    subscribers: Subscriber<T>[],
    event: IGameEvent<T>,
  ): Promise<void> {
    const promises = subscribers
      .filter((sub) => !sub.filter || sub.filter(event))
      .map(async (sub) => {
        try {
          await sub.callback(event);
        } catch (error) {
          this.logger.error(
            `Error in event subscriber ${sub.id}: ${error.message}`,
          );
        }
      });

    await Promise.all(promises);
  }

  /**
   * Add event to history
   */
  private addToHistory(event: IGameEvent): void {
    this.eventHistory.push(event);

    // Trim history if it exceeds max size
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory = this.eventHistory.slice(-this.maxHistorySize);
    }
  }

  /**
   * Get event history
   */
  getHistory(
    eventType?: GameEventType,
    gameId?: string,
    limit?: number,
  ): IGameEvent[] {
    let history = [...this.eventHistory];

    if (eventType) {
      history = history.filter((e) => e.type === eventType);
    }

    if (gameId) {
      history = history.filter((e) => e.gameId === gameId);
    }

    if (limit) {
      history = history.slice(-limit);
    }

    return history;
  }

  /**
   * Clear event history
   */
  clearHistory(): void {
    this.eventHistory = [];
    this.logger.log('Event history cleared');
  }

  /**
   * Get subscriber count for an event type
   */
  getSubscriberCount(eventType?: GameEventType): number {
    if (eventType) {
      return (this.subscribers.get(eventType) || []).length;
    }

    // Total subscriber count
    let count = this.wildcardSubscribers.length;
    this.subscribers.forEach((subs) => {
      count += subs.length;
    });
    return count;
  }

  /**
   * Remove all subscribers
   */
  removeAllSubscribers(): void {
    this.subscribers.clear();
    this.wildcardSubscribers = [];
    this.logger.log('All subscribers removed');
  }

  /**
   * Wait for a specific event
   */
  async waitFor<T = any>(
    eventType: GameEventType,
    filter?: EventFilter<T>,
    timeout?: number,
  ): Promise<IGameEvent<T>> {
    return new Promise((resolve, reject) => {
      let timeoutHandle: NodeJS.Timeout | undefined;

      const subscription = this.on<T>(
        eventType,
        (event) => {
          if (!filter || filter(event)) {
            if (timeoutHandle) clearTimeout(timeoutHandle);
            subscription.unsubscribe();
            resolve(event);
          }
        },
        filter,
      );

      if (timeout) {
        timeoutHandle = setTimeout(() => {
          subscription.unsubscribe();
          reject(new Error(`Timeout waiting for event: ${eventType}`));
        }, timeout);
      }
    });
  }
}
