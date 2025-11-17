import { PromptTemplate } from '../services/prompt-template.service';

export const npcGenerationTemplate: PromptTemplate = {
  id: 'npc_generation',
  name: 'NPC Character Generator',
  description: 'Create detailed NPCs with personalities and backgrounds',
  category: 'generation',
  version: '1.0.0',
  template: `Create a detailed NPC for {{location}} in a {{game_theme}} setting.

Context:
- Location: {{location}}
- Game Theme: {{game_theme}}
- NPC Role: {{npc_role}}
- Importance Level: {{importance_level}}
- Cultural Setting: {{cultural_setting}}
- Existing NPCs: {{existing_npcs}}

Generate a complete NPC with the following JSON structure:
{
  "name": "Character's full name",
  "role": "Their function/job",
  "age": "Age or age range",
  "appearance": "Physical description",
  "personality": {
    "traits": ["list", "of", "personality", "traits"],
    "values": ["what", "they", "value"],
    "fears": ["what", "they", "fear"],
    "motivations": ["what", "drives", "them"]
  },
  "background": "Brief personal history",
  "speech_pattern": {
    "formality": "casual/formal/archaic",
    "verbosity": "terse/normal/verbose",
    "accent": "description of accent/dialect",
    "common_phrases": ["phrases", "they", "use"]
  },
  "relationships": [
    {
      "target": "other character name",
      "relationship": "ally/enemy/neutral/family",
      "description": "nature of relationship"
    }
  ],
  "secrets": ["hidden", "information", "they", "know"],
  "skills": ["abilities", "and", "talents"],
  "possessions": ["important", "items", "they", "carry"],
  "daily_routine": "what they typically do",
  "current_mood": "their present emotional state",
  "goals": ["short", "term", "objectives"]
}`,
  variables: [
    {
      name: 'location',
      type: 'string',
      required: true,
      description: 'Where the NPC is located',
    },
    {
      name: 'game_theme',
      type: 'string',
      required: true,
      description: 'Game setting/theme',
    },
    {
      name: 'npc_role',
      type: 'string',
      required: true,
      description: 'NPC function/job',
    },
    {
      name: 'importance_level',
      type: 'string',
      required: false,
      description: 'Story importance',
      defaultValue: 'minor',
    },
    {
      name: 'cultural_setting',
      type: 'string',
      required: false,
      description: 'Cultural context',
      defaultValue: 'standard fantasy',
    },
    {
      name: 'existing_npcs',
      type: 'string',
      required: false,
      description: 'Other NPCs to relate to',
      defaultValue: 'none specified',
    },
  ],
  systemPrompt:
    'You are a character creation expert. Create believable, three-dimensional NPCs with consistent personalities and clear motivations.',
  outputFormat: 'json',
};
