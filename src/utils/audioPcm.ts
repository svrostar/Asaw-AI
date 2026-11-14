/**
 * Resamples Float32Array audio from an arbitrary native AudioContext sample rate
 * (e.g., 44100Hz or 48000Hz) down to 16000Hz for Gemini Live API.
 */
export function downsampleTo16k(
  buffer: Float32Array,
  inputSampleRate: number
): Float32Array {
  const targetRate = 16000;
  if (inputSampleRate === targetRate) {
    return buffer;
  }
  const ratio = inputSampleRate / targetRate;
  const outputLength = Math.max(1, Math.floor(buffer.length / ratio));
  const result = new Float32Array(outputLength);

  let offsetResult = 0;
  let offsetBuffer = 0;
  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
    let accum = 0;
    let count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
      accum += buffer[i];
      count++;
    }
    result[offsetResult] = count > 0 ? accum / count : 0;
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }

  return result;
}

/**
 * Converts Float32Array audio samples (-1.0 to 1.0) at 16kHz into
 * base64-encoded signed 16-bit little-endian PCM bytes for Gemini Live API.
 */
export function float32ToInt16Base64(float32: Float32Array): string {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const clamped = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }

  const bytes = new Uint8Array(int16.buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

/**
 * Decodes base64-encoded raw 16-bit little-endian PCM at 24kHz
 * into an AudioBuffer for gapless Web Audio playback.
 */
export function decodeBase64Pcm24k(
  audioCtx: AudioContext,
  base64: string
): AudioBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  const view = new DataView(bytes.buffer);
  const sampleCount = Math.floor(bytes.byteLength / 2);
  const audioBuffer = audioCtx.createBuffer(1, sampleCount, 24000);
  const channel = audioBuffer.getChannelData(0);

  for (let i = 0; i < sampleCount; i++) {
    const int16 = view.getInt16(i * 2, true);
    channel[i] = int16 / 32768;
  }

  return audioBuffer;
}

export function computeRmsLevel(float32: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < float32.length; i++) {
    sum += float32[i] * float32[i];
  }
  const rms = Math.sqrt(sum / Math.max(1, float32.length));
  return Math.min(1, rms * 4.5);
}
