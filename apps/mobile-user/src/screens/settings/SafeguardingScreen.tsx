// S-007 — In-app viewer for the safeguarding policy.
// Keep content in sync with docs/safeguarding-policy.md.
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import React from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Screen, colors, radius, spacing, typography } from '@noni/ui';
import type { AppStackParamList } from '../../navigation/RootNavigator';

type Props = NativeStackScreenProps<AppStackParamList, 'Safeguarding'>;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: spacing.xl }}>
      <Text style={styles.h2}>{title}</Text>
      <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>{children}</View>
    </View>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <Text style={styles.p}>{children}</Text>;
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', gap: spacing.sm }}>
      <Text style={styles.bulletDot}>•</Text>
      <Text style={[styles.p, { flex: 1 }]}>{children}</Text>
    </View>
  );
}

function Line({ label, number }: { label: string; number: string }) {
  return (
    <Pressable
      onPress={() => Linking.openURL(`tel:${number.replace(/\s+/g, '')}`)}
      style={({ pressed }) => [styles.line, pressed && { opacity: 0.8 }]}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.lineLabel}>{label}</Text>
        <Text style={styles.lineNumber}>{number}</Text>
      </View>
      <Text style={styles.lineAction}>Call</Text>
    </Pressable>
  );
}

export function SafeguardingScreen({ navigation }: Props) {
  return (
    <Screen>
      <View style={{ flex: 1 }}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={12}
          style={{ paddingVertical: spacing.xs, marginLeft: -spacing.xs }}
        >
          <Feather name="arrow-left" size={22} color={colors.text} />
        </Pressable>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: spacing.xxl }}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.eyebrow}>How we handle harm</Text>
          <Text style={styles.h1}>
            Safeguarding <Text style={styles.h1Italic}>Policy</Text>
          </Text>
          <Text style={styles.meta}>Last updated April 2026</Text>

          <Section title="Our commitment">
            <Bullet>We believe what you tell us.</Bullet>
            <Bullet>We do not pretend to be a medical service. We are peer support.</Bullet>
            <Bullet>
              We will not abandon you in a crisis. A human stays on the line until you are
              connected to someone trained — or until you tell us to stop.
            </Bullet>
            <Bullet>
              We will not share what you say, except where the law or this policy requires it.
            </Bullet>
          </Section>

          <Section title="If you want to end your life or hurt yourself">
            <P>The app will pause the conversation and show you the emergency lines.</P>
            <Line label="MANI Nigeria" number="0811 190 9090" />
            <Line label="Suicide Prevention Lifeline Nigeria" number="0806 210 6493" />
            <Line label="Emergency services" number="112" />
            <P>
              We offer to connect you to a trained human listener, free of charge, and we notify
              an on-call supervisor. The AI will not give advice on methods, diagnose you, or
              discuss the choice to end your life as if it were neutral.
            </P>
          </Section>

          <Section title="If you disclose abuse, assault, or trafficking">
            <Bullet>A listener will believe you. They will not interrogate you.</Bullet>
            <Bullet>They will gently check that you are safe in this moment.</Bullet>
            <Bullet>They will share the relevant Nigerian support lines.</Bullet>
            <Bullet>They will stay with you.</Bullet>
            <Line label="Emergency services" number="112" />
            <Line label="Mirabel Centre (sexual assault)" number="0818 959 5595" />
            <Line
              label="Domestic and Sexual Violence Response Team (Lagos)"
              number="0813 796 0048"
            />
          </Section>

          <Section title="Child safety">
            <P>
              Noni is intended for people aged <Text style={styles.bold}>18 and older</Text>. A
              user who identifies as under 18 during a session will be gently ended and
              redirected.
            </P>
            <Line label="UNICEF Nigeria" number="0803 402 0084" />
            <P>
              If a user under 18 discloses abuse, we follow the reporting requirements of the
              Nigerian Child Rights Act (2003). A designated safeguarding lead escalates
              appropriately. Listeners are never asked to handle disclosures from minors alone.
            </P>
          </Section>

          <Section title="When we break confidentiality">
            <P>
              Noni is designed for anonymity. We do not ask for your name, your face, or your
              location. Conversations are not stored.
            </P>
            <P>There are narrow exceptions. We will share what is necessary when:</P>
            <Bullet>Someone is in imminent danger of dying or being killed.</Bullet>
            <Bullet>A child is being abused.</Bullet>
            <Bullet>A court orders us to, under Nigerian law.</Bullet>
            <P>We will always tell you when we do this, if it is safe to do so.</P>
          </Section>

          <Section title="Our listeners">
            <Bullet>
              Every listener completes a 30-minute crisis recognition module before going live.
            </Bullet>
            <Bullet>Listeners are given scripts and supervisor escalation paths for crises.</Bullet>
            <Bullet>
              Listeners are not licensed clinicians. They are trained peer supporters.
            </Bullet>
            <Bullet>
              Users can block or report any listener mid-session. Reports are reviewed within
              24 hours.
            </Bullet>
          </Section>

          <Section title="Reaching us">
            <P>
              If you believe a listener, another user, or the platform itself has let you down,
              please write to{' '}
              <Text
                style={styles.link}
                onPress={() => Linking.openURL('mailto:safeguarding@noni.ng')}
              >
                safeguarding@noni.ng
              </Text>
              . A human reads every email. We aim to respond within one working day; for urgent
              matters within the same day.
            </P>
          </Section>

          <Section title="How we keep this policy honest">
            <P>
              This document is reviewed every six months in consultation with MANI Nigeria and
              an external safeguarding advisor. Revision history is public in the Noni
              repository.
            </P>
          </Section>
        </ScrollView>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  eyebrow: {
    ...typography.label,
    color: colors.textDim,
    marginTop: spacing.md,
  },
  h1: {
    ...typography.display,
    color: colors.text,
    marginTop: spacing.sm,
  },
  h1Italic: {
    fontFamily: 'Fraunces-Italic',
    color: colors.emphasis,
  },
  h2: {
    ...typography.title,
    color: colors.text,
  },
  meta: {
    ...typography.caption,
    color: colors.textDim,
    marginTop: spacing.xs,
  },
  p: {
    ...typography.body,
    color: colors.textMuted,
    lineHeight: 24,
  },
  bulletDot: {
    ...typography.body,
    color: colors.primary,
    lineHeight: 24,
  },
  bold: {
    color: colors.text,
    fontFamily: 'GeneralSans-SemiBold',
  },
  link: {
    color: colors.secondary,
    textDecorationLine: 'underline',
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  lineLabel: {
    ...typography.caption,
    color: colors.textMuted,
  },
  lineNumber: {
    ...typography.mono,
    color: colors.text,
    marginTop: 2,
  },
  lineAction: {
    ...typography.body,
    color: colors.primary,
    fontWeight: '600',
  },
});
