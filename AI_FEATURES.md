# 🤖 AI Features Guide

This document provides comprehensive information about the AI capabilities integrated into The Quest Weaver's Essential Guide.

## 📋 Table of Contents

- [Overview](#overview)
- [Text-to-Speech (TTS)](#text-to-speech-tts)
- [Speech-to-Text (STT)](#speech-to-text-stt)
- [Image Generation](#image-generation)
- [VRAM Management](#vram-management)
- [Setup & Configuration](#setup--configuration)
- [API Reference](#api-reference)

---

## Overview

The Quest Weaver's Essential Guide now includes three powerful AI modules running locally within a 24GB VRAM budget:

| Module | Technology | VRAM Usage | Purpose |
|--------|-----------|------------|---------|
| **LLM** | 7B Model (Q4_K_M) | 5GB | Story generation, NPC dialogue |
| **STT** | Whisper Small | 2GB | Voice commands, narration input |
| **TTS** | Kokoro (GPU) | 0.5-1GB | Character voices, narration |
| **Image Gen** | SDXL FP8 | 5GB | Scene visualization, artwork |
| **Buffer** | - | 11.5GB | Dynamic allocation |

**Total Budget:** 24GB VRAM ✅

---

## Text-to-Speech (TTS)

### 🎤 Overview

Generate natural-sounding speech from text with multiple voice options and GPU acceleration.

### Features

- **3 Provider Options:**
  1. **Kokoro TTS** (Native Node.js) - Recommended
  2. **Python TTS** (Coqui, Piper, Bark)
  3. **HTTP TTS** (External services)

- **GPU Acceleration:** Optional WebGPU/CUDA support
- **9 High-Quality Voices:**
  - American: Bella, Sarah, Nicole (Female); Adam, Michael (Male)
  - British: Emma, Isabella (Female); George, Lewis (Male)
- **Streaming Support:** Sentence-by-sentence generation
- **Multiple Formats:** MP3, WAV, Opus

### Kokoro TTS (Recommended)

**Advantages:**
- Native Node.js (no Python needed)
- 82M parameters, Apache 2.0 license
- 35-100x realtime speed on GPU
- Only 200-500MB VRAM

**Configuration:**
```env
TTS_KOKORO_ENABLED=true
TTS_KOKORO_GPU=false          # Set to true for GPU acceleration
TTS_KOKORO_MODEL_SIZE=q8      # q8 (200MB), q4 (100MB), fp16 (164MB)
TTS_DEFAULT_VOICE=af_bella
TTS_SPEED=1.0
```

**Installation:**
```bash
cd nestjs-app
npm install kokoro-js --legacy-peer-deps
```

### API Endpoints

#### GET `/api/tts/status`
Check TTS service health and statistics.

**Response:**
```json
{
  "status": "available",
  "initialized": true,
  "primaryProvider": "kokoro",
  "availableProviders": 1,
  "totalVoices": 9
}
```

#### GET `/api/tts/voices`
List all available voices.

**Response:**
```json
{
  "voices": [
    { "voice": "af_bella", "provider": "kokoro" },
    { "voice": "am_adam", "provider": "kokoro" }
  ]
}
```

#### POST `/api/tts/generate`
Generate speech (streaming audio response).

**Request:**
```json
{
  "text": "Welcome to the adventure!",
  "voice": "af_bella",
  "speed": 1.0,
  "language": "en"
}
```

**Response:** Audio file stream (MP3/WAV)

#### POST `/api/tts/synthesize`
Generate speech (base64 JSON response).

**Request:**
```json
{
  "text": "The dragon roars!",
  "voice": "am_adam",
  "speed": 1.2
}
```

**Response:**
```json
{
  "audio": "base64_encoded_audio_data...",
  "format": "wav",
  "voice": "am_adam",
  "size": 245678
}
```

### Example Usage

```typescript
// Generate speech for narration
const response = await fetch('http://localhost:3000/api/tts/generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    text: 'You enter a dark cave. Water drips from stalactites above.',
    voice: 'bf_emma',
    speed: 0.9
  })
});

const audioBlob = await response.blob();
const audio = new Audio(URL.createObjectURL(audioBlob));
audio.play();
```

---

## Speech-to-Text (STT)

### 🎧 Overview

Transcribe audio to text using OpenAI Whisper models running locally.

### Features

- **2 Provider Options:**
  1. **Python Whisper** - Local transcription
  2. **HTTP Whisper** - whisper.cpp server

- **Multiple Models:**
  - tiny/base (~1GB VRAM) - Fast, basic accuracy
  - **small (~2GB VRAM)** - Recommended balance
  - medium (~5GB VRAM) - High accuracy
  - large-v2/v3 (~10GB VRAM) - Maximum accuracy

- **99 Languages Supported**
- **Word-Level Timestamps** (optional)
- **Segment-Level Transcription**

### Configuration

```env
STT_ENABLED=true
STT_MODEL=base.en          # tiny, base, small, medium, large-v2, large-v3
STT_LANGUAGE=en
STT_PYTHON_ENABLED=true
```

### API Endpoints

#### GET `/api/stt/status`
Check STT service health.

#### GET `/api/stt/models`
List available models with VRAM requirements.

**Response:**
```json
{
  "models": [
    { "model": "tiny", "provider": "python-whisper", "vramUsage": 1024 },
    { "model": "small", "provider": "python-whisper", "vramUsage": 2048 }
  ]
}
```

#### POST `/api/stt/transcribe`
Transcribe audio file (multipart/form-data).

**Request:**
```typescript
const formData = new FormData();
formData.append('audio', audioFile);
formData.append('language', 'en');
formData.append('model', 'small');
formData.append('wordTimestamps', 'true');

const response = await fetch('http://localhost:3000/api/stt/transcribe', {
  method: 'POST',
  body: formData
});
```

**Response:**
```json
{
  "success": true,
  "transcription": "Hello, this is a test recording.",
  "language": "en",
  "languageProbability": 0.98,
  "duration": 3.5,
  "segments": [
    {
      "text": "Hello, this is a test recording.",
      "start": 0.0,
      "end": 3.5,
      "words": [
        { "word": "Hello", "start": 0.0, "end": 0.5, "probability": 0.99 }
      ]
    }
  ]
}
```

#### POST `/api/stt/transcribe-base64`
Transcribe base64-encoded audio.

**Request:**
```json
{
  "audio": "base64_audio_data...",
  "dto": {
    "language": "en",
    "model": "small",
    "wordTimestamps": true
  }
}
```

### Example Usage

```typescript
// Voice command transcription
navigator.mediaDevices.getUserMedia({ audio: true })
  .then(stream => {
    const mediaRecorder = new MediaRecorder(stream);
    const chunks = [];

    mediaRecorder.ondataavailable = (e) => chunks.push(e.data);

    mediaRecorder.onstop = async () => {
      const audioBlob = new Blob(chunks, { type: 'audio/wav' });
      const formData = new FormData();
      formData.append('audio', audioBlob);
      formData.append('model', 'small');

      const response = await fetch('http://localhost:3000/api/stt/transcribe', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();
      console.log('Transcription:', result.transcription);
    };

    mediaRecorder.start();
    setTimeout(() => mediaRecorder.stop(), 5000); // 5 seconds
  });
```

---

## Image Generation

### 🎨 Overview

Generate images from text prompts using Stable Diffusion XL (SDXL) FP8 via ComfyUI.

### Features

- **Queue-Based Processing:** Prevents VRAM overload
- **Multiple Models:** SDXL, SD3, FLUX-schnell
- **Job Tracking:** Real-time progress updates
- **Priority Queue:** Higher priority jobs processed first
- **Auto-Retry:** Failed jobs automatically retry with backoff

### Configuration

```env
IMAGE_GEN_ENABLED=true
COMFYUI_HOST=localhost:8188
COMFYUI_TIMEOUT=120000
IMAGE_GEN_MODEL=sdxl
IMAGE_GEN_DEFAULT_WIDTH=1024
IMAGE_GEN_DEFAULT_HEIGHT=1024
IMAGE_GEN_DEFAULT_STEPS=20
IMAGE_GEN_DEFAULT_CFG=7.5
REDIS_HOST=localhost
REDIS_PORT=6379
```

### Setup ComfyUI

1. **Install ComfyUI:**
```bash
git clone https://github.com/comfyanonymous/ComfyUI
cd ComfyUI
pip install -r requirements.txt
```

2. **Download SDXL Model:**
```bash
cd models/checkpoints
wget https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/resolve/main/sd_xl_base_1.0.safetensors
```

3. **Start ComfyUI Server:**
```bash
python main.py --listen 0.0.0.0 --port 8188
```

4. **Start Redis:**
```bash
# Linux
sudo apt-get install redis-server
redis-server

# macOS
brew install redis
brew services start redis
```

### API Endpoints

#### GET `/api/image-gen/status`
Check image generation service health.

#### GET `/api/image-gen/metrics`
Get queue metrics.

**Response:**
```json
{
  "available": true,
  "waiting": 2,
  "active": 1,
  "completed": 45,
  "failed": 1,
  "delayed": 0,
  "total": 3
}
```

#### POST `/api/image-gen/generate`
Queue image generation.

**Request:**
```json
{
  "prompt": "A majestic dragon perched on a mountain peak at sunset, fantasy art, highly detailed",
  "negativePrompt": "blurry, low quality, distorted",
  "width": 1024,
  "height": 1024,
  "steps": 30,
  "cfgScale": 7.5,
  "seed": 42,
  "sampler": "dpmpp_2m",
  "model": "sdxl",
  "priority": 5
}
```

**Response:**
```json
{
  "success": true,
  "jobId": "img-user123-1699123456789",
  "status": "queued",
  "message": "Image generation queued successfully",
  "estimatedTime": "1-2 minutes"
}
```

#### GET `/api/image-gen/job/:jobId`
Get job status and progress.

**Response:**
```json
{
  "success": true,
  "id": "img-user123-1699123456789",
  "status": "completed",
  "progress": 100,
  "result": {
    "imagePath": "/output/ComfyUI_00001.png",
    "imageUrl": "http://localhost:8188/view?filename=ComfyUI_00001.png",
    "prompt": "A majestic dragon...",
    "seed": 42,
    "generationTime": 45000
  }
}
```

#### DELETE `/api/image-gen/job/:jobId`
Cancel a queued or active job.

#### POST `/api/image-gen/job/:jobId/retry`
Retry a failed job.

### Example Usage

```typescript
// Generate scene artwork
async function generateSceneImage(sceneDescription: string) {
  // Queue the generation
  const queueResponse = await fetch('http://localhost:3000/api/image-gen/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: sceneDescription,
      negativePrompt: 'blurry, low quality',
      width: 1024,
      height: 768,
      steps: 25,
      cfgScale: 7.5,
      model: 'sdxl',
      priority: 5
    })
  });

  const { jobId } = await queueResponse.json();

  // Poll for completion
  while (true) {
    const statusResponse = await fetch(`http://localhost:3000/api/image-gen/job/${jobId}`);
    const status = await statusResponse.json();

    if (status.status === 'completed') {
      console.log('Image URL:', status.result.imageUrl);
      return status.result;
    } else if (status.status === 'failed') {
      throw new Error(`Generation failed: ${status.failedReason}`);
    }

    await new Promise(resolve => setTimeout(resolve, 2000)); // Poll every 2s
  }
}
```

---

## VRAM Management

### 🎮 Overview

Intelligent VRAM allocation and management to run all AI features within a 24GB budget.

### Features

- **Dynamic Model Loading/Unloading**
- **LRU (Least Recently Used) Eviction**
- **Auto-Unload Idle Models** (5min timeout)
- **Real-Time VRAM Monitoring**
- **Baseline Tracking** (LLM + STT always loaded)

### VRAM Budget Allocation

```
Total VRAM: 24GB
├── Baseline (Always Loaded): 7GB
│   ├── 7B LLM (Q4_K_M): 5GB
│   ├── Whisper Small: 2GB
│   └── TTS (CPU offloaded): 0GB
│
├── Dynamic (On-Demand): 5GB
│   └── SDXL FP8: 5GB (loaded when generating)
│
└── Buffer: 12GB
    └── Available for future features
```

### Configuration

```env
VRAM_LIMIT=24576          # 24GB in MB
```

### API Integration

The VRAM Manager automatically:
1. **Tracks** all loaded models
2. **Unloads** idle models after 5 minutes
3. **Evicts** LRU models when VRAM is needed
4. **Prevents** VRAM overflow

### Monitoring

```typescript
// Check VRAM status
const vramStatus = vramManagerService.getVRAMStatus();

console.log(`
  Total VRAM: ${vramStatus.total}MB
  Used: ${vramStatus.used}MB
  Available: ${vramStatus.available}MB
  Baseline: ${vramStatus.baseline}MB
  Loaded Models: ${vramStatus.models.length}
`);
```

---

## Setup & Configuration

### Prerequisites

- **Node.js** 18+ and npm
- **Redis** (for image generation queue)
- **Python** 3.8+ (optional, for Python-based TTS/STT)
- **ComfyUI** (for image generation)
- **NVIDIA GPU** with 24GB VRAM (recommended)

### Installation

1. **Install Dependencies:**
```bash
cd nestjs-app
npm install --legacy-peer-deps
```

2. **Install Optional AI Packages:**
```bash
# Kokoro TTS (native Node.js)
npm install kokoro-js --legacy-peer-deps

# For Python-based providers, install separately:
# pip install openai-whisper faster-whisper coqui-tts
```

3. **Configure Environment:**
```bash
cp .env.example .env
# Edit .env with your settings
```

4. **Start Redis:**
```bash
# Linux
sudo service redis-server start

# macOS
brew services start redis

# Docker
docker run -d -p 6379:6379 redis:alpine
```

5. **Start ComfyUI:**
```bash
cd path/to/ComfyUI
python main.py --listen 0.0.0.0 --port 8188
```

6. **Start the Application:**
```bash
cd nestjs-app
npm run start:dev
```

### Environment Variables

See `.env.example` for a complete list of configuration options.

**Key Variables:**
```env
# TTS
TTS_KOKORO_ENABLED=true
TTS_KOKORO_GPU=false
TTS_DEFAULT_VOICE=af_bella

# STT
STT_ENABLED=true
STT_MODEL=small
STT_LANGUAGE=en

# Image Generation
IMAGE_GEN_ENABLED=true
COMFYUI_HOST=localhost:8188
REDIS_HOST=localhost
REDIS_PORT=6379

# VRAM
VRAM_LIMIT=24576
```

---

## API Reference

### Base URL

```
http://localhost:3000/api
```

### Authentication

Currently, all AI endpoints are unauthenticated. For production, implement JWT or API key authentication.

### Rate Limiting

Default rate limits (configure in .env):
- 10 requests per minute per IP
- Burst of 20 requests allowed

### Error Handling

All APIs return standard error responses:

```json
{
  "statusCode": 500,
  "message": "Error message here",
  "error": "Internal Server Error"
}
```

### Health Checks

```bash
# TTS Health
curl http://localhost:3000/api/tts/status

# STT Health
curl http://localhost:3000/api/stt/status

# Image Gen Health
curl http://localhost:3000/api/image-gen/status
```

---

## Performance Tips

1. **Use Smaller Models for Development:**
   - Whisper `tiny` instead of `small` for testing
   - Kokoro `q4` instead of `q8` for faster loading

2. **Enable GPU Acceleration:**
   - Set `TTS_KOKORO_GPU=true` for 2-4x speed improvement
   - Use CUDA-enabled Whisper for faster transcription

3. **Optimize Image Generation:**
   - Lower steps (15-20) for drafts
   - Use priority queues for important requests
   - Batch similar generations

4. **Monitor VRAM:**
   - Check VRAM status regularly
   - Unload unused models manually if needed
   - Adjust `VRAM_LIMIT` based on your GPU

---

## Troubleshooting

### TTS Not Working

**Problem:** "Kokoro TTS provider is not available"

**Solution:**
```bash
npm install kokoro-js --legacy-peer-deps
npm run build
```

### STT Fails

**Problem:** "Python Whisper provider is not available"

**Solution:**
```bash
pip install openai-whisper
# Or for better performance:
pip install faster-whisper
```

### Image Generation Queue Unavailable

**Problem:** "Redis not available"

**Solution:**
```bash
# Check if Redis is running
redis-cli ping
# Should return: PONG

# If not, start Redis
redis-server
```

### ComfyUI Connection Failed

**Problem:** "ComfyUI server is not available"

**Solution:**
```bash
cd path/to/ComfyUI
python main.py --listen 0.0.0.0 --port 8188
```

### VRAM Overflow

**Problem:** Out of memory errors

**Solution:**
1. Lower `VRAM_LIMIT` in .env
2. Use smaller models (Whisper `tiny` instead of `small`)
3. Ensure idle models are unloading (check logs)

---

## License

All AI models used:
- **Kokoro TTS:** Apache 2.0
- **Whisper:** MIT
- **SDXL:** CreativeML Open RAIL++-M

See individual model licenses for commercial use restrictions.

---

## Support

For issues or questions:
- GitHub Issues: https://github.com/jeffreysblake/the-quest-weavers-essential-guide/issues
- Documentation: This file and README.md
