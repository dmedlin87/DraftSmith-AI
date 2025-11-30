import { Modality, LiveServerMessage } from "@google/genai";
import { ModelConfig } from "../../config/models";
import { ai } from "./client";
import { base64ToUint8Array, createBlob, decodeAudioData } from "@/features/voice";
import { LIVE_AGENT_SYSTEM_INSTRUCTION } from "./prompts";

/** Client interface for a live audio session */
export interface LiveSessionClient {
  sendAudio: (data: Float32Array) => Promise<void>;
  disconnect: () => Promise<void>;
}

const getAudioContextCtor = () => {
  const ctor = window.AudioContext || window.webkitAudioContext;
  if (!ctor) {
    throw new Error('Web Audio API not supported in this environment.');
  }
  return ctor;
};

export const generateSpeech = async (text: string): Promise<AudioBuffer | null> => {
  try {
    const response = await ai.models.generateContent({
      model: ModelConfig.tts,
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) return null;

    const AudioContextCtor = getAudioContextCtor();
    const audioContext = new AudioContextCtor({ sampleRate: 24000 });
    const buffer = await decodeAudioData(
      base64ToUint8Array(base64Audio),
      audioContext,
      24000,
      1
    );
    if (audioContext.state !== 'closed') {
      await audioContext.close();
    }
    return buffer;
  } catch (e) {
    console.error("TTS Error:", e);
    return null;
  }
};

export const connectLiveSession = async (
  onAudioData: (buffer: AudioBuffer) => void,
  onClose: () => void
): Promise<LiveSessionClient> => {
  const AudioContextCtor = getAudioContextCtor();
  const outputAudioContext = new AudioContextCtor({ sampleRate: 24000 });
  
  const sessionPromise = ai.live.connect({
    model: ModelConfig.liveAudio,
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } },
      },
      systemInstruction: LIVE_AGENT_SYSTEM_INSTRUCTION,
    },
    callbacks: {
      onopen: () => {
        console.log("Live session opened");
      },
      onmessage: async (message: LiveServerMessage) => {
        const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
        if (base64Audio) {
          if (outputAudioContext.state === 'closed') return;
          
          const audioBuffer = await decodeAudioData(
            base64ToUint8Array(base64Audio),
            outputAudioContext,
            24000,
            1
          );
          onAudioData(audioBuffer);
        }
      },
      onclose: () => {
        console.log("Live session closed");
        onClose();
      },
      onerror: (err) => {
        console.error("Live session error", err);
        onClose();
      }
    }
  });

  return {
    sendAudio: async (data: Float32Array) => {
      const pcmBlob = createBlob(data);
      const session = await sessionPromise;
      session.sendRealtimeInput({ media: pcmBlob });
    },
    disconnect: async () => {
      if (outputAudioContext.state !== 'closed') {
        await outputAudioContext.close();
      }
      const session = await sessionPromise;
      (session as any).close?.(); 
    }
  };
};
