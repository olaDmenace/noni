// F-003 — First-login preference pick. Shown once, when tierPreference is null.
import { useQueryClient } from '@tanstack/react-query';
import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import type { MeResponse, Tier } from '@noni/types';
import { Button, Screen, colors, radius, spacing, typography, useToast } from '@noni/ui';
import { api } from '../../api/client';
import { useAuthStore } from '../../stores/authStore';

const OPTIONS: Array<{ tier: Tier; label: string; detail: string }> = [
  { tier: 'T0', label: 'Noni AI', detail: 'Free · any hour' },
  { tier: 'T1', label: 'Text with a listener', detail: '₦100 · 20 minutes' },
  { tier: 'T2', label: 'Priority text', detail: '₦150 · front of the queue' },
  { tier: 'T3', label: 'Voice call', detail: '₦300 · 30 minutes' },
  { tier: 'T4', label: 'Longer voice call', detail: '₦500 · 60 minutes' },
];

export function PreferencesScreen() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const patchUser = useAuthStore((s) => s.patchUser);
  const [selected, setSelected] = useState<Tier | null>(null);
  const [saving, setSaving] = useState(false);

  async function onContinue() {
    if (!selected || saving) return;
    setSaving(true);
    try {
      await api.updateMe({ tierPreference: selected });
      queryClient.setQueryData<MeResponse>(['me'], (old) =>
        old ? { ...old, tierPreference: selected } : old,
      );
      await patchUser({ tierPreference: selected });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Try again', 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: spacing.xl }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ marginTop: spacing.xl }}>
          <Text style={{ ...typography.label, color: colors.textDim }}>One last thing</Text>
          <Text style={{ ...typography.display, color: colors.text, marginTop: spacing.sm }}>
            How would you like to{' '}
            <Text style={{ fontFamily: 'Fraunces-Italic', color: colors.emphasis }}>talk</Text>?
          </Text>
          <Text style={{ ...typography.body, color: colors.textMuted, marginTop: spacing.md }}>
            Pick what feels most like you. You can change this any time, or choose differently for
            each session.
          </Text>
        </View>

        <View style={{ gap: spacing.sm, marginTop: spacing.xl }}>
          {OPTIONS.map((o) => {
            const active = selected === o.tier;
            return (
              <Pressable
                key={o.tier}
                onPress={() => setSelected(o.tier)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingHorizontal: spacing.lg,
                  paddingVertical: spacing.md,
                  borderRadius: radius.md,
                  borderWidth: 1,
                  borderColor: active ? colors.primary : colors.border,
                  backgroundColor: active ? colors.primaryMuted : colors.surface,
                }}
              >
                <Text style={{ ...typography.bodyStrong, color: colors.text }}>{o.label}</Text>
                <Text style={{ ...typography.caption, color: colors.textMuted }}>{o.detail}</Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <View style={{ paddingTop: spacing.md }}>
        <Button
          label={saving ? 'Saving…' : 'Continue'}
          onPress={onContinue}
          disabled={!selected || saving}
        />
      </View>
    </Screen>
  );
}
