import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitterService } from './event-emitter.service';
import { GameEventType, IGameEvent } from './event.interfaces';

describe('EventEmitterService', () => {
  let service: EventEmitterService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EventEmitterService],
    }).compile();

    service = module.get<EventEmitterService>(EventEmitterService);
  });

  afterEach(() => {
    service.clearHistory();
    service.removeAllSubscribers();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('on', () => {
    it('should subscribe to specific event type', () => {
      const callback = jest.fn();
      const subscription = service.on(GameEventType.GAME_CREATED, callback);

      expect(subscription).toBeDefined();
      expect(subscription.id).toBeDefined();
      expect(subscription.eventType).toBe(GameEventType.GAME_CREATED);
      expect(subscription.unsubscribe).toBeInstanceOf(Function);
    });

    it('should register multiple subscribers for same event', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();

      service.on(GameEventType.GAME_CREATED, callback1);
      service.on(GameEventType.GAME_CREATED, callback2);

      const count = service.getSubscriberCount(GameEventType.GAME_CREATED);
      expect(count).toBe(2);
    });

    it('should register subscribers for different events', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();

      service.on(GameEventType.GAME_CREATED, callback1);
      service.on(GameEventType.GAME_SAVED, callback2);

      expect(service.getSubscriberCount(GameEventType.GAME_CREATED)).toBe(1);
      expect(service.getSubscriberCount(GameEventType.GAME_SAVED)).toBe(1);
    });

    it('should support event filtering', async () => {
      const callback = jest.fn();
      const filter = (event: IGameEvent) => event.gameId === 'game1';

      service.on(GameEventType.GAME_CREATED, callback, filter);

      await service.emit(GameEventType.GAME_CREATED, { test: 'data' }, 'game1');
      await service.emit(GameEventType.GAME_CREATED, { test: 'data' }, 'game2');

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should generate unique subscription IDs', () => {
      const callback = jest.fn();
      const sub1 = service.on(GameEventType.GAME_CREATED, callback);
      const sub2 = service.on(GameEventType.GAME_CREATED, callback);

      expect(sub1.id).not.toBe(sub2.id);
    });
  });

  describe('onAny', () => {
    it('should subscribe to all event types', () => {
      const callback = jest.fn();
      const subscription = service.onAny(callback);

      expect(subscription).toBeDefined();
      expect(subscription.id).toBeDefined();
      expect(subscription.unsubscribe).toBeInstanceOf(Function);
    });

    it('should receive all emitted events', async () => {
      const callback = jest.fn();
      service.onAny(callback);

      await service.emit(GameEventType.GAME_CREATED, { test: 'data1' });
      await service.emit(GameEventType.GAME_SAVED, { test: 'data2' });
      await service.emit(GameEventType.ENTITY_CREATED, { test: 'data3' });

      expect(callback).toHaveBeenCalledTimes(3);
    });

    it('should support wildcard filtering', async () => {
      const callback = jest.fn();
      const filter = (event: IGameEvent) => event.gameId === 'specific-game';

      service.onAny(callback, filter);

      await service.emit(
        GameEventType.GAME_CREATED,
        { test: 'data' },
        'specific-game',
      );
      await service.emit(
        GameEventType.GAME_SAVED,
        { test: 'data' },
        'other-game',
      );
      await service.emit(
        GameEventType.ENTITY_CREATED,
        { test: 'data' },
        'specific-game',
      );

      expect(callback).toHaveBeenCalledTimes(2);
    });

    it('should work alongside specific event subscribers', async () => {
      const wildcardCallback = jest.fn();
      const specificCallback = jest.fn();

      service.onAny(wildcardCallback);
      service.on(GameEventType.GAME_CREATED, specificCallback);

      await service.emit(GameEventType.GAME_CREATED, { test: 'data' });

      expect(wildcardCallback).toHaveBeenCalledTimes(1);
      expect(specificCallback).toHaveBeenCalledTimes(1);
    });
  });

  describe('once', () => {
    it('should subscribe and auto-unsubscribe after first event', async () => {
      const callback = jest.fn();
      service.once(GameEventType.GAME_CREATED, callback);

      await service.emit(GameEventType.GAME_CREATED, { test: 'data1' });
      await service.emit(GameEventType.GAME_CREATED, { test: 'data2' });

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should return subscription with unsubscribe method', () => {
      const callback = jest.fn();
      const subscription = service.once(GameEventType.GAME_CREATED, callback);

      expect(subscription).toBeDefined();
      expect(subscription.unsubscribe).toBeInstanceOf(Function);
    });

    it('should allow manual unsubscribe before event fires', async () => {
      const callback = jest.fn();
      const subscription = service.once(GameEventType.GAME_CREATED, callback);

      subscription.unsubscribe();

      await service.emit(GameEventType.GAME_CREATED, { test: 'data' });

      expect(callback).not.toHaveBeenCalled();
    });

    it('should work with async callbacks', async () => {
      const asyncCallback = jest.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      service.once(GameEventType.GAME_CREATED, asyncCallback);

      await service.emit(GameEventType.GAME_CREATED, { test: 'data' });
      await service.emit(GameEventType.GAME_CREATED, { test: 'data' });

      expect(asyncCallback).toHaveBeenCalledTimes(1);
    });
  });

  describe('off', () => {
    it('should unsubscribe from event', async () => {
      const callback = jest.fn();
      const subscription = service.on(GameEventType.GAME_CREATED, callback);

      await service.emit(GameEventType.GAME_CREATED, { test: 'data1' });

      service.off(GameEventType.GAME_CREATED, subscription.id);

      await service.emit(GameEventType.GAME_CREATED, { test: 'data2' });

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should handle unsubscribing non-existent subscription', () => {
      expect(() => {
        service.off(GameEventType.GAME_CREATED, 'nonexistent-id');
      }).not.toThrow();
    });

    it('should unsubscribe via subscription.unsubscribe()', async () => {
      const callback = jest.fn();
      const subscription = service.on(GameEventType.GAME_CREATED, callback);

      await service.emit(GameEventType.GAME_CREATED, { test: 'data1' });

      subscription.unsubscribe();

      await service.emit(GameEventType.GAME_CREATED, { test: 'data2' });

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should only unsubscribe specific subscription', async () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();

      const sub1 = service.on(GameEventType.GAME_CREATED, callback1);
      service.on(GameEventType.GAME_CREATED, callback2);

      service.off(GameEventType.GAME_CREATED, sub1.id);

      await service.emit(GameEventType.GAME_CREATED, { test: 'data' });

      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).toHaveBeenCalledTimes(1);
    });
  });

  describe('emit', () => {
    it('should emit event to subscribers', async () => {
      const callback = jest.fn();
      service.on(GameEventType.GAME_CREATED, callback);

      await service.emit(GameEventType.GAME_CREATED, { gameName: 'Test Game' });

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          type: GameEventType.GAME_CREATED,
          data: { gameName: 'Test Game' },
        }),
      );
    });

    it('should emit event with gameId', async () => {
      const callback = jest.fn();
      service.on(GameEventType.GAME_SAVED, callback);

      await service.emit(GameEventType.GAME_SAVED, { test: 'data' }, 'game123');

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          gameId: 'game123',
        }),
      );
    });

    it('should emit event with metadata', async () => {
      const callback = jest.fn();
      service.on(GameEventType.CUSTOM_EVENT, callback);

      const metadata = { source: 'test', priority: 'high' };
      await service.emit(
        GameEventType.CUSTOM_EVENT,
        { test: 'data' },
        undefined,
        metadata,
      );

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata,
        }),
      );
    });

    it('should include timestamp in event', async () => {
      const callback = jest.fn();
      service.on(GameEventType.GAME_CREATED, callback);

      const beforeEmit = new Date().toISOString();
      await service.emit(GameEventType.GAME_CREATED, { test: 'data' });
      const afterEmit = new Date().toISOString();

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          timestamp: expect.any(String),
        }),
      );

      const event = callback.mock.calls[0][0];
      expect(event.timestamp >= beforeEmit).toBe(true);
      expect(event.timestamp <= afterEmit).toBe(true);
    });

    it('should notify all subscribers in parallel', async () => {
      const callback1 = jest.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });
      const callback2 = jest.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      service.on(GameEventType.GAME_CREATED, callback1);
      service.on(GameEventType.GAME_CREATED, callback2);

      const startTime = Date.now();
      await service.emit(GameEventType.GAME_CREATED, { test: 'data' });
      const duration = Date.now() - startTime;

      expect(callback1).toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
      expect(duration).toBeLessThan(100); // Should be parallel, not sequential
    });

    it('should not crash if subscriber throws error', async () => {
      const errorCallback = jest.fn(() => {
        throw new Error('Subscriber error');
      });
      const successCallback = jest.fn();

      service.on(GameEventType.GAME_CREATED, errorCallback);
      service.on(GameEventType.GAME_CREATED, successCallback);

      await expect(
        service.emit(GameEventType.GAME_CREATED, { test: 'data' }),
      ).resolves.not.toThrow();

      expect(errorCallback).toHaveBeenCalled();
      expect(successCallback).toHaveBeenCalled();
    });

    it('should notify wildcard and specific subscribers', async () => {
      const wildcardCallback = jest.fn();
      const specificCallback = jest.fn();

      service.onAny(wildcardCallback);
      service.on(GameEventType.GAME_CREATED, specificCallback);

      await service.emit(GameEventType.GAME_CREATED, { test: 'data' });

      expect(wildcardCallback).toHaveBeenCalledTimes(1);
      expect(specificCallback).toHaveBeenCalledTimes(1);
    });

    it('should handle emitting to event with no subscribers', async () => {
      await expect(
        service.emit(GameEventType.GAME_DELETED, { test: 'data' }),
      ).resolves.not.toThrow();
    });

    it('should apply filters correctly', async () => {
      const callback = jest.fn();
      const filter = (event: IGameEvent) => event.data.priority === 'high';

      service.on(GameEventType.CUSTOM_EVENT, callback, filter);

      await service.emit(GameEventType.CUSTOM_EVENT, { priority: 'low' });
      await service.emit(GameEventType.CUSTOM_EVENT, { priority: 'high' });
      await service.emit(GameEventType.CUSTOM_EVENT, { priority: 'medium' });

      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe('getHistory', () => {
    it('should return all event history', async () => {
      await service.emit(GameEventType.GAME_CREATED, { test: 'data1' });
      await service.emit(GameEventType.GAME_SAVED, { test: 'data2' });
      await service.emit(GameEventType.GAME_DELETED, { test: 'data3' });

      const history = service.getHistory();
      expect(history.length).toBe(3);
    });

    it('should filter history by event type', async () => {
      await service.emit(GameEventType.GAME_CREATED, { test: 'data1' });
      await service.emit(GameEventType.GAME_SAVED, { test: 'data2' });
      await service.emit(GameEventType.GAME_CREATED, { test: 'data3' });

      const history = service.getHistory(GameEventType.GAME_CREATED);
      expect(history.length).toBe(2);
      expect(history[0].type).toBe(GameEventType.GAME_CREATED);
      expect(history[1].type).toBe(GameEventType.GAME_CREATED);
    });

    it('should filter history by gameId', async () => {
      await service.emit(
        GameEventType.GAME_CREATED,
        { test: 'data1' },
        'game1',
      );
      await service.emit(GameEventType.GAME_SAVED, { test: 'data2' }, 'game2');
      await service.emit(
        GameEventType.GAME_CREATED,
        { test: 'data3' },
        'game1',
      );

      const history = service.getHistory(undefined, 'game1');
      expect(history.length).toBe(2);
      expect(history[0].gameId).toBe('game1');
      expect(history[1].gameId).toBe('game1');
    });

    it('should limit history results', async () => {
      for (let i = 0; i < 10; i++) {
        await service.emit(GameEventType.GAME_CREATED, { index: i });
      }

      const history = service.getHistory(undefined, undefined, 5);
      expect(history.length).toBe(5);
    });

    it('should return most recent events when limited', async () => {
      await service.emit(GameEventType.GAME_CREATED, { index: 1 });
      await service.emit(GameEventType.GAME_CREATED, { index: 2 });
      await service.emit(GameEventType.GAME_CREATED, { index: 3 });
      await service.emit(GameEventType.GAME_CREATED, { index: 4 });
      await service.emit(GameEventType.GAME_CREATED, { index: 5 });

      const history = service.getHistory(undefined, undefined, 3);
      expect(history.length).toBe(3);
      expect(history[0].data.index).toBe(3);
      expect(history[1].data.index).toBe(4);
      expect(history[2].data.index).toBe(5);
    });

    it('should filter by both event type and gameId', async () => {
      await service.emit(
        GameEventType.GAME_CREATED,
        { test: 'data1' },
        'game1',
      );
      await service.emit(GameEventType.GAME_SAVED, { test: 'data2' }, 'game1');
      await service.emit(
        GameEventType.GAME_CREATED,
        { test: 'data3' },
        'game2',
      );
      await service.emit(
        GameEventType.GAME_CREATED,
        { test: 'data4' },
        'game1',
      );

      const history = service.getHistory(GameEventType.GAME_CREATED, 'game1');
      expect(history.length).toBe(2);
      expect(history[0].type).toBe(GameEventType.GAME_CREATED);
      expect(history[0].gameId).toBe('game1');
    });

    it('should combine all filters', async () => {
      for (let i = 0; i < 5; i++) {
        await service.emit(GameEventType.GAME_CREATED, { index: i }, 'game1');
        await service.emit(GameEventType.GAME_SAVED, { index: i }, 'game1');
      }

      const history = service.getHistory(
        GameEventType.GAME_CREATED,
        'game1',
        3,
      );
      expect(history.length).toBe(3);
      expect(history.every((e) => e.type === GameEventType.GAME_CREATED)).toBe(
        true,
      );
      expect(history.every((e) => e.gameId === 'game1')).toBe(true);
    });

    it('should return empty array when no events match', () => {
      const history = service.getHistory(
        GameEventType.GAME_CREATED,
        'nonexistent-game',
      );
      expect(history).toEqual([]);
    });

    it('should return copy of history, not reference', async () => {
      await service.emit(GameEventType.GAME_CREATED, { test: 'data' });

      const history1 = service.getHistory();
      const history2 = service.getHistory();

      expect(history1).not.toBe(history2);
    });
  });

  describe('clearHistory', () => {
    it('should clear all event history', async () => {
      await service.emit(GameEventType.GAME_CREATED, { test: 'data1' });
      await service.emit(GameEventType.GAME_SAVED, { test: 'data2' });
      await service.emit(GameEventType.GAME_DELETED, { test: 'data3' });

      expect(service.getHistory().length).toBe(3);

      service.clearHistory();

      expect(service.getHistory().length).toBe(0);
    });

    it('should not affect subscribers', async () => {
      const callback = jest.fn();
      service.on(GameEventType.GAME_CREATED, callback);

      service.clearHistory();

      await service.emit(GameEventType.GAME_CREATED, { test: 'data' });

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should allow new events after clearing', async () => {
      await service.emit(GameEventType.GAME_CREATED, { test: 'old' });
      service.clearHistory();
      await service.emit(GameEventType.GAME_CREATED, { test: 'new' });

      const history = service.getHistory();
      expect(history.length).toBe(1);
      expect(history[0].data.test).toBe('new');
    });
  });

  describe('getSubscriberCount', () => {
    it('should return subscriber count for specific event', () => {
      service.on(GameEventType.GAME_CREATED, jest.fn());
      service.on(GameEventType.GAME_CREATED, jest.fn());
      service.on(GameEventType.GAME_SAVED, jest.fn());

      expect(service.getSubscriberCount(GameEventType.GAME_CREATED)).toBe(2);
      expect(service.getSubscriberCount(GameEventType.GAME_SAVED)).toBe(1);
    });

    it('should return 0 for event with no subscribers', () => {
      expect(service.getSubscriberCount(GameEventType.GAME_DELETED)).toBe(0);
    });

    it('should return total subscriber count when no event specified', () => {
      service.on(GameEventType.GAME_CREATED, jest.fn());
      service.on(GameEventType.GAME_SAVED, jest.fn());
      service.on(GameEventType.GAME_DELETED, jest.fn());
      service.onAny(jest.fn());

      const total = service.getSubscriberCount();
      expect(total).toBe(4);
    });

    it('should include wildcard subscribers in total count', () => {
      service.on(GameEventType.GAME_CREATED, jest.fn());
      service.onAny(jest.fn());
      service.onAny(jest.fn());

      const total = service.getSubscriberCount();
      expect(total).toBe(3);
    });

    it('should not include wildcard subscribers in specific event count', () => {
      service.on(GameEventType.GAME_CREATED, jest.fn());
      service.onAny(jest.fn());

      expect(service.getSubscriberCount(GameEventType.GAME_CREATED)).toBe(1);
    });

    it('should update count when subscribers are removed', () => {
      const sub1 = service.on(GameEventType.GAME_CREATED, jest.fn());
      const sub2 = service.on(GameEventType.GAME_CREATED, jest.fn());

      expect(service.getSubscriberCount(GameEventType.GAME_CREATED)).toBe(2);

      sub1.unsubscribe();

      expect(service.getSubscriberCount(GameEventType.GAME_CREATED)).toBe(1);

      sub2.unsubscribe();

      expect(service.getSubscriberCount(GameEventType.GAME_CREATED)).toBe(0);
    });
  });

  describe('removeAllSubscribers', () => {
    it('should remove all subscribers', async () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();
      const callback3 = jest.fn();

      service.on(GameEventType.GAME_CREATED, callback1);
      service.on(GameEventType.GAME_SAVED, callback2);
      service.onAny(callback3);

      expect(service.getSubscriberCount()).toBe(3);

      service.removeAllSubscribers();

      expect(service.getSubscriberCount()).toBe(0);

      await service.emit(GameEventType.GAME_CREATED, { test: 'data' });

      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).not.toHaveBeenCalled();
      expect(callback3).not.toHaveBeenCalled();
    });

    it('should remove wildcard subscribers', async () => {
      const callback = jest.fn();
      service.onAny(callback);

      service.removeAllSubscribers();

      await service.emit(GameEventType.GAME_CREATED, { test: 'data' });

      expect(callback).not.toHaveBeenCalled();
    });

    it('should not affect event history', async () => {
      await service.emit(GameEventType.GAME_CREATED, { test: 'data' });

      service.removeAllSubscribers();

      expect(service.getHistory().length).toBe(1);
    });

    it('should allow new subscriptions after removal', async () => {
      service.on(GameEventType.GAME_CREATED, jest.fn());
      service.removeAllSubscribers();

      const callback = jest.fn();
      service.on(GameEventType.GAME_CREATED, callback);

      await service.emit(GameEventType.GAME_CREATED, { test: 'data' });

      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe('waitFor', () => {
    it('should resolve when event is emitted', async () => {
      const promise = service.waitFor(GameEventType.GAME_CREATED);

      setTimeout(() => {
        service.emit(GameEventType.GAME_CREATED, { test: 'data' });
      }, 10);

      const event = await promise;
      expect(event.type).toBe(GameEventType.GAME_CREATED);
      expect(event.data).toEqual({ test: 'data' });
    });

    it('should resolve with correct event data', async () => {
      const promise = service.waitFor(GameEventType.GAME_SAVED);

      setTimeout(() => {
        service.emit(GameEventType.GAME_SAVED, { gameName: 'Test' }, 'game123');
      }, 10);

      const event = await promise;
      expect(event.type).toBe(GameEventType.GAME_SAVED);
      expect(event.gameId).toBe('game123');
      expect(event.data.gameName).toBe('Test');
    });

    it('should support filtering', async () => {
      const filter = (event: IGameEvent) => event.data.priority === 'high';
      const promise = service.waitFor(GameEventType.CUSTOM_EVENT, filter);

      setTimeout(async () => {
        await service.emit(GameEventType.CUSTOM_EVENT, { priority: 'low' });
        await service.emit(GameEventType.CUSTOM_EVENT, { priority: 'high' });
      }, 10);

      const event = await promise;
      expect(event.data.priority).toBe('high');
    });

    it('should reject on timeout', async () => {
      const promise = service.waitFor(
        GameEventType.GAME_CREATED,
        undefined,
        50,
      );

      await expect(promise).rejects.toThrow('Timeout waiting for event');
    });

    it('should clean up subscription after resolving', async () => {
      const initialCount = service.getSubscriberCount(
        GameEventType.GAME_CREATED,
      );

      const promise = service.waitFor(GameEventType.GAME_CREATED);

      setTimeout(() => {
        service.emit(GameEventType.GAME_CREATED, { test: 'data' });
      }, 10);

      await promise;

      const finalCount = service.getSubscriberCount(GameEventType.GAME_CREATED);
      expect(finalCount).toBe(initialCount);
    });

    it('should clean up subscription after timeout', async () => {
      const initialCount = service.getSubscriberCount(
        GameEventType.GAME_CREATED,
      );

      const promise = service.waitFor(
        GameEventType.GAME_CREATED,
        undefined,
        50,
      );

      await expect(promise).rejects.toThrow();

      const finalCount = service.getSubscriberCount(GameEventType.GAME_CREATED);
      expect(finalCount).toBe(initialCount);
    });

    it('should handle multiple concurrent waitFor calls', async () => {
      const promise1 = service.waitFor(GameEventType.GAME_CREATED);
      const promise2 = service.waitFor(GameEventType.GAME_CREATED);

      setTimeout(() => {
        service.emit(GameEventType.GAME_CREATED, { test: 'data' });
      }, 10);

      const [event1, event2] = await Promise.all([promise1, promise2]);

      expect(event1.type).toBe(GameEventType.GAME_CREATED);
      expect(event2.type).toBe(GameEventType.GAME_CREATED);
    });

    it('should resolve with first matching filtered event', async () => {
      const filter = (event: IGameEvent) => event.data.value > 5;
      const promise = service.waitFor(GameEventType.CUSTOM_EVENT, filter);

      setTimeout(async () => {
        await service.emit(GameEventType.CUSTOM_EVENT, { value: 2 });
        await service.emit(GameEventType.CUSTOM_EVENT, { value: 3 });
        await service.emit(GameEventType.CUSTOM_EVENT, { value: 8 });
        await service.emit(GameEventType.CUSTOM_EVENT, { value: 10 });
      }, 10);

      const event = await promise;
      expect(event.data.value).toBe(8);
    });
  });

  describe('Event History Management', () => {
    it('should maintain history up to max size', async () => {
      // Emit more than max history size (1000)
      for (let i = 0; i < 1100; i++) {
        await service.emit(GameEventType.CUSTOM_EVENT, { index: i });
      }

      const history = service.getHistory();
      expect(history.length).toBe(1000);
      expect(history[0].data.index).toBe(100); // First 100 should be trimmed
    });

    it('should store events even with no subscribers', async () => {
      await service.emit(GameEventType.GAME_CREATED, { test: 'data' });

      const history = service.getHistory();
      expect(history.length).toBe(1);
    });

    it('should preserve event order in history', async () => {
      await service.emit(GameEventType.GAME_CREATED, { order: 1 });
      await service.emit(GameEventType.GAME_SAVED, { order: 2 });
      await service.emit(GameEventType.GAME_DELETED, { order: 3 });

      const history = service.getHistory();
      expect(history[0].data.order).toBe(1);
      expect(history[1].data.order).toBe(2);
      expect(history[2].data.order).toBe(3);
    });
  });

  describe('Complex Event Scenarios', () => {
    it('should handle rapid event emission', async () => {
      const callback = jest.fn();
      service.on(GameEventType.CUSTOM_EVENT, callback);

      const promises = [];
      for (let i = 0; i < 100; i++) {
        promises.push(service.emit(GameEventType.CUSTOM_EVENT, { index: i }));
      }

      await Promise.all(promises);

      expect(callback).toHaveBeenCalledTimes(100);
    });

    it('should handle subscriber that adds new subscribers', async () => {
      const callback1 = jest.fn(() => {
        service.on(GameEventType.GAME_SAVED, jest.fn());
      });

      service.on(GameEventType.GAME_CREATED, callback1);

      await service.emit(GameEventType.GAME_CREATED, { test: 'data' });

      expect(service.getSubscriberCount(GameEventType.GAME_SAVED)).toBe(1);
    });

    it('should handle subscriber that removes itself', async () => {
      let subscription: any;
      const callback = jest.fn(() => {
        subscription.unsubscribe();
      });

      subscription = service.on(GameEventType.GAME_CREATED, callback);

      await service.emit(GameEventType.GAME_CREATED, { test: 'data1' });
      await service.emit(GameEventType.GAME_CREATED, { test: 'data2' });

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should handle async and sync subscribers together', async () => {
      const syncCallback = jest.fn();
      const asyncCallback = jest.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      service.on(GameEventType.GAME_CREATED, syncCallback);
      service.on(GameEventType.GAME_CREATED, asyncCallback);

      await service.emit(GameEventType.GAME_CREATED, { test: 'data' });

      expect(syncCallback).toHaveBeenCalled();
      expect(asyncCallback).toHaveBeenCalled();
    });

    it('should handle large event payloads', async () => {
      const largeData = {
        items: Array(1000)
          .fill(null)
          .map((_, i) => ({
            id: `item-${i}`,
            name: `Item ${i}`,
            properties: { value: i, rarity: 'common' },
          })),
      };

      const callback = jest.fn();
      service.on(GameEventType.CUSTOM_EVENT, callback);

      await service.emit(GameEventType.CUSTOM_EVENT, largeData);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          data: largeData,
        }),
      );
    });

    it('should handle deeply nested filters', async () => {
      const callback = jest.fn();
      const filter = (event: IGameEvent) =>
        event.data?.user?.profile?.settings?.notifications === true;

      service.on(GameEventType.CUSTOM_EVENT, callback, filter);

      await service.emit(GameEventType.CUSTOM_EVENT, {
        user: { profile: { settings: { notifications: false } } },
      });
      await service.emit(GameEventType.CUSTOM_EVENT, {
        user: { profile: { settings: { notifications: true } } },
      });

      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe('Edge Cases', () => {
    it('should handle null or undefined data', async () => {
      const callback = jest.fn();
      service.on(GameEventType.CUSTOM_EVENT, callback);

      await service.emit(GameEventType.CUSTOM_EVENT, null);
      await service.emit(GameEventType.CUSTOM_EVENT, undefined);

      expect(callback).toHaveBeenCalledTimes(2);
    });

    it('should handle empty event emissions', async () => {
      const callback = jest.fn();
      service.on(GameEventType.CUSTOM_EVENT, callback);

      await service.emit(GameEventType.CUSTOM_EVENT, {});

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should handle filter that throws error', async () => {
      const callback = jest.fn();
      const badFilter = () => {
        throw new Error('Filter error');
      };

      service.on(GameEventType.CUSTOM_EVENT, callback, badFilter);

      await expect(
        service.emit(GameEventType.CUSTOM_EVENT, { test: 'data' }),
      ).rejects.toThrow();
    });

    it('should handle multiple unsubscribe calls', () => {
      const subscription = service.on(GameEventType.GAME_CREATED, jest.fn());

      expect(() => {
        subscription.unsubscribe();
        subscription.unsubscribe();
        subscription.unsubscribe();
      }).not.toThrow();
    });

    it('should handle waitFor with immediate emission', async () => {
      // Emit before waiting
      await service.emit(GameEventType.GAME_CREATED, { test: 'data' });

      // This should wait for the next emission
      const promise = service.waitFor(
        GameEventType.GAME_CREATED,
        undefined,
        100,
      );

      setTimeout(() => {
        service.emit(GameEventType.GAME_CREATED, { test: 'data2' });
      }, 10);

      const event = await promise;
      expect(event.data.test).toBe('data2');
    });

    it('should handle gameId as undefined', async () => {
      const callback = jest.fn();
      service.on(GameEventType.GAME_CREATED, callback);

      await service.emit(GameEventType.GAME_CREATED, { test: 'data' });

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          gameId: undefined,
        }),
      );
    });
  });
});
