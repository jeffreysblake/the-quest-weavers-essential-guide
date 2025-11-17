import { PromptTemplate } from '../services/prompt-template.service';

export const objectGenerationTemplate: PromptTemplate = {
  id: 'object_generation',
  name: 'Dynamic Object Generator',
  description: 'Create objects that fit the game world and current context',
  category: 'generation',
  version: '1.0.0',
  template: `Create a new object for {{location}} in {{game_theme}} setting.

Context:
- Location: {{location}}
- Game Theme: {{game_theme}}
- Object Purpose: {{object_purpose}}
- Material Constraints: {{available_materials}}
- Cultural Setting: {{cultural_setting}}
- Technology Level: {{tech_level}}
- Existing Objects: {{existing_objects}}
- Player Level: {{player_level}}

Requirements:
- Must fit the location's purpose and theme
- Should be interesting but not overpowered
- Must respect world consistency
- Should enhance gameplay or narrative

Generate object with JSON structure:
{
  "name": "Object name",
  "description": "Detailed description for examination",
  "brief_description": "Short description for room listings",
  "type": "object category (weapon/tool/decoration/etc)",
  "material": "primary material",
  "weight": "weight in appropriate units",
  "size": {
    "width": "width",
    "height": "height",
    "depth": "depth"
  },
  "properties": {
    "is_portable": true/false,
    "is_container": true/false,
    "can_contain": true/false,
    "container_capacity": "if container",
    "durability": "condition/health",
    "value": "estimated worth",
    "magical": true/false,
    "interactive": true/false
  },
  "functionality": {
    "primary_use": "main purpose",
    "secondary_uses": ["other", "possible", "uses"],
    "special_abilities": ["any", "special", "features"],
    "requirements": ["requirements", "to", "use"]
  },
  "backstory": "History or origin of the object",
  "cultural_significance": "Cultural importance if any",
  "craftsmanship": "Quality and style of creation",
  "markings": "Any inscriptions, symbols, or identifying marks",
  "condition": "Current state/wear",
  "location_placement": "Suggested placement within the location"
}`,
  variables: [
    {
      name: 'location',
      type: 'string',
      required: true,
      description: 'Where object will be placed',
    },
    {
      name: 'game_theme',
      type: 'string',
      required: true,
      description: 'Overall game theme',
    },
    {
      name: 'object_purpose',
      type: 'string',
      required: true,
      description: 'Why object is needed',
    },
    {
      name: 'available_materials',
      type: 'string',
      required: false,
      description: 'Available materials',
      defaultValue: 'common materials',
    },
    {
      name: 'cultural_setting',
      type: 'string',
      required: false,
      description: 'Cultural context',
      defaultValue: 'standard fantasy',
    },
    {
      name: 'tech_level',
      type: 'string',
      required: false,
      description: 'Technology level',
      defaultValue: 'medieval',
    },
    {
      name: 'existing_objects',
      type: 'string',
      required: false,
      description: 'Objects already present',
      defaultValue: 'none specified',
    },
    {
      name: 'player_level',
      type: 'string',
      required: false,
      description: 'Player progression level',
      defaultValue: 'beginner',
    },
  ],
  systemPrompt:
    'You are a creative game designer who creates objects that enhance both gameplay and storytelling. Every object should feel like it belongs in the world.',
  outputFormat: 'json',
};
