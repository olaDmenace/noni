// F-026 — Monthly plans. Wallet-funded T6/T7 subscriptions.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { NoniApiError } from '@noni/api-client';
import { TIER_PRICING, type SubscriptionState, type Tier } from '@noni/types';
import { Card, Screen, colors, radius, spacing, typography, useToast } from '@noni/ui';
import { api } from '../../api/client';
import { formatNaira } from '../../utils/formatters';

type PlanTier = Extract<Tier, 'T6' | 'T7'>;

const PLANS: Array<{ tier: PlanTier; name: string; sessions: number; perks: string }> = [
  { tier: 'T6', name: 'Monthly Lite', sessions: 5, perks: '5 text sessions each month' },
  {
    tier: 'T7',
    name: 'Monthly Standard',
    sessions: 15,
    perks: '15 sessions each month, priority queue',
  },
];

function planName(tier: Tier): string {
  return PLANS.find((p) => p.tier === tier)?.name ?? tier;
}

function formatRenewal(iso: string): string {
  return new Date(iso).toLocaleDateString('en-NG', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function SubscriptionScreen() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['subscription'],
    queryFn: () => api.getSubscription(),
  });

  function applyState(next: SubscriptionState) {
    queryClient.setQueryData(['subscription'], { subscription: next });
  }

  function onMutationError(err: unknown) {
    if (err instanceof NoniApiError && err.code === 'INSUFFICIENT_FUNDS') {
      toast.warning(
        'Your wallet balance can’t cover this plan yet. Top up first, then come back.',
        'Wallet too low',
      );
    } else {
      toast.error(err instanceof Error ? err.message : 'Try again', 'Something went wrong');
    }
  }

  const createMutation = useMutation({
    mutationFn: (tier: PlanTier) => api.createSubscription({ tier }),
    onSuccess: (sub) => {
      applyState(sub);
      toast.success('Paid from your wallet. Sessions are ready when you are.', 'Plan active');
    },
    onError: onMutationError,
  });
  const pauseMutation = useMutation({
    mutationFn: () => api.pauseSubscription(),
    onSuccess: (sub) => {
      applyState(sub);
      toast.info('Your sessions will wait for you.', 'Plan paused');
    },
    onError: onMutationError,
  });
  const resumeMutation = useMutation({
    mutationFn: () => api.resumeSubscription(),
    onSuccess: (sub) => {
      applyState(sub);
      toast.success('Welcome back.', 'Plan resumed');
    },
    onError: onMutationError,
  });
  const cancelMutation = useMutation({
    mutationFn: () => api.cancelSubscription(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['subscription'] });
      toast.info('You can start again any time.', 'Plan cancelled');
    },
    onError: onMutationError,
  });

  const busy =
    createMutation.isPending ||
    pauseMutation.isPending ||
    resumeMutation.isPending ||
    cancelMutation.isPending;

  function confirmCancel() {
    Alert.alert(
      'Cancel your plan?',
      'Your remaining sessions stay usable until the end of the period, then the plan stops renewing.',
      [
        { text: 'Keep plan', style: 'cancel' },
        { text: 'Cancel plan', style: 'destructive', onPress: () => cancelMutation.mutate() },
      ],
    );
  }

  if (query.isLoading) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </Screen>
    );
  }

  const sub = query.data?.subscription ?? null;
  const hasPlan = sub !== null && sub.isActive;

  return (
    <Screen>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: spacing.xl }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ marginTop: spacing.md }}>
          <Text style={{ ...typography.label, color: colors.textDim }}>Monthly plans</Text>
          <Text style={{ ...typography.display, color: colors.text, marginTop: spacing.sm }}>
            A listener,{' '}
            <Text style={{ fontFamily: 'Fraunces-Italic', color: colors.emphasis }}>whenever</Text>.
          </Text>
        </View>

        {hasPlan && sub ? (
          <>
            <Card variant="elevated" style={{ marginTop: spacing.xl }}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <Text style={{ ...typography.title, color: colors.text }}>
                  {planName(sub.tier)}
                </Text>
                {sub.isPaused ? (
                  <View
                    style={{
                      backgroundColor: colors.secondaryMuted,
                      borderRadius: radius.pill,
                      paddingHorizontal: spacing.md,
                      paddingVertical: spacing.xs,
                    }}
                  >
                    <Text style={{ ...typography.label, color: colors.secondary }}>Paused</Text>
                  </View>
                ) : null}
              </View>

              <View style={{ flexDirection: 'row', gap: spacing.xl, marginTop: spacing.lg }}>
                <View>
                  <Text
                    style={{ ...typography.mono, fontSize: 28, lineHeight: 34, color: colors.text }}
                  >
                    {sub.sessionsRemaining + sub.rolloverSessions}
                  </Text>
                  <Text style={{ ...typography.caption, color: colors.textMuted, marginTop: 2 }}>
                    sessions left
                    {sub.rolloverSessions > 0 ? ` (incl. ${sub.rolloverSessions} rolled over)` : ''}
                  </Text>
                </View>
              </View>

              <Text style={{ ...typography.caption, color: colors.textMuted, marginTop: spacing.lg }}>
                {sub.isPaused
                  ? 'Renewal is on hold while paused.'
                  : `Renews ${formatRenewal(sub.renewsAt)} · ${formatNaira(
                      TIER_PRICING[sub.tier].priceKobo,
                    )}/mo from your wallet.`}
              </Text>
            </Card>

            <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
              <Pressable
                onPress={() => (sub.isPaused ? resumeMutation.mutate() : pauseMutation.mutate())}
                disabled={busy}
                style={({ pressed }) => ({
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: radius.md,
                  paddingVertical: spacing.md,
                  alignItems: 'center',
                  opacity: busy ? 0.5 : pressed ? 0.7 : 1,
                })}
              >
                <Text style={{ ...typography.body, color: colors.text }}>
                  {sub.isPaused
                    ? resumeMutation.isPending
                      ? 'Resuming…'
                      : 'Resume plan'
                    : pauseMutation.isPending
                      ? 'Pausing…'
                      : 'Pause plan'}
                </Text>
              </Pressable>
              <Pressable
                onPress={confirmCancel}
                disabled={busy}
                style={({ pressed }) => ({
                  paddingVertical: spacing.md,
                  alignItems: 'center',
                  opacity: busy ? 0.5 : pressed ? 0.7 : 1,
                })}
              >
                <Text style={{ ...typography.body, color: colors.textMuted }}>
                  {cancelMutation.isPending ? 'Cancelling…' : 'Cancel plan'}
                </Text>
              </Pressable>
            </View>
          </>
        ) : (
          <>
            <Text style={{ ...typography.body, color: colors.textMuted, marginTop: spacing.md }}>
              Paid from your wallet each month. Unused sessions roll over. Pause or cancel any
              time.
            </Text>
            <View style={{ gap: spacing.md, marginTop: spacing.xl }}>
              {PLANS.map((p) => (
                <Card key={p.tier} variant="elevated">
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <Text style={{ ...typography.title, color: colors.text }}>{p.name}</Text>
                    <Text style={{ ...typography.mono, color: colors.text }}>
                      {formatNaira(TIER_PRICING[p.tier].priceKobo)}/mo
                    </Text>
                  </View>
                  <Text style={{ ...typography.body, color: colors.textMuted, marginTop: spacing.sm }}>
                    {p.perks}
                  </Text>
                  <Pressable
                    onPress={() => createMutation.mutate(p.tier)}
                    disabled={busy}
                    style={({ pressed }) => ({
                      marginTop: spacing.lg,
                      backgroundColor: colors.primary,
                      borderRadius: radius.md,
                      paddingVertical: spacing.md,
                      alignItems: 'center',
                      opacity: busy ? 0.5 : pressed ? 0.88 : 1,
                    })}
                  >
                    <Text style={{ ...typography.body, color: colors.primaryInk, fontWeight: '600' }}>
                      {createMutation.isPending && createMutation.variables === p.tier
                        ? 'Starting…'
                        : `Start ${p.name}`}
                    </Text>
                  </Pressable>
                </Card>
              ))}
            </View>
            <Text
              style={{
                ...typography.caption,
                color: colors.textDim,
                textAlign: 'center',
                marginTop: spacing.xl,
              }}
            >
              Paid from your wallet balance — top up first if you need to.
            </Text>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
