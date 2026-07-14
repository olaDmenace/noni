// Agent crisis training (S-006). Before an agent can go AVAILABLE they must
// pass this quiz. Passing score is 4/5 — one slip is tolerated but a majority
// wrong means they retake. Content mirrors the mobile training modules.
import { prisma } from '../models/prisma.js';
import { BadRequest, NotFound } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export interface QuizQuestion {
  id: string;
  prompt: string;
  options: Array<{ id: string; label: string }>;
  correct: string;
  rationale: string;
}

// 5-question bank. Covers: listening posture, validation, safety disclosure,
// escalation, boundary limits. If you add a question, update PASSING_SCORE only
// if the ratio still yields ~80%.
export const CRISIS_QUIZ: QuizQuestion[] = [
  {
    id: 'Q1',
    prompt:
      'A user opens with "I don\'t see the point anymore." What do you do first?',
    options: [
      { id: 'A', label: 'Tell them it will get better.' },
      { id: 'B', label: 'Ask calmly if they are thinking about ending their life.' },
      { id: 'C', label: 'Change the subject to something lighter.' },
      { id: 'D', label: 'Send the MANI number and end the session.' },
    ],
    correct: 'B',
    rationale:
      'Ask directly and calmly. Avoiding the question leaves them alone with it. Changing the subject signals you can\'t hold the weight.',
  },
  {
    id: 'Q2',
    prompt: 'The user says they feel unsafe at home. What is your first move?',
    options: [
      { id: 'A', label: 'Tell them to call the police.' },
      { id: 'B', label: 'Ask who is hurting them.' },
      { id: 'C', label: 'Acknowledge what they said and ask if they are safe right now.' },
      { id: 'D', label: 'Flag the session for crisis review and stay quiet.' },
    ],
    correct: 'C',
    rationale:
      'Validate first, then assess immediate safety. Pressing for details before they feel heard makes them shut down.',
  },
  {
    id: 'Q3',
    prompt: 'When should you use the crisis flag button in the session?',
    options: [
      { id: 'A', label: 'Any time a user mentions sadness.' },
      { id: 'B', label: 'If the user expresses intent to harm themselves or someone else.' },
      { id: 'C', label: 'Only after three explicit requests for help.' },
      { id: 'D', label: 'Never — only the AI flags crises.' },
    ],
    correct: 'B',
    rationale:
      'The flag is for active harm intent, or when you believe the user needs immediate professional support. Your judgment matters.',
  },
  {
    id: 'Q4',
    prompt: 'A user asks you for medical advice about their anxiety medication.',
    options: [
      { id: 'A', label: 'Share what worked for you.' },
      { id: 'B', label: 'Tell them clearly Noni is peer support and point them to a clinician.' },
      { id: 'C', label: 'Say you\'ll ask your supervisor and get back to them.' },
      { id: 'D', label: 'Offer a dosage recommendation based on common use.' },
    ],
    correct: 'B',
    rationale:
      'You are not a clinician. Pretending to be one — even helpfully — is the single biggest risk on this platform.',
  },
  {
    id: 'Q5',
    prompt: 'Which statement best describes the listener\'s role on Noni?',
    options: [
      { id: 'A', label: 'Diagnose the user\'s condition and suggest treatment.' },
      { id: 'B', label: 'Convince the user their situation is not that bad.' },
      { id: 'C', label: 'Stay present, validate, and connect them to help when needed.' },
      { id: 'D', label: 'Keep them talking as long as possible to extend the session.' },
    ],
    correct: 'C',
    rationale:
      'Presence, validation, and a warm hand-off. That\'s the job. Extending the session for earnings is a fireable offence.',
  },
];

export const PASSING_SCORE = 4;

export const trainingService = {
  listQuiz() {
    // Strip correct answers before returning to client.
    return CRISIS_QUIZ.map(({ correct: _c, rationale: _r, ...rest }) => rest);
  },

  async completeCrisisTraining(agentUserId: string, answers: Array<{ questionId: string; choice: string }>) {
    const agent = await prisma.agent.findUnique({ where: { userId: agentUserId } });
    if (!agent) throw NotFound('AGENT_NOT_FOUND', 'Agent profile not found');

    const byId = new Map(CRISIS_QUIZ.map((q) => [q.id, q]));
    let score = 0;
    const feedback: Array<{ questionId: string; correct: boolean; rationale: string }> = [];
    for (const a of answers) {
      const q = byId.get(a.questionId);
      if (!q) throw BadRequest('UNKNOWN_QUESTION', `Unknown question ${a.questionId}`);
      const correct = a.choice === q.correct;
      if (correct) score += 1;
      feedback.push({ questionId: q.id, correct, rationale: q.rationale });
    }

    const passed = score >= PASSING_SCORE;
    let passedAt: Date | null = agent.crisisTrainingPassedAt;
    if (passed && !passedAt) {
      const updated = await prisma.agent.update({
        where: { id: agent.id },
        data: { crisisTrainingPassedAt: new Date() },
      });
      passedAt = updated.crisisTrainingPassedAt;
      logger.info({ agentId: agent.id, score }, 'crisis training passed');
    } else if (!passed) {
      logger.info({ agentId: agent.id, score }, 'crisis training attempt failed');
    }

    return {
      passed,
      score,
      passingScore: PASSING_SCORE,
      crisisTrainingPassedAt: passedAt ? passedAt.toISOString() : null,
      feedback,
    };
  },
};
