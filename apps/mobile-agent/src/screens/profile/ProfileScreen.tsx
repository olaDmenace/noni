// F-031 — agent profile self-service: specialties, languages, session types,
// and bank details for payouts.
//
// Note: the API has no GET /me/profile — an empty PATCH is a server-side
// no-op that returns the current profile, so we use it as the read.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import type { AgentProfileResponse } from '@noni/types';
import { SessionType } from '@noni/types';
import {
  Avatar,
  Button,
  Card,
  Input,
  Screen,
  colors,
  radius,
  spacing,
  typography,
  useToast,
} from '@noni/ui';
import { api } from '../../api/client';
import { useAuthStore } from '../../stores/authStore';

const SPECIALTY_SUGGESTIONS = [
  'Anxiety',
  'Relationships',
  'Work stress',
  'Family pressure',
  'Grief',
  'Faith',
];
const LANGUAGE_OPTIONS = ['English', 'Pidgin'];
const SESSION_TYPE_OPTIONS: Array<{ value: SessionType; label: string }> = [
  { value: SessionType.TEXT, label: 'Text' },
  { value: SessionType.VOICE, label: 'Voice' },
];

function sameSet(a: string[], b: string[]): boolean {
  return [...a].sort().join('|') === [...b].sort().join('|');
}

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: radius.pill,
        borderWidth: 1,
        backgroundColor: selected ? colors.primaryMuted : colors.surface,
        borderColor: selected ? colors.primaryGlow : colors.border,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <Text
        style={{
          ...typography.caption,
          color: selected ? colors.primary : colors.textMuted,
          fontWeight: selected ? '600' : '400',
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <Text
      style={{
        ...typography.label,
        color: colors.textDim,
        marginTop: spacing.xl,
        marginBottom: spacing.sm,
      }}
    >
      {children}
    </Text>
  );
}

export function ProfileScreen() {
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const toast = useToast();
  const qc = useQueryClient();

  const profile = useQuery({
    queryKey: ['agentProfile'],
    // Empty PATCH = read (no GET endpoint; validated no-op server-side).
    queryFn: () => api.updateAgentProfile({}),
  });

  // Editable copies, seeded once when the profile loads.
  const [specialties, setSpecialties] = useState<string[] | null>(null);
  const [languages, setLanguages] = useState<string[] | null>(null);
  const [sessionTypes, setSessionTypes] = useState<SessionType[] | null>(null);

  // Bank form.
  const [bankFormOpen, setBankFormOpen] = useState(false);
  const [bankCode, setBankCode] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankNumber, setBankNumber] = useState('');
  const [bankErrors, setBankErrors] = useState<{
    code?: string;
    name?: string;
    number?: string;
  }>({});

  useEffect(() => {
    const p = profile.data;
    if (!p) return;
    if (specialties === null) setSpecialties(p.specialties);
    if (languages === null) setLanguages(p.languages);
    if (sessionTypes === null) setSessionTypes(p.sessionTypes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.data]);

  const applyProfile = (data: AgentProfileResponse) => {
    qc.setQueryData(['agentProfile'], data);
    setSpecialties(data.specialties);
    setLanguages(data.languages);
    setSessionTypes(data.sessionTypes);
  };

  const savePrefs = useMutation({
    mutationFn: () =>
      api.updateAgentProfile({
        specialties: specialties ?? undefined,
        languages: languages ?? undefined,
        sessionTypes: sessionTypes ?? undefined,
      }),
    onSuccess: (data) => {
      applyProfile(data);
      toast.success('Users will see the update right away.', 'Profile saved');
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : 'Try again', 'Could not save'),
  });

  const saveBank = useMutation({
    mutationFn: () =>
      api.updateAgentProfile({
        bankCode: bankCode.trim(),
        bankAccountName: bankName.trim(),
        bankAccountNumber: bankNumber.trim(),
      }),
    onSuccess: (data) => {
      applyProfile(data);
      setBankFormOpen(false);
      setBankCode('');
      setBankName('');
      setBankNumber('');
      setBankErrors({});
      // hasBankAccount feeds the earnings screen.
      void qc.invalidateQueries({ queryKey: ['agentDashboard'] });
      toast.success('Payouts will go to this account.', 'Bank details saved');
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : 'Try again', 'Could not save'),
  });

  function submitBank() {
    const errors: typeof bankErrors = {};
    const code = bankCode.trim();
    const name = bankName.trim();
    const number = bankNumber.trim();
    if (code.length < 2 || code.length > 10) errors.code = 'Bank code is 2–10 characters.';
    if (name.length < 2) errors.name = 'Enter the account name exactly as the bank has it.';
    if (!/^\d{10}$/.test(number)) errors.number = 'NUBAN account numbers are 10 digits.';
    setBankErrors(errors);
    if (Object.keys(errors).length === 0) saveBank.mutate();
  }

  function toggle<T extends string>(list: T[] | null, value: T): T[] {
    const current = list ?? [];
    return current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
  }

  const p = profile.data;
  const prefsDirty =
    !!p &&
    specialties !== null &&
    languages !== null &&
    sessionTypes !== null &&
    (!sameSet(specialties, p.specialties) ||
      !sameSet(languages, p.languages) ||
      !sameSet(sessionTypes, p.sessionTypes));
  const sessionTypesEmpty = (sessionTypes ?? []).length === 0;

  // Show server-side specialties that aren't in our suggestion list too.
  const specialtyOptions = [
    ...SPECIALTY_SUGGESTIONS,
    ...(p?.specialties ?? []).filter((s) => !SPECIALTY_SUGGESTIONS.includes(s)),
  ];

  return (
    <Screen>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: spacing.xl }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={{ ...typography.label, color: colors.textDim, marginTop: spacing.xl }}>
          Your listener identity
        </Text>

        <Card variant="elevated" style={{ marginTop: spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <Avatar label={user?.alias ?? '•'} size={56} />
            <View style={{ flex: 1 }}>
              <Text style={{ ...typography.title, color: colors.text }}>
                {user?.alias ?? '—'}
              </Text>
              <Text style={{ ...typography.caption, color: colors.textMuted, marginTop: 2 }}>
                Users only see this alias. Your number stays hashed.
              </Text>
            </View>
          </View>
        </Card>

        {profile.isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
        ) : (
          <>
            <SectionLabel>Specialties</SectionLabel>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              {specialtyOptions.map((s) => (
                <Chip
                  key={s}
                  label={s}
                  selected={(specialties ?? []).includes(s)}
                  onPress={() => setSpecialties(toggle(specialties, s))}
                />
              ))}
            </View>

            <SectionLabel>Languages</SectionLabel>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              {LANGUAGE_OPTIONS.map((l) => (
                <Chip
                  key={l}
                  label={l}
                  selected={(languages ?? []).includes(l)}
                  onPress={() => setLanguages(toggle(languages, l))}
                />
              ))}
            </View>

            <SectionLabel>Session types</SectionLabel>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              {SESSION_TYPE_OPTIONS.map((t) => (
                <Chip
                  key={t.value}
                  label={t.label}
                  selected={(sessionTypes ?? []).includes(t.value)}
                  onPress={() => setSessionTypes(toggle(sessionTypes, t.value))}
                />
              ))}
            </View>
            {sessionTypesEmpty ? (
              <Text style={{ ...typography.caption, color: colors.warning, marginTop: spacing.sm }}>
                Keep at least one session type on — otherwise no one can reach you.
              </Text>
            ) : null}

            {prefsDirty ? (
              <Button
                label={savePrefs.isPending ? 'Saving…' : 'Save changes'}
                onPress={() => savePrefs.mutate()}
                disabled={savePrefs.isPending || sessionTypesEmpty}
                style={{ marginTop: spacing.lg }}
              />
            ) : null}

            <SectionLabel>Payout account</SectionLabel>
            <Card>
              {p?.bankAccountLast4 && !bankFormOpen ? (
                <View>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <View>
                      <Text style={{ ...typography.bodyStrong, color: colors.text }}>
                        {p.bankAccountName ?? '—'}
                      </Text>
                      <Text
                        style={{
                          ...typography.mono,
                          color: colors.textMuted,
                          marginTop: 2,
                        }}
                      >
                        •••• {p.bankAccountLast4}
                      </Text>
                      {p.bankCode ? (
                        <Text
                          style={{ ...typography.caption, color: colors.textDim, marginTop: 2 }}
                        >
                          Bank code {p.bankCode}
                        </Text>
                      ) : null}
                    </View>
                    <Pressable onPress={() => setBankFormOpen(true)} hitSlop={8}>
                      <Text
                        style={{ ...typography.caption, color: colors.secondary, fontWeight: '600' }}
                      >
                        Change
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ) : bankFormOpen || !p?.bankAccountLast4 ? (
                <View style={{ gap: spacing.md }}>
                  {!p?.bankAccountLast4 ? (
                    <Text style={{ ...typography.body, color: colors.textMuted }}>
                      Add the account your earnings should land in.
                    </Text>
                  ) : null}
                  <Input
                    label="Bank code"
                    value={bankCode}
                    onChangeText={setBankCode}
                    placeholder="e.g. 058"
                    autoCapitalize="none"
                    maxLength={10}
                    error={bankErrors.code}
                  />
                  <Input
                    label="Account name"
                    value={bankName}
                    onChangeText={setBankName}
                    placeholder="Name on the account"
                    error={bankErrors.name}
                  />
                  <Input
                    label="Account number"
                    value={bankNumber}
                    onChangeText={(t) => setBankNumber(t.replace(/[^0-9]/g, ''))}
                    placeholder="10 digits"
                    keyboardType="number-pad"
                    maxLength={10}
                    mono
                    error={bankErrors.number}
                  />
                  <Button
                    label={saveBank.isPending ? 'Saving…' : 'Save bank details'}
                    onPress={submitBank}
                    disabled={saveBank.isPending}
                  />
                  {p?.bankAccountLast4 ? (
                    <Pressable
                      onPress={() => {
                        setBankFormOpen(false);
                        setBankErrors({});
                      }}
                      style={{ alignItems: 'center', paddingVertical: spacing.xs }}
                    >
                      <Text style={{ ...typography.caption, color: colors.textMuted }}>
                        Cancel
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
            </Card>
          </>
        )}

        <SectionLabel>Support</SectionLabel>
        <Card padding="none">
          <View style={{ paddingHorizontal: spacing.lg }}>
            <SupportRow label="Listener handbook" />
            <View style={{ height: 1, backgroundColor: colors.border }} />
            <SupportRow label="Crisis protocol · S-001 to S-007" />
            <View style={{ height: 1, backgroundColor: colors.border }} />
            <SupportRow label="Contact supervisor" />
          </View>
        </Card>

        <Pressable
          onPress={() => void signOut()}
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
      </ScrollView>
    </Screen>
  );
}

function SupportRow({ label, onPress }: { label: string; onPress?: () => void }) {
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
      <Text style={{ ...typography.caption, color: colors.textDim }}>›</Text>
    </Pressable>
  );
}
