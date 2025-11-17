import { PromptTemplate } from '../services/prompt-template.service';

export const npcDialogueTemplate: PromptTemplate = {
  id: 'npc_dialogue',
  name: 'NPC Dialogue Generator',
  description: 'Generate contextual dialogue for NPCs',
  category: 'generation',
  version: '1.0.0',
  template: `Generate dialogue for {{npc_name}} in the current situation.

NPC Details:
- Name: {{npc_name}}
- Role: {{npc_role}}
- Personality: {{personality_traits}}
- Current Mood: {{current_mood}}
- Speech Pattern: {{speech_pattern}}
- Relationship to Player: {{player_relationship}}

Situation:
- Context: {{dialogue_context}}
- Player Action: {{player_action}}
- Location: {{location}}
- Recent Events: {{recent_events}}
- NPC's Goals: {{npc_goals}}

Conversation History:
{{conversation_history}}

Generate appropriate dialogue that:
1. Reflects the NPC's personality and speech patterns
2. Responds appropriately to the situation
3. Advances the interaction meaningfully
4. Maintains character consistency
5. Fits the {{dialogue_tone}} tone

Response format:
{
  "dialogue": "The actual words the NPC speaks",
  "internal_thoughts": "What the NPC is thinking (not spoken)",
  "body_language": "Non-verbal communication/actions",
  "mood_change": "any change in emotional state",
  "hidden_agenda": "any secret motivations affecting the response",
  "relationship_impact": "how this might affect the relationship",
  "follow_up_options": ["possible", "conversation", "directions"]
}`,
  variables: [
    {
      name: 'npc_name',
      type: 'string',
      required: true,
      description: 'NPC name',
    },
    {
      name: 'npc_role',
      type: 'string',
      required: true,
      description: 'NPC role/job',
    },
    {
      name: 'personality_traits',
      type: 'string',
      required: true,
      description: 'Key personality traits',
    },
    {
      name: 'current_mood',
      type: 'string',
      required: true,
      description: 'Current emotional state',
    },
    {
      name: 'speech_pattern',
      type: 'string',
      required: true,
      description: 'How they speak',
    },
    {
      name: 'player_relationship',
      type: 'string',
      required: true,
      description: 'Relationship to player',
    },
    {
      name: 'dialogue_context',
      type: 'string',
      required: true,
      description: 'Current situation context',
    },
    {
      name: 'player_action',
      type: 'string',
      required: false,
      description: 'What player just did',
      defaultValue: 'approached',
    },
    {
      name: 'location',
      type: 'string',
      required: true,
      description: 'Current location',
    },
    {
      name: 'recent_events',
      type: 'string',
      required: false,
      description: 'Recent significant events',
      defaultValue: 'nothing notable',
    },
    {
      name: 'npc_goals',
      type: 'string',
      required: false,
      description: 'NPC current objectives',
      defaultValue: 'daily routine',
    },
    {
      name: 'conversation_history',
      type: 'string',
      required: false,
      description: 'Previous conversation',
      defaultValue: 'first meeting',
    },
    {
      name: 'dialogue_tone',
      type: 'string',
      required: false,
      description: 'Desired tone',
      defaultValue: 'natural',
    },
  ],
  systemPrompt:
    'You are an expert at creating believable NPC dialogue. Make each character feel unique and authentic while advancing the story.',
  outputFormat: 'json',
};
