// F-030 — practice bot. Chat with "Chidi", an AI practice partner playing a
// distressed (non-crisis) user, so new agents can rehearse before going live.
//
// Same privacy posture as real sessions: messages live in component state
// only and evaporate when this screen unmounts. Each turn is a REST call
// (api.practiceMessage); "Start over" resets the server-side conversation.
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMutation } from '@tanstack/react-query';
import React, { useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Card, Screen, colors, radius, spacing, typography, useToast } from '@noni/ui';
import { api } from '../../api/client';
import type { AppStackParamList } from '../../navigation/RootNavigator';

type Props = NativeStackScreenProps<AppStackParamList, 'Practice'>;

interface PracticeMessage {
  id: string;
  from: 'AGENT' | 'CHIDI';
  text: string;
}

export function PracticeScreen(_props: Props) {
  const toast = useToast();
  const [messages, setMessages] = useState<PracticeMessage[]>([]);
  const [input, setInput] = useState('');
  const listRef = useRef<FlatList<PracticeMessage>>(null);
  const msgSeq = useRef(0);

  function append(from: PracticeMessage['from'], text: string) {
    msgSeq.current += 1;
    setMessages((m) => [...m, { id: `p${msgSeq.current}`, from, text }]);
  }

  const send = useMutation({
    mutationFn: (message: string) => api.practiceMessage(message),
    onSuccess: (res) => append('CHIDI', res.reply),
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : 'Try again', 'Chidi went quiet'),
  });

  const reset = useMutation({
    mutationFn: () => api.resetPractice(),
    onSuccess: () => {
      setMessages([]);
      toast.success('Fresh start. Chidi forgot everything.', 'Practice reset');
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : 'Try again', 'Could not reset'),
  });

  function handleSend() {
    const text = input.trim();
    if (!text || send.isPending) return;
    append('AGENT', text);
    setInput('');
    send.mutate(text);
  }

  const header = (
    <View>
      <View style={{ marginTop: spacing.md }}>
        <Text style={{ ...typography.label, color: colors.textDim }}>Training</Text>
        <Text style={{ ...typography.display, color: colors.text, marginTop: spacing.sm }}>
          Practice with{' '}
          <Text style={{ fontFamily: 'Fraunces-Italic', color: colors.emphasis }}>Chidi</Text>
        </Text>
      </View>

      <Card variant="muted" style={{ marginTop: spacing.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
          <Feather name="cpu" size={16} color={colors.secondary} style={{ marginTop: 2 }} />
          <Text style={{ ...typography.caption, color: colors.textMuted, flex: 1 }}>
            Practice before you go live. Chidi is an AI — real sessions connect you to real
            people. Try listening first, naming the feeling, and staying in your lane.
          </Text>
        </View>
      </Card>

      {messages.length > 0 ? (
        <Pressable
          onPress={() => reset.mutate()}
          disabled={reset.isPending}
          hitSlop={6}
          style={({ pressed }) => [styles.resetButton, pressed && styles.pressed]}
        >
          <Feather name="rotate-ccw" size={13} color={colors.secondary} />
          <Text style={{ ...typography.caption, color: colors.secondary }}>
            {reset.isPending ? 'Resetting…' : 'Start over'}
          </Text>
        </Pressable>
      ) : null}
      <View style={{ height: spacing.md }} />
    </View>
  );

  return (
    <Screen>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 96 : 0}
      >
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          style={{ flex: 1 }}
          contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.sm }}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          ListHeaderComponent={header}
          ListEmptyComponent={
            <View style={{ paddingHorizontal: spacing.xl, marginTop: spacing.lg }}>
              <Text style={{ ...typography.body, color: colors.textMuted, textAlign: 'center' }}>
                Say hello. Chidi is having a rough week and needs someone to{' '}
                <Text style={{ fontFamily: 'Fraunces-Italic', color: colors.emphasis }}>
                  listen
                </Text>
                .
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const mine = item.from === 'AGENT';
            return (
              <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                <Text style={{ ...typography.body, color: colors.text }}>{item.text}</Text>
              </View>
            );
          }}
        />

        {send.isPending ? (
          <Text style={{ ...typography.caption, color: colors.textDim, marginBottom: spacing.xs }}>
            Chidi is typing…
          </Text>
        ) : null}

        <View style={styles.composer}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Practice your opener…"
            placeholderTextColor={colors.textDim}
            multiline
            style={styles.composerInput}
          />
          <Pressable
            onPress={handleSend}
            disabled={!input.trim() || send.isPending}
            style={({ pressed }) => [
              styles.sendButton,
              { opacity: !input.trim() || send.isPending ? 0.4 : pressed ? 0.85 : 1 },
            ]}
          >
            <Feather name="arrow-up" size={20} color={colors.primaryInk} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
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
    marginBottom: spacing.sm,
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
  pressed: { opacity: 0.8 },
});
