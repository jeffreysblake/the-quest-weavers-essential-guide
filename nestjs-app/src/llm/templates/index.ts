import { PromptTemplate } from '../services/prompt-template.service';
import { roomDescriptionTemplate } from './room-description.template';
import { npcGenerationTemplate } from './npc-generation.template';
import { physicsConflictResolutionTemplate } from './physics-conflict-resolution.template';
import { npcDialogueTemplate } from './npc-dialogue.template';
import { objectGenerationTemplate } from './object-generation.template';
import { roomEnhancementTemplate } from './room-enhancement.template';
import { npcEnhancementTemplate } from './npc-enhancement.template';
import { storyGenerationTemplate } from './story-generation.template';
import { questGenerationTemplate } from './quest-generation.template';
import { plotTwistTemplate } from './plot-twist.template';
import { adaptiveNarrativeTemplate } from './adaptive-narrative.template';
import { storyValidationTemplate } from './story-validation.template';
import { storySummaryTemplate } from './story-summary.template';

/**
 * All default prompt templates
 */
export const defaultTemplates: PromptTemplate[] = [
  roomDescriptionTemplate,
  npcGenerationTemplate,
  physicsConflictResolutionTemplate,
  npcDialogueTemplate,
  objectGenerationTemplate,
  roomEnhancementTemplate,
  npcEnhancementTemplate,
  storyGenerationTemplate,
  questGenerationTemplate,
  plotTwistTemplate,
  adaptiveNarrativeTemplate,
  storyValidationTemplate,
  storySummaryTemplate,
];

// Re-export for convenience
export {
  roomDescriptionTemplate,
  npcGenerationTemplate,
  physicsConflictResolutionTemplate,
  npcDialogueTemplate,
  objectGenerationTemplate,
  roomEnhancementTemplate,
  npcEnhancementTemplate,
  storyGenerationTemplate,
  questGenerationTemplate,
  plotTwistTemplate,
  adaptiveNarrativeTemplate,
  storyValidationTemplate,
  storySummaryTemplate,
};
