// Time-limited TURN credentials per the coturn REST API convention:
// username = "<unix-expiry>:<label>", credential = base64(HMAC-SHA1(secret, username)).
import { createHmac } from 'node:crypto';
import type { WsTurnCredentialsEvent } from '@noni/types';
import { env } from '../config/env.js';

const TTL_SECS = 2 * 60 * 60; // long enough for the longest voice session

export function generateTurnCredentials(sessionId: string): WsTurnCredentialsEvent {
  const expiry = Math.floor(Date.now() / 1000) + TTL_SECS;
  const username = `${expiry}:${sessionId}`;
  const credential = createHmac('sha1', env.TURN_SHARED_SECRET).update(username).digest('base64');
  // TURN_SERVER_URL accepts a comma-separated pool — Nigerian ISPs force most
  // media through TURN, so production should list ≥2 servers (or a managed pool).
  const urls = env.TURN_SERVER_URL.split(',').map((u) => u.trim()).filter(Boolean);
  return { urls, username, credential, ttlSecs: TTL_SECS };
}
