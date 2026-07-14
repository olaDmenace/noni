// Active session — chat, timer, crisis controls, private notes.
//
// Privacy rule (schema.prisma header): message content is NEVER persisted.
// Messages live in component state only and evaporate when this screen
// unmounts. Notes go through PUT /note which encrypts server-side (F-017).
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMutation, useQuery } from '@tanstack/react-query';
import React, { useEffect, useRef, useState } from 'react';
import {
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
import type {
  WsCrisisAlertEvent,
  WsMessageEvent,
  WsSessionEndEvent,
  WsTypingEvent,
} from '@noni/types';
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
import { formatDuration, formatNaira } from '../../utils/formatters';
import type { AppStackParamList } from '../../navigation/RootNavigator';

type Props = NativeStackScreenProps<AppStackParamList, 'Session'>;

interface ChatMessage extends WsMessageEvent {
  id: string;
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

  const listRef = useRef<FlatList<ChatMessage>>(null);
  const msgSeq = useRef(0);
  const typingRef = useRef(false);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, []);

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

    socket.on('message', onMessage);
    socket.on('typing_start', onTypingStart);
    socket.on('typing_stop', onTypingStop);
    socket.on('crisis_alert', onCrisis);
    socket.on('session_end', onEnd);
    socket.on('error_event', onErrorEvent);

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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

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

        {peerTyping ? (
          <Text style={{ ...typography.caption, color: colors.textDim, marginBottom: spacing.xs }}>
            They&apos;re typing…
          </Text>
        ) : null}

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
