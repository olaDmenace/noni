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
import { Avatar, CrisisAlert, Disclaimer, Screen, colors, radius, spacing, typography } from '@noni/ui';
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
  const listRef = useRef<FlatList<Message>>(null);
  const historyLoaded = useRef(false);

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
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <View
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: colors.success,
              }}
            />
            <Text style={{ ...typography.caption, color: colors.success }}>listening</Text>
          </View>
        </View>
        <Pressable onPress={clearHistory} hitSlop={12} style={{ padding: spacing.xs }}>
          <Feather name="trash-2" size={18} color={colors.textDim} />
        </Pressable>
      </View>

      <KeyboardAvoidingView
        // SDK 54 is edge-to-edge on Android: the window no longer auto-resizes for
        // the keyboard, so Android needs explicit padding behavior too.
        behavior="padding"
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
      >
        <FlatList
          ref={listRef}
          style={{ flex: 1 }}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ paddingVertical: spacing.md, gap: spacing.sm }}
          onContentSizeChange={scrollToEnd}
          renderItem={({ item }) => {
            if (item.sender === 'SYSTEM') {
              return (
                <View
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
                </View>
              );
            }
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
            onChangeText={setInput}
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
