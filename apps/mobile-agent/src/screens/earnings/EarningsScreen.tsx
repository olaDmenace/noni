import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import type { AgentPayout } from '@noni/types';
import { Card, Screen, colors, radius, spacing, typography, useToast } from '@noni/ui';
import { api } from '../../api/client';
import { formatDate, formatNaira } from '../../utils/formatters';
import type { AppStackParamList, AppTabParamList } from '../../navigation/RootNavigator';

type Props = CompositeScreenProps<
  BottomTabScreenProps<AppTabParamList, 'Earnings'>,
  NativeStackScreenProps<AppStackParamList>
>;

type MetricProps = {
  label: string;
  value: string;
};

function Metric({ label, value }: MetricProps) {
  return (
    <Card style={{ flex: 1 }}>
      <Text style={{ ...typography.label, color: colors.textDim }}>{label}</Text>
      <Text
        style={{
          ...typography.title,
          color: colors.text,
          marginTop: 6,
          fontFamily: 'Geist-Medium',
          fontVariant: ['tabular-nums'],
        }}
      >
        {value}
      </Text>
    </Card>
  );
}

const PAYOUT_STATUS: Record<
  AgentPayout['status'],
  { label: string; color: string; bg: string }
> = {
  PENDING: { label: 'Pending', color: colors.warning, bg: 'rgba(212, 162, 76, 0.14)' },
  SUCCESS: { label: 'Paid', color: colors.success, bg: 'rgba(111, 168, 139, 0.14)' },
  FAILED: { label: 'Failed', color: colors.crisis, bg: colors.crisisSoft },
};

export function EarningsScreen({ navigation }: Props) {
  const toast = useToast();
  const qc = useQueryClient();
  const dash = useQuery({ queryKey: ['agentDashboard'], queryFn: () => api.agentDashboard() });
  const payouts = useQuery({ queryKey: ['agentPayouts'], queryFn: () => api.listPayouts() });

  const payout = useMutation({
    mutationFn: () => api.requestPayout(),
    onSuccess: () => {
      toast.success('Request submitted', 'Payout in 2–3 business days');
      void qc.invalidateQueries({ queryKey: ['agentDashboard'] });
      void qc.invalidateQueries({ queryKey: ['agentPayouts'] });
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : 'Try again', 'Could not request payout'),
  });

  if (dash.isLoading) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </Screen>
    );
  }

  const d = dash.data;
  const balance = d?.earningsBalanceKobo ?? 0;
  const minPayout = d?.minPayoutKobo ?? 0;
  const hasBank = d?.hasBankAccount ?? false;
  const belowMin = balance < minPayout;
  const canRequest = !belowMin && hasBank && balance > 0;

  return (
    <Screen>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: spacing.xl }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ marginTop: spacing.xl }}>
          <Text style={{ ...typography.label, color: colors.textDim }}>Earnings balance</Text>
          <Text
            style={{
              ...typography.display,
              fontSize: 44,
              lineHeight: 48,
              color: colors.text,
              marginTop: spacing.sm,
            }}
          >
            {d ? formatNaira(balance) : '—'}
          </Text>
          <Text
            style={{
              ...typography.caption,
              color: colors.textMuted,
              marginTop: spacing.xs,
            }}
          >
            Next payout: {d ? formatDate(d.nextPayoutDate) : '—'} · Minimum payout:{' '}
            {d ? formatNaira(minPayout) : '—'}
          </Text>
        </View>

        <Pressable
          onPress={() => payout.mutate()}
          disabled={payout.isPending || !canRequest}
          style={({ pressed }) => ({
            marginTop: spacing.lg,
            backgroundColor: canRequest ? colors.primary : colors.surfaceElev,
            borderWidth: 1,
            borderColor: canRequest ? 'transparent' : colors.border,
            borderRadius: radius.md,
            paddingVertical: spacing.md,
            alignItems: 'center',
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Text
            style={{
              ...typography.bodyStrong,
              color: canRequest ? colors.primaryInk : colors.textDim,
            }}
          >
            {payout.isPending ? 'Requesting…' : 'Request payout'}
          </Text>
        </Pressable>

        {!hasBank ? (
          <Pressable
            onPress={() => navigation.navigate('Profile')}
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          >
            <Text style={{ ...typography.caption, color: colors.textMuted, marginTop: spacing.sm }}>
              Add your bank account first so we know where to send it.{' '}
              <Text style={{ color: colors.secondary, fontWeight: '600' }}>
                Add bank details in Profile ›
              </Text>
            </Text>
          </Pressable>
        ) : belowMin ? (
          <Text style={{ ...typography.caption, color: colors.textMuted, marginTop: spacing.sm }}>
            Payouts unlock at {formatNaira(minPayout)}. You&apos;re{' '}
            {formatNaira(minPayout - balance)} away — it adds up.
          </Text>
        ) : null}

        <Text
          style={{
            ...typography.label,
            color: colors.textDim,
            marginTop: spacing.xxl,
            marginBottom: spacing.md,
          }}
        >
          This week
        </Text>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Metric label="Earned" value={d ? formatNaira(d.earningsThisWeekKobo) : '—'} />
          <Metric label="Sessions" value={String(d?.sessionsCompleted ?? 0)} />
        </View>

        <Text
          style={{
            ...typography.label,
            color: colors.textDim,
            marginTop: spacing.xl,
            marginBottom: spacing.md,
          }}
        >
          Rating
        </Text>
        <Card>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'baseline',
              justifyContent: 'space-between',
            }}
          >
            <Text
              style={{
                ...typography.display,
                fontFamily: 'Geist-Medium',
                color: colors.text,
                fontVariant: ['tabular-nums'],
              }}
            >
              {d && d.ratingCount > 0 ? d.ratingAvg.toFixed(1) : '—'}
            </Text>
            <Text style={{ ...typography.caption, color: colors.textMuted }}>
              ★ average across {d?.ratingCount ?? 0} rated sessions
            </Text>
          </View>
        </Card>

        <Text
          style={{
            ...typography.label,
            color: colors.textDim,
            marginTop: spacing.xl,
            marginBottom: spacing.md,
          }}
        >
          Payout history
        </Text>
        {payouts.isLoading ? (
          <ActivityIndicator color={colors.primary} />
        ) : (payouts.data?.payouts.length ?? 0) === 0 ? (
          <Card variant="muted">
            <Text style={{ ...typography.body, color: colors.textMuted, textAlign: 'center' }}>
              No payouts yet. Your first one lands here.
            </Text>
          </Card>
        ) : (
          <View style={{ gap: spacing.sm }}>
            {payouts.data?.payouts.map((p) => {
              const s = PAYOUT_STATUS[p.status];
              return (
                <Card key={p.id} padding="md">
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <View>
                      <Text
                        style={{
                          ...typography.bodyStrong,
                          color: colors.text,
                          fontFamily: 'Geist-Medium',
                          fontVariant: ['tabular-nums'],
                        }}
                      >
                        {formatNaira(p.amountKobo)}
                      </Text>
                      <Text
                        style={{ ...typography.caption, color: colors.textDim, marginTop: 2 }}
                      >
                        {formatDate(p.createdAt)}
                        {p.settledAt ? ` · settled ${formatDate(p.settledAt)}` : ''}
                      </Text>
                    </View>
                    <View
                      style={{
                        paddingHorizontal: spacing.sm,
                        paddingVertical: 4,
                        borderRadius: radius.pill,
                        backgroundColor: s.bg,
                      }}
                    >
                      <Text style={{ ...typography.caption, color: s.color, fontWeight: '600' }}>
                        {s.label}
                      </Text>
                    </View>
                  </View>
                </Card>
              );
            })}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}
