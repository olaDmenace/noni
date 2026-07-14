import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Screen, colors, radius, spacing, typography, useToast } from '@noni/ui';
import { api } from '../../api/client';
import { useAuthStore } from '../../stores/authStore';
import type { AuthStackParamList } from '../../navigation/RootNavigator';

type Props = NativeStackScreenProps<AuthStackParamList, 'Otp'>;

const CODE_LENGTH = 6;

export function OtpScreen({ route, navigation }: Props) {
  const { phone } = route.params;
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const setSession = useAuthStore((s) => s.setSession);
  const toast = useToast();

  async function verify(final?: string) {
    const value = (final ?? code).trim();
    if (value.length !== CODE_LENGTH) {
      toast.warning('Enter the 6-digit code');
      return;
    }
    setBusy(true);
    try {
      const tokens = await api.verifyOtp({ phone, code: value });
      await setSession(tokens);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Try again', 'Verification failed');
      setCode('');
      inputRef.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  async function onResend() {
    setResending(true);
    try {
      await api.requestOtp({ phone });
      toast.success('Code resent', 'Check your phone');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Try again', 'Could not resend');
    } finally {
      setResending(false);
    }
  }

  function handleChange(next: string) {
    const digits = next.replace(/\D/g, '').slice(0, CODE_LENGTH);
    setCode(digits);
    if (digits.length === CODE_LENGTH) {
      void verify(digits);
    }
  }

  const cells = Array.from({ length: CODE_LENGTH }, (_, i) => code[i] ?? '');

  return (
    <Screen>
      <View style={{ flex: 1 }}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={16}
          style={{ marginTop: spacing.sm }}
        >
          <Text style={{ ...typography.body, color: colors.textMuted }}>← Back</Text>
        </Pressable>

        <View style={{ flex: 1, justifyContent: 'center' }}>
          <Text style={{ ...typography.label, color: colors.textDim }}>Verify phone</Text>
          <Text style={{ ...typography.display, color: colors.text, marginTop: spacing.sm }}>
            Enter the{' '}
            <Text style={{ fontFamily: 'Fraunces-Italic', color: colors.emphasis }}>
              code
            </Text>
            .
          </Text>
          <Text style={{ ...typography.body, color: colors.textMuted, marginTop: spacing.md }}>
            We sent 6 digits to{' '}
            <Text style={{ ...typography.mono, color: colors.text }}>{phone}</Text>.
          </Text>

          <Pressable
            onPress={() => inputRef.current?.focus()}
            style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl }}
          >
            {cells.map((c, i) => {
              const active = code.length === i;
              return (
                <View
                  key={i}
                  style={{
                    flex: 1,
                    aspectRatio: 1,
                    borderRadius: radius.md,
                    backgroundColor: colors.surface,
                    borderWidth: 1,
                    borderColor: active ? colors.primary : colors.borderStrong,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text
                    style={{ fontFamily: 'Geist-Medium', fontSize: 26, color: colors.text }}
                  >
                    {c || (active ? '|' : '')}
                  </Text>
                </View>
              );
            })}
          </Pressable>

          <TextInput
            ref={inputRef}
            value={code}
            onChangeText={handleChange}
            keyboardType="number-pad"
            autoFocus
            maxLength={CODE_LENGTH}
            style={{ position: 'absolute', opacity: 0, width: 1, height: 1 }}
          />

          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'center',
              alignItems: 'center',
              gap: spacing.xs,
              marginTop: spacing.xl,
            }}
          >
            <Text style={{ ...typography.caption, color: colors.textMuted }}>
              Didn&apos;t get it?
            </Text>
            <Pressable onPress={onResend} disabled={resending} hitSlop={8}>
              <Text style={{ ...typography.caption, color: colors.secondary, fontWeight: '600' }}>
                {resending ? 'Sending…' : 'Resend'}
              </Text>
            </Pressable>
          </View>

          {busy ? (
            <Text
              style={{
                ...typography.caption,
                color: colors.textMuted,
                textAlign: 'center',
                marginTop: spacing.md,
              }}
            >
              Verifying…
            </Text>
          ) : null}
        </View>
      </View>
    </Screen>
  );
}
