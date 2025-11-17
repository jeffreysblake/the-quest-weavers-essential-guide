import { PromptTemplate } from '../services/prompt-template.service';

export const roomDescriptionTemplate: PromptTemplate = {
  id: 'room_description',
  name: 'Room Description Generator',
  description: 'Generate rich descriptions for rooms based on context',
  category: 'generation',
  version: '1.0.0',
  template: `Generate a vivid description for {{room_name}} in a {{game_theme}} setting.

Room Details:
- Name: {{room_name}}
- Type: {{room_type}}
- Size: {{room_size}}
- Theme: {{room_theme}}
- Objects present: {{objects_list}}
- Connected rooms: {{connected_rooms}}
- Time of day: {{time_of_day}}
- Lighting: {{lighting}}

The description should:
1. Create a vivid sensory experience (sight, sound, smell, feel)
2. Mention notable objects naturally within the description
3. Convey the room's purpose and atmosphere
4. Use {{narrative_style}} writing style
5. Be {{description_length}} in length

Write an immersive description that draws the reader into the space:`,
  variables: [
    {
      name: 'room_name',
      type: 'string',
      required: true,
      description: 'Name of the room',
    },
    {
      name: 'room_type',
      type: 'string',
      required: true,
      description: 'Type/purpose of the room',
    },
    {
      name: 'room_size',
      type: 'string',
      required: false,
      description: 'Size description',
      defaultValue: 'medium',
    },
    {
      name: 'room_theme',
      type: 'string',
      required: true,
      description: 'Room theme/style',
    },
    {
      name: 'game_theme',
      type: 'string',
      required: true,
      description: 'Overall game theme',
    },
    {
      name: 'objects_list',
      type: 'string',
      required: false,
      description: 'List of objects in room',
      defaultValue: 'various items',
    },
    {
      name: 'connected_rooms',
      type: 'string',
      required: false,
      description: 'Connected rooms',
      defaultValue: 'other areas',
    },
    {
      name: 'time_of_day',
      type: 'string',
      required: false,
      description: 'Current time',
      defaultValue: 'day',
    },
    {
      name: 'lighting',
      type: 'string',
      required: false,
      description: 'Lighting conditions',
      defaultValue: 'well-lit',
    },
    {
      name: 'narrative_style',
      type: 'string',
      required: false,
      description: 'Writing style',
      defaultValue: 'descriptive',
    },
    {
      name: 'description_length',
      type: 'string',
      required: false,
      description: 'Length preference',
      defaultValue: 'detailed',
    },
  ],
  systemPrompt:
    'You are a master storyteller creating immersive game environments. Focus on creating atmospheric descriptions that enhance player engagement.',
  outputFormat: 'text',
};
