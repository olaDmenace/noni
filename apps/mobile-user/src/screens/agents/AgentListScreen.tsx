import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useQuery } from '@tanstack/react-query';
import React, { useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, Text, View } from 'react-native';
import { NoniApiError } from '@noni/api-client';
import { AgentStatus, SessionType, TIER_PRICING, type Agent, type Tier } from '@noni/types';
import { Avatar, Card, Screen, colors, radius, spacing, typography, useToast } from '@noni/ui';
import { api } from '../../api/client';
import { formatNaira } from '../../utils/formatters';
import type { AppStackParamList, AppTabParamList } from '../../navigation/RootNavigator';

type Props = CompositeScreenProps<
  BottomTabScreenProps<AppTabParamList, 'Agents'>,
  NativeStackScreenProps<AppStackParamList>
>;

type BookableTier = Extract<Tier, 'T1' | 'T2' | 'T3' | 'T4'>;

const TIER_OPTIONS: Array<{
  tier: BookableTier;
  label: string;
  detail: string;
  sessionType: SessionType;
}> = [
  { tier: 'T1', label: 'Text', detail: '20 minutes', sessionType: SessionType.TEXT },
  { tier: 'T2', label: 'Priority text', detail: 'Front of the queue', sessionType: SessionType.TEXT },
  { tier: 'T3', label: 'Voice', detail: '30 minutes', sessionType: SessionType.VOICE },
  { tier: 'T4', label: 'Voice', detail: '60 minutes', sessionType: SessionType.VOICE },
];

function formatWait(secs: number): string {
  if (secs < 60) return 'now';
  const mins = Math.round(secs / 60);
  return `${mins} min${mins === 1 ? '' : 's'}`;
}

function presenceColor(status: AgentStatus): string {
  if (status === AgentStatus.AVAILABLE) return colors.success;
  if (status === AgentStatus.BUSY) return colors.warning;
  return colors.textDim;
}

export function AgentListScreen({ navigation }: Props) {
  const toast = useToast();
  const query = useQuery({
    queryKey: ['agents'],
    queryFn: () => api.listAgents({}),
  });

  const [bookingAgent, setBookingAgent] = useState<Agent | null>(null);
  const [selectedTier, setSelectedTier] = useState<BookableTier | null>(null);
  const [booking, setBooking] = useState(false);

  const agents = query.data?.agents ?? [];

  function openBooking(agent: Agent) {
    setSelectedTier(null);
    setBookingAgent(agent);
  }

  function closeBooking() {
    if (booking) return;
    setBookingAgent(null);
    setSelectedTier(null);
  }

  async function confirmBooking() {
    if (!bookingAgent || !selectedTier || booking) return;
    const option = TIER_OPTIONS.find((o) => o.tier === selectedTier);
    if (!option) return;
    setBooking(true);
    try {
      const res = await api.createSession({
        tier: selectedTier,
        sessionType: option.sessionType,
        isPriority: selectedTier === 'T2',
        preferredAgentId: bookingAgent.id,
      });
      setBookingAgent(null);
      setSelectedTier(null);
      navigation.navigate('Queue', { sessionId: res.session.id });
    } catch (err) {
      if (err instanceof NoniApiError && err.code === 'INSUFFICIENT_FUNDS') {
        toast.warning('Not enough in your wallet for this session. Top up and come back — we dey here.', 'Wallet too low');
      } else {
        toast.error(err instanceof Error ? err.message : 'Try again', 'Could not book');
      }
    } finally {
      setBooking(false);
    }
  }

  return (
    <Screen>
      <View style={{ marginBottom: spacing.lg }}>
        <Text style={{ ...typography.label, color: colors.textDim }}>
          Bring in a listener
        </Text>
        <Text
          style={{
            ...typography.display,
            color: colors.text,
            marginTop: spacing.sm,
          }}
        >
          Someone is{' '}
          <Text
            style={{
              fontFamily: 'Fraunces-Italic',
              color: colors.emphasis,
            }}
          >
            here
          </Text>
          .
        </Text>
        <Text
          style={{
            ...typography.caption,
            color: colors.textMuted,
            marginTop: spacing.sm,
          }}
        >
          Anonymous. No name, no profile. Just someone trained to hold space.
        </Text>
      </View>

      {query.isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : query.isError ? (
        <Card variant="muted">
          <Text style={{ ...typography.body, color: colors.danger }}>
            {(query.error as Error).message}
          </Text>
        </Card>
      ) : (
        <FlatList
          data={agents}
          keyExtractor={(a) => a.id}
          contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.xl }}
          ListEmptyComponent={
            <Card variant="muted">
              <Text
                style={{
                  ...typography.body,
                  color: colors.textMuted,
                  textAlign: 'center',
                }}
              >
                No listeners online right now. Try again in a minute.
              </Text>
            </Card>
          }
          renderItem={({ item }) => (
            <Pressable onPress={() => openBooking(item)}>
              <Card>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                  <Avatar
                    label={item.alias}
                    size={44}
                    showPresence
                    presenceColor={presenceColor(item.status)}
                  />
                  <View style={{ flex: 1 }}>
                    <View
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <Text style={{ ...typography.bodyStrong, color: colors.text }}>
                        {item.alias}
                      </Text>
                      <Text style={{ ...typography.mono, color: colors.textMuted, fontSize: 13 }}>
                        ★ {item.ratingAvg.toFixed(1)}
                      </Text>
                    </View>
                    <Text
                      style={{
                        ...typography.caption,
                        color: colors.textMuted,
                        marginTop: 2,
                      }}
                      numberOfLines={1}
                    >
                      {item.specialties.slice(0, 3).join(' · ')}
                    </Text>
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginTop: 4,
                      }}
                    >
                      <Text
                        style={{
                          ...typography.caption,
                          color:
                            item.status === AgentStatus.AVAILABLE
                              ? colors.success
                              : colors.textDim,
                        }}
                      >
                        {item.status === AgentStatus.AVAILABLE
                          ? `Available · ${formatWait(item.estimatedWaitSecs)}`
                          : item.status === AgentStatus.BUSY
                            ? 'In a session'
                            : 'Offline'}
                      </Text>
                      {/* F-010 — advance booking (T6/T7 perk). */}
                      <Pressable
                        onPress={() =>
                          navigation.navigate('Schedule', {
                            agentId: item.id,
                            agentAlias: item.alias,
                            sessionTypes: item.sessionTypes,
                          })
                        }
                        hitSlop={8}
                      >
                        <Text style={{ ...typography.caption, color: colors.secondary }}>
                          Book ahead ›
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              </Card>
            </Pressable>
          )}
        />
      )}

      {/* Booking sheet — pick how to talk, then confirm. */}
      <Modal
        visible={bookingAgent !== null}
        transparent
        animationType="slide"
        onRequestClose={closeBooking}
      >
        <Pressable
          onPress={closeBooking}
          style={{ flex: 1, backgroundColor: 'rgba(14, 11, 10, 0.85)', justifyContent: 'flex-end' }}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              backgroundColor: colors.surface,
              borderTopLeftRadius: radius.lg,
              borderTopRightRadius: radius.lg,
              borderWidth: 1,
              borderBottomWidth: 0,
              borderColor: colors.border,
              paddingHorizontal: spacing.lg,
              paddingTop: spacing.sm,
              paddingBottom: spacing.xl,
              gap: spacing.md,
            }}
          >
            <View
              style={{
                width: 44,
                height: 4,
                backgroundColor: colors.borderStrong,
                borderRadius: 2,
                alignSelf: 'center',
                marginBottom: spacing.sm,
              }}
            />
            <Text style={{ ...typography.title, color: colors.text }}>
              Talk with {bookingAgent?.alias}
            </Text>
            <Text style={{ ...typography.body, color: colors.textMuted }}>
              Pick how you&apos;d like to talk. If no one joins, you&apos;re refunded in full.
            </Text>

            <View style={{ gap: spacing.sm }}>
              {TIER_OPTIONS.map((o) => {
                const supported =
                  bookingAgent?.sessionTypes.includes(o.sessionType) ?? true;
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
                      <Text style={{ ...typography.bodyStrong, color: colors.text }}>
                        {o.label}
                      </Text>
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

            <Pressable
              onPress={confirmBooking}
              disabled={!selectedTier || booking}
              style={({ pressed }) => ({
                backgroundColor: colors.primary,
                paddingVertical: spacing.md,
                borderRadius: radius.md,
                alignItems: 'center',
                marginTop: spacing.sm,
                opacity: !selectedTier || booking ? 0.5 : pressed ? 0.88 : 1,
              })}
            >
              <Text style={{ ...typography.body, color: colors.primaryInk, fontWeight: '600' }}>
                {booking ? 'Booking…' : 'Start session'}
              </Text>
            </Pressable>

            <Pressable onPress={closeBooking} hitSlop={12}>
              <Text
                style={{
                  ...typography.caption,
                  color: colors.textDim,
                  textAlign: 'center',
                }}
              >
                Not now
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}
