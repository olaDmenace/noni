import Anthropic from '@anthropic-ai/sdk';
import { NONI_SYSTEM_PROMPT } from '@noni/ai-prompt';
import type { AiMessageResponse } from '@noni/types';
import { env } from '../config/env.js';
import { redis } from '../models/redis.js';
import { logger } from '../utils/logger.js';
import { safetyService } from './safety.service.js';

const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

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

    // 4. Call Claude.
    let reply: string;
    try {
      const response = await anthropic.messages.create({
        model: env.ANTHROPIC_MODEL,
        max_tokens: 400,
        system: NONI_SYSTEM_PROMPT,
        messages: [...trimmed, { role: 'user', content: userMessage }],
      });
      const block = response.content[0];
      reply = block && block.type === 'text' ? block.text : '';
    } catch (err) {
      logger.error({ err, sessionId }, 'anthropic call failed');
      throw err;
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
};
