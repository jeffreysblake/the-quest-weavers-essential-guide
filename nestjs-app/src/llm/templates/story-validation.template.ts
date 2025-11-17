import { PromptTemplate } from '../services/prompt-template.service';

export const storyValidationTemplate: PromptTemplate = {
  id: 'story_validation',
  name: 'Story Content Validator',
  description:
    'Validate generated story content for quality and consistency',
  category: 'validation',
  version: '1.0.0',
  template: `Validate the generated story content for quality, consistency, and gameplay value.

Story Details:
{{story}}

Content Statistics:
- Rooms: {{rooms}}
- NPCs: {{npcs}}
- Quests: {{quests}}
- Theme: {{theme}}
- Genre: {{genre}}
- Player Level: {{playerLevel}}

Evaluate the story for:
1. Internal consistency and logical flow
2. Appropriate balance for player level
3. Engaging content that matches theme/genre
4. Technical issues or contradictions
5. Overall narrative quality

Provide validation results with specific issues and quality assessment.`,
  variables: [
    {
      name: 'story',
      type: 'string',
      required: true,
      description: 'Story content to validate',
    },
    {
      name: 'rooms',
      type: 'string',
      required: true,
      description: 'Number of rooms',
    },
    {
      name: 'npcs',
      type: 'string',
      required: true,
      description: 'Number of NPCs',
    },
    {
      name: 'quests',
      type: 'string',
      required: true,
      description: 'Number of quests',
    },
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
      name: 'playerLevel',
      type: 'string',
      required: true,
      description: 'Target player level',
    },
  ],
  systemPrompt:
    'You are a quality assurance expert for game content. Provide thorough, actionable validation feedback.',
  outputFormat: 'json',
};
