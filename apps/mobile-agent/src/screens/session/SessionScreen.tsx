// Active session — chat, timer, crisis controls, private notes, voice
// (F-013), voice upgrade decisions (F-014), quick reactions (F-016).
//
// Privacy rule (schema.prisma header): message content is NEVER persisted.
// Messages live in component state only and evaporate when this screen
// unmounts. Notes go through PUT /note which encrypts server-side (F-017).
// Reactions are relay-only and render as a fading overlay — never stored.
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMutation, useQuery } from '@tanstack/react-query';
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { SessionType } from '@noni/types';
import type {
  WsCrisisAlertEvent,
  WsMessageEvent,
  WsReactionEvent,
  WsSessionEndEvent,
  WsTypingEvent,
  WsVoiceUpgradeRequestedEvent,
  WsWebrtcSignalEvent,
} from '@noni/types';
import { NoniApiError } from '@noni/api-client';
import {
  Button,
  CrisisAlert,
  CrisisScript,
  Screen,
  colors,
  radius,
  spacing,
  typography,
  useToast,
} from '@noni/ui';
import { api } from '../../api/client';
import { connectSocket, getSocket } from '../../realtime/socket';
import { createVoiceCall, isVoiceAvailable, type VoiceCall } from '../../realtime/webrtc';
import { formatDuration, formatNaira } from '../../utils/formatters';
import type { AppStackParamList } from '../../navigation/RootNavigator';

type Props = NativeStackScreenProps<AppStackParamList, 'Session'>;

interface ChatMessage extends WsMessageEvent {
  id: string;
}

// F-016 — allowlisted quick reactions (server drops anything else).
const REACTION_EMOJI = ['❤️', '🙏', '😢'] as const;

interface FloatingReaction {
  id: number;
  emoji: string;
  opacity: Animated.Value;
}

const END_REASON_COPY: Record<WsSessionEndEvent['reason'], string> = {
  COMPLETED: 'The user ended the session.',
  INTERRUPTED: 'The session was interrupted.',
  CRISIS_FLAGGED: 'The session was flagged. A supervisor has the audit trail.',
};

export function SessionScreen({ route, navigation }: Props) {
  const { sessionId } = route.params;
  const toast = useToast();

  const [elapsed, setElapsed] = useState(0);
  const [ending, setEnding] = useState(false);
  const [flagging, setFlagging] = useState(false);
  const [scriptVisible, setScriptVisible] = useState(false);

  // Chat — component state ONLY, never persisted.
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [peerTyping, setPeerTyping] = useState(false);
  const [crisisAlert, setCrisisAlert] = useState<WsCrisisAlertEvent | null>(null);
  const [endedEvent, setEndedEvent] = useState<WsSessionEndEvent | null>(null);

  // Notes sheet (F-017).
  const [notesVisible, setNotesVisible] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  // Voice (F-013/F-014). `voiceMode` flips on for VOICE sessions and after an
  // accepted upgrade. Call state is local — audio never touches our servers.
  const voiceAvailable = isVoiceAvailable();
  const [voiceMode, setVoiceMode] = useState(false);
  const [callState, setCallState] = useState<'idle' | 'connecting' | 'active'>('idle');
  const [callSecs, setCallSecs] = useState(0);
  const [muted, setMuted] = useState(false);
  const [upgradeOffer, setUpgradeOffer] = useState<WsVoiceUpgradeRequestedEvent | null>(null);
  const [upgradeBusy, setUpgradeBusy] = useState(false);
  const callRef = useRef<VoiceCall | null>(null);
  const pendingIce = useRef<unknown[]>([]);

  // Quick reactions (F-016) — fading overlay, never stored.
  const [reactions, setReactions] = useState<FloatingReaction[]>([]);
  const reactionSeq = useRef(0);

  const listRef = useRef<FlatList<ChatMessage>>(null);
  const msgSeq = useRef(0);
  const typingRef = useRef(false);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sessionQuery = useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => api.getSession(sessionId),
    staleTime: Infinity,
  });
  const isVoiceSession = voiceMode || sessionQuery.data?.sessionType === SessionType.VOICE;

  useEffect(() => {
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // In-call elapsed timer.
  useEffect(() => {
    if (callState !== 'active') return;
    setCallSecs(0);
    const t = setInterval(() => setCallSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [callState]);

  // ── Socket room lifecycle ────────────────────────────────────────────
  useEffect(() => {
    const socket = connectSocket();
    if (!socket) return;

    const join = () => socket.emit('join_room', { sessionId });
    if (socket.connected) join();
    // Re-join after any reconnect so a blip doesn't leave us deaf.
    socket.on('connect', join);

    const onMessage = (event: WsMessageEvent) => {
      msgSeq.current += 1;
      setMessages((m) => [...m, { ...event, id: `m${msgSeq.current}` }]);
      setPeerTyping(false);
    };
    const onTypingStart = (event: WsTypingEvent) => {
      if (event.sender !== 'AGENT') setPeerTyping(true);
    };
    const onTypingStop = (event: WsTypingEvent) => {
      if (event.sender !== 'AGENT') setPeerTyping(false);
    };
    const onCrisis = (event: WsCrisisAlertEvent) => setCrisisAlert(event);
    const onEnd = (event: WsSessionEndEvent) => setEndedEvent(event);
    const onErrorEvent = (event: { code?: string }) =>
      toast.error(event?.code ?? 'Something went wrong', 'Session');

    // F-016 — incoming reactions (server never echoes our own back).
    const onReaction = (event: WsReactionEvent) => {
      if (event.sender !== 'AGENT') showReaction(event.emoji);
    };

    // F-014 — voice upgrade lifecycle.
    const onUpgradeRequested = (event: WsVoiceUpgradeRequestedEvent) => {
      if (event.sessionId === sessionId) setUpgradeOffer(event);
    };
    const onUpgradeAccepted = () => {
      setUpgradeOffer(null);
      setVoiceMode(true);
    };
    const onUpgradeDeclined = () => setUpgradeOffer(null);
    const onUpgradeFailed = () => {
      setUpgradeOffer(null);
      toast.error("The switch to voice didn't go through. Continuing in text.", 'Voice upgrade');
    };

    // F-013 — WebRTC signalling. The agent is the callee: the user's app
    // sends the offer; we answer. ICE flows both ways.
    const onWebrtcOffer = (event: WsWebrtcSignalEvent) => {
      if (event.sessionId === sessionId) void answerCall(event.data);
    };
    const onWebrtcIce = (event: WsWebrtcSignalEvent) => {
      if (event.sessionId !== sessionId) return;
      if (callRef.current) void callRef.current.handleRemoteIce(event.data);
      else pendingIce.current.push(event.data);
    };

    socket.on('message', onMessage);
    socket.on('typing_start', onTypingStart);
    socket.on('typing_stop', onTypingStop);
    socket.on('crisis_alert', onCrisis);
    socket.on('session_end', onEnd);
    socket.on('error_event', onErrorEvent);
    socket.on('reaction', onReaction);
    socket.on('voice_upgrade_requested', onUpgradeRequested);
    socket.on('voice_upgrade_accepted', onUpgradeAccepted);
    socket.on('voice_upgrade_declined', onUpgradeDeclined);
    socket.on('voice_upgrade_failed', onUpgradeFailed);
    socket.on('webrtc_offer', onWebrtcOffer);
    socket.on('webrtc_ice', onWebrtcIce);

    return () => {
      if (typingTimer.current) clearTimeout(typingTimer.current);
      if (typingRef.current) socket.emit('typing_stop', { sessionId });
      socket.emit('leave_room', { sessionId });
      socket.off('connect', join);
      socket.off('message', onMessage);
      socket.off('typing_start', onTypingStart);
      socket.off('typing_stop', onTypingStop);
      socket.off('crisis_alert', onCrisis);
      socket.off('session_end', onEnd);
      socket.off('error_event', onErrorEvent);
      socket.off('reaction', onReaction);
      socket.off('voice_upgrade_requested', onUpgradeRequested);
      socket.off('voice_upgrade_accepted', onUpgradeAccepted);
      socket.off('voice_upgrade_declined', onUpgradeDeclined);
      socket.off('voice_upgrade_failed', onUpgradeFailed);
      socket.off('webrtc_offer', onWebrtcOffer);
      socket.off('webrtc_ice', onWebrtcIce);
      // Tear the call down with the screen.
      callRef.current?.close();
      callRef.current = null;
      pendingIce.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // ── Voice call (F-013, agent = callee) ───────────────────────────────
  async function answerCall(offer: unknown) {
    if (!isVoiceAvailable()) return;
    const socket = getSocket();
    if (!socket) return;
    try {
      setCallState('connecting');
      callRef.current?.close();
      const turn = await api.getTurnCredentials(sessionId);
      const call = await createVoiceCall(turn, {
        onLocalIce: (candidate) => socket.emit('webrtc_ice', { sessionId, data: candidate }),
        onConnected: () => setCallState('active'),
        onEnded: () => {
          // Far side dropped — free the mic, keep the chat alive.
          callRef.current?.close();
          callRef.current = null;
          setCallState('idle');
          setMuted(false);
        },
      });
      callRef.current = call;
      const answer = await call.handleOffer(offer);
      socket.emit('webrtc_answer', { sessionId, data: answer });
      for (const candidate of pendingIce.current.splice(0)) {
        void call.handleRemoteIce(candidate);
      }
    } catch {
      setCallState('idle');
      toast.error('Could not connect the call. Chat still works.', 'Voice');
    }
  }

  function hangUp() {
    callRef.current?.close();
    callRef.current = null;
    setCallState('idle');
    setMuted(false);
  }

  function toggleMute() {
    const next = !muted;
    callRef.current?.setMuted(next);
    setMuted(next);
  }

  // ── Voice upgrade decision (F-014) ───────────────────────────────────
  async function respondToUpgrade(acceptIt: boolean) {
    if (!upgradeOffer || upgradeBusy) return;
    setUpgradeBusy(true);
    try {
      if (acceptIt) {
        await api.acceptVoiceUpgrade(sessionId);
        setVoiceMode(true); // room event confirms; flip locally too
      } else {
        await api.declineVoiceUpgrade(sessionId);
      }
      setUpgradeOffer(null);
    } catch (err) {
      setUpgradeOffer(null);
      if (err instanceof NoniApiError && err.code === 'INSUFFICIENT_FUNDS') {
        toast.error("Their wallet couldn't cover the upgrade. Continuing in text.", 'Voice upgrade');
      } else {
        toast.error(err instanceof Error ? err.message : 'Try again', 'Voice upgrade');
      }
    } finally {
      setUpgradeBusy(false);
    }
  }

  // ── Quick reactions (F-016) — overlay only, never stored ─────────────
  function showReaction(emoji: string) {
    reactionSeq.current += 1;
    const id = reactionSeq.current;
    const opacity = new Animated.Value(0);
    setReactions((r) => [...r, { id, emoji, opacity }]);
    Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(1200),
      Animated.timing(opacity, { toValue: 0, duration: 450, useNativeDriver: true }),
    ]).start(() => setReactions((r) => r.filter((x) => x.id !== id)));
  }

  function sendReaction(emoji: string) {
    getSocket()?.emit('reaction', { sessionId, emoji });
    showReaction(emoji); // server relays to the peer only — echo locally
  }

  // ── Typing indicator (outbound, throttled) ───────────────────────────
  function stopTyping() {
    if (typingTimer.current) clearTimeout(typingTimer.current);
    if (typingRef.current) {
      getSocket()?.emit('typing_stop', { sessionId });
      typingRef.current = false;
    }
  }

  function handleInputChange(text: string) {
    setInput(text);
    const socket = getSocket();
    if (!socket) return;
    if (!typingRef.current) {
      socket.emit('typing_start', { sessionId });
      typingRef.current = true;
    }
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      socket.emit('typing_stop', { sessionId });
      typingRef.current = false;
    }, 1800);
  }

  function sendMessage() {
    const text = input.trim();
    if (!text) return;
    getSocket()?.emit('send_message', { sessionId, text });
    msgSeq.current += 1;
    setMessages((m) => [
      ...m,
      { id: `m${msgSeq.current}`, text, sender: 'AGENT', timestamp: Date.now() },
    ]);
    setInput('');
    stopTyping();
  }

  // ── Notes (F-017 — private, encrypted server-side) ───────────────────
  const noteQuery = useQuery({
    queryKey: ['sessionNote', sessionId],
    queryFn: () => api.getSessionNote(sessionId),
    enabled: notesVisible,
    staleTime: Infinity,
  });
  useEffect(() => {
    if (noteQuery.data !== undefined && note === null) {
      setNote(noteQuery.data.note ?? '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteQuery.data]);

  const saveNote = useMutation({
    mutationFn: () => api.putSessionNote(sessionId, note ?? ''),
    onSuccess: () => {
      toast.success('Only you can read it.', 'Note saved');
      setNotesVisible(false);
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : 'Try again', 'Could not save note'),
  });

  // ── Session controls ──────────────────────────────────────────────────
  async function flagCrisis() {
    setFlagging(true);
    try {
      await api.flagCrisis(sessionId);
      toast.crisis('Supervisor notified. Stay with the user.', 'Crisis flagged');
      setScriptVisible(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Try again', 'Could not flag');
    } finally {
      setFlagging(false);
    }
  }

  async function endSession() {
    setEnding(true);
    try {
      const session = await api.endSession(sessionId);
      if (session?.agentPayoutKobo) {
        toast.success(`You earned ${formatNaira(session.agentPayoutKobo)}`, 'Session complete');
      } else {
        toast.success('Thank you for holding space.', 'Session ended');
      }
      navigation.goBack();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Try again', 'Could not end session');
      setEnding(false);
    }
  }

  // ── Completion state (user / server ended the session) ───────────────
  if (endedEvent) {
    return (
      <Screen>
        <View style={{ flex: 1, justifyContent: 'center', gap: spacing.md }}>
          <Text style={{ ...typography.label, color: colors.textDim }}>Session ended</Text>
          <Text style={{ ...typography.display, color: colors.text }}>
            Thank you for holding{' '}
            <Text style={{ fontFamily: 'Fraunces-Italic', color: colors.emphasis }}>space</Text>.
          </Text>
          <Text style={{ ...typography.body, color: colors.textMuted }}>
            {END_REASON_COPY[endedEvent.reason]}
          </Text>
          <Text
            style={{
              ...typography.mono,
              color: colors.textMuted,
            }}
          >
            {formatDuration(endedEvent.durationSecs)} together
          </Text>
          <Button
            label="Back to dashboard"
            onPress={() => navigation.goBack()}
            style={{ marginTop: spacing.lg }}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <CrisisScript visible={scriptVisible} onClose={() => setScriptVisible(false)} />
      <CrisisAlert
        visible={crisisAlert !== null}
        message={crisisAlert?.message}
        onEscalate={() => {
          // For the agent, "escalating" means following the S-003 script.
          setCrisisAlert(null);
          setScriptVisible(true);
        }}
        onDismiss={() => setCrisisAlert(null)}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 96 : 0}
      >
        {/* Header — status, timer, actions */}
        <View style={styles.headerRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <View style={styles.liveDot} />
            <Text style={{ ...typography.caption, color: colors.success, fontWeight: '600' }}>
              Active
            </Text>
            <Text style={styles.timer}>{formatDuration(elapsed)}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Pressable
              onPress={() => setNotesVisible(true)}
              hitSlop={8}
              style={({ pressed }) => [styles.headerAction, pressed && styles.pressed]}
            >
              <Feather name="edit-3" size={14} color={colors.secondary} />
              <Text style={{ ...typography.caption, color: colors.secondary }}>Notes</Text>
            </Pressable>
            <Pressable
              onPress={() => setScriptVisible(true)}
              hitSlop={8}
              style={({ pressed }) => [styles.headerAction, pressed && styles.pressed]}
            >
              <Feather name="book-open" size={14} color={colors.secondary} />
              <Text style={{ ...typography.caption, color: colors.secondary }}>Script</Text>
            </Pressable>
          </View>
        </View>

        {/* Voice panel (F-013) — only for VOICE sessions / after upgrade */}
        {isVoiceSession ? (
          voiceAvailable ? (
            <View style={styles.voicePanel}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Feather
                  name={callState === 'active' ? 'phone-call' : 'phone'}
                  size={16}
                  color={callState === 'active' ? colors.success : colors.textMuted}
                />
                <Text style={{ ...typography.caption, color: colors.text, flex: 1 }}>
                  {callState === 'active'
                    ? 'Voice call — live'
                    : callState === 'connecting'
                      ? 'Connecting…'
                      : 'Voice session — waiting for their call'}
                </Text>
                {callState === 'active' ? (
                  <Text style={{ ...typography.mono, color: colors.text }}>
                    {formatDuration(callSecs)}
                  </Text>
                ) : null}
              </View>
              {callState !== 'idle' ? (
                <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
                  <Pressable
                    onPress={toggleMute}
                    style={({ pressed }) => [
                      styles.voiceAction,
                      muted && styles.voiceActionActive,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Feather
                      name={muted ? 'mic-off' : 'mic'}
                      size={14}
                      color={muted ? colors.primary : colors.textMuted}
                    />
                    <Text
                      style={{
                        ...typography.caption,
                        color: muted ? colors.primary : colors.textMuted,
                        fontWeight: '600',
                      }}
                    >
                      {muted ? 'Unmute' : 'Mute'}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={hangUp}
                    style={({ pressed }) => [
                      styles.voiceAction,
                      styles.voiceEnd,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Feather name="phone-off" size={14} color={colors.crisis} />
                    <Text style={{ ...typography.caption, color: colors.crisis, fontWeight: '600' }}>
                      End call
                    </Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          ) : (
            <View style={styles.voiceUnavailable}>
              <Feather name="phone-off" size={14} color={colors.textDim} />
              <Text style={{ ...typography.caption, color: colors.textMuted, flex: 1 }}>
                Voice needs the installed (preview) app — chat still works.
              </Text>
            </View>
          )
        ) : null}

        {/* Chat */}
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          style={{ flex: 1, marginTop: spacing.sm }}
          contentContainerStyle={{ gap: spacing.sm, paddingVertical: spacing.sm }}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          ListEmptyComponent={
            <View style={styles.emptyChat}>
              <Text style={{ ...typography.body, color: colors.textMuted, textAlign: 'center' }}>
                They&apos;re here. Start anywhere —{' '}
                <Text style={{ fontFamily: 'Fraunces-Italic', color: colors.emphasis }}>
                  listen
                </Text>{' '}
                first.
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const mine = item.sender === 'AGENT';
            return (
              <View
                style={[
                  styles.bubble,
                  mine ? styles.bubbleMine : styles.bubbleTheirs,
                ]}
              >
                <Text style={{ ...typography.body, color: colors.text }}>{item.text}</Text>
              </View>
            );
          }}
        />

        {/* Floating reactions (F-016) — brief, fading, never stored */}
        <View pointerEvents="none" style={styles.reactionOverlay}>
          {reactions.map((r) => (
            <Animated.Text key={r.id} style={{ opacity: r.opacity, fontSize: 36 }}>
              {r.emoji}
            </Animated.Text>
          ))}
        </View>

        {peerTyping ? (
          <Text style={{ ...typography.caption, color: colors.textDim, marginBottom: spacing.xs }}>
            They&apos;re typing…
          </Text>
        ) : null}

        {/* Voice upgrade decision (F-014) */}
        {upgradeOffer ? (
          <View style={styles.upgradeCard}>
            <Text style={{ ...typography.bodyStrong, color: colors.text }}>Switch to voice?</Text>
            <Text style={{ ...typography.caption, color: colors.textMuted, marginTop: 4 }}>
              The user asks to switch to voice (+{formatNaira(upgradeOffer.deltaKobo)} billed to
              them). Accept?
            </Text>
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
              <Pressable
                onPress={() => void respondToUpgrade(true)}
                disabled={upgradeBusy}
                style={({ pressed }) => [
                  styles.upgradeAccept,
                  (pressed || upgradeBusy) && styles.pressed,
                ]}
              >
                <Text style={{ ...typography.bodyStrong, color: colors.primaryInk }}>
                  {upgradeBusy ? 'Working…' : 'Accept'}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => void respondToUpgrade(false)}
                disabled={upgradeBusy}
                style={({ pressed }) => [
                  styles.upgradeDecline,
                  (pressed || upgradeBusy) && styles.pressed,
                ]}
              >
                <Text style={{ ...typography.body, color: colors.textMuted }}>Decline</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {/* Quick reactions (F-016) */}
        <View style={styles.reactionRow}>
          {REACTION_EMOJI.map((emoji) => (
            <Pressable
              key={emoji}
              onPress={() => sendReaction(emoji)}
              hitSlop={6}
              style={({ pressed }) => [styles.reactionButton, pressed && styles.pressed]}
            >
              <Text style={{ fontSize: 18 }}>{emoji}</Text>
            </Pressable>
          ))}
        </View>

        {/* Composer */}
        <View style={styles.composer}>
          <TextInput
            value={input}
            onChangeText={handleInputChange}
            placeholder="Say something kind…"
            placeholderTextColor={colors.textDim}
            multiline
            style={styles.composerInput}
          />
          <Pressable
            onPress={sendMessage}
            disabled={!input.trim()}
            style={({ pressed }) => [
              styles.sendButton,
              { opacity: !input.trim() ? 0.4 : pressed ? 0.85 : 1 },
            ]}
          >
            <Feather name="arrow-up" size={20} color={colors.primaryInk} />
          </Pressable>
        </View>

        {/* Session controls */}
        <View style={styles.controlsRow}>
          <Pressable
            onPress={flagCrisis}
            disabled={flagging}
            style={({ pressed }) => [styles.flagButton, pressed && styles.pressed]}
          >
            <Text style={{ ...typography.caption, color: colors.crisis, fontWeight: '600' }}>
              {flagging ? 'Flagging…' : 'Flag crisis · S-003'}
            </Text>
          </Pressable>
          <Pressable
            onPress={endSession}
            disabled={ending}
            style={({ pressed }) => [styles.endButton, pressed && styles.pressed]}
          >
            <Text style={{ ...typography.caption, color: colors.textMuted }}>
              {ending ? 'Ending…' : 'End session'}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      {/* Private notes sheet (F-017) */}
      <Modal
        visible={notesVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setNotesVisible(false)}
      >
        <View style={styles.sheetScrim}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={{ ...typography.title, color: colors.text }}>Notes</Text>
              <Pressable onPress={() => setNotesVisible(false)} hitSlop={12}>
                <Text style={{ ...typography.caption, color: colors.textMuted, fontWeight: '600' }}>
                  Close
                </Text>
              </Pressable>
            </View>
            <Text style={{ ...typography.caption, color: colors.textMuted }}>
              Private notes — never visible to the user or admins
            </Text>
            <TextInput
              value={note ?? ''}
              onChangeText={setNote}
              editable={!noteQuery.isLoading}
              placeholder={noteQuery.isLoading ? 'Loading…' : 'What do you want to remember?'}
              placeholderTextColor={colors.textDim}
              multiline
              textAlignVertical="top"
              style={styles.noteInput}
            />
            <Button
              label={saveNote.isPending ? 'Saving…' : 'Save note'}
              onPress={() => saveNote.mutate()}
              disabled={saveNote.isPending || noteQuery.isLoading}
            />
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
  timer: {
    ...typography.mono,
    color: colors.text,
    marginLeft: spacing.xs,
  },
  headerAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  emptyChat: {
    marginTop: spacing.xxl,
    paddingHorizontal: spacing.xl,
  },
  bubble: {
    maxWidth: '82%',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  bubbleMine: {
    alignSelf: 'flex-end',
    backgroundColor: colors.primaryMuted,
    borderColor: colors.primaryGlow,
  },
  bubbleTheirs: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  composerInput: {
    ...typography.body,
    flex: 1,
    color: colors.text,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    maxHeight: 120,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  flagButton: {
    backgroundColor: colors.crisisSoft,
    borderColor: colors.crisis,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  endButton: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  pressed: { opacity: 0.8 },
  voicePanel: {
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  voiceAction: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElev,
  },
  voiceActionActive: {
    backgroundColor: colors.primaryMuted,
    borderColor: colors.primaryGlow,
  },
  voiceEnd: {
    backgroundColor: colors.crisisSoft,
    borderColor: colors.crisis,
  },
  voiceUnavailable: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElev,
  },
  reactionOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 140,
    alignItems: 'center',
    gap: spacing.xs,
  },
  reactionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  reactionButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  upgradeCard: {
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primaryGlow,
    backgroundColor: colors.primaryMuted,
  },
  upgradeAccept: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  upgradeDecline: {
    paddingHorizontal: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetScrim: {
    flex: 1,
    backgroundColor: 'rgba(14, 11, 10, 0.92)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.borderStrong,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  noteInput: {
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.surfaceElev,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: 140,
    maxHeight: 260,
  },
});
