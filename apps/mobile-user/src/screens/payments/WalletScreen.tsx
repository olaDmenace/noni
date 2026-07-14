import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useFocusEffect } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  MIN_WALLET_TOPUP_KOBO,
  TransactionType,
  type WalletStateResponse,
  type WsWalletUpdateEvent,
} from '@noni/types';
import { Card, Screen, colors, radius, spacing, typography, useToast } from '@noni/ui';
import { api } from '../../api/client';
import { getSocket } from '../../realtime/socket';
import { formatNaira } from '../../utils/formatters';
import type { AppStackParamList, AppTabParamList } from '../../navigation/RootNavigator';

type Props = CompositeScreenProps<
  BottomTabScreenProps<AppTabParamList, 'Wallet'>,
  NativeStackScreenProps<AppStackParamList>
>;

const TYPE_LABEL: Record<TransactionType, string> = {
  TOPUP: 'Top-up',
  SESSION_DEBIT: 'Session',
  REFUND: 'Refund',
  SUBSCRIPTION: 'Subscription',
  PAYOUT: 'Payout',
};

const QUICK_AMOUNTS_NAIRA = [500, 1000, 2000];
const MIN_TOPUP_NAIRA = MIN_WALLET_TOPUP_KOBO / 100;

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-NG', { month: 'short', day: 'numeric' });
}

function isCredit(t: TransactionType): boolean {
  return t === TransactionType.TOPUP || t === TransactionType.REFUND;
}

export function WalletScreen({ navigation }: Props) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['wallet'], queryFn: () => api.getWallet() });

  const [topupVisible, setTopupVisible] = useState(false);
  const [amountNaira, setAmountNaira] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Reference of a checkout the user left the app for — verified on return.
  const [pendingRef, setPendingRef] = useState<string | null>(null);

  // Live balance updates over the socket.
  useEffect(() => {
    const socket = getSocket();
    const onWalletUpdate = (e: WsWalletUpdateEvent) => {
      queryClient.setQueryData<WalletStateResponse>(['wallet'], (old) =>
        old ? { ...old, balanceKobo: e.balanceKobo } : old,
      );
      void queryClient.invalidateQueries({ queryKey: ['wallet'] });
    };
    socket.on('wallet_update', onWalletUpdate);
    return () => {
      socket.off('wallet_update', onWalletUpdate);
    };
  }, [queryClient]);

  // After an external Flutterwave/OPay checkout, confirm by reference when the
  // user comes back — the platform does not rely on the dashboard webhook.
  const refetchWallet = query.refetch;
  useFocusEffect(
    useCallback(() => {
      if (!pendingRef) return;
      void (async () => {
        try {
          const result = await api.verifyTopup(pendingRef);
          if (result.credited) {
            setPendingRef(null);
            toast.success('Your wallet has been credited.', 'Top-up confirmed');
          }
        } catch {
          // Keep the reference; the server-side poller is the safety net.
        }
        void refetchWallet();
      })();
    }, [pendingRef, refetchWallet, toast]),
  );

  const parsedNaira = parseInt(amountNaira.replace(/\D/g, ''), 10) || 0;
  const amountValid = parsedNaira >= MIN_TOPUP_NAIRA;

  async function confirmTopup(paymentOption?: 'opay') {
    if (!amountValid || submitting) return;
    setSubmitting(true);
    try {
      const res = await api.initiateTopup({ amountKobo: parsedNaira * 100, paymentOption });
      if (res.authorizationUrl.startsWith('https://dev.noni.local')) {
        await api.devCompleteTopup(res.reference);
        await query.refetch();
        toast.success(`${formatNaira(parsedNaira * 100)} added to your wallet.`, 'Top-up complete (dev)');
      } else {
        setPendingRef(res.reference);
        await Linking.openURL(res.authorizationUrl);
      }
      setTopupVisible(false);
      setAmountNaira('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Try again', 'Top-up failed');
    } finally {
      setSubmitting(false);
    }
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

  const txs = query.data?.recentTransactions ?? [];

  return (
    <Screen>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: spacing.xl }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ marginTop: spacing.xl }}>
          <Text style={{ ...typography.label, color: colors.textDim }}>Wallet balance</Text>
          <Text
            style={{
              ...typography.display,
              fontSize: 44,
              lineHeight: 48,
              color: colors.text,
              marginTop: spacing.sm,
            }}
          >
            {query.data ? formatNaira(query.data.balanceKobo) : '—'}
          </Text>
          <Text
            style={{
              ...typography.caption,
              color: colors.textMuted,
              marginTop: spacing.xs,
            }}
          >
            Stored in kobo · ₦1 = 100 kobo
          </Text>
        </View>

        <Pressable
          onPress={() => setTopupVisible(true)}
          style={({ pressed }) => ({
            marginTop: spacing.lg,
            backgroundColor: colors.primary,
            borderRadius: radius.md,
            paddingVertical: spacing.md,
            alignItems: 'center',
            opacity: pressed ? 0.9 : 1,
          })}
        >
          <Text style={{ ...typography.bodyStrong, color: colors.primaryInk }}>
            Top up wallet
          </Text>
        </Pressable>

        <Pressable
          onPress={() => navigation.navigate('Subscription')}
          hitSlop={8}
          style={({ pressed }) => ({
            marginTop: spacing.md,
            alignItems: 'center',
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Text style={{ ...typography.body, color: colors.secondary }}>
            Monthly plans — from ₦500/mo ›
          </Text>
        </Pressable>

        <View style={{ marginTop: spacing.xl }}>
          <Text style={{ ...typography.label, color: colors.textDim, marginBottom: spacing.md }}>
            Recent
          </Text>
          {txs.length === 0 ? (
            <Card variant="muted">
              <Text
                style={{
                  ...typography.body,
                  color: colors.textMuted,
                  textAlign: 'center',
                }}
              >
                No transactions yet.
              </Text>
            </Card>
          ) : (
            <View style={{ gap: spacing.sm }}>
              {txs.map((t) => {
                const credit = isCredit(t.type);
                return (
                  <Card key={t.id}>
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={{ ...typography.bodyStrong, color: colors.text }}>
                          {TYPE_LABEL[t.type]}
                        </Text>
                        <Text
                          style={{
                            ...typography.caption,
                            color: colors.textMuted,
                            marginTop: 2,
                          }}
                        >
                          {formatDate(t.createdAt)}
                          {t.providerRef ? ` · ${t.providerRef.slice(0, 10)}` : ''}
                        </Text>
                      </View>
                      <Text
                        style={{
                          ...typography.mono,
                          color: credit ? colors.success : colors.text,
                        }}
                      >
                        {credit ? '+' : '−'}
                        {formatNaira(Math.abs(t.amountKobo))}
                      </Text>
                    </View>
                  </Card>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Top-up sheet. */}
      <Modal
        visible={topupVisible}
        transparent
        animationType="slide"
        onRequestClose={() => !submitting && setTopupVisible(false)}
      >
        <Pressable
          onPress={() => !submitting && setTopupVisible(false)}
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
            <Text style={{ ...typography.title, color: colors.text }}>Top up wallet</Text>
            <Text style={{ ...typography.body, color: colors.textMuted }}>
              Card, transfer, USSD, OPay, or PalmPay. Minimum {formatNaira(MIN_WALLET_TOPUP_KOBO)}.
            </Text>

            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              {QUICK_AMOUNTS_NAIRA.map((n) => {
                const active = parsedNaira === n;
                return (
                  <Pressable
                    key={n}
                    onPress={() => setAmountNaira(String(n))}
                    style={{
                      flex: 1,
                      alignItems: 'center',
                      paddingVertical: spacing.md,
                      borderRadius: radius.sm,
                      borderWidth: 1,
                      borderColor: active ? colors.primary : colors.border,
                      backgroundColor: active ? colors.primaryMuted : colors.surfaceElev,
                    }}
                  >
                    <Text style={{ ...typography.mono, color: colors.text }}>
                      ₦{n.toLocaleString('en-NG')}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <TextInput
              value={amountNaira}
              onChangeText={(v) => setAmountNaira(v.replace(/\D/g, ''))}
              keyboardType="number-pad"
              placeholder={`Amount in naira (min ${MIN_TOPUP_NAIRA})`}
              placeholderTextColor={colors.textDim}
              style={{
                ...typography.mono,
                color: colors.text,
                backgroundColor: colors.surfaceElev,
                borderColor: colors.borderStrong,
                borderWidth: 1,
                borderRadius: radius.md,
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.md,
              }}
            />
            {amountNaira.length > 0 && !amountValid ? (
              <Text style={{ ...typography.caption, color: colors.warning }}>
                Minimum top-up is {formatNaira(MIN_WALLET_TOPUP_KOBO)}.
              </Text>
            ) : null}

            <Pressable
              onPress={() => confirmTopup()}
              disabled={!amountValid || submitting}
              style={({ pressed }) => ({
                backgroundColor: colors.primary,
                paddingVertical: spacing.md,
                borderRadius: radius.md,
                alignItems: 'center',
                opacity: !amountValid || submitting ? 0.5 : pressed ? 0.88 : 1,
              })}
            >
              <Text style={{ ...typography.body, color: colors.primaryInk, fontWeight: '600' }}>
                {submitting
                  ? 'One moment…'
                  : amountValid
                    ? `Top up ${formatNaira(parsedNaira * 100)}`
                    : 'Top up'}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => confirmTopup('opay')}
              disabled={!amountValid || submitting}
              style={({ pressed }) => ({
                paddingVertical: spacing.md,
                borderRadius: radius.md,
                alignItems: 'center',
                borderWidth: 1,
                borderColor: colors.borderStrong,
                backgroundColor: colors.surfaceElev,
                opacity: !amountValid || submitting ? 0.5 : pressed ? 0.88 : 1,
              })}
            >
              <Text style={{ ...typography.body, color: colors.text, fontWeight: '600' }}>
                Pay with OPay
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}
