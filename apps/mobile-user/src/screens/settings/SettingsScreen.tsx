import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useQuery } from '@tanstack/react-query';
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { Avatar, Card, Screen, colors, radius, spacing, typography, useToast } from '@noni/ui';
import { api } from '../../api/client';
import { disconnectSocket } from '../../realtime/socket';
import { useAuthStore } from '../../stores/authStore';
import type { AppStackParamList, AppTabParamList } from '../../navigation/RootNavigator';

type Props = CompositeScreenProps<
  BottomTabScreenProps<AppTabParamList, 'Settings'>,
  NativeStackScreenProps<AppStackParamList>
>;

type RowProps = {
  label: string;
  value?: string;
  onPress?: () => void;
};

function Row({ label, value, onPress }: RowProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: spacing.md,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Text style={{ ...typography.body, color: colors.text }}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {value ? (
          <Text style={{ ...typography.caption, color: colors.textMuted }}>{value}</Text>
        ) : null}
        <Text style={{ ...typography.caption, color: colors.textDim }}>›</Text>
      </View>
    </Pressable>
  );
}

export function SettingsScreen({ navigation }: Props) {
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const toast = useToast();
  const meQuery = useQuery({ queryKey: ['me'], queryFn: () => api.me() });
  const [deleting, setDeleting] = useState(false);

  function onSignOut() {
    disconnectSocket();
    void signOut();
  }

  function confirmDelete() {
    if (deleting) return;
    Alert.alert(
      'Delete your data?',
      'This permanently removes your account, alias, wallet balance, and history. It cannot be undone — not by us, not by anyone.',
      [
        { text: 'Keep my account', style: 'cancel' },
        {
          text: 'Delete everything',
          style: 'destructive',
          onPress: () => void doDelete(),
        },
      ],
    );
  }

  async function doDelete() {
    setDeleting(true);
    try {
      await api.deleteAccount();
      disconnectSocket();
      await signOut();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Try again', 'Could not delete');
      setDeleting(false);
    }
  }

  return (
    <Screen>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: spacing.xl }}
        showsVerticalScrollIndicator={false}
      >
        <Text
          style={{
            ...typography.label,
            color: colors.textDim,
            marginTop: spacing.xl,
          }}
        >
          Your anonymous identity
        </Text>

        <Card variant="elevated" style={{ marginTop: spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <Avatar label={user?.alias ?? '•'} size={56} />
            <View style={{ flex: 1 }}>
              <Text style={{ ...typography.title, color: colors.text }}>
                {user?.alias ?? '—'}
              </Text>
              <Text style={{ ...typography.caption, color: colors.textMuted, marginTop: 2 }}>
                No name, no profile. Just a way to come back.
              </Text>
            </View>
          </View>
        </Card>

        <Text
          style={{
            ...typography.label,
            color: colors.textDim,
            marginTop: spacing.xl,
            marginBottom: spacing.sm,
          }}
        >
          Preferences
        </Text>
        <Card padding="none">
          <View style={{ paddingHorizontal: spacing.lg }}>
            <Row label="Notifications" value="On" />
            <View style={{ height: 1, backgroundColor: colors.border }} />
            <Row label="Language" value="English" />
            <View style={{ height: 1, backgroundColor: colors.border }} />
            <Row label="Tier preference" value={user?.tierPreference ?? 'Ask each time'} />
            <View style={{ height: 1, backgroundColor: colors.border }} />
            <Row
              label="App lock"
              value={meQuery.data ? (meQuery.data.hasPin ? 'On' : 'Off') : undefined}
              onPress={() => navigation.navigate('SetPin')}
            />
          </View>
        </Card>

        <Text
          style={{
            ...typography.label,
            color: colors.textDim,
            marginTop: spacing.xl,
            marginBottom: spacing.sm,
          }}
        >
          Safety & privacy
        </Text>
        <Card padding="none">
          <View style={{ paddingHorizontal: spacing.lg }}>
            <Row label="How Noni keeps you anonymous" />
            <View style={{ height: 1, backgroundColor: colors.border }} />
            <Row label="Crisis resources" />
            <View style={{ height: 1, backgroundColor: colors.border }} />
            <Row label="Safeguarding policy" onPress={() => navigation.navigate('Safeguarding')} />
            <View style={{ height: 1, backgroundColor: colors.border }} />
            <Row label={deleting ? 'Deleting…' : 'Delete my data'} onPress={confirmDelete} />
          </View>
        </Card>

        <Pressable
          onPress={onSignOut}
          style={({ pressed }) => ({
            marginTop: spacing.xxl,
            paddingVertical: spacing.md,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: 'center',
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Text style={{ ...typography.body, color: colors.textMuted }}>Sign out</Text>
        </Pressable>

        <Text
          style={{
            ...typography.caption,
            color: colors.textDim,
            textAlign: 'center',
            marginTop: spacing.xl,
          }}
        >
          Noni v0.1 · A quiet room
        </Text>
      </ScrollView>
    </Screen>
  );
}
