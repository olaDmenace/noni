// Crisis keyword list — used by the safety service (S-001).
// Matched case-insensitively as whole-word phrases. Keep this list reviewed
// quarterly with input from MANI Nigeria and product safety lead.
//
// The list intentionally mixes English, Pidgin, and culturally common phrases.

export const CRISIS_KEYWORDS: readonly string[] = [
  // Direct self-harm / suicidal ideation
  'kill myself',
  'end my life',
  'end it all',
  'suicide',
  'suicidal',
  'want to die',
  'wan die',
  'no reason to live',
  'better off dead',
  'take my life',
  "i don't want to be here",
  'i dont want to be here',
  'no point living',
  'nothing left',
  // Self-harm methods (do not enumerate methods — match intent only)
  'cut myself',
  'cutting myself',
  'hurt myself',
  'self harm',
  'self-harm',
  'overdose',
  // Pidgin / culturally specific
  'i don tire',
  'i don taya',
  'life don tire me',
  'na me i go finish',
  // Abuse / acute danger
  'they are hitting me',
  'beating me',
  'rape',
  'raped',
  'molested',
  'molesting me',
];

export interface CrisisMatch {
  matched: boolean;
  keyword?: string;
}

export function detectCrisis(text: string): CrisisMatch {
  const haystack = text.toLowerCase();
  for (const keyword of CRISIS_KEYWORDS) {
    if (haystack.includes(keyword)) {
      return { matched: true, keyword };
    }
  }
  return { matched: false };
}
