// App lock gate — shown once per launch when the account has a PIN.
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Button, Input, Screen, colors, spacing, typography } from '@noni/ui';
import { api } from '../../api/client';
import { disconnectSocket } from '../../realtime/socket';
import { useAuthStore } from '../../stores/authStore';

export function LockScreen({ onUnlocked }: { onUnlocked: () => void }) {
  const signOut = useAuthStore((s) => s.signOut);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [checking, setChecking] = useState(false);

  async function onUnlock() {
    if (pin.length < 4 || checking) return;
    setChecking(true);
    setError(undefined);
    try {
      await api.verifyPin(pin);
      onUnlocked();
    } catch {
      setError('That PIN is not right. Take your time.');
      setPin('');
    } finally {
      setChecking(false);
    }
  }

  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <Text style={{ ...typography.label, color: colors.textDim }}>App lock</Text>
        <Text style={{ ...typography.display, color: colors.text, marginTop: spacing.sm }}>
          Welcome{' '}
          <Text style={{ fontFamily: 'Fraunces-Italic', color: colors.emphasis }}>back</Text>.
        </Text>
        <Text style={{ ...typography.body, color: colors.textMuted, marginTop: spacing.md }}>
          Enter your PIN to open your quiet room.
        </Text>

        <Input
          value={pin}
          onChangeText={(v) => setPin(v.replace(/\D/g, '').slice(0, 6))}
          keyboardType="number-pad"
          secureTextEntry
          autoFocus
          maxLength={6}
          placeholder="••••"
          mono
          error={error}
          containerStyle={{ marginTop: spacing.xl }}
        />

        <Button
          label={checking ? 'Checking…' : 'Unlock'}
          onPress={onUnlock}
          disabled={pin.length < 4 || checking}
          style={{ marginTop: spacing.lg }}
        />

        <Pressable
          onPress={() => {
            disconnectSocket();
            void signOut();
          }}
          hitSlop={8}
          style={{ marginTop: spacing.xl, alignSelf: 'center' }}
        >
          <Text style={{ ...typography.caption, color: colors.secondary }}>
            Forgot it? Sign out and start again.
          </Text>
        </Pressable>
      </View>
    </Screen>
  );
}
