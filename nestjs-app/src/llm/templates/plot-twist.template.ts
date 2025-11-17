import { PromptTemplate } from '../services/prompt-template.service';

export const plotTwistTemplate: PromptTemplate = {
  id: 'plot_twist',
  name: 'Dynamic Plot Twist Generator',
  description: 'Generate plot twists based on current story state',
  category: 'generation',
  version: '1.0.0',
  template: `Generate a compelling plot twist for the current story situation.

Current Story State:
{{currentState}}

Story Progress: {{storyProgress}}

Create a plot twist that:
1. Surprises but makes sense in hindsight
2. Recontextualizes previous events
3. Opens new narrative possibilities
4. Maintains story coherence
5. Creates dramatic tension

The twist should be impactful but not story-breaking.`,
  variables: [
    {
      name: 'currentState',
      type: 'string',
      required: true,
      description: 'Current story situation',
    },
    {
      name: 'storyProgress',
      type: 'string',
      required: false,
      description: 'Story completion percentage',
      defaultValue: '50%',
    },
  ],
  systemPrompt:
    'You are a master of dramatic storytelling. Create plot twists that surprise and delight while maintaining narrative integrity.',
  outputFormat: 'json',
};
