// F-010 — Advance scheduling, a T6/T7 subscriber perk. Book a listener up to
// 7 days ahead (min 30 minutes' notice); the server sweeper starts the session
// at the booked time with normal matching/billing rules.
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { NoniApiError } from '@noni/api-client';
import { SessionType, TIER_PRICING, type Booking, type Tier } from '@noni/types';
import { Avatar, Card, Screen, colors, radius, spacing, typography, useToast } from '@noni/ui';
import { api } from '../../api/client';
import { formatNaira } from '../../utils/formatters';
import type { AppStackParamList } from '../../navigation/RootNavigator';

type Props = NativeStackScreenProps<AppStackParamList, 'Schedule'>;

type BookAheadTier = Extract<Tier, 'T1' | 'T3'>;

const TIER_OPTIONS: Array<{
  tier: BookAheadTier;
  label: string;
  detail: string;
  sessionType: SessionType;
}> = [
  { tier: 'T1', label: 'Text', detail: '20 minutes', sessionType: SessionType.TEXT },
  { tier: 'T3', label: 'Voice', detail: '30 minutes', sessionType: SessionType.VOICE },
];

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const MINUTES = [0, 15, 30, 45];
const MIN_AHEAD_MS = 30 * 60_000; // mirrors the server's 30-minute rule

function two(n: number): string {
  return n.toString().padStart(2, '0');
}

function formatBookingTime(iso: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString('en-NG', { weekday: 'short', month: 'short', day: 'numeric' });
  return `${day} · ${two(d.getHours())}:${two(d.getMinutes())}`;
}

export function ScheduleScreen({ route, navigation }: Props) {
  const { agentId, agentAlias, sessionTypes } = route.params;
  const toast = useToast();
  const queryClient = useQueryClient();

  const subQuery = useQuery({
    queryKey: ['subscription'],
    queryFn: () => api.getSubscription(),
  });
  const sub = subQuery.data?.subscription ?? null;
  const isSubscriber = sub !== null && sub.isActive && !sub.isPaused;

  const bookingsQuery = useQuery({
    queryKey: ['bookings'],
    queryFn: () => api.myBookings(),
    enabled: isSubscriber,
  });

  const days = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
      const label =
        i === 0
          ? 'Today'
          : i === 1
            ? 'Tomorrow'
            : date.toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric' });
      return { key: date.toISOString(), label, date };
    });
  }, []);

  const [selectedTier, setSelectedTier] = useState<BookAheadTier | null>(() => {
    const first = TIER_OPTIONS.find((o) => sessionTypes.includes(o.sessionType));
    return first?.tier ?? null;
  });
  const [dayIndex, setDayIndex] = useState(0);
  const [hour, setHour] = useState<number | null>(null);
  const [minute, setMinute] = useState(0);

  const scheduledAt = useMemo(() => {
    if (hour === null) return null;
    const d = days[dayIndex].date;
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour, minute);
  }, [days, dayIndex, hour, minute]);

  const tooSoon = scheduledAt !== null && scheduledAt.getTime() < Date.now() + MIN_AHEAD_MS;
  const canBook = selectedTier !== null && scheduledAt !== null && !tooSoon;

  function bookingError(err: unknown) {
    if (err instanceof NoniApiError) {
      if (err.code === 'SUBSCRIPTION_REQUIRED') {
        toast.warning('Booking ahead comes with a monthly plan.', 'Subscribers only');
        navigation.navigate('Subscription');
        return;
      }
      if (err.code === 'SLOT_TAKEN') {
        toast.warning('That timeslot is already booked — pick another.', 'Slot taken');
        return;
      }
      if (err.code === 'TOO_SOON') {
        toast.warning('Book at least 30 minutes ahead.', 'Too soon');
        return;
      }
      if (err.code === 'TYPE_NOT_OFFERED') {
        toast.warning('This listener does not offer that session type.', 'Not offered');
        return;
      }
    }
    toast.error(err instanceof Error ? err.message : 'Try again', 'Could not book');
  }

  const createMutation = useMutation({
    mutationFn: (body: {
      agentId: string;
      tier: BookAheadTier;
      sessionType: SessionType;
      scheduledAt: string;
    }) => api.createBooking(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['bookings'] });
      setHour(null);
      toast.success(`${agentAlias} will be there. See you then.`, 'Session booked');
    },
    onError: bookingError,
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.cancelBooking(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['bookings'] });
      toast.info('Booking cancelled.', 'Done');
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : 'Try again', 'Could not cancel'),
  });

  function submitBooking() {
    if (!canBook || createMutation.isPending || !selectedTier || !scheduledAt) return;
    const option = TIER_OPTIONS.find((o) => o.tier === selectedTier);
    if (!option) return;
    createMutation.mutate({
      agentId,
      tier: selectedTier,
      sessionType: option.sessionType,
      scheduledAt: scheduledAt.toISOString(),
    });
  }

  function confirmCancel(booking: Booking) {
    Alert.alert('Cancel this booking?', formatBookingTime(booking.scheduledAt), [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Cancel booking',
        style: 'destructive',
        onPress: () => cancelMutation.mutate(booking.id),
      },
    ]);
  }

  if (subQuery.isLoading) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </Screen>
    );
  }

  // Upsell — booking ahead is a T6/T7 perk.
  if (!isSubscriber) {
    return (
      <Screen>
        <View style={{ marginTop: spacing.md }}>
          <Text style={{ ...typography.label, color: colors.textDim }}>Book ahead</Text>
          <Text style={{ ...typography.display, color: colors.text, marginTop: spacing.sm }}>
            A time that&apos;s{' '}
            <Text style={{ fontFamily: 'Fraunces-Italic', color: colors.emphasis }}>yours</Text>.
          </Text>
        </View>
        <Card variant="elevated" style={{ marginTop: spacing.xl }}>
          <Text style={{ ...typography.label, color: colors.textDim }}>Monthly plan perk</Text>
          <Text style={{ ...typography.title, color: colors.text, marginTop: spacing.sm }}>
            Reserve {agentAlias} up to 7 days ahead
          </Text>
          <Text style={{ ...typography.body, color: colors.textMuted, marginTop: spacing.sm }}>
            Advance booking comes with Monthly Lite and Monthly Standard. Pick a time that suits
            you, and your session starts on the dot.
          </Text>
          <Pressable
            onPress={() => navigation.navigate('Subscription')}
            style={({ pressed }) => ({
              marginTop: spacing.lg,
              backgroundColor: colors.primary,
              borderRadius: radius.md,
              paddingVertical: spacing.md,
              alignItems: 'center',
              opacity: pressed ? 0.88 : 1,
            })}
          >
            <Text style={{ ...typography.body, color: colors.primaryInk, fontWeight: '600' }}>
              See monthly plans
            </Text>
          </Pressable>
        </Card>
      </Screen>
    );
  }

  const bookings = bookingsQuery.data?.bookings ?? [];

  return (
    <Screen>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: spacing.xl }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <Avatar label={agentAlias} size={44} />
          <View style={{ flex: 1 }}>
            <Text style={{ ...typography.bodyStrong, color: colors.text }}>{agentAlias}</Text>
            <Text style={{ ...typography.caption, color: colors.textMuted, marginTop: 2 }}>
              Up to 7 days ahead · at least 30 minutes&apos; notice
            </Text>
          </View>
        </View>

        {/* How you'll talk */}
        <Text style={{ ...typography.label, color: colors.textDim, marginTop: spacing.xl }}>
          How you&apos;ll talk
        </Text>
        <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
          {TIER_OPTIONS.map((o) => {
            const supported = sessionTypes.includes(o.sessionType);
            const active = selectedTier === o.tier;
            return (
              <Pressable
                key={o.tier}
                onPress={() => supported && setSelectedTier(o.tier)}
                disabled={!supported}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingHorizontal: spacing.lg,
                  paddingVertical: spacing.md,
                  borderRadius: radius.md,
                  borderWidth: 1,
                  borderColor: active ? colors.primary : colors.border,
                  backgroundColor: active ? colors.primaryMuted : colors.surfaceElev,
                  opacity: supported ? 1 : 0.4,
                }}
              >
                <View>
                  <Text style={{ ...typography.bodyStrong, color: colors.text }}>{o.label}</Text>
                  <Text style={{ ...typography.caption, color: colors.textMuted, marginTop: 2 }}>
                    {supported ? o.detail : 'Not offered by this listener'}
                  </Text>
                </View>
                <Text style={{ ...typography.mono, color: colors.text }}>
                  {formatNaira(TIER_PRICING[o.tier].priceKobo)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Day */}
        <Text style={{ ...typography.label, color: colors.textDim, marginTop: spacing.xl }}>
          Day
        </Text>
        <View
          style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md }}
        >
          {days.map((d, i) => {
            const active = dayIndex === i;
            return (
              <Pressable
                key={d.key}
                onPress={() => setDayIndex(i)}
                style={{
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.sm,
                  borderRadius: radius.pill,
                  borderWidth: 1,
                  borderColor: active ? colors.primary : colors.border,
                  backgroundColor: active ? colors.primaryMuted : colors.surfaceElev,
                }}
              >
                <Text style={{ ...typography.caption, color: active ? colors.text : colors.textMuted }}>
                  {d.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Hour */}
        <Text style={{ ...typography.label, color: colors.textDim, marginTop: spacing.xl }}>
          Hour
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: spacing.sm, paddingVertical: spacing.md }}
        >
          {HOURS.map((h) => {
            const active = hour === h;
            return (
              <Pressable
                key={h}
                onPress={() => setHour(h)}
                style={{
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.sm,
                  borderRadius: radius.sm,
                  borderWidth: 1,
                  borderColor: active ? colors.primary : colors.border,
                  backgroundColor: active ? colors.primaryMuted : colors.surfaceElev,
                }}
              >
                <Text
                  style={{
                    ...typography.mono,
                    fontSize: 14,
                    color: active ? colors.text : colors.textMuted,
                  }}
                >
                  {two(h)}:00
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Minute */}
        <Text style={{ ...typography.label, color: colors.textDim, marginTop: spacing.md }}>
          Minute
        </Text>
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
          {MINUTES.map((m) => {
            const active = minute === m;
            return (
              <Pressable
                key={m}
                onPress={() => setMinute(m)}
                style={{
                  flex: 1,
                  alignItems: 'center',
                  paddingVertical: spacing.sm,
                  borderRadius: radius.sm,
                  borderWidth: 1,
                  borderColor: active ? colors.primary : colors.border,
                  backgroundColor: active ? colors.primaryMuted : colors.surfaceElev,
                }}
              >
                <Text
                  style={{
                    ...typography.mono,
                    fontSize: 14,
                    color: active ? colors.text : colors.textMuted,
                  }}
                >
                  :{two(m)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {scheduledAt !== null && tooSoon ? (
          <Text style={{ ...typography.caption, color: colors.warning, marginTop: spacing.md }}>
            Book at least 30 minutes ahead.
          </Text>
        ) : scheduledAt !== null ? (
          <Text style={{ ...typography.caption, color: colors.textMuted, marginTop: spacing.md }}>
            Booked for {formatBookingTime(scheduledAt.toISOString())}.
          </Text>
        ) : null}

        <Pressable
          onPress={submitBooking}
          disabled={!canBook || createMutation.isPending}
          style={({ pressed }) => ({
            marginTop: spacing.lg,
            backgroundColor: colors.primary,
            borderRadius: radius.md,
            paddingVertical: spacing.md,
            alignItems: 'center',
            opacity: !canBook || createMutation.isPending ? 0.5 : pressed ? 0.88 : 1,
          })}
        >
          <Text style={{ ...typography.body, color: colors.primaryInk, fontWeight: '600' }}>
            {createMutation.isPending ? 'Booking…' : 'Book session'}
          </Text>
        </Pressable>

        {/* My bookings */}
        <Text style={{ ...typography.label, color: colors.textDim, marginTop: spacing.xxl }}>
          My bookings
        </Text>
        <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
          {bookingsQuery.isLoading ? (
            <ActivityIndicator color={colors.primary} />
          ) : bookings.length === 0 ? (
            <Card variant="muted">
              <Text style={{ ...typography.body, color: colors.textMuted, textAlign: 'center' }}>
                Nothing booked yet.
              </Text>
            </Card>
          ) : (
            bookings.map((b) => (
              <Card key={b.id}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ ...typography.bodyStrong, color: colors.text }}>
                      {b.sessionType === SessionType.VOICE ? 'Voice session' : 'Text session'}
                    </Text>
                    <Text style={{ ...typography.caption, color: colors.textMuted, marginTop: 2 }}>
                      {formatBookingTime(b.scheduledAt)} ·{' '}
                      {formatNaira(TIER_PRICING[b.tier].priceKobo)}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => confirmCancel(b)}
                    disabled={cancelMutation.isPending}
                    hitSlop={8}
                    style={({ pressed }) => ({
                      opacity: cancelMutation.isPending ? 0.5 : pressed ? 0.7 : 1,
                    })}
                  >
                    <Text style={{ ...typography.caption, color: colors.textMuted }}>Cancel</Text>
                  </Pressable>
                </View>
              </Card>
            ))
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}
