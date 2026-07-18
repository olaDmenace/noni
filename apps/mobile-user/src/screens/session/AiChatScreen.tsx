import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  Avatar,
  CrisisAlert,
  Disclaimer,
  FadeInView,
  RichText,
  Screen,
  TypingDots,
  colors,
  radius,
  spacing,
  typography,
  useKeyboardInset,
} from '@noni/ui';
import { api } from '../../api/client';
import type { AppStackParamList } from '../../navigation/RootNavigator';

type Props = NativeStackScreenProps<AppStackParamList, 'AiChat'>;

interface Message {
  id: string;
  text: string;
  sender: 'USER' | 'AI' | 'SYSTEM';
}

// AI chat history lives ON THIS DEVICE ONLY — the server never stores chat
// content (schema.prisma privacy rule). Deleting the app deletes the history.
const HISTORY_FILE = `${FileSystem.documentDirectory}noni-ai-chat.json`;
const HISTORY_MAX_MESSAGES = 200;

const WELCOME: Message = {
  id: 'welcome',
  sender: 'AI',
  text: "I'm here. Take your time. Start anywhere, even the smallest thing.",
};

async function loadHistory(): Promise<Message[] | null> {
  try {
    const info = await FileSystem.getInfoAsync(HISTORY_FILE);
    if (!info.exists) return null;
    const parsed = JSON.parse(await FileSystem.readAsStringAsync(HISTORY_FILE)) as Message[];
    return Array.isArray(parsed) && parsed.length ? parsed : null;
  } catch {
    return null;
  }
}

async function saveHistory(messages: Message[]): Promise<void> {
  try {
    await FileSystem.writeAsStringAsync(
      HISTORY_FILE,
      JSON.stringify(messages.slice(-HISTORY_MAX_MESSAGES)),
    );
  } catch {
    // History is best-effort; never let persistence break the chat.
  }
}

export function AiChatScreen({ route, navigation }: Props) {
  const { sessionId } = route.params;
  const [disclaimerVisible, setDisclaimerVisible] = useState(true);
  const [crisisVisible, setCrisisVisible] = useState(false);
  const [crisisMessage, setCrisisMessage] = useState<string | undefined>(undefined);
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [userTyping, setUserTyping] = useState(false);
  const listRef = useRef<FlatList<Message>>(null);
  const historyLoaded = useRef(false);
  const keyboardInset = useKeyboardInset();
  const typingIdleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Presence line under "Noni": Available → "…listening" while the user types
  // → "…typing" while the reply is being composed.
  function onInputChange(text: string) {
    setInput(text);
    setUserTyping(true);
    if (typingIdleTimer.current) clearTimeout(typingIdleTimer.current);
    typingIdleTimer.current = setTimeout(() => setUserTyping(false), 1600);
  }
  useEffect(
    () => () => {
      if (typingIdleTimer.current) clearTimeout(typingIdleTimer.current);
    },
    [],
  );
  const presence: 'typing' | 'listening' | 'available' = busy
    ? 'typing'
    : userTyping
      ? 'listening'
      : 'available';

  // Restore the on-device history once, then persist every change after that.
  useEffect(() => {
    void loadHistory().then((saved) => {
      if (saved) setMessages(saved);
      historyLoaded.current = true;
    });
  }, []);
  useEffect(() => {
    if (historyLoaded.current) void saveHistory(messages);
  }, [messages]);

  function clearHistory() {
    Alert.alert('Clear this conversation?', 'History is only stored on this phone.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: () => {
          setMessages([WELCOME]);
          void FileSystem.deleteAsync(HISTORY_FILE, { idempotent: true });
        },
      },
    ]);
  }

  function scrollToEnd() {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 30);
  }

  // Keep the latest message visible when the keyboard claims its space.
  useEffect(() => {
    if (keyboardInset > 0) scrollToEnd();
  }, [keyboardInset]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setMessages((m) => [...m, { id: `${Date.now()}-u`, text, sender: 'USER' }]);
    setInput('');
    setBusy(true);
    scrollToEnd();
    try {
      const res = await api.sendAiMessage({ sessionId, message: text });
      setMessages((m) => [...m, { id: `${Date.now()}-a`, text: res.reply, sender: 'AI' }]);
      if (res.crisisDetected) {
        setCrisisMessage(res.reply);
        setCrisisVisible(true);
      }
      if (res.showUpgradeNudge) {
        setMessages((m) => [
          ...m,
          {
            id: `${Date.now()}-s`,
            text: 'Want to continue with a real listener? From ₦100.',
            sender: 'SYSTEM',
          },
        ]);
      }
    } catch (err) {
      setMessages((m) => [
        ...m,
        {
          id: `${Date.now()}-e`,
          text: err instanceof Error ? err.message : 'Could not reach Noni',
          sender: 'SYSTEM',
        },
      ]);
    } finally {
      setBusy(false);
      scrollToEnd();
    }
  }

  return (
    <Screen>
      <Disclaimer visible={disclaimerVisible} onDismiss={() => setDisclaimerVisible(false)} />
      <CrisisAlert
        visible={crisisVisible}
        message={crisisMessage}
        onEscalate={() => {
          setCrisisVisible(false);
          navigation.navigate('Tabs', { screen: 'Agents' } as never);
        }}
        onDismiss={() => setCrisisVisible(false)}
      />
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
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={12}
          style={{ padding: spacing.xs, marginLeft: -spacing.xs }}
        >
          <Feather name="arrow-left" size={22} color={colors.text} />
        </Pressable>
        <Avatar label="N" size={40} showPresence presenceColor={colors.success} />
        <View style={{ flex: 1 }}>
          <Text style={{ ...typography.bodyStrong, color: colors.text }}>Noni</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2, minHeight: 18 }}>
            <View
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: colors.success,
              }}
            />
            {presence === 'available' ? (
              <FadeInView key="available" rise={0}>
                <Text style={{ ...typography.caption, color: colors.success }}>Available</Text>
              </FadeInView>
            ) : (
              <FadeInView key={presence} rise={0}>
                <TypingDots
                  dotsFirst
                  label={presence === 'typing' ? 'typing' : 'listening'}
                  color={colors.success}
                />
              </FadeInView>
            )}
          </View>
        </View>
        <Pressable onPress={clearHistory} hitSlop={12} style={{ padding: spacing.xs }}>
          <Feather name="trash-2" size={18} color={colors.textDim} />
        </Pressable>
      </View>

      <KeyboardAvoidingView
        // iOS: KeyboardAvoidingView works. Android: it has proven unreliable
        // under SDK 54's edge-to-edge, so useKeyboardInset() measures the
        // keyboard and we pad for it explicitly (paddingBottom below).
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, paddingBottom: keyboardInset }}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
      >
        <FlatList
          ref={listRef}
          style={{ flex: 1 }}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ paddingVertical: spacing.md, gap: spacing.sm }}
          onContentSizeChange={scrollToEnd}
          ListFooterComponent={
            busy ? (
              <FadeInView
                style={{
                  alignSelf: 'flex-start',
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  borderWidth: 1,
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.md,
                  borderRadius: radius.md,
                  borderBottomLeftRadius: 6,
                  marginTop: spacing.sm,
                }}
              >
                <TypingDots label="Noni is typing" />
              </FadeInView>
            ) : null
          }
          renderItem={({ item }) => {
            if (item.sender === 'SYSTEM') {
              return (
                <FadeInView
                  style={{
                    alignSelf: 'center',
                    backgroundColor: colors.secondaryMuted,
                    borderColor: colors.secondaryGlow,
                    borderWidth: 1,
                    paddingHorizontal: spacing.md,
                    paddingVertical: spacing.sm,
                    borderRadius: radius.pill,
                    maxWidth: '90%',
                  }}
                >
                  <Text
                    style={{
                      ...typography.caption,
                      color: colors.secondary,
                      textAlign: 'center',
                    }}
                  >
                    {item.text}
                  </Text>
                </FadeInView>
              );
            }
            const isMe = item.sender === 'USER';
            return (
              <FadeInView
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
                {isMe ? (
                  <Text style={{ ...typography.body, color: colors.primaryInk }}>{item.text}</Text>
                ) : (
                  // AI replies can contain markdown (**bold**, lists) — render it.
                  <RichText text={item.text} style={{ ...typography.body, color: colors.text }} />
                )}
              </FadeInView>
            );
          }}
        />

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
            onChangeText={onInputChange}
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
            disabled={busy || !input.trim()}
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
              {busy ? '…' : '↑'}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
