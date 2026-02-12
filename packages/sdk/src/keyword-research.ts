/**
 * Keyword research — discover keyword opportunities using Google Autocomplete.
 * No API key required. Uses public Google Suggest endpoints.
 */

export interface KeywordSuggestion {
  keyword: string;
  source: "autocomplete" | "alphabet" | "question" | "preposition";
}

export interface KeywordResearchResult {
  seed: string;
  locale: string;
  suggestions: KeywordSuggestion[];
  questions: KeywordSuggestion[];
  longTail: KeywordSuggestion[];
  totalKeywords: number;
}

export interface KeywordResearchOptions {
  /** Locale for suggestions (default: "en") */
  locale?: string;
  /** Country code (default: "us") */
  country?: string;
  /** Run alphabet expansion a-z (default: true) */
  alphabetExpansion?: boolean;
  /** Generate question keywords (default: true) */
  questionKeywords?: boolean;
  /** Generate preposition keywords (default: true) */
  prepositionKeywords?: boolean;
  /** Request timeout in ms (default: 5000) */
  timeout?: number;
}

const QUESTION_PREFIXES = [
  "what is", "how to", "why", "when to", "where to",
  "can you", "is", "does", "which", "best",
];

const PREPOSITIONS = [
  "for", "with", "without", "vs", "or",
  "like", "near", "in", "to", "from",
];

const ALPHABET = "abcdefghijklmnopqrstuvwxyz".split("");

/**
 * Research keywords for a seed term using Google Autocomplete.
 * Returns direct suggestions, question-based keywords, and long-tail variations.
 */
export async function researchKeywords(
  seed: string,
  options?: KeywordResearchOptions,
): Promise<KeywordResearchResult> {
  const locale = options?.locale ?? "en";
  const country = options?.country ?? "us";
  const timeout = options?.timeout ?? 5000;
  const doAlphabet = options?.alphabetExpansion !== false;
  const doQuestions = options?.questionKeywords !== false;
  const doPrepositions = options?.prepositionKeywords !== false;

  const seedWords = seed.toLowerCase().trim().split(/\s+/).filter((w) => w.length > 0);
  const allSuggestions = new Map<string, KeywordSuggestion>();

  // 1. Direct autocomplete
  const direct = await fetchSuggestions(seed, locale, country, timeout);
  for (const kw of direct) {
    if (isRelevantToSeed(kw, seedWords)) {
      addSuggestion(allSuggestions, kw, "autocomplete");
    }
  }

  // 2. Alphabet expansion: "seed a", "seed b", ...
  if (doAlphabet) {
    const alphabetPromises = ALPHABET.map((letter) =>
      fetchSuggestions(`${seed} ${letter}`, locale, country, timeout)
        .then((results) => ({ letter, results }))
        .catch(() => ({ letter, results: [] as string[] })),
    );
    const alphabetResults = await Promise.all(alphabetPromises);
    for (const { results } of alphabetResults) {
      for (const kw of results) {
        if (isRelevantToSeed(kw, seedWords)) {
          addSuggestion(allSuggestions, kw, "alphabet");
        }
      }
    }
  }

  // 3. Question keywords: "how to seed", "what is seed", ...
  const questions: KeywordSuggestion[] = [];
  if (doQuestions) {
    const questionPromises = QUESTION_PREFIXES.map((prefix) =>
      fetchSuggestions(`${prefix} ${seed}`, locale, country, timeout)
        .then((results) => ({ prefix, results }))
        .catch(() => ({ prefix, results: [] as string[] })),
    );
    const questionResults = await Promise.all(questionPromises);
    for (const { results } of questionResults) {
      for (const kw of results) {
        if (isRelevantToSeed(kw, seedWords)) {
          const suggestion: KeywordSuggestion = { keyword: kw, source: "question" };
          questions.push(suggestion);
          allSuggestions.set(kw.toLowerCase(), suggestion);
        }
      }
    }
  }

  // 4. Preposition keywords: "seed for", "seed vs", ...
  if (doPrepositions) {
    const prepPromises = PREPOSITIONS.map((prep) =>
      fetchSuggestions(`${seed} ${prep}`, locale, country, timeout)
        .then((results) => ({ prep, results }))
        .catch(() => ({ prep, results: [] as string[] })),
    );
    const prepResults = await Promise.all(prepPromises);
    for (const { results } of prepResults) {
      for (const kw of results) {
        if (isRelevantToSeed(kw, seedWords)) {
          addSuggestion(allSuggestions, kw, "preposition");
        }
      }
    }
  }

  // Categorize
  const suggestions = [...allSuggestions.values()].filter(
    (s) => s.source === "autocomplete",
  );
  const longTail = [...allSuggestions.values()].filter(
    (s) => s.source === "alphabet" || s.source === "preposition",
  );

  return {
    seed,
    locale,
    suggestions,
    questions,
    longTail,
    totalKeywords: allSuggestions.size,
  };
}

/**
 * Fetch autocomplete suggestions from Google Suggest.
 */
async function fetchSuggestions(
  query: string,
  locale: string,
  country: string,
  timeout: number,
): Promise<string[]> {
  const params = new URLSearchParams({
    client: "firefox",
    q: query,
    hl: locale,
    gl: country,
  });

  const url = `https://www.google.com/complete/search?${params}`;

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; Indxel/0.1; +https://indxel.com)",
      },
      signal: AbortSignal.timeout(timeout),
    });

    if (!response.ok) return [];

    const data = await response.json();

    // Google returns [query, [suggestions]]
    if (Array.isArray(data) && Array.isArray(data[1])) {
      return data[1].filter(
        (s: unknown): s is string => typeof s === "string" && s !== query,
      );
    }

    return [];
  } catch {
    return [];
  }
}

function addSuggestion(
  map: Map<string, KeywordSuggestion>,
  keyword: string,
  source: KeywordSuggestion["source"],
): void {
  const key = keyword.toLowerCase().trim();
  if (key && !map.has(key)) {
    map.set(key, { keyword: key, source });
  }
}

/**
 * Check if a suggestion is relevant to the seed keyword.
 * Filters out suggestions where seed words only appear as prefixes of
 * unrelated words (e.g., seed "seo" should not match "seoul" or "seoulspice").
 * Each seed word must appear as a standalone word in the suggestion.
 */
function isRelevantToSeed(suggestion: string, seedWords: string[]): boolean {
  return seedWords.every((word) => {
    const regex = new RegExp(`\\b${escapeRegex(word)}\\b`, "i");
    return regex.test(suggestion);
  });
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
