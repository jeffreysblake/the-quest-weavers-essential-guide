import { Injectable, Logger } from '@nestjs/common';
import { EventEmitterService } from '../events/event-emitter.service';
import { GameEventType } from '../events/event.interfaces';

/**
 * State definition
 */
export interface IState {
  name: string;
  onEnter?: () => void | Promise<void>;
  onExit?: () => void | Promise<void>;
  onUpdate?: (deltaTime: number) => void | Promise<void>;
}

/**
 * Transition definition
 */
export interface ITransition {
  from: string;
  to: string;
  condition?: () => boolean | Promise<boolean>;
  onTransition?: () => void | Promise<void>;
}

/**
 * State machine instance
 */
export interface IStateMachineInstance {
  id: string;
  currentState: string;
  previousState?: string;
  states: Map<string, IState>;
  transitions: ITransition[];
  context?: any;
}

/**
 * Generic state machine service
 * Manages state transitions for game entities and systems
 */
@Injectable()
export class StateMachineService {
  private readonly logger = new Logger(StateMachineService.name);
  private machines: Map<string, IStateMachineInstance> = new Map();

  constructor(private readonly eventEmitter: EventEmitterService) {}

  /**
   * Create a new state machine
   */
  create(
    id: string,
    initialState: string,
    context?: any,
  ): IStateMachineInstance {
    const machine: IStateMachineInstance = {
      id,
      currentState: initialState,
      states: new Map(),
      transitions: [],
      context,
    };

    this.machines.set(id, machine);
    this.logger.log(
      `Created state machine '${id}' with initial state '${initialState}'`,
    );

    return machine;
  }

  /**
   * Add a state to a machine
   */
  addState(machineId: string, state: IState): void {
    const machine = this.machines.get(machineId);

    if (!machine) {
      throw new Error(`State machine '${machineId}' not found`);
    }

    machine.states.set(state.name, state);
    this.logger.debug(`Added state '${state.name}' to machine '${machineId}'`);
  }

  /**
   * Add a transition to a machine
   */
  addTransition(machineId: string, transition: ITransition): void {
    const machine = this.machines.get(machineId);

    if (!machine) {
      throw new Error(`State machine '${machineId}' not found`);
    }

    machine.transitions.push(transition);
    this.logger.debug(
      `Added transition ${transition.from} -> ${transition.to} to machine '${machineId}'`,
    );
  }

  /**
   * Transition to a new state
   */
  async transition(machineId: string, toState: string): Promise<boolean> {
    const machine = this.machines.get(machineId);

    if (!machine) {
      throw new Error(`State machine '${machineId}' not found`);
    }

    const fromState = machine.currentState;

    // Find valid transition
    const transition = machine.transitions.find(
      (t) => t.from === fromState && t.to === toState,
    );

    if (!transition) {
      this.logger.warn(
        `No transition found from '${fromState}' to '${toState}' in machine '${machineId}'`,
      );
      return false;
    }

    // Check condition if exists
    if (transition.condition) {
      const conditionMet = await transition.condition();
      if (!conditionMet) {
        this.logger.debug(
          `Transition condition not met for ${fromState} -> ${toState}`,
        );
        return false;
      }
    }

    // Execute exit callback
    const currentState = machine.states.get(fromState);
    if (currentState?.onExit) {
      await currentState.onExit();
    }

    // Execute transition callback
    if (transition.onTransition) {
      await transition.onTransition();
    }

    // Change state
    machine.previousState = fromState;
    machine.currentState = toState;

    // Execute enter callback
    const nextState = machine.states.get(toState);
    if (nextState?.onEnter) {
      await nextState.onEnter();
    }

    this.logger.log(
      `Machine '${machineId}' transitioned from '${fromState}' to '${toState}'`,
    );

    // Emit event (with gameId from context if available)
    await this.eventEmitter.emit(
      GameEventType.CUSTOM_EVENT,
      {
        action: 'state_transition',
        machineId,
        from: fromState,
        to: toState,
      },
      machine.context?.gameId,
    );

    return true;
  }

  /**
   * Update state machine (call onUpdate if defined)
   */
  async update(machineId: string, deltaTime: number): Promise<void> {
    const machine = this.machines.get(machineId);

    if (!machine) {
      return;
    }

    const currentState = machine.states.get(machine.currentState);

    if (currentState?.onUpdate) {
      await currentState.onUpdate(deltaTime);
    }
  }

  /**
   * Get current state
   */
  getCurrentState(machineId: string): string | undefined {
    return this.machines.get(machineId)?.currentState;
  }

  /**
   * Get previous state
   */
  getPreviousState(machineId: string): string | undefined {
    return this.machines.get(machineId)?.previousState;
  }

  /**
   * Check if in a specific state
   */
  isInState(machineId: string, stateName: string): boolean {
    return this.machines.get(machineId)?.currentState === stateName;
  }

  /**
   * Get machine context
   */
  getContext<T = any>(machineId: string): T | undefined {
    return this.machines.get(machineId)?.context;
  }

  /**
   * Set machine context
   */
  setContext(machineId: string, context: any): void {
    const machine = this.machines.get(machineId);

    if (machine) {
      machine.context = context;
    }
  }

  /**
   * Remove a state machine
   */
  remove(machineId: string): void {
    this.machines.delete(machineId);
    this.logger.log(`Removed state machine '${machineId}'`);
  }

  /**
   * Get all machine IDs
   */
  getAllMachineIds(): string[] {
    return Array.from(this.machines.keys());
  }

  /**
   * Get machine info
   */
  getMachineInfo(machineId: string):
    | {
        id: string;
        currentState: string;
        previousState?: string;
        stateCount: number;
        transitionCount: number;
      }
    | undefined {
    const machine = this.machines.get(machineId);

    if (!machine) {
      return undefined;
    }

    return {
      id: machine.id,
      currentState: machine.currentState,
      previousState: machine.previousState,
      stateCount: machine.states.size,
      transitionCount: machine.transitions.length,
    };
  }

  /**
   * Clear all state machines
   */
  clearAll(): void {
    this.machines.clear();
    this.logger.log('Cleared all state machines');
  }
}
