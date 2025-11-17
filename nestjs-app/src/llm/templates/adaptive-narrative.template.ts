import { PromptTemplate } from '../services/prompt-template.service';

export const adaptiveNarrativeTemplate: PromptTemplate = {
  id: 'adaptive_narrative',
  name: 'Adaptive Narrative Generator',
  description: 'Generate narrative responses to player actions',
  category: 'generation',
  version: '1.0.0',
  template: `Generate a narrative response to the player's actions and adapt the story accordingly.

Player Actions:
{{playerActions}}

Current Game State:
{{gameState}}

Story Context:
{{storyContext}}

Create a response that:
1. Acknowledges the player's choices
2. Shows meaningful consequences
3. Advances the narrative
4. Introduces new elements as needed
5. Maintains story momentum

The response should feel reactive and personalized to the player's actions.`,
  variables: [
    {
      name: 'playerActions',
      type: 'string',
      required: true,
      description: 'Recent player actions',
    },
    {
      name: 'gameState',
      type: 'string',
      required: true,
      description: 'Current game state',
    },
    {
      name: 'storyContext',
      type: 'string',
      required: true,
      description: 'Story context',
    },
  ],
  systemPrompt:
    'You are adapting the story in real-time based on player choices. Create responsive, engaging narrative that feels personal.',
  outputFormat: 'json',
};
