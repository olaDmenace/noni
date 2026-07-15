// F-013 — voice calling, agent side (callee).
//
// react-native-webrtc CANNOT load inside Expo Go: importing it throws because
// the native module isn't linked there. Everything below lazy-requires the
// library inside a try/catch so the rest of the app (chat, queue, training)
// keeps working in Expo Go — voice simply reports unavailable and the session
// screen shows a banner instead of a call panel.
//
// Audio never touches our servers: media flows peer-to-peer (or through the
// TURN relay), and signalling payloads are relayed opaquely by Socket.IO.
import type { WsTurnCredentialsEvent } from '@noni/types';

type RtcModule = typeof import('react-native-webrtc');
type SessionDescriptionInit = ConstructorParameters<RtcModule['RTCSessionDescription']>[0];

let rtcModule: RtcModule | null = null;
let loadAttempted = false;

function loadRtc(): RtcModule | null {
  if (!loadAttempted) {
    loadAttempted = true;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      rtcModule = require('react-native-webrtc') as RtcModule;
    } catch {
      rtcModule = null; // Expo Go / web — native module missing.
    }
  }
  return rtcModule;
}

/** True when the native WebRTC module is present (installed/preview build). */
export function isVoiceAvailable(): boolean {
  return loadRtc() !== null;
}

export interface VoiceCallEvents {
  /** A local ICE candidate is ready — emit `webrtc_ice` to the session room. */
  onLocalIce: (candidate: unknown) => void;
  /** Peer connection reached `connected`. */
  onConnected?: () => void;
  /** Connection failed/dropped from the far side (not fired on local close()). */
  onEnded?: () => void;
}

export interface VoiceCall {
  /** Callee flow: apply the user's offer and return the answer to signal back. */
  handleOffer(offer: unknown): Promise<unknown>;
  handleRemoteIce(candidate: unknown): Promise<void>;
  /** Mutes/unmutes the local microphone track. */
  setMuted(muted: boolean): void;
  /** Stops the mic and tears the peer connection down. Safe to call twice. */
  close(): void;
}

/**
 * Creates an audio-only peer connection using the session-scoped TURN
 * credentials. Throws if the native module is unavailable — check
 * isVoiceAvailable() first.
 */
export async function createVoiceCall(
  turn: WsTurnCredentialsEvent,
  events: VoiceCallEvents,
): Promise<VoiceCall> {
  const mod = loadRtc();
  if (!mod) throw new Error('react-native-webrtc is not available in this build');

  const pc = new mod.RTCPeerConnection({
    iceServers: [{ urls: turn.urls, username: turn.username, credential: turn.credential }],
  });
  const stream = await mod.mediaDevices.getUserMedia({ audio: true, video: false });
  for (const track of stream.getTracks()) pc.addTrack(track, stream);

  let closed = false;

  // The shim's EventTarget typings don't resolve under the app tsconfig, so
  // address addEventListener through a minimal structural type.
  const pcEvents = pc as unknown as {
    addEventListener(type: string, listener: (event: { candidate?: unknown }) => void): void;
  };

  pcEvents.addEventListener('icecandidate', (event) => {
    const candidate = event.candidate as { toJSON?: () => unknown } | null | undefined;
    if (!candidate || closed) return;
    events.onLocalIce(typeof candidate.toJSON === 'function' ? candidate.toJSON() : candidate);
  });
  pcEvents.addEventListener('connectionstatechange', () => {
    if (closed) return;
    if (pc.connectionState === 'connected') events.onConnected?.();
    if (
      pc.connectionState === 'failed' ||
      pc.connectionState === 'disconnected' ||
      pc.connectionState === 'closed'
    ) {
      events.onEnded?.();
    }
  });

  return {
    async handleOffer(offer: unknown) {
      await pc.setRemoteDescription(
        new mod.RTCSessionDescription(offer as SessionDescriptionInit),
      );
      const answer = (await pc.createAnswer()) as { type: string; sdp: string };
      await pc.setLocalDescription(answer);
      return { type: answer.type, sdp: answer.sdp };
    },
    async handleRemoteIce(candidate: unknown) {
      try {
        await pc.addIceCandidate(candidate);
      } catch {
        // Late/duplicate candidates after teardown are harmless — ignore.
      }
    },
    setMuted(muted: boolean) {
      for (const track of stream.getAudioTracks()) track.enabled = !muted;
    },
    close() {
      if (closed) return;
      closed = true;
      for (const track of stream.getTracks()) track.stop();
      pc.close();
    },
  };
}
