// F-010 — advance scheduling, agent side.
//
// Read-only view of the agent's booked sessions. Bookings are created by
// users; at the scheduled start time the server turns each one into a normal
// session offer (F-032 modal), so there is nothing to "start" here — the
// agent just needs to be online when it lands.
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import React from 'react';
import { ActivityIndicator, FlatList, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { Booking } from '@noni/types';
import { Card, Screen, colors, radius, spacing, typography } from '@noni/ui';
import { api } from '../../api/client';
import { formatDate } from '../../utils/formatters';
import { SESSION_TYPE_LABEL, TIER_LABEL } from '../../utils/labels';
import type { AppStackParamList } from '../../navigation/RootNavigator';

type Props = NativeStackScreenProps<AppStackParamList, 'Schedule'>;

const STATUS_COPY: Record<Booking['status'], string> = {
  BOOKED: 'Booked',
  STARTED: 'Started',
  CANCELLED: 'Cancelled',
  MISSED: 'Missed',
};

/** "2026-07-18T14:30:00.000Z" → "3:30 PM" (device locale/zone). */
function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-NG', { hour: 'numeric', minute: '2-digit' });
}

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export function ScheduleScreen(_props: Props) {
  const schedule = useQuery({
    queryKey: ['agentSchedule'],
    queryFn: () => api.agentSchedule(),
  });

  const bookings = [...(schedule.data?.bookings ?? [])].sort(
    (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
  );

  const header = (
    <View>
      <View style={{ marginTop: spacing.md }}>
        <Text style={{ ...typography.label, color: colors.textDim }}>Booked ahead</Text>
        <Text style={{ ...typography.display, color: colors.text, marginTop: spacing.sm }}>
          Schedule
        </Text>
      </View>

      <Card variant="muted" style={{ marginTop: spacing.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
          <Feather name="bell" size={16} color={colors.secondary} style={{ marginTop: 2 }} />
          <Text style={{ ...typography.caption, color: colors.textMuted, flex: 1 }}>
            Booked sessions arrive automatically as offers at their start time — the same
            accept screen as queue requests. Just be online a few minutes before.
          </Text>
        </View>
      </Card>

      {schedule.isLoading ? (
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
        Upcoming
      </Text>
    </View>
  );

  return (
    <Screen>
      <FlatList
        data={bookings}
        keyExtractor={(b) => b.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.xl }}
        ListHeaderComponent={header}
        ListEmptyComponent={
          schedule.isLoading ? null : (
            <Card variant="muted">
              <Text style={{ ...typography.body, color: colors.textMuted, textAlign: 'center' }}>
                Nothing booked yet. When someone schedules you, it shows up here.
              </Text>
            </Card>
          )
        }
        renderItem={({ item }) => {
          const past = item.status !== 'BOOKED' && item.status !== 'STARTED';
          const today = isToday(item.scheduledAt);
          return (
            <Card style={past ? { opacity: 0.55 } : undefined}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <Text
                  style={{
                    ...typography.mono,
                    color: colors.text,
                  }}
                >
                  {formatDate(item.scheduledAt)} · {formatTime(item.scheduledAt)}
                </Text>
                {today && item.status === 'BOOKED' ? (
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
                      Today
                    </Text>
                  </View>
                ) : null}
              </View>
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  gap: spacing.sm,
                  marginTop: spacing.sm,
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
                {item.status !== 'BOOKED' ? (
                  <Text style={{ ...typography.caption, color: colors.textDim }}>
                    {STATUS_COPY[item.status]}
                  </Text>
                ) : null}
              </View>
            </Card>
          );
        }}
      />
    </Screen>
  );
}
