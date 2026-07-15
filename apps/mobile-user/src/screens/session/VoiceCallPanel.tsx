// F-013 — Voice call panel, shown for VOICE sessions (and after a text→voice
// upgrade). Sits above the chat; call state never blocks the chat below it.
// In Expo Go the native module is absent, so a muted banner shows instead.
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import type { WsWebrtcSignalEvent } from '@noni/types';
import { colors, radius, spacing, typography, useToast } from '@noni/ui';
import { api } from '../../api/client';
import { getSocket } from '../../realtime/socket';
import { VoiceCall, isVoiceAvailable } from '../../realtime/webrtc';
import { formatDuration } from '../../utils/formatters';

type CallUiState = 'idle' | 'connecting' | 'active' | 'ended';

export function VoiceCallPanel({ sessionId }: { sessionId: string }) {
  const toast = useToast();
  const available = isVoiceAvailable();

  const [state, setState] = useState<CallUiState>('idle');
  const [muted, setMuted] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const callRef = useRef<VoiceCall | null>(null);

  // Remote signalling — the listener's answer + ICE candidates.
  useEffect(() => {
    if (!available) return;
    const socket = getSocket();
    const onAnswer = (e: WsWebrtcSignalEvent) => {
      if (e.sessionId === sessionId) void callRef.current?.handleAnswer(e.data);
    };
    const onIce = (e: WsWebrtcSignalEvent) => {
      if (e.sessionId === sessionId) void callRef.current?.handleRemoteIce(e.data);
    };
    socket.on('webrtc_answer', onAnswer);
    socket.on('webrtc_ice', onIce);
    return () => {
      socket.off('webrtc_answer', onAnswer);
      socket.off('webrtc_ice', onIce);
    };
  }, [available, sessionId]);

  // Release the mic if the screen unmounts mid-call.
  useEffect(() => () => callRef.current?.end(), []);

  // In-call timer.
  useEffect(() => {
    if (state !== 'active') return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [state]);

  function teardown(next: CallUiState) {
    callRef.current?.end();
    callRef.current = null;
    setState(next);
  }

  async function startCall() {
    if (state === 'connecting' || state === 'active') return;
    callRef.current?.end();
    setElapsed(0);
    setMuted(false);
    setState('connecting');
    try {
      const turn = await api.getTurnCredentials(sessionId);
      const call = new VoiceCall({
        sendSignal: (event, data) => getSocket().emit(event, { sessionId, data }),
        onStateChange: (s) => {
          if (s === 'active') {
            setState('active');
          } else if (s === 'ended' || s === 'failed') {
            // Remote hangup / connection loss — keep the chat, note the call.
            teardown('ended');
          }
        },
      });
      callRef.current = call;
      await call.start([
        { urls: turn.urls, username: turn.username, credential: turn.credential },
      ]);
    } catch (err) {
      teardown('idle');
      toast.error(err instanceof Error ? err.message : 'Try again', 'Could not start the call');
    }
  }

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    callRef.current?.setMuted(next);
  }

  if (!available) {
    return (
      <View
        style={{
          backgroundColor: colors.secondaryMuted,
          borderColor: colors.secondaryGlow,
          borderWidth: 1,
          borderRadius: radius.sm,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          marginTop: spacing.sm,
        }}
      >
        <Text style={{ ...typography.caption, color: colors.secondary }}>
          Voice needs the installed (preview) app — chat still works.
        </Text>
      </View>
    );
  }

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: radius.md,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.md,
        marginTop: spacing.sm,
      }}
    >
      {state === 'active' ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: colors.success,
            }}
          />
          <Text style={{ ...typography.mono, fontSize: 14, color: colors.text, flex: 1 }}>
            {formatDuration(elapsed)}
          </Text>
          <Pressable
            onPress={toggleMute}
            hitSlop={6}
            style={({ pressed }) => ({
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.xs,
              borderRadius: radius.pill,
              borderWidth: 1,
              borderColor: muted ? colors.primary : colors.border,
              backgroundColor: muted ? colors.primaryMuted : 'transparent',
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text style={{ ...typography.caption, color: muted ? colors.primary : colors.textMuted }}>
              {muted ? 'Unmute' : 'Mute'}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => teardown('ended')}
            hitSlop={6}
            style={({ pressed }) => ({
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.xs,
              borderRadius: radius.pill,
              borderWidth: 1,
              borderColor: colors.borderStrong,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text style={{ ...typography.caption, color: colors.textMuted }}>End call</Text>
          </Pressable>
        </View>
      ) : state === 'connecting' ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={{ ...typography.caption, color: colors.textMuted, flex: 1 }}>
            Connecting your call…
          </Text>
          <Pressable onPress={() => teardown('idle')} hitSlop={8}>
            <Text style={{ ...typography.caption, color: colors.textDim }}>Cancel</Text>
          </Pressable>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Text style={{ ...typography.caption, color: colors.textMuted, flex: 1 }}>
            {state === 'ended'
              ? 'Call ended — chat stays open.'
              : 'Voice is ready when you are.'}
          </Text>
          <Pressable
            onPress={() => void startCall()}
            style={({ pressed }) => ({
              backgroundColor: colors.primary,
              paddingHorizontal: spacing.lg,
              paddingVertical: spacing.sm,
              borderRadius: radius.pill,
              opacity: pressed ? 0.88 : 1,
            })}
          >
            <Text style={{ ...typography.caption, color: colors.primaryInk }}>
              {state === 'ended' ? 'Call again' : 'Start call'}
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
