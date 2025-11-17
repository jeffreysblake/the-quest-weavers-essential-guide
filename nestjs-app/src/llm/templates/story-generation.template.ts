import { PromptTemplate } from '../services/prompt-template.service';

export const storyGenerationTemplate: PromptTemplate = {
  id: 'story_generation',
  name: 'Comprehensive Story Generator',
  description:
    'Generate complete story structures with acts, characters, and quests',
  category: 'generation',
  version: '1.0.0',
  template: `Create a comprehensive {{genre}} story with the theme "{{theme}}".

Story Parameters:
- Genre: {{genre}}
- Theme: {{theme}}
- Target Length: {{targetLength}}
- Player Level: {{playerLevel}}
- Key Elements: {{keyElements}}
- Conflicts: {{conflicts}}
- Desired Outcome: {{desiredOutcome}}

Constraints:
- Maximum {{maxRooms}} locations
- Maximum {{maxNPCs}} characters
- Story should be appropriate for player level {{playerLevel}}

Create a complete story structure with:
1. Compelling title and synopsis
2. 3-5 story acts with clear progression
3. Memorable characters with distinct roles
4. Diverse locations that serve the narrative
5. Engaging plot hooks and quest lines
6. Appropriate difficulty scaling

Generate using the story JSON schema.`,
  variables: [
    {
      name: 'genre',
      type: 'string',
      required: true,
      description: 'Story genre',
    },
    {
      name: 'theme',
      type: 'string',
      required: true,
      description: 'Story theme',
    },
    {
      name: 'targetLength',
      type: 'string',
      required: true,
      description: 'Story length',
    },
    {
      name: 'playerLevel',
      type: 'string',
      required: true,
      description: 'Player level',
    },
    {
      name: 'keyElements',
      type: 'string',
      required: false,
      description: 'Key story elements',
      defaultValue: 'adventure',
    },
    {
      name: 'conflicts',
      type: 'string',
      required: false,
      description: 'Story conflicts',
      defaultValue: 'challenges',
    },
    {
      name: 'desiredOutcome',
      type: 'string',
      required: false,
      description: 'Story outcome',
      defaultValue: 'open',
    },
    {
      name: 'maxRooms',
      type: 'string',
      required: true,
      description: 'Maximum locations',
    },
    {
      name: 'maxNPCs',
      type: 'string',
      required: true,
      description: 'Maximum characters',
    },
  ],
  systemPrompt:
    'You are a master storyteller creating engaging narrative adventures. Focus on compelling characters, interesting conflicts, and meaningful choices.',
  outputFormat: 'json',
};
