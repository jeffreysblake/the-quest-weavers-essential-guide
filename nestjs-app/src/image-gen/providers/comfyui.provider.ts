import { Injectable, Logger } from '@nestjs/common';
import { ImageGenProvider, ImageGenOptions, ImageGenResult } from '../interfaces/image-gen.interface';
import axios from 'axios';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * ComfyUI Provider - Connects to ComfyUI server for image generation
 * Supports SDXL, SD3, and Flux models via workflow JSON files
 */
@Injectable()
export class ComfyUIProvider implements ImageGenProvider {
  private readonly logger = new Logger(ComfyUIProvider.name);
  readonly name = 'comfyui';
  readonly supportedModels: string[] = ['sdxl', 'sd3', 'flux-schnell'];
  readonly defaultModel = 'sdxl';

  private apiHost: string;
  private timeout: number;
  private workflowsPath: string;

  constructor() {
    this.apiHost = process.env.COMFYUI_HOST || 'localhost:8188';
    this.timeout = parseInt(process.env.COMFYUI_TIMEOUT || '120000');
    this.workflowsPath = path.join(process.cwd(), 'workflows');
  }

  async generateImage(options: ImageGenOptions): Promise<ImageGenResult> {
    const {
      prompt,
      negativePrompt = '',
      width = 1024,
      height = 1024,
      steps = 20,
      cfgScale = 7.5,
      seed = Math.floor(Math.random() * 4294967295),
      sampler = 'dpmpp_2m',
    } = options;

    this.logger.log(`Generating image with ComfyUI: ${prompt.substring(0, 50)}...`);

    const startTime = Date.now();

    try {
      // Load workflow template
      const workflow = await this.loadWorkflow('sdxl');

      // Update workflow with parameters
      this.updateWorkflowParams(workflow, {
        prompt,
        negativePrompt,
        width,
        height,
        steps,
        cfgScale,
        seed,
        sampler,
      });

      // Submit to ComfyUI and wait for completion
      const result = await this.submitWorkflow(workflow);

      const generationTime = Date.now() - startTime;

      this.logger.log(`Image generated in ${generationTime}ms`);

      return {
        imagePath: result.imagePath,
        imageUrl: result.imageUrl,
        prompt,
        seed,
        width,
        height,
        steps,
        model: 'sdxl',
        generationTime,
      };
    } catch (error) {
      this.logger.error(`Image generation failed: ${error.message}`);
      throw error;
    }
  }

  private async loadWorkflow(modelName: string): Promise<any> {
    try {
      const workflowFile = path.join(this.workflowsPath, `${modelName}.json`);
      const workflowData = await fs.readFile(workflowFile, 'utf-8');
      return JSON.parse(workflowData);
    } catch (error) {
      this.logger.error(`Failed to load workflow for ${modelName}: ${error.message}`);
      // Return a basic SDXL workflow as fallback
      return this.getDefaultSDXLWorkflow();
    }
  }

  private updateWorkflowParams(workflow: any, params: any): void {
    // Update workflow nodes with generation parameters
    // This depends on your specific ComfyUI workflow structure
    // Below is a generic approach that works with standard SDXL workflows

    for (const nodeId in workflow) {
      const node = workflow[nodeId];

      // Update text prompts
      if (node.class_type === 'CLIPTextEncode') {
        if (node.inputs?.text === 'POSITIVE_PROMPT') {
          node.inputs.text = params.prompt;
        } else if (node.inputs?.text === 'NEGATIVE_PROMPT') {
          node.inputs.text = params.negativePrompt || '';
        }
      }

      // Update KSampler
      if (node.class_type === 'KSampler') {
        if (node.inputs) {
          node.inputs.seed = params.seed;
          node.inputs.steps = params.steps;
          node.inputs.cfg = params.cfgScale;
          node.inputs.sampler_name = params.sampler;
        }
      }

      // Update Empty Latent Image (resolution)
      if (node.class_type === 'EmptyLatentImage') {
        if (node.inputs) {
          node.inputs.width = params.width;
          node.inputs.height = params.height;
        }
      }
    }
  }

  private async submitWorkflow(workflow: any): Promise<{ imagePath: string; imageUrl?: string }> {
    try {
      // Queue the prompt
      const queueResponse = await axios.post(
        `http://${this.apiHost}/prompt`,
        { prompt: workflow },
        { timeout: this.timeout }
      );

      const promptId = queueResponse.data.prompt_id;

      this.logger.log(`Workflow queued with ID: ${promptId}`);

      // Poll for completion
      const result = await this.pollForCompletion(promptId);

      return result;
    } catch (error) {
      this.logger.error(`Failed to submit workflow: ${error.message}`);
      throw error;
    }
  }

  private async pollForCompletion(promptId: string, maxAttempts = 60): Promise<{ imagePath: string; imageUrl?: string }> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const historyResponse = await axios.get(`http://${this.apiHost}/history/${promptId}`);
        const history = historyResponse.data[promptId];

        if (history && history.status?.completed) {
          // Extract output images
          const outputs = history.outputs;
          for (const nodeId in outputs) {
            const output = outputs[nodeId];
            if (output.images && output.images.length > 0) {
              const image = output.images[0];
              const imagePath = `/output/${image.filename}`;
              const imageUrl = `http://${this.apiHost}/view?filename=${encodeURIComponent(image.filename)}&type=output`;

              return { imagePath, imageUrl };
            }
          }
        }

        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        this.logger.warn(`Polling attempt ${attempt + 1} failed: ${error.message}`);
      }
    }

    throw new Error('Image generation timed out');
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await axios.get(`http://${this.apiHost}/system_stats`, { timeout: 5000 });
      return response.status === 200;
    } catch {
      return false;
    }
  }

  getVRAMUsage(): number {
    // Estimate for SDXL FP8
    return 5120; // ~5GB
  }

  private getDefaultSDXLWorkflow(): any {
    // Basic SDXL workflow structure
    return {
      "3": {
        "inputs": {
          "seed": 0,
          "steps": 20,
          "cfg": 7.5,
          "sampler_name": "dpmpp_2m",
          "scheduler": "karras",
          "denoise": 1,
          "model": ["4", 0],
          "positive": ["6", 0],
          "negative": ["7", 0],
          "latent_image": ["5", 0]
        },
        "class_type": "KSampler"
      },
      "4": {
        "inputs": {
          "ckpt_name": "sd_xl_base_1.0.safetensors"
        },
        "class_type": "CheckpointLoaderSimple"
      },
      "5": {
        "inputs": {
          "width": 1024,
          "height": 1024,
          "batch_size": 1
        },
        "class_type": "EmptyLatentImage"
      },
      "6": {
        "inputs": {
          "text": "POSITIVE_PROMPT",
          "clip": ["4", 1]
        },
        "class_type": "CLIPTextEncode"
      },
      "7": {
        "inputs": {
          "text": "NEGATIVE_PROMPT",
          "clip": ["4", 1]
        },
        "class_type": "CLIPTextEncode"
      },
      "8": {
        "inputs": {
          "samples": ["3", 0],
          "vae": ["4", 2]
        },
        "class_type": "VAEDecode"
      },
      "9": {
        "inputs": {
          "filename_prefix": "ComfyUI",
          "images": ["8", 0]
        },
        "class_type": "SaveImage"
      }
    };
  }
}
