// S-006 — Agent crisis training gate.
// Two phases: read the modules, then pass the 5-question quiz (≥4/5).
// Passing writes crisisTrainingPassedAt on the Agent row, which unlocks going online.
import { Feather } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { Card, Screen, colors, radius, spacing, typography, useToast } from '@noni/ui';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api } from '../../api/client';
import type { AppStackParamList } from '../../navigation/RootNavigator';

type Props = NativeStackScreenProps<AppStackParamList, 'CrisisTraining'>;

type Phase = 'modules' | 'quiz' | 'result';

const MODULES: Array<{ id: string; heading: string; body: string }> = [
  {
    id: 'listen',
    heading: 'Listen before you help.',
    body: "Let the user finish. Don't finish their sentences. Don't jump to solutions. Your first two replies should be reflections, not advice. If you're typing before they're done, you're not listening.",
  },
  {
    id: 'validate',
    heading: 'Name the feeling.',
    body: "People need to feel heard before they can move forward. \"That sounds exhausting.\" \"Of course you're angry.\" These are not throwaway lines, they're the work. Skip validation and the rest of the session collapses.",
  },
  {
    id: 'safety',
    heading: 'Ask the hard question calmly.',
    body: "If you sense someone is at risk, ask directly: \"Are you thinking about ending your life?\" Asking does not plant the idea. Not asking leaves them alone with it. Stay calm. Stay with them.",
  },
  {
    id: 'escalate',
    heading: 'Hand-off is not failure.',
    body: "When the situation needs a clinician or hotline, saying so out loud is the right move. Use the crisis flag button. MANI: 0811 190 9090. SPLN: 0806 210 6493. You are a bridge, not the endpoint.",
  },
  {
    id: 'limits',
    heading: 'Stay in your lane.',
    body: "You are a peer listener. Not a therapist. Not a doctor. Not a priest. Don't diagnose. Don't prescribe. Don't promise outcomes. Pretending otherwise is the fastest way to get removed from the platform.",
  },
];

export function CrisisTrainingScreen({ navigation }: Props) {
  const qc = useQueryClient();
  const toast = useToast();
  const [phase, setPhase] = useState<Phase>('modules');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{
    passed: boolean;
    score: number;
    passingScore: number;
    feedback?: Array<{ questionId: string; correct: boolean; rationale: string }>;
  } | null>(null);

  const quiz = useQuery({
    queryKey: ['crisisQuiz'],
    queryFn: () => api.getCrisisQuiz(),
    enabled: phase !== 'modules',
  });

  const submit = useMutation({
    mutationFn: () =>
      api.completeCrisisTraining({
        answers: Object.entries(answers).map(([questionId, choice]) => ({ questionId, choice })),
      }),
    onSuccess: (res) => {
      setResult({
        passed: res.passed,
        score: res.score,
        passingScore: res.passingScore,
        feedback: res.feedback,
      });
      setPhase('result');
      void qc.invalidateQueries({ queryKey: ['agentDashboard'] });
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : 'Try again', 'Could not submit'),
  });

  const allAnswered = useMemo(() => {
    const total = quiz.data?.questions.length ?? 0;
    return total > 0 && Object.keys(answers).length === total;
  }, [answers, quiz.data]);

  if (phase === 'modules') {
    return (
      <Screen>
        <ScrollView
          contentContainerStyle={{ paddingBottom: spacing.xl }}
          showsVerticalScrollIndicator={false}
        >
          <Pressable
            onPress={() => navigation.goBack()}
            hitSlop={12}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.md }}
          >
            <Feather name="arrow-left" size={20} color={colors.textMuted} />
            <Text style={{ ...typography.caption, color: colors.textMuted }}>Back</Text>
          </Pressable>

          <Text style={{ ...typography.label, color: colors.textDim, marginTop: spacing.lg }}>
            Before you go online
          </Text>
          <Text style={{ ...typography.display, color: colors.text, marginTop: spacing.sm }}>
            Crisis training
          </Text>
          <Text
            style={{
              ...typography.body,
              color: colors.textMuted,
              marginTop: spacing.sm,
            }}
          >
            Five short modules, then a five-question check. This is the minimum bar to take real
            sessions on Noni.
          </Text>

          <View style={{ gap: spacing.md, marginTop: spacing.xl }}>
            {MODULES.map((m, idx) => (
              <Card key={m.id} variant="elevated">
                <Text style={{ ...typography.caption, color: colors.primary, fontWeight: '600' }}>
                  {String(idx + 1).padStart(2, '0')}
                </Text>
                <Text
                  style={{
                    ...typography.title,
                    color: colors.text,
                    marginTop: 6,
                  }}
                >
                  {m.heading}
                </Text>
                <Text
                  style={{
                    ...typography.body,
                    color: colors.textMuted,
                    marginTop: spacing.sm,
                  }}
                >
                  {m.body}
                </Text>
              </Card>
            ))}
          </View>

          <Pressable
            onPress={() => setPhase('quiz')}
            style={({ pressed }) => ({
              marginTop: spacing.xl,
              backgroundColor: colors.primary,
              paddingVertical: spacing.md,
              borderRadius: radius.md,
              alignItems: 'center',
              opacity: pressed ? 0.9 : 1,
            })}
          >
            <Text style={{ ...typography.bodyStrong, color: colors.primaryInk }}>
              I&apos;ve read these — start the check
            </Text>
          </Pressable>
        </ScrollView>
      </Screen>
    );
  }

  if (phase === 'quiz') {
    if (quiz.isLoading) {
      return (
        <Screen>
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={colors.primary} />
          </View>
        </Screen>
      );
    }

    return (
      <Screen>
        <ScrollView
          contentContainerStyle={{ paddingBottom: spacing.xl }}
          showsVerticalScrollIndicator={false}
        >
          <Pressable
            onPress={() => setPhase('modules')}
            hitSlop={12}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.md }}
          >
            <Feather name="arrow-left" size={20} color={colors.textMuted} />
            <Text style={{ ...typography.caption, color: colors.textMuted }}>Review modules</Text>
          </Pressable>

          <Text style={{ ...typography.display, color: colors.text, marginTop: spacing.lg }}>
            Quick check
          </Text>
          <Text style={{ ...typography.body, color: colors.textMuted, marginTop: spacing.sm }}>
            Four of five to pass. You can retake if you miss.
          </Text>

          <View style={{ gap: spacing.lg, marginTop: spacing.xl }}>
            {quiz.data?.questions.map((q, idx) => (
              <View key={q.id}>
                <Text
                  style={{ ...typography.caption, color: colors.primary, fontWeight: '600' }}
                >
                  Question {idx + 1}
                </Text>
                <Text
                  style={{ ...typography.bodyStrong, color: colors.text, marginTop: 4 }}
                >
                  {q.prompt}
                </Text>
                <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
                  {q.options.map((opt) => {
                    const selected = answers[q.id] === opt.id;
                    return (
                      <Pressable
                        key={opt.id}
                        onPress={() => setAnswers((prev) => ({ ...prev, [q.id]: opt.id }))}
                        style={{
                          padding: spacing.md,
                          borderRadius: radius.md,
                          borderWidth: 1,
                          borderColor: selected ? colors.primary : colors.border,
                          backgroundColor: selected ? colors.primaryMuted : colors.surfaceElev,
                        }}
                      >
                        <Text style={{ ...typography.body, color: colors.text }}>
                          {opt.id}. {opt.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))}
          </View>

          <Pressable
            onPress={() => submit.mutate()}
            disabled={!allAnswered || submit.isPending}
            style={({ pressed }) => ({
              marginTop: spacing.xl,
              backgroundColor: colors.primary,
              paddingVertical: spacing.md,
              borderRadius: radius.md,
              alignItems: 'center',
              opacity: !allAnswered || submit.isPending ? 0.5 : pressed ? 0.9 : 1,
            })}
          >
            <Text style={{ ...typography.bodyStrong, color: colors.primaryInk }}>
              {submit.isPending ? 'Submitting…' : 'Submit'}
            </Text>
          </Pressable>
        </ScrollView>
      </Screen>
    );
  }

  // result phase
  const feedbackByQ = new Map(result?.feedback?.map((f) => [f.questionId, f]) ?? []);
  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ paddingBottom: spacing.xl }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ marginTop: spacing.xl }}>
          <Text style={{ ...typography.label, color: colors.textDim }}>Result</Text>
          <Text style={{ ...typography.display, color: colors.text, marginTop: spacing.sm }}>
            {result?.passed ? "You're cleared." : 'Close, but not quite.'}
          </Text>
          <Text style={{ ...typography.body, color: colors.textMuted, marginTop: spacing.sm }}>
            {result
              ? `${result.score} of ${quiz.data?.questions.length ?? 5} correct — need ${result.passingScore} to pass.`
              : ''}
          </Text>
        </View>

        {result && !result.passed && result.feedback?.length ? (
          <View style={{ gap: spacing.md, marginTop: spacing.xl }}>
            <Text style={{ ...typography.label, color: colors.textDim }}>
              What to carry forward
            </Text>
            {quiz.data?.questions.map((q, idx) => {
              const fb = feedbackByQ.get(q.id);
              if (!fb || fb.correct) return null;
              return (
                <Card key={q.id}>
                  <Text
                    style={{ ...typography.caption, color: colors.emphasis, fontWeight: '600' }}
                  >
                    Question {idx + 1} · missed
                  </Text>
                  <Text
                    style={{ ...typography.bodyStrong, color: colors.text, marginTop: 4 }}
                  >
                    {q.prompt}
                  </Text>
                  <Text
                    style={{
                      ...typography.body,
                      color: colors.textMuted,
                      marginTop: spacing.sm,
                    }}
                  >
                    {fb.rationale}
                  </Text>
                </Card>
              );
            })}
          </View>
        ) : null}

        {result?.passed ? (
          <Pressable
            onPress={() => navigation.goBack()}
            style={({ pressed }) => ({
              marginTop: spacing.xl,
              backgroundColor: colors.primary,
              paddingVertical: spacing.md,
              borderRadius: radius.md,
              alignItems: 'center',
              opacity: pressed ? 0.9 : 1,
            })}
          >
            <Text style={{ ...typography.bodyStrong, color: colors.primaryInk }}>
              Back to queue
            </Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => {
              setAnswers({});
              setResult(null);
              setPhase('modules');
            }}
            style={({ pressed }) => ({
              marginTop: spacing.xl,
              backgroundColor: colors.primary,
              paddingVertical: spacing.md,
              borderRadius: radius.md,
              alignItems: 'center',
              opacity: pressed ? 0.9 : 1,
            })}
          >
            <Text style={{ ...typography.bodyStrong, color: colors.primaryInk }}>
              Re-read the modules
            </Text>
          </Pressable>
        )}
      </ScrollView>
    </Screen>
  );
}
