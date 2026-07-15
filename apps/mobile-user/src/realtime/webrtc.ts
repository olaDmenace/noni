// F-013 — WebRTC voice calling.
// react-native-webrtc is a native module and CANNOT load inside Expo Go: the
// import throws at module-init time. Everything here goes through a lazy
// require guarded by try/catch; isVoiceAvailable() reports whether the native
// module is present (installed preview/production builds only).
//
// The USER is always the caller: start() captures the mic, creates the offer
// and emits it over the existing session socket; the agent answers and both
// sides trickle ICE via webrtc_ice.

type WebrtcModule = typeof import('react-native-webrtc');
type PeerConnection = InstanceType<WebrtcModule['RTCPeerConnection']>;
type LocalStream = InstanceType<WebrtcModule['MediaStream']>;

declare const require: (id: string) => unknown;

let mod: WebrtcModule | null | undefined;

function loadWebrtc(): WebrtcModule | null {
  if (mod !== undefined) return mod;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    mod = require('react-native-webrtc') as WebrtcModule;
  } catch {
    // Expo Go (or any build without the native module) lands here.
    mod = null;
  }
  return mod;
}

export function isVoiceAvailable(): boolean {
  return loadWebrtc() !== null;
}

export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export type VoiceCallState = 'connecting' | 'active' | 'ended' | 'failed';

export interface VoiceCallHandlers {
  /** Emit a signalling event; the screen wraps it as { sessionId, data }. */
  sendSignal: (event: 'webrtc_offer' | 'webrtc_ice', data: unknown) => void;
  onStateChange: (state: VoiceCallState) => void;
}

// react-native-webrtc's d.ts pulls EventTarget from 'event-target-shim/index',
// which does not resolve under moduleResolution "bundler" — so the inherited
// addEventListener is invisible to tsc. Narrow, hand-written event surface:
interface PeerConnectionEvents {
  addEventListener(
    type: 'icecandidate',
    listener: (e: { candidate: { toJSON(): unknown } | null }) => void,
  ): void;
  addEventListener(type: 'connectionstatechange', listener: () => void): void;
}

export class VoiceCall {
  private pc: PeerConnection | null = null;
  private localStream: LocalStream | null = null;
  private pendingRemoteIce: unknown[] = [];
  private hasRemoteDescription = false;
  private closed = false;

  constructor(private readonly handlers: VoiceCallHandlers) {}

  /** Caller side: capture audio, create + send the offer. */
  async start(iceServers: IceServer[]): Promise<void> {
    const webrtc = loadWebrtc();
    if (!webrtc) throw new Error('Voice calling is not available in this build');

    this.handlers.onStateChange('connecting');
    const pc = new webrtc.RTCPeerConnection({ iceServers });
    this.pc = pc;

    const events = pc as unknown as PeerConnectionEvents;
    events.addEventListener('icecandidate', (e) => {
      if (this.closed || !e.candidate) return;
      this.handlers.sendSignal('webrtc_ice', e.candidate.toJSON());
    });
    events.addEventListener('connectionstatechange', () => {
      if (this.closed) return;
      const state = pc.connectionState;
      if (state === 'connected') {
        this.handlers.onStateChange('active');
      } else if (state === 'failed') {
        this.handlers.onStateChange('failed');
      } else if (state === 'disconnected' || state === 'closed') {
        this.handlers.onStateChange('ended');
      }
    });

    this.localStream = await webrtc.mediaDevices.getUserMedia({ audio: true });
    for (const track of this.localStream.getTracks()) {
      pc.addTrack(track, this.localStream);
    }

    const offer = (await pc.createOffer()) as { type: string; sdp: string };
    await pc.setLocalDescription(offer);
    this.handlers.sendSignal('webrtc_offer', { type: offer.type, sdp: offer.sdp });
  }

  /** The agent's SDP answer arrived over the socket. */
  async handleAnswer(data: unknown): Promise<void> {
    const pc = this.pc;
    if (!pc || this.closed) return;
    try {
      await pc.setRemoteDescription(data as { type: string; sdp: string });
      this.hasRemoteDescription = true;
      for (const candidate of this.pendingRemoteIce.splice(0)) {
        await pc.addIceCandidate(candidate);
      }
    } catch {
      if (!this.closed) this.handlers.onStateChange('failed');
    }
  }

  /** A remote ICE candidate arrived; buffer until the answer is applied. */
  async handleRemoteIce(data: unknown): Promise<void> {
    const pc = this.pc;
    if (!pc || this.closed) return;
    if (!this.hasRemoteDescription) {
      this.pendingRemoteIce.push(data);
      return;
    }
    try {
      await pc.addIceCandidate(data);
    } catch {
      // Malformed/duplicate candidates are safe to drop.
    }
  }

  setMuted(muted: boolean): void {
    for (const track of this.localStream?.getTracks() ?? []) {
      track.enabled = !muted;
    }
  }

  /** Stop tracks, release the mic, close the connection. Idempotent. */
  end(): void {
    if (this.closed) return;
    this.closed = true;
    for (const track of this.localStream?.getTracks() ?? []) {
      track.stop();
    }
    this.localStream?.release(false);
    this.localStream = null;
    this.pc?.close();
    this.pc = null;
    this.pendingRemoteIce = [];
  }
}
