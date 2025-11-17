import { PromptTemplate } from '../services/prompt-template.service';

export const storySummaryTemplate: PromptTemplate = {
  id: 'story_summary',
  name: 'Story Summary Generator',
  description: 'Generate summary of completed story creation',
  category: 'generation',
  version: '1.0.0',
  template: `Generate a compelling summary of the completed story creation.

Story Details:
- Theme: {{theme}}
- Genre: {{genre}}
- Rooms Created: {{roomCount}}
- NPCs Created: {{npcCount}}
- Quests Created: {{questCount}}

Create a summary that:
1. Highlights the key story elements
2. Describes the world that was created
3. Mentions notable characters and locations
4. Explains the types of adventures players can expect
5. Conveys the overall tone and atmosphere

Write an engaging summary that would excite players to explore this story.`,
  variables: [
    {
      name: 'theme',
      type: 'string',
      required: true,
      description: 'Story theme',
    },
    {
      name: 'genre',
      type: 'string',
      required: true,
      description: 'Story genre',
    },
    {
      name: 'roomCount',
      type: 'string',
      required: true,
      description: 'Number of rooms created',
    },
    {
      name: 'npcCount',
      type: 'string',
      required: true,
      description: 'Number of NPCs created',
    },
    {
      name: 'questCount',
      type: 'string',
      required: true,
      description: 'Number of quests created',
    },
  ],
  systemPrompt:
    'You are a marketing copywriter who creates compelling game content descriptions that excite and engage players.',
  outputFormat: 'text',
};
