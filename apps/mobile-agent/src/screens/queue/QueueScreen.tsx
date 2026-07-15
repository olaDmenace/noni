import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { AgentStatus } from '@noni/types';
import { Card, Screen, colors, radius, spacing, typography, useToast } from '@noni/ui';
import { api } from '../../api/client';
import { connectSocket } from '../../realtime/socket';
import { formatDate, formatNaira } from '../../utils/formatters';
import { SESSION_TYPE_LABEL, TIER_LABEL } from '../../utils/labels';
import type { AppStackParamList, AppTabParamList } from '../../navigation/RootNavigator';

type Props = CompositeScreenProps<
  BottomTabScreenProps<AppTabParamList, 'Queue'>,
  NativeStackScreenProps<AppStackParamList>
>;

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card padding="md" style={{ flex: 1 }}>
      <Text style={{ ...typography.label, color: colors.textDim }}>{label}</Text>
      <Text
        style={{
          ...typography.headline,
          color: colors.text,
          marginTop: 6,
          fontFamily: 'Geist-Medium',
          fontVariant: ['tabular-nums'],
        }}
        numberOfLines={1}
      >
        {value}
      </Text>
    </Card>
  );
}

export function QueueScreen({ navigation }: Props) {
  const qc = useQueryClient();
  const toast = useToast();
  const [status, setStatus] = useState<AgentStatus>(AgentStatus.OFFLINE);

  const dashboard = useQuery({
    queryKey: ['agentDashboard'],
    queryFn: () => api.agentDashboard(),
  });

  const queue = useQuery({
    queryKey: ['agentQueue'],
    queryFn: () => api.agentQueue(),
    refetchInterval: 5_000,
    enabled: dashboard.data?.canGoOnline ?? false,
  });

  const setAvail = useMutation({
    mutationFn: (next: AgentStatus) => api.setAgentStatus({ status: next }),
    onSuccess: (_data, variables) => {
      setStatus(variables);
      // F-029: the socket must stay up while AVAILABLE — a drop mid-session
      // interrupts and refunds the user. Connect (or re-connect) now.
      if (variables === AgentStatus.AVAILABLE) connectSocket();
      void qc.invalidateQueries({ queryKey: ['agentQueue'] });
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : 'Try again', 'Could not update status'),
  });

  const accept = useMutation({
    mutationFn: (sessionId: string) => api.acceptSession(sessionId),
    onSuccess: (session) => {
      void qc.invalidateQueries({ queryKey: ['agentQueue'] });
      navigation.navigate('Session', { sessionId: session.id });
    },
    onError: (err) => {
      void qc.invalidateQueries({ queryKey: ['agentQueue'] });
      toast.error(
        err instanceof Error ? err.message : 'It may have been reassigned',
        'Could not accept',
      );
    },
  });

  const pass = useMutation({
    mutationFn: (sessionId: string) => api.passSession(sessionId),
    onSettled: () => void qc.invalidateQueries({ queryKey: ['agentQueue'] }),
  });

  const available = status === AgentStatus.AVAILABLE;
  const canGoOnline = dashboard.data?.canGoOnline ?? false;
  const trainingDone = !!dashboard.data?.crisisTrainingPassedAt;
  const d = dashboard.data;

  const header = (
    <View>
      <View style={{ marginTop: spacing.md }}>
        <Text style={{ ...typography.label, color: colors.textDim }}>Today</Text>
        <Text style={{ ...typography.display, color: colors.text, marginTop: spacing.sm }}>
          Incoming
        </Text>
      </View>

      {dashboard.isLoading ? null : !trainingDone ? (
        <Card variant="elevated" style={{ marginTop: spacing.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Feather name="lock" size={18} color={colors.primary} />
            <Text style={{ ...typography.bodyStrong, color: colors.text }}>
              Crisis training required
            </Text>
          </View>
          <Text style={{ ...typography.body, color: colors.textMuted, marginTop: spacing.sm }}>
            Noni sessions carry real weight. Five modules and a short check before you take
            anyone.
          </Text>
          <Pressable
            onPress={() => navigation.navigate('CrisisTraining')}
            style={({ pressed }) => ({
              marginTop: spacing.md,
              backgroundColor: colors.primary,
              paddingVertical: spacing.md,
              borderRadius: radius.md,
              alignItems: 'center',
              opacity: pressed ? 0.9 : 1,
            })}
          >
            <Text style={{ ...typography.bodyStrong, color: colors.primaryInk }}>
              Start crisis training
            </Text>
          </Pressable>
        </Card>
      ) : null}

      <Pressable
        onPress={() =>
          setAvail.mutate(available ? AgentStatus.OFFLINE : AgentStatus.AVAILABLE)
        }
        disabled={setAvail.isPending || !canGoOnline}
        style={({ pressed }) => ({
          marginTop: spacing.lg,
          padding: spacing.lg,
          borderRadius: radius.md,
          backgroundColor: available ? colors.primaryMuted : colors.surface,
          borderWidth: 1,
          borderColor: available ? colors.primaryGlow : colors.border,
          opacity: !canGoOnline ? 0.5 : pressed ? 0.85 : 1,
        })}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <View
              style={{
                width: 10,
                height: 10,
                borderRadius: 5,
                backgroundColor: available ? colors.success : colors.textDim,
              }}
            />
            <Text style={{ ...typography.bodyStrong, color: colors.text }}>
              {available ? 'Available to take sessions' : 'Offline'}
            </Text>
          </View>
          <Text
            style={{
              ...typography.caption,
              color: available ? colors.primary : colors.textMuted,
              fontWeight: '600',
            }}
          >
            {setAvail.isPending ? 'Updating…' : available ? 'Go offline' : 'Go available'}
          </Text>
        </View>
        {!available ? (
          <Text style={{ ...typography.caption, color: colors.textMuted, marginTop: 6 }}>
            Users won&apos;t be routed to you until you switch on.
          </Text>
        ) : null}
      </Pressable>

      {d ? (
        <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Metric label="Today" value={formatNaira(d.earningsTodayKobo)} />
            <Metric label="This week" value={formatNaira(d.earningsThisWeekKobo)} />
            <Metric label="This month" value={formatNaira(d.earningsThisMonthKobo)} />
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Metric label="Sessions" value={String(d.sessionsCompleted)} />
            <Metric
              label="Rating"
              value={d.ratingCount > 0 ? `${d.ratingAvg.toFixed(1)} ★ (${d.ratingCount})` : '—'}
            />
            <Metric label="Next payout" value={formatDate(d.nextPayoutDate)} />
          </View>
        </View>
      ) : null}

      {/* Schedule (F-010) + practice bot (F-030) */}
      <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
        <Pressable
          onPress={() => navigation.navigate('Schedule')}
          style={({ pressed }) => ({
            flex: 1,
            padding: spacing.md,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surface,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Feather name="calendar" size={16} color={colors.secondary} />
            <Text style={{ ...typography.bodyStrong, color: colors.text }}>Schedule</Text>
          </View>
          <Text style={{ ...typography.caption, color: colors.textMuted, marginTop: 4 }}>
            Sessions booked ahead
          </Text>
        </Pressable>
        <Pressable
          onPress={() => navigation.navigate('Practice')}
          style={({ pressed }) => ({
            flex: 1,
            padding: spacing.md,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surface,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Feather name="message-circle" size={16} color={colors.secondary} />
            <Text style={{ ...typography.bodyStrong, color: colors.text }}>Practice</Text>
          </View>
          <Text style={{ ...typography.caption, color: colors.textMuted, marginTop: 4 }}>
            Rehearse with Chidi (AI)
          </Text>
        </Pressable>
      </View>

      {queue.isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
      ) : null}

      <Text
        style={{
          ...typography.label,
          color: colors.textDim,
          marginTop: spacing.xl,
          marginBottom: spacing.md,
        }}
      >
        Waiting for you
      </Text>
    </View>
  );

  return (
    <Screen>
      <FlatList
        data={queue.data?.requests ?? []}
        keyExtractor={(s) => s.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.xl }}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <Card variant="muted">
            <Text style={{ ...typography.body, color: colors.textMuted, textAlign: 'center' }}>
              {available
                ? 'Quiet for now. Someone will arrive soon.'
                : 'Go available to start receiving sessions.'}
            </Text>
          </Card>
        }
        renderItem={({ item }) => (
          <Card>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.sm,
                marginBottom: spacing.sm,
              }}
            >
              <View
                style={{
                  paddingHorizontal: spacing.sm,
                  paddingVertical: 4,
                  borderRadius: radius.pill,
                  backgroundColor: colors.primaryMuted,
                  borderWidth: 1,
                  borderColor: colors.primaryGlow,
                }}
              >
                <Text
                  style={{ ...typography.caption, color: colors.primary, fontWeight: '600' }}
                >
                  {TIER_LABEL[item.tier]}
                </Text>
              </View>
              <View
                style={{
                  paddingHorizontal: spacing.sm,
                  paddingVertical: 4,
                  borderRadius: radius.pill,
                  backgroundColor: colors.surfaceElev,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <Text style={{ ...typography.caption, color: colors.textMuted }}>
                  {SESSION_TYPE_LABEL[item.sessionType]}
                </Text>
              </View>
              {item.isPriority ? (
                <View
                  style={{
                    paddingHorizontal: spacing.sm,
                    paddingVertical: 4,
                    borderRadius: radius.pill,
                    backgroundColor: colors.emphasisMuted,
                  }}
                >
                  <Text
                    style={{ ...typography.caption, color: colors.emphasis, fontWeight: '600' }}
                  >
                    Priority
                  </Text>
                </View>
              ) : null}
            </View>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Pressable
                onPress={() => accept.mutate(item.id)}
                disabled={accept.isPending || pass.isPending}
                style={({ pressed }) => ({
                  flex: 1,
                  backgroundColor: colors.primary,
                  borderRadius: radius.md,
                  paddingVertical: spacing.md,
                  alignItems: 'center',
                  opacity: pressed || accept.isPending ? 0.9 : 1,
                })}
              >
                <Text style={{ ...typography.bodyStrong, color: colors.primaryInk }}>
                  {accept.isPending ? 'Accepting…' : 'Accept'}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => pass.mutate(item.id)}
                disabled={accept.isPending || pass.isPending}
                style={({ pressed }) => ({
                  paddingHorizontal: spacing.xl,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: radius.md,
                  paddingVertical: spacing.md,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Text style={{ ...typography.body, color: colors.textMuted }}>Pass</Text>
              </Pressable>
            </View>
          </Card>
        )}
      />
    </Screen>
  );
}
