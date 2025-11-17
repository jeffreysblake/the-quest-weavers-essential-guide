import { PromptTemplate } from '../services/prompt-template.service';

export const npcEnhancementTemplate: PromptTemplate = {
  id: 'npc_enhancement',
  name: 'NPC Enhancement Generator',
  description: 'Enhance existing NPCs with new attributes',
  category: 'enhancement',
  version: '1.0.0',
  template: `Enhance the existing NPC with the requested improvements.

Current NPC:
{{existingNPC}}

Enhancement Requests:
{{enhancements}}

Create enhancements that:
1. Build upon the NPC's existing personality
2. Add depth without contradicting established traits
3. Create new interaction possibilities
4. Maintain character consistency

Generate the enhanced NPC using the full NPC JSON schema.`,
  variables: [
    {
      name: 'existingNPC',
      type: 'string',
      required: true,
      description: 'Current NPC data',
    },
    {
      name: 'enhancements',
      type: 'string',
      required: true,
      description: 'Requested enhancements',
    },
  ],
  systemPrompt:
    'You are enhancing existing NPCs. Build upon their established character while adding meaningful depth.',
  outputFormat: 'json',
};
