// Live text session with a human listener.
// Privacy rule: messages live ONLY in component state — never persisted anywhere.
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { NoniApiError } from '@noni/api-client';
import type {
  WsCrisisAlertEvent,
  WsMessageEvent,
  WsReactionEvent,
  WsSessionEndEvent,
  WsTypingEvent,
} from '@noni/types';
import {
  Avatar,
  BlockReportSheet,
  CrisisAlert,
  Disclaimer,
  Screen,
  colors,
  radius,
  spacing,
  typography,
  useToast,
  type ReportReason,
} from '@noni/ui';
import { api } from '../../api/client';
import { getSocket } from '../../realtime/socket';
import { formatDuration, formatNaira } from '../../utils/formatters';
import type { AppStackParamList } from '../../navigation/RootNavigator';
import { VoiceCallPanel } from './VoiceCallPanel';

type Props = NativeStackScreenProps<AppStackParamList, 'HumanSession'>;

interface ChatMessage {
  id: string;
  text: string;
  sender: 'USER' | 'AGENT';
}

const TYPING_IDLE_MS = 1500;
// F-016 — the only reactions the server relays.
const REACTION_EMOJI = ['❤️', '🙏', '😢'] as const;
const REACTION_VISIBLE_MS = 2000;

export function HumanSessionScreen({ route, navigation }: Props) {
  const { sessionId, agentAlias, sessionType } = route.params;
  const toast = useToast();

  // Chat state — in memory only, by design (see schema.prisma privacy rule).
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [agentTyping, setAgentTyping] = useState(false);

  const [disclaimerVisible, setDisclaimerVisible] = useState(true);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [crisis, setCrisis] = useState<WsCrisisAlertEvent | null>(null);
  const [crisisModalVisible, setCrisisModalVisible] = useState(false);

  // Voice (F-013/F-014) — VOICE sessions start in voice mode; TEXT sessions
  // can switch after the listener accepts an upgrade.
  const [voiceMode, setVoiceMode] = useState(sessionType === 'VOICE');
  const [upgradeDeltaKobo, setUpgradeDeltaKobo] = useState<number | null>(null);
  const [requestingUpgrade, setRequestingUpgrade] = useState(false);

  // Quick reactions (F-016) — ephemeral overlay, never chat bubbles, never stored.
  const [floatingReactions, setFloatingReactions] = useState<
    Array<{ id: string; emoji: string }>
  >([]);
  const reactionSeqRef = useRef(0);

  const [elapsed, setElapsed] = useState(0);
  const [ratingVisible, setRatingVisible] = useState(false);
  const [rating, setRating] = useState<0 | 1 | 2 | 3 | 4 | 5>(0);
  const [comment, setComment] = useState('');
  const [submittingRating, setSubmittingRating] = useState(false);
  const [ending, setEnding] = useState(false);

  const listRef = useRef<FlatList<ChatMessage>>(null);
  const endedRef = useRef(false);
  const typingRef = useRef(false);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seqRef = useRef(0);

  function scrollToEnd() {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 30);
  }

  const showFloatingReaction = useCallback((emoji: string) => {
    reactionSeqRef.current += 1;
    const id = `r-${reactionSeqRef.current}`;
    setFloatingReactions((rs) => [...rs, { id, emoji }]);
    setTimeout(() => {
      setFloatingReactions((rs) => rs.filter((r) => r.id !== id));
    }, REACTION_VISIBLE_MS);
  }, []);

  // Session timer.
  useEffect(() => {
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // Socket room + listeners.
  useEffect(() => {
    const socket = getSocket();

    const onMessage = (e: WsMessageEvent) => {
      // Our own messages are appended optimistically on send; only take the agent's.
      if (e.sender !== 'AGENT') return;
      seqRef.current += 1;
      setMessages((m) => [
        ...m,
        { id: `${e.timestamp}-${seqRef.current}`, text: e.text, sender: 'AGENT' },
      ]);
      setAgentTyping(false);
      scrollToEnd();
    };
    const onTypingStart = (e: WsTypingEvent) => {
      if (e.sender === 'AGENT') setAgentTyping(true);
    };
    const onTypingStop = (e: WsTypingEvent) => {
      if (e.sender === 'AGENT') setAgentTyping(false);
    };
    const onCrisisAlert = (e: WsCrisisAlertEvent) => {
      setCrisis(e);
      setCrisisModalVisible(true);
    };
    const onSessionEnd = (_e: WsSessionEndEvent) => {
      if (endedRef.current) return;
      endedRef.current = true;
      toast.info('Thank you for being here.', 'Session ended');
      setRatingVisible(true);
    };
    const onErrorEvent = (e: { code: string }) => {
      toast.error(e.code, 'Something went wrong');
    };
    // F-016 — the server only relays to the rest of the room, so anything
    // arriving here is the listener's.
    const onReaction = (e: WsReactionEvent) => {
      if (e.sender === 'AGENT') showFloatingReaction(e.emoji);
    };
    // F-014 — text→voice upgrade outcomes.
    const onUpgradeAccepted = (e: { sessionId: string }) => {
      if (e.sessionId !== sessionId) return;
      setUpgradeDeltaKobo(null);
      setVoiceMode(true);
      toast.success('Voice is ready — start the call whenever you like.', 'Listener accepted');
    };
    const onUpgradeDeclined = (e: { sessionId: string }) => {
      if (e.sessionId !== sessionId) return;
      setUpgradeDeltaKobo(null);
      toast.info('Your listener prefers to continue in text.');
    };
    const onUpgradeFailed = (e: { sessionId: string; reason: string }) => {
      if (e.sessionId !== sessionId) return;
      setUpgradeDeltaKobo(null);
      if (e.reason === 'INSUFFICIENT_FUNDS') {
        toast.warning(
          'Not enough in your wallet for voice. Top up and try again — the chat continues.',
          'Wallet too low',
        );
      } else {
        toast.error('You can keep talking in text.', 'Could not switch to voice');
      }
    };

    socket.emit('join_room', { sessionId });
    socket.on('message', onMessage);
    socket.on('typing_start', onTypingStart);
    socket.on('typing_stop', onTypingStop);
    socket.on('crisis_alert', onCrisisAlert);
    socket.on('session_end', onSessionEnd);
    socket.on('error_event', onErrorEvent);
    socket.on('reaction', onReaction);
    socket.on('voice_upgrade_accepted', onUpgradeAccepted);
    socket.on('voice_upgrade_declined', onUpgradeDeclined);
    socket.on('voice_upgrade_failed', onUpgradeFailed);

    return () => {
      socket.emit('leave_room', { sessionId });
      socket.off('message', onMessage);
      socket.off('typing_start', onTypingStart);
      socket.off('typing_stop', onTypingStop);
      socket.off('crisis_alert', onCrisisAlert);
      socket.off('session_end', onSessionEnd);
      socket.off('error_event', onErrorEvent);
      socket.off('reaction', onReaction);
      socket.off('voice_upgrade_accepted', onUpgradeAccepted);
      socket.off('voice_upgrade_declined', onUpgradeDeclined);
      socket.off('voice_upgrade_failed', onUpgradeFailed);
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    };
  }, [sessionId, toast, showFloatingReaction]);

  function stopTyping() {
    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current);
      typingTimerRef.current = null;
    }
    if (typingRef.current) {
      typingRef.current = false;
      getSocket().emit('typing_stop', { sessionId });
    }
  }

  function handleInputChange(text: string) {
    setInput(text);
    if (endedRef.current) return;
    const socket = getSocket();
    if (!typingRef.current) {
      typingRef.current = true;
      socket.emit('typing_start', { sessionId });
    }
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      typingRef.current = false;
      socket.emit('typing_stop', { sessionId });
    }, TYPING_IDLE_MS);
  }

  function send() {
    const text = input.trim();
    if (!text || endedRef.current) return;
    stopTyping();
    seqRef.current += 1;
    setMessages((m) => [...m, { id: `local-${seqRef.current}`, text, sender: 'USER' }]);
    setInput('');
    getSocket().emit('send_message', { sessionId, text });
    scrollToEnd();
  }

  function sendReaction(emoji: string) {
    if (endedRef.current) return;
    getSocket().emit('reaction', { sessionId, emoji });
    // The server never echoes back to the sender — show our own locally.
    showFloatingReaction(emoji);
  }

  async function requestVoiceUpgrade() {
    if (requestingUpgrade || upgradeDeltaKobo !== null || endedRef.current) return;
    setRequestingUpgrade(true);
    try {
      const res = await api.requestVoiceUpgrade(sessionId);
      setUpgradeDeltaKobo(res.deltaKobo);
    } catch (err) {
      if (err instanceof NoniApiError && err.code === 'INSUFFICIENT_FUNDS') {
        toast.warning(
          'Not enough in your wallet for voice. Top up and try again — the chat continues.',
          'Wallet too low',
        );
      } else {
        toast.error(err instanceof Error ? err.message : 'Try again', 'Could not request voice');
      }
    } finally {
      setRequestingUpgrade(false);
    }
  }

  async function onEndSession() {
    if (ending || endedRef.current) return;
    setEnding(true);
    try {
      await api.endSession(sessionId);
      endedRef.current = true;
      setRatingVisible(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Try again', 'Could not end session');
    } finally {
      setEnding(false);
    }
  }

  async function onBlock() {
    try {
      await api.blockAgent(sessionId);
      toast.success('No charge for this session.', 'Session ended');
      navigation.navigate('Tabs');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Try again', 'Could not block');
    }
  }

  async function onReport(reason: ReportReason, details: string | undefined, includeEvidence: boolean) {
    try {
      // S-005 consented evidence: chat lives only on this device — it reaches the
      // server only when the reporter opts in, and only the last 50 messages.
      const evidence = includeEvidence
        ? messages.slice(-50).map((m) => ({ sender: m.sender, text: m.text }))
        : undefined;
      await api.reportAgent(sessionId, { reason, details, evidence });
      toast.success('A human reviewer reads every report, within 24 hours.', 'Report sent');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Try again', 'Could not send report');
    }
  }

  async function submitRating() {
    if (submittingRating) return;
    if (rating > 0) {
      setSubmittingRating(true);
      try {
        await api.rateSession(sessionId, {
          rating: rating as 1 | 2 | 3 | 4 | 5,
          comment: comment.trim() || undefined,
        });
      } catch {
        // Rating is best-effort — never trap the user in the modal.
      } finally {
        setSubmittingRating(false);
      }
    }
    setRatingVisible(false);
    navigation.navigate('Tabs');
  }

  return (
    <Screen>
      <Disclaimer visible={disclaimerVisible} onDismiss={() => setDisclaimerVisible(false)} />
      <CrisisAlert
        visible={crisisModalVisible}
        message={crisis?.message}
        onEscalate={() => setCrisisModalVisible(false)}
        onDismiss={() => setCrisisModalVisible(false)}
      />
      <BlockReportSheet
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
        onBlock={onBlock}
        onReport={onReport}
        evidenceMessageCount={messages.length}
      />

      {/* Header — alias + elapsed timer + end + overflow. */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          paddingBottom: spacing.md,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        <Avatar label={agentAlias} size={40} showPresence presenceColor={colors.success} />
        <View style={{ flex: 1 }}>
          <Text style={{ ...typography.bodyStrong, color: colors.text }} numberOfLines={1}>
            {agentAlias}
          </Text>
          <Text style={{ ...typography.mono, fontSize: 13, lineHeight: 16, color: colors.textMuted, marginTop: 2 }}>
            {formatDuration(elapsed)}
          </Text>
        </View>
        <Pressable
          onPress={onEndSession}
          disabled={ending}
          style={({ pressed }) => ({
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
            borderRadius: radius.sm,
            borderWidth: 1,
            borderColor: colors.border,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Text style={{ ...typography.caption, color: colors.textMuted }}>
            {ending ? 'Ending…' : 'End'}
          </Text>
        </Pressable>
        <Pressable onPress={() => setSheetVisible(true)} hitSlop={12}>
          <Feather name="more-vertical" size={20} color={colors.textMuted} />
        </Pressable>
      </View>

      {voiceMode ? <VoiceCallPanel sessionId={sessionId} /> : null}

      {!voiceMode && upgradeDeltaKobo !== null ? (
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
            Waiting for your listener to accept… ({formatNaira(upgradeDeltaKobo)} extra)
          </Text>
        </View>
      ) : null}

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
        keyboardVerticalOffset={80}
      >
        <FlatList
          ref={listRef}
          style={{ flex: 1 }}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ paddingVertical: spacing.md, gap: spacing.sm }}
          onContentSizeChange={scrollToEnd}
          ListEmptyComponent={
            <Text
              style={{
                ...typography.caption,
                color: colors.textDim,
                textAlign: 'center',
                paddingVertical: spacing.xl,
              }}
            >
              {agentAlias} is here. Start anywhere. Even the smallest thing.
            </Text>
          }
          renderItem={({ item }) => {
            const isMe = item.sender === 'USER';
            return (
              <View
                style={{
                  alignSelf: isMe ? 'flex-end' : 'flex-start',
                  backgroundColor: isMe ? colors.primary : colors.surface,
                  borderColor: isMe ? 'transparent' : colors.border,
                  borderWidth: isMe ? 0 : 1,
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.md,
                  borderRadius: radius.md,
                  borderBottomRightRadius: isMe ? 6 : radius.md,
                  borderBottomLeftRadius: isMe ? radius.md : 6,
                  maxWidth: '85%',
                }}
              >
                <Text
                  style={{
                    ...typography.body,
                    color: isMe ? colors.primaryInk : colors.text,
                  }}
                >
                  {item.text}
                </Text>
              </View>
            );
          }}
        />

        {/* F-016 — incoming reactions float near the top of the chat for ~2s. */}
        {floatingReactions.length > 0 ? (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: spacing.sm,
              left: 0,
              right: 0,
              flexDirection: 'row',
              justifyContent: 'center',
              gap: spacing.sm,
              zIndex: 5,
            }}
          >
            {floatingReactions.map((r) => (
              <FloatingReaction key={r.id} emoji={r.emoji} />
            ))}
          </View>
        ) : null}

        {agentTyping ? (
          <Text style={{ ...typography.caption, color: colors.textMuted, paddingBottom: spacing.xs }}>
            {agentAlias} is typing…
          </Text>
        ) : null}

        {/* Crisis strip — held, not alarmed. Stays pinned above the composer. */}
        {crisis ? (
          <Pressable
            onPress={() => setCrisisModalVisible(true)}
            style={{
              backgroundColor: colors.crisisSoft,
              borderColor: colors.crisis,
              borderWidth: 1,
              borderRadius: radius.sm,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.sm,
              marginBottom: spacing.sm,
            }}
          >
            <Text style={{ ...typography.caption, color: colors.text }}>
              You matter. Right now. MANI{' '}
              <Text style={{ ...typography.mono, fontSize: 13, color: colors.crisis }}>
                {crisis.hotlineNumber}
              </Text>{' '}
              is always there — tap for options.
            </Text>
          </Pressable>
        ) : null}

        {/* F-016 quick reactions + F-014 switch-to-voice — subtle, above the composer. */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
            paddingTop: spacing.xs,
          }}
        >
          {REACTION_EMOJI.map((emoji) => (
            <Pressable
              key={emoji}
              onPress={() => sendReaction(emoji)}
              hitSlop={6}
              style={({ pressed }) => ({
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.xs,
                borderRadius: radius.pill,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: pressed ? colors.surfaceElev : 'transparent',
              })}
            >
              <Text style={{ fontSize: 15, lineHeight: 20 }}>{emoji}</Text>
            </Pressable>
          ))}
          <View style={{ flex: 1 }} />
          {!voiceMode && sessionType === 'TEXT' && upgradeDeltaKobo === null ? (
            <Pressable
              onPress={() => void requestVoiceUpgrade()}
              disabled={requestingUpgrade}
              hitSlop={6}
              style={({ pressed }) => ({ opacity: pressed || requestingUpgrade ? 0.6 : 1 })}
            >
              <Text style={{ ...typography.caption, color: colors.secondary }}>
                {requestingUpgrade ? 'Asking…' : 'Switch to voice'}
              </Text>
            </Pressable>
          ) : null}
        </View>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-end',
            gap: spacing.sm,
            paddingTop: spacing.sm,
            paddingBottom: spacing.sm,
          }}
        >
          <TextInput
            value={input}
            onChangeText={handleInputChange}
            placeholder="Type how you feel…"
            placeholderTextColor={colors.textDim}
            multiline
            style={{
              flex: 1,
              ...typography.body,
              color: colors.text,
              backgroundColor: colors.surface,
              borderColor: colors.borderStrong,
              borderWidth: 1,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.md,
              borderRadius: radius.md,
              maxHeight: 120,
            }}
          />
          <Pressable
            onPress={send}
            disabled={!input.trim()}
            style={({ pressed }) => ({
              width: 48,
              height: 48,
              borderRadius: 24,
              backgroundColor: input.trim() ? colors.primary : colors.surfaceElev,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text
              style={{
                ...typography.bodyStrong,
                color: input.trim() ? colors.primaryInk : colors.textDim,
              }}
            >
              ↑
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      {/* Rating — shown when the session ends, then home. */}
      <Modal visible={ratingVisible} transparent animationType="fade">
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(14, 11, 10, 0.85)',
            justifyContent: 'center',
            paddingHorizontal: spacing.lg,
          }}
        >
          <View
            style={{
              backgroundColor: colors.surface,
              borderRadius: radius.lg,
              borderWidth: 1,
              borderColor: colors.border,
              padding: spacing.xl,
              gap: spacing.md,
            }}
          >
            <Text style={{ ...typography.label, color: colors.textDim }}>Session ended</Text>
            <Text style={{ ...typography.display, fontSize: 28, lineHeight: 32, color: colors.text }}>
              How was{' '}
              <Text style={{ fontFamily: 'Fraunces-Italic', color: colors.emphasis }}>
                {agentAlias}
              </Text>
              ?
            </Text>

            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: spacing.md }}>
              {([1, 2, 3, 4, 5] as const).map((star) => (
                <Pressable key={star} onPress={() => setRating(star)} hitSlop={8}>
                  <Text
                    style={{
                      fontSize: 34,
                      lineHeight: 40,
                      color: star <= rating ? colors.primary : colors.textDim,
                    }}
                  >
                    {star <= rating ? '★' : '☆'}
                  </Text>
                </Pressable>
              ))}
            </View>

            <TextInput
              value={comment}
              onChangeText={setComment}
              placeholder="Anything you want to add (optional)"
              placeholderTextColor={colors.textDim}
              multiline
              style={{
                ...typography.body,
                color: colors.text,
                backgroundColor: colors.surfaceElev,
                borderColor: colors.border,
                borderWidth: 1,
                borderRadius: radius.md,
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.md,
                minHeight: 72,
              }}
            />

            <Pressable
              onPress={submitRating}
              disabled={submittingRating}
              style={({ pressed }) => ({
                backgroundColor: colors.primary,
                paddingVertical: spacing.md,
                borderRadius: radius.md,
                alignItems: 'center',
                opacity: pressed || submittingRating ? 0.85 : 1,
              })}
            >
              <Text style={{ ...typography.body, color: colors.primaryInk, fontWeight: '600' }}>
                {submittingRating ? 'Sending…' : rating > 0 ? 'Send and close' : 'Skip'}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

// F-016 — a reaction drifts up and fades over ~2s. Never a chat bubble,
// never stored; it exists only for the moment it is felt.
function FloatingReaction({ emoji }: { emoji: string }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: REACTION_VISIBLE_MS - 100,
      useNativeDriver: true,
    }).start();
  }, [anim]);

  return (
    <Animated.Text
      style={{
        fontSize: 26,
        lineHeight: 32,
        opacity: anim.interpolate({
          inputRange: [0, 0.12, 0.7, 1],
          outputRange: [0, 1, 1, 0],
        }),
        transform: [
          {
            translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [10, -14] }),
          },
        ],
      }}
    >
      {emoji}
    </Animated.Text>
  );
}
