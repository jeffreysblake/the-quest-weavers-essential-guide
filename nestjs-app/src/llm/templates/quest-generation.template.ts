import { PromptTemplate } from '../services/prompt-template.service';

export const questGenerationTemplate: PromptTemplate = {
  id: 'quest_generation',
  name: 'Dynamic Quest Generator',
  description: 'Generate quests with objectives, rewards, and dialogue',
  category: 'generation',
  version: '1.0.0',
  template: `Create a {{type}} quest with difficulty level {{difficulty}}.

Quest Parameters:
- Type: {{type}}
- Difficulty: {{difficulty}}/10
- Objectives: {{objectives}}
- NPCs Involved: {{npcsInvolved}}
- Locations: {{locationsInvolved}}
- Prerequisites: {{prerequisites}}

Create a quest that:
1. Matches the specified difficulty level
2. Has clear, achievable objectives
3. Offers appropriate rewards
4. Includes engaging dialogue
5. Fits the game world

Generate using the quest JSON schema with complete objectives, rewards, and dialogue.`,
  variables: [
    {
      name: 'type',
      type: 'string',
      required: true,
      description: 'Quest type',
    },
    {
      name: 'difficulty',
      type: 'string',
      required: true,
      description: 'Difficulty level',
    },
    {
      name: 'objectives',
      type: 'string',
      required: true,
      description: 'Quest objectives',
    },
    {
      name: 'npcsInvolved',
      type: 'string',
      required: false,
      description: 'NPCs involved',
      defaultValue: 'none',
    },
    {
      name: 'locationsInvolved',
      type: 'string',
      required: false,
      description: 'Locations involved',
      defaultValue: 'current area',
    },
    {
      name: 'prerequisites',
      type: 'string',
      required: false,
      description: 'Prerequisites',
      defaultValue: 'none',
    },
  ],
  systemPrompt:
    'You are designing engaging quests. Create clear objectives, fair rewards, and interesting challenges that enhance gameplay.',
  outputFormat: 'json',
};
