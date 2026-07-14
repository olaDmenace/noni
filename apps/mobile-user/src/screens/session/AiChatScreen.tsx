import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import React, { useRef, useState } from 'react';
import {
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

export function AiChatScreen({ route, navigation }: Props) {
  const { sessionId } = route.params;
  const [disclaimerVisible, setDisclaimerVisible] = useState(true);
  const [crisisVisible, setCrisisVisible] = useState(false);
  const [crisisMessage, setCrisisMessage] = useState<string | undefined>(undefined);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      sender: 'AI',
      text: "I'm here. Take your time. Start anywhere, even the smallest thing.",
    },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const listRef = useRef<FlatList<Message>>(null);

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
      </View>

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
