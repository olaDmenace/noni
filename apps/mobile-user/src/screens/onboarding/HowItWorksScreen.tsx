import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Button, Card, Screen, colors, spacing, typography } from '@noni/ui';
import type { AuthStackParamList } from '../../navigation/RootNavigator';

type Props = NativeStackScreenProps<AuthStackParamList, 'HowItWorks'>;

const SECTIONS: Array<{ eyebrow: string; title: string; body: string }> = [
  {
    eyebrow: 'Anonymous by design',
    title: 'No name. No profile.',
    body: 'Your number is hashed and never shared. What you say in a session is never stored. You are just a quiet alias, and a voice.',
  },
  {
    eyebrow: 'Real people, or AI',
    title: 'Start anywhere.',
    body: 'Noni AI is free, any hour. When you want a real person, bring in a trained listener from ₦100. Text or voice — your pace.',
  },
  {
    eyebrow: 'Crisis-safe',
    title: 'If it gets heavy, we stay.',
    body: 'Trained listeners, a clear safety protocol, and the MANI line — 0811 190 9090 — always one tap away. You don’t have to carry it alone.',
  },
];

export function HowItWorksScreen({ route, navigation }: Props) {
  const { phone } = route.params;

  return (
    <Screen>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: spacing.xl }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ marginTop: spacing.xl }}>
          <Text style={{ ...typography.label, color: colors.textDim }}>How Noni works</Text>
          <Text style={{ ...typography.display, color: colors.text, marginTop: spacing.sm }}>
            Someone is{' '}
            <Text style={{ fontFamily: 'Fraunces-Italic', color: colors.emphasis }}>here</Text>.
          </Text>
        </View>

        <View style={{ gap: spacing.md, marginTop: spacing.xl }}>
          {SECTIONS.map((s) => (
            <Card key={s.eyebrow}>
              <Text style={{ ...typography.label, color: colors.secondary }}>{s.eyebrow}</Text>
              <Text style={{ ...typography.title, color: colors.text, marginTop: spacing.sm }}>
                {s.title}
              </Text>
              <Text style={{ ...typography.body, color: colors.textMuted, marginTop: spacing.sm }}>
                {s.body}
              </Text>
            </Card>
          ))}
        </View>
      </ScrollView>

      <View style={{ paddingTop: spacing.md }}>
        <Text
          style={{
            ...typography.caption,
            color: colors.textDim,
            textAlign: 'center',
            marginBottom: spacing.md,
          }}
        >
          Noni is peer support, not medical treatment.
        </Text>
        <Button label="Continue" onPress={() => navigation.navigate('Otp', { phone })} />
      </View>
    </Screen>
  );
}
