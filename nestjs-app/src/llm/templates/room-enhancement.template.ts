import { PromptTemplate } from '../services/prompt-template.service';

export const roomEnhancementTemplate: PromptTemplate = {
  id: 'room_enhancement',
  name: 'Room Enhancement Generator',
  description: 'Enhance existing rooms with new elements',
  category: 'enhancement',
  version: '1.0.0',
  template: `Enhance the existing room with the requested improvements.

Current Room:
{{existingRoom}}

Enhancement Requests:
{{enhancements}}

Current Objects:
{{currentObjects}}

Create enhancements that:
1. Complement the existing room design
2. Add meaningful gameplay elements
3. Maintain thematic consistency
4. Enhance the room's atmosphere

Generate the enhancements using the room content JSON schema, focusing only on the new additions.`,
  variables: [
    {
      name: 'existingRoom',
      type: 'string',
      required: true,
      description: 'Current room data',
    },
    {
      name: 'enhancements',
      type: 'string',
      required: true,
      description: 'Requested enhancements',
    },
    {
      name: 'currentObjects',
      type: 'string',
      required: false,
      description: 'Current objects',
      defaultValue: 'none',
    },
  ],
  systemPrompt:
    'You are enhancing existing game content. Maintain consistency while adding meaningful improvements.',
  outputFormat: 'json',
};
