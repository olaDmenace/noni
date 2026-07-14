// Settings → App lock. Set (or replace) a 4-6 digit PIN.
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQueryClient } from '@tanstack/react-query';
import React, { useState } from 'react';
import { Text, View } from 'react-native';
import type { MeResponse } from '@noni/types';
import { Button, Input, Screen, colors, spacing, typography, useToast } from '@noni/ui';
import { api } from '../../api/client';
import type { AppStackParamList } from '../../navigation/RootNavigator';

type Props = NativeStackScreenProps<AppStackParamList, 'SetPin'>;

function digitsOnly(v: string): string {
  return v.replace(/\D/g, '').slice(0, 6);
}

export function PinScreen({ navigation }: Props) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);

  const mismatch = confirm.length > 0 && !pin.startsWith(confirm);
  const ready = pin.length >= 4 && confirm === pin;

  async function onSave() {
    if (!ready || saving) return;
    setSaving(true);
    try {
      await api.setPin(pin);
      queryClient.setQueryData<MeResponse>(['me'], (old) =>
        old ? { ...old, hasPin: true } : old,
      );
      toast.success('You will be asked for it when the app opens.', 'App lock is on');
      navigation.goBack();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Try again', 'Could not set PIN');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen>
      <View style={{ flex: 1 }}>
        <View style={{ marginTop: spacing.xl }}>
          <Text style={{ ...typography.label, color: colors.textDim }}>App lock</Text>
          <Text style={{ ...typography.display, color: colors.text, marginTop: spacing.sm }}>
            Keep this room{' '}
            <Text style={{ fontFamily: 'Fraunces-Italic', color: colors.emphasis }}>yours</Text>.
          </Text>
          <Text style={{ ...typography.body, color: colors.textMuted, marginTop: spacing.md }}>
            A 4-6 digit PIN, asked once each time the app opens. No one who borrows your phone
            walks in here.
          </Text>
        </View>

        <Input
          label="Choose a PIN"
          value={pin}
          onChangeText={(v) => setPin(digitsOnly(v))}
          keyboardType="number-pad"
          secureTextEntry
          maxLength={6}
          placeholder="4-6 digits"
          mono
          containerStyle={{ marginTop: spacing.xl }}
        />
        <Input
          label="Type it again"
          value={confirm}
          onChangeText={(v) => setConfirm(digitsOnly(v))}
          keyboardType="number-pad"
          secureTextEntry
          maxLength={6}
          placeholder="Same digits"
          mono
          error={mismatch ? 'Those don’t match yet.' : undefined}
          containerStyle={{ marginTop: spacing.lg }}
        />

        <Button
          label={saving ? 'Saving…' : 'Turn on app lock'}
          onPress={onSave}
          disabled={!ready || saving}
          style={{ marginTop: spacing.xl }}
        />
      </View>
    </Screen>
  );
}
