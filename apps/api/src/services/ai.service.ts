import Anthropic from '@anthropic-ai/sdk';
import { NONI_SYSTEM_PROMPT, PRACTICE_PERSONA_PROMPT } from '@noni/ai-prompt';
import type { AiMessageResponse } from '@noni/types';
import { env } from '../config/env.js';
import { redis } from '../models/redis.js';
import { logger } from '../utils/logger.js';
import { safetyService } from './safety.service.js';

const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

// Placeholder key = dev mode: canned replies keep every flow testable offline.
export function isDevAi(): boolean {
  return env.ANTHROPIC_API_KEY.startsWith('sk-ant-replace');
}

const DEV_REPLIES = [
  'I hear you. That sounds like a lot to carry — do you want to tell me more about it?',
  'Thank you for sharing that with me. What part of it weighs on you the most?',
  'That makes sense. Sitting with something like that is hard. I am here with you.',
];

const DEV_PRACTICE_REPLIES = [
  'I dunno… things just tire me these days. Work matter.',
  'You go understand? I lost my job last month and I never tell my papa.',
  'The thing tire me. Rent dey due and I just dey avoid everybody.',
];

async function callClaude(system: string, messages: HistoryItem[]): Promise<string> {
  const response = await anthropic.messages.create({
    model: env.ANTHROPIC_MODEL,
    max_tokens: 400,
    system,
    messages,
  });
  const block = response.content[0];
  return block && block.type === 'text' ? block.text : '';
}

const HISTORY_TTL_SECS = 60 * 60; // 1h
const HISTORY_MAX_TURNS = 20;
const NUDGE_THRESHOLD_TURNS = 16; // 8 user + 8 assistant

interface HistoryItem {
  role: 'user' | 'assistant';
  content: string;
}

export const aiService = {
  async chat(sessionId: string, userMessage: string): Promise<AiMessageResponse> {
    // 1. Safety check before sending to LLM (S-001).
    const crisis = safetyService.hasCrisisKeyword(userMessage);
    if (crisis.detected) {
      await safetyService.triggerCrisisProtocol({
        sessionId,
        triggeredBy: 'KEYWORD',
        triggerSource: 'USER',
        matchedKeyword: crisis.matchedKeyword,
      });
      return {
        reply: crisis.responseMessage,
        showUpgradeNudge: false,
        crisisDetected: true,
      };
    }

    // 2. Retrieve in-memory session history.
    const historyKey = `ai:history:${sessionId}`;
    const raw = await redis.lrange(historyKey, 0, -1);
    const history: HistoryItem[] = raw.map((s) => JSON.parse(s) as HistoryItem);

    // 3. Truncate history to control token spend.
    const trimmed = history.slice(-HISTORY_MAX_TURNS + 2);

    // 4. Call Claude (or the dev fallback with a placeholder key).
    let reply: string;
    if (isDevAi()) {
      reply = DEV_REPLIES[history.length % DEV_REPLIES.length]!;
    } else {
      try {
        reply = await callClaude(NONI_SYSTEM_PROMPT, [
          ...trimmed,
          { role: 'user', content: userMessage },
        ]);
      } catch (err) {
        logger.error({ err, sessionId }, 'anthropic call failed');
        throw err;
      }
    }

    // 5. Append turn to ephemeral history.
    await redis
      .multi()
      .rpush(
        historyKey,
        JSON.stringify({ role: 'user', content: userMessage }),
        JSON.stringify({ role: 'assistant', content: reply }),
      )
      .expire(historyKey, HISTORY_TTL_SECS)
      .exec();

    // 6. Decide upgrade nudge — fired once per session (F-021).
    const nudgeKey = `ai:nudge:${sessionId}`;
    const turnCount = await redis.llen(historyKey);
    const nudgeAlreadyShown = await redis.get(nudgeKey);
    let showUpgradeNudge = false;
    if (turnCount >= NUDGE_THRESHOLD_TURNS && !nudgeAlreadyShown) {
      await redis.set(nudgeKey, '1', 'EX', HISTORY_TTL_SECS);
      showUpgradeNudge = true;
    }

    return { reply, showUpgradeNudge, crisisDetected: false };
  },

  async clearSession(sessionId: string): Promise<void> {
    await redis.del(`ai:history:${sessionId}`, `ai:nudge:${sessionId}`);
  },

  /**
   * F-030 practice bot: the AI plays a distressed (non-crisis) user so trainee
   * listeners rehearse before going live. History is ephemeral like T0 chat.
   * No crisis protocol here — there is no real user and no session to flag.
   */
  async practiceChat(agentUserId: string, message: string): Promise<{ reply: string }> {
    const historyKey = `ai:practice:${agentUserId}`;
    const raw = await redis.lrange(historyKey, 0, -1);
    const history: HistoryItem[] = raw.map((s) => JSON.parse(s) as HistoryItem);
    const trimmed = history.slice(-HISTORY_MAX_TURNS + 2);

    const reply = isDevAi()
      ? DEV_PRACTICE_REPLIES[history.length % DEV_PRACTICE_REPLIES.length]!
      : await callClaude(PRACTICE_PERSONA_PROMPT, [...trimmed, { role: 'user', content: message }]);

    await redis
      .multi()
      .rpush(
        historyKey,
        JSON.stringify({ role: 'user', content: message }),
        JSON.stringify({ role: 'assistant', content: reply }),
      )
      .expire(historyKey, HISTORY_TTL_SECS)
      .exec();
    return { reply };
  },

  async resetPractice(agentUserId: string): Promise<void> {
    await redis.del(`ai:practice:${agentUserId}`);
  },
};
