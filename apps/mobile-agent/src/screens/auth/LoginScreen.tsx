import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Input, Screen, colors, spacing, typography, useToast } from '@noni/ui';
import { api } from '../../api/client';
import type { AuthStackParamList } from '../../navigation/RootNavigator';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export function LoginScreen({ navigation }: Props) {
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function send() {
    const cleaned = phone.trim();
    if (cleaned.length < 8) {
      toast.warning('Enter your phone number');
      return;
    }
    setBusy(true);
    try {
      await api.requestOtp({ phone: cleaned });
      navigation.navigate('Otp', { phone: cleaned });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Try again', 'Could not send code');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <Text style={{ ...typography.label, color: colors.textDim }}>Noni for listeners</Text>
        <Text
          style={{
            ...typography.display,
            color: colors.text,
            marginTop: spacing.sm,
          }}
        >
          Sign in to{' '}
          <Text style={{ fontFamily: 'Fraunces-Italic', color: colors.emphasis }}>
            hold space
          </Text>
          .
        </Text>
        <Text
          style={{
            ...typography.body,
            color: colors.textMuted,
            marginTop: spacing.md,
          }}
        >
          Your number stays hashed. Your alias is the only thing users see.
        </Text>

        <Input
          label="Phone"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          placeholder="+234 803 000 0000"
          mono
          containerStyle={{ marginTop: spacing.xl }}
          hint="Include country code."
        />

        <Button
          label={busy ? 'Sending…' : 'Send code'}
          onPress={send}
          disabled={busy}
          style={{ marginTop: spacing.lg }}
        />

        <Text
          style={{
            ...typography.caption,
            color: colors.textDim,
            textAlign: 'center',
            marginTop: spacing.xxl,
          }}
        >
          New listener? Apply at{' '}
          <Text style={{ color: colors.secondary, fontWeight: '600' }}>
            noni.app/listeners
          </Text>
        </Text>
      </View>
    </Screen>
  );
}
