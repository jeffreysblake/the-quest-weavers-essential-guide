import { Injectable, Logger } from '@nestjs/common';
import { LLMService } from './llm.service';
import { PromptTemplateService } from './prompt-template.service';
import { ContextBuilderService } from './context-builder.service';
import { RoomService } from '../../entity/room.service';
import { ObjectService } from '../../entity/object.service';
import { IRoom } from '../../entity/room.interface';
import { IObject } from '../../entity/object.interface';

interface RoomGenerationRequest {
  theme?: string;
  style?: 'medieval' | 'modern' | 'fantasy' | 'sci-fi' | 'horror' | 'mystery';
  size?: 'small' | 'medium' | 'large';
  purpose?: string;
  connectedRooms?: string[];
  requiredObjects?: string[];
  ambiance?: string;
  dangerLevel?: number;
}

interface GeneratedRoomContent {
  name: string;
  description: string;
  shortDescription: string;
  objects: Array<{
    name: string;
    description: string;
    material: string;
    canOpen?: boolean;
    capacity?: number;
    weight?: number;
    flammability?: number;
  }>;
  exits: Array<{
    direction: string;
    description: string;
    locked?: boolean;
    hidden?: boolean;
  }>;
  ambiance: {
    lighting: string;
    sounds: string;
    smells: string;
    temperature: string;
  };
  secrets?: Array<{
    trigger: string;
    description: string;
    reward?: string;
  }>;
}

@Injectable()
export class RoomGeneratorService {
  private readonly logger = new Logger(RoomGeneratorService.name);

  constructor(
    private llmService: LLMService,
    private promptTemplateService: PromptTemplateService,
    private contextBuilderService: ContextBuilderService,
    private roomService: RoomService,
    private objectService: ObjectService,
  ) {}

  async generateRoom(request: RoomGenerationRequest): Promise<IRoom> {
    this.logger.log(
      `Generating room with theme: ${request.theme || 'generic'}`,
    );

    try {
      const context = await this.buildGenerationContext(request);
      const roomContent = await this.generateRoomContent(request, context);
      const room = await this.createRoomFromContent(roomContent, request);

      this.logger.log(`Successfully generated room: ${room.name} (${room.id})`);
      return room;
    } catch (error) {
      this.logger.error(`Room generation failed: ${error.message}`);
      throw new Error(`Failed to generate room: ${error.message}`);
    }
  }

  async generateMultipleRooms(
    requests: RoomGenerationRequest[],
    connectRooms = true,
  ): Promise<IRoom[]> {
    const rooms: IRoom[] = [];

    for (let i = 0; i < requests.length; i++) {
      const request = requests[i];

      if (connectRooms && i > 0) {
        request.connectedRooms = [rooms[i - 1].id];
      }

      const room = await this.generateRoom(request);
      rooms.push(room);
    }

    if (connectRooms) {
      await this.createRoomConnections(rooms);
    }

    return rooms;
  }

  async enhanceExistingRoom(
    roomId: string,
    enhancements: Partial<RoomGenerationRequest>,
  ): Promise<IRoom> {
    const existingRoom = this.roomService.findById(roomId);
    if (!existingRoom) {
      throw new Error(`Room ${roomId} not found`);
    }

    const context = await this.contextBuilderService.buildRoomContext(roomId);
    const enhancementPrompt = await this.promptTemplateService.renderTemplate(
      'room_enhancement',
      {
        existingRoom: JSON.stringify(context.room, null, 2),
        enhancements: JSON.stringify(enhancements, null, 2),
        currentObjects:
          context.objects?.map((obj) => obj.object.name).join(', ') || 'none',
      },
    );

    const schema = this.getRoomContentSchema();
    const response =
      await this.llmService.generateStructuredResponse<GeneratedRoomContent>(
        enhancementPrompt,
        schema,
      );

    if (response.validationErrors?.length) {
      this.logger.warn(
        `Room enhancement validation errors: ${response.validationErrors.join(', ')}`,
      );
    }

    const enhancedRoom = await this.applyRoomEnhancements(
      existingRoom,
      response.parsedContent,
    );
    return enhancedRoom;
  }

  private async buildGenerationContext(
    request: RoomGenerationRequest,
  ): Promise<any> {
    const context: any = {
      request,
      worldState: {
        existingRooms: this.roomService.findAll().length,
        totalObjects: this.objectService.findAll().length,
      },
    };

    if (request.connectedRooms?.length) {
      context.connectedRooms = request.connectedRooms
        .map((roomId) => {
          const room = this.roomService.findById(roomId);
          return room
            ? {
                id: room.id,
                name: room.name,
                description: room.description,
              }
            : null;
        })
        .filter(Boolean);
    }

    return context;
  }

  private async generateRoomContent(
    request: RoomGenerationRequest,
    context: any,
  ): Promise<GeneratedRoomContent> {
    const prompt = await this.promptTemplateService.renderTemplate(
      'room_description',
      {
        room_name:
          context.generatedName ||
          `${request.theme || 'Mystery'} ${request.purpose || 'Chamber'}`,
        room_type: request.purpose || 'chamber',
        room_size: request.size || 'medium',
        room_theme: `${request.style || 'fantasy'} ${request.theme || 'mysterious'}`,
        game_theme: request.style || 'fantasy',
        objects_list: request.requiredObjects?.join(', ') || 'various items',
        connected_rooms:
          context.connectedRooms?.map((r: any) => r.name).join(', ') ||
          'other areas',
        time_of_day: 'day',
        lighting: context.lighting || 'well-lit',
        narrative_style: 'descriptive',
        description_length: 'detailed',
      },
    );

    const schema = this.getRoomContentSchema();

    const response =
      await this.llmService.generateStructuredResponse<GeneratedRoomContent>(
        prompt,
        schema,
        {
          temperature: 0.8,
          maxTokens: 3000,
        },
      );

    if (response.validationErrors?.length) {
      this.logger.warn(
        `Room generation validation errors: ${response.validationErrors.join(', ')}`,
      );
    }

    return response.parsedContent;
  }

  private async createRoomFromContent(
    content: GeneratedRoomContent,
    request: RoomGenerationRequest,
  ): Promise<IRoom> {
    const room = this.roomService.create({
      name: content.name,
      description: content.description,
      position: { x: 0, y: 0, z: 0 },
      width: 10,
      height: 10,
      size: { width: 10, height: 10, depth: 3 },
      objects: [],
      players: [],
    });

    for (const objData of content.objects || []) {
      try {
        const object = this.objectService.create({
          name: objData.name,
          description: objData.description,
          position: room.position,
          material: objData.material as any,
          objectType: 'item' as const,
          state: {
            isOpen:
              objData.canOpen !== undefined ? !objData.canOpen : undefined,
          },
          containerCapacity: objData.capacity || 1,
          properties: {
            weight: objData.weight || 1,
          },
        });

        this.objectService.placeInRoom(object.id, room.id);
      } catch (error) {
        this.logger.warn(
          `Failed to create object ${objData.name}: ${error.message}`,
        );
      }
    }

    return room;
  }

  private async createRoomConnections(rooms: IRoom[]): Promise<void> {
    for (let i = 0; i < rooms.length - 1; i++) {
      const currentRoom = rooms[i];
      const nextRoom = rooms[i + 1];

      try {
        this.roomService.connectRooms(
          currentRoom.id,
          nextRoom.id,
          this.getRandomDirection(),
        );
      } catch (error) {
        this.logger.warn(
          `Failed to connect rooms ${currentRoom.id} -> ${nextRoom.id}: ${error.message}`,
        );
      }
    }
  }

  private async applyRoomEnhancements(
    room: IRoom,
    enhancements: GeneratedRoomContent,
  ): Promise<IRoom> {
    if (enhancements.description) {
      room.description = enhancements.description;
    }

    this.roomService.update(room.id, room);

    for (const objData of enhancements.objects || []) {
      try {
        const object = this.objectService.create({
          name: objData.name,
          description: objData.description,
          position: room.position,
          material: objData.material as any,
          objectType: 'item' as const,
          state: {
            isOpen:
              objData.canOpen !== undefined ? !objData.canOpen : undefined,
          },
          containerCapacity: objData.capacity || 1,
          properties: {
            weight: objData.weight || 1,
          },
        });

        this.objectService.placeInRoom(object.id, room.id);
      } catch (error) {
        this.logger.warn(
          `Failed to create enhancement object ${objData.name}: ${error.message}`,
        );
      }
    }

    return room;
  }

  private getRoomContentSchema() {
    return {
      type: 'object',
      required: [
        'name',
        'description',
        'shortDescription',
        'objects',
        'exits',
        'ambiance',
      ],
      properties: {
        name: {
          type: 'string',
          description: 'The name of the room',
        },
        description: {
          type: 'string',
          description: 'Detailed description of the room',
        },
        shortDescription: {
          type: 'string',
          description: 'Brief description for quick reference',
        },
        objects: {
          type: 'array',
          items: {
            type: 'object',
            required: ['name', 'description', 'material'],
            properties: {
              name: { type: 'string' },
              description: { type: 'string' },
              material: { type: 'string' },
              canOpen: { type: 'boolean' },
              capacity: { type: 'number' },
              weight: { type: 'number' },
              flammability: { type: 'number' },
            },
          },
        },
        exits: {
          type: 'array',
          items: {
            type: 'object',
            required: ['direction', 'description'],
            properties: {
              direction: { type: 'string' },
              description: { type: 'string' },
              locked: { type: 'boolean' },
              hidden: { type: 'boolean' },
            },
          },
        },
        ambiance: {
          type: 'object',
          required: ['lighting', 'sounds', 'smells', 'temperature'],
          properties: {
            lighting: { type: 'string' },
            sounds: { type: 'string' },
            smells: { type: 'string' },
            temperature: { type: 'string' },
          },
        },
        secrets: {
          type: 'array',
          items: {
            type: 'object',
            required: ['trigger', 'description'],
            properties: {
              trigger: { type: 'string' },
              description: { type: 'string' },
              reward: { type: 'string' },
            },
          },
        },
      },
    };
  }

  private getRandomDirection(): string {
    const directions = [
      'north',
      'south',
      'east',
      'west',
      'up',
      'down',
      'northeast',
      'northwest',
      'southeast',
      'southwest',
    ];
    return directions[Math.floor(Math.random() * directions.length)];
  }
}
