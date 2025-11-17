import { PromptTemplate } from '../services/prompt-template.service';

export const physicsConflictResolutionTemplate: PromptTemplate = {
  id: 'physics_conflict_resolution',
  name: 'Physics Conflict Resolver',
  description:
    'Resolve impossible physics scenarios with narrative explanations',
  category: 'conflict_resolution',
  version: '1.0.0',
  template: `A physics conflict has occurred in {{game_name}}:

Conflict Details:
- Type: {{conflict_type}}
- Affected Objects: {{affected_objects}}
- Location: {{location}}
- Description: {{conflict_description}}
- Game Rules: {{physics_rules}}

Current Situation:
{{current_situation}}

World Context:
- Theme: {{game_theme}}
- Magic System: {{magic_system}}
- Technology Level: {{tech_level}}

Provide a resolution that:
1. Maintains game world consistency
2. Provides a believable explanation
3. Offers alternative solutions if possible
4. Considers player immersion

Respond with JSON:
{
  "primary_solution": {
    "action": "specific action to take",
    "explanation": "narrative explanation for players",
    "side_effects": ["any", "consequences"],
    "reversible": true/false
  },
  "alternative_solutions": [
    {
      "action": "alternative action",
      "explanation": "alternative explanation",
      "pros": ["advantages"],
      "cons": ["disadvantages"]
    }
  ],
  "narrative_description": "Rich description of how the resolution appears in-game",
  "consistency_notes": "How this maintains world logic"
}`,
  variables: [
    {
      name: 'game_name',
      type: 'string',
      required: true,
      description: 'Name of the game',
    },
    {
      name: 'conflict_type',
      type: 'string',
      required: true,
      description: 'Type of physics conflict',
    },
    {
      name: 'affected_objects',
      type: 'string',
      required: true,
      description: 'Objects involved in conflict',
    },
    {
      name: 'location',
      type: 'string',
      required: true,
      description: 'Where conflict occurred',
    },
    {
      name: 'conflict_description',
      type: 'string',
      required: true,
      description: 'Detailed conflict description',
    },
    {
      name: 'physics_rules',
      type: 'string',
      required: true,
      description: 'Established physics rules',
    },
    {
      name: 'current_situation',
      type: 'string',
      required: true,
      description: 'Current game state',
    },
    {
      name: 'game_theme',
      type: 'string',
      required: true,
      description: 'Game world theme',
    },
    {
      name: 'magic_system',
      type: 'string',
      required: false,
      description: 'Magic system rules',
      defaultValue: 'none',
    },
    {
      name: 'tech_level',
      type: 'string',
      required: false,
      description: 'Technology level',
      defaultValue: 'medieval',
    },
  ],
  systemPrompt:
    'You are a game master expert at maintaining world consistency while resolving impossible situations. Prioritize player immersion and believable explanations.',
  outputFormat: 'json',
};
