import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, Text, TextInput, View } from 'react-native';
import {
  Button,
  COUNTRIES,
  Screen,
  colors,
  radius,
  spacing,
  typography,
  useToast,
  type Country,
} from '@noni/ui';
import { api } from '../../api/client';
import type { AuthStackParamList } from '../../navigation/RootNavigator';

type Props = NativeStackScreenProps<AuthStackParamList, 'Welcome'>;

function normalizeLocal(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  return digits.startsWith('0') ? digits.slice(1) : digits;
}

export function WelcomeScreen({ navigation }: Props) {
  const toast = useToast();
  const [country, setCountry] = useState<Country>(COUNTRIES[0]!);
  const [local, setLocal] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.dial.includes(q) ||
        c.code.toLowerCase().includes(q)
    );
  }, [query]);

  async function onContinue() {
    const digits = normalizeLocal(local);
    if (digits.length < 7) {
      toast.warning('Enter your phone number', 'Almost there');
      return;
    }
    const phone = `${country.dial}${digits}`;
    setSubmitting(true);
    try {
      await api.requestOtp({ phone });
      navigation.navigate('HowItWorks', { phone });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Try again', 'Could not send code');
    } finally {
      setSubmitting(false);
    }
  }

  function openPicker() {
    setQuery('');
    setPickerOpen(true);
  }

  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <Text style={{ ...typography.display, color: colors.text }}>Noni</Text>
        <Text style={{ ...typography.body, color: colors.textMuted, marginTop: spacing.sm }}>
          Talk to someone who actually listens. No name, no judgment.
        </Text>
        <View style={{ marginTop: spacing.xl }}>
          <Text style={{ ...typography.label, color: colors.textDim }}>Phone</Text>
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
            <Pressable
              onPress={openPicker}
              accessibilityLabel={`Country: ${country.name}`}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.md,
                backgroundColor: colors.surface,
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: colors.borderStrong,
              }}
            >
              <Text style={{ fontSize: 20 }}>{country.flag}</Text>
              <Text style={{ ...typography.mono, color: colors.text }}>{country.dial}</Text>
              <Text style={{ color: colors.textDim, fontSize: 11 }}>▾</Text>
            </Pressable>
            <TextInput
              value={local}
              onChangeText={setLocal}
              keyboardType="phone-pad"
              placeholder="803 000 0000"
              placeholderTextColor={colors.textDim}
              style={{
                flex: 1,
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.md,
                backgroundColor: colors.surface,
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: colors.borderStrong,
                color: colors.text,
                ...typography.mono,
              }}
            />
          </View>
          <Text style={{ ...typography.caption, color: colors.textDim, marginTop: spacing.sm }}>
            Your number is hashed. We never share it.
          </Text>
          <Button
            label={submitting ? 'Sending…' : 'Send code'}
            onPress={onContinue}
            disabled={submitting}
            style={{ marginTop: spacing.lg }}
          />
        </View>
      </View>

      <Modal
        visible={pickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPickerOpen(false)}
      >
        <Pressable
          onPress={() => setPickerOpen(false)}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              backgroundColor: colors.surfaceElev,
              borderTopLeftRadius: radius.xl,
              borderTopRightRadius: radius.xl,
              paddingTop: spacing.lg,
              paddingBottom: spacing.xl,
              height: '80%',
            }}
          >
            <View
              style={{
                alignSelf: 'center',
                width: 40,
                height: 4,
                borderRadius: 2,
                backgroundColor: colors.borderStrong,
                marginBottom: spacing.lg,
              }}
            />
            <Text
              style={{
                ...typography.title,
                color: colors.text,
                paddingHorizontal: spacing.lg,
                marginBottom: spacing.md,
              }}
            >
              Choose country
            </Text>
            <View style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.md }}>
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search country or code"
                placeholderTextColor={colors.textDim}
                autoCorrect={false}
                autoCapitalize="none"
                style={{
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.md,
                  backgroundColor: colors.surface,
                  borderRadius: radius.md,
                  borderWidth: 1,
                  borderColor: colors.borderStrong,
                  color: colors.text,
                  ...typography.body,
                }}
              />
            </View>
            <FlatList
              data={filtered}
              keyExtractor={(c) => c.code}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <Text
                  style={{
                    ...typography.body,
                    color: colors.textMuted,
                    textAlign: 'center',
                    paddingVertical: spacing.xl,
                  }}
                >
                  No match
                </Text>
              }
              renderItem={({ item }) => {
                const active = item.code === country.code;
                return (
                  <Pressable
                    onPress={() => {
                      setCountry(item);
                      setPickerOpen(false);
                    }}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: spacing.md,
                      paddingHorizontal: spacing.lg,
                      paddingVertical: spacing.md,
                      backgroundColor: active ? colors.primaryMuted : 'transparent',
                    }}
                  >
                    <Text style={{ fontSize: 24 }}>{item.flag}</Text>
                    <Text style={{ ...typography.body, color: colors.text, flex: 1 }}>
                      {item.name}
                    </Text>
                    <Text style={{ ...typography.mono, color: colors.textMuted }}>{item.dial}</Text>
                  </Pressable>
                );
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}
