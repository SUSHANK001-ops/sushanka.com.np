// lib/profanity.ts
// Returns false if the normalized input contains a blocked term as a WHOLE WORD
// (word-boundary match, never a substring) so that innocent words that merely
// contain a blocked substring are not flagged (classic "Scunthorpe" problem).

// A short, curated, conservative in-repo word list. False negatives are preferred
// over false positives since posting is already auth-gated and reportable. This
// list is the single source of truth and is easy to extend.
const BLOCKED: string[] = [
  'fuck',
  'shit',
  'bitch',
  'asshole',
  'bastard',
  'cunt',
  'dick',
  'piss',
  'slut',
  'whore',
  'nigger',
  'nigga',
  'faggot',
  'retard',
  'spic',
  'chink',
  'kike',
  'wetback',
  'tranny',
]

// Collapse common leetspeak substitutions across the whole string.
function deLeet(s: string): string {
  return s
    .replace(/@/g, 'a')
    .replace(/0/g, 'o')
    .replace(/1/g, 'i')
    .replace(/3/g, 'e')
    .replace(/\$/g, 's')
    .replace(/5/g, 's')
    .replace(/7/g, 't')
    .replace(/4/g, 'a')
}

// Collapse runs of the same character longer than 2 down to 2 (fuuuuck -> fuuck).
function collapseRuns(s: string): string {
  return s.replace(/(.)\1{2,}/g, '$1$1')
}

function normalize(input: string): string {
  const lowered = input.toLowerCase()
  // strip diacritics
  const noMarks = lowered.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  const leet = deLeet(noMarks)
  return collapseRuns(leet)
}

export function isClean(input: string | null | undefined): boolean {
  if (input == null) return true
  if (input.trim().length === 0) return true

  const normalized = normalize(input)
  const tokens = normalized.split(/[^a-z]+/).filter(Boolean)
  for (const token of tokens) {
    if (BLOCKED.includes(token)) return false
  }
  return true
}
