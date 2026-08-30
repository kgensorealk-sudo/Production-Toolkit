/**
 * Typing Simulator with Mistype & Self-Correction Emulation
 * 
 * Simulates human-like / mascot typing rhythm with:
 * 1. Variable character delays (faster on letters, pauses on punctuation).
 * 2. Authentic mistyping of words (adjacent key slips or transposed letters).
 * 3. Human realization pause (~200-280ms) when noticing the typo.
 * 4. Rapid backspace deletion of the mistyped letters (~45-65ms per stroke).
 * 5. Correction pause (~80-130ms) before typing the correct letters.
 * 6. Adaptive speed-up for lengthy responses with full instant-skip capability.
 */

// Adjacent QWERTY keys for realistic keyboard mistypes
const ADJACENT_KEYS: Record<string, string[]> = {
  a: ['s', 'q', 'z', 'w'],
  b: ['v', 'n', 'g', 'h'],
  c: ['x', 'v', 'd', 'f'],
  d: ['s', 'f', 'e', 'c', 'r'],
  e: ['w', 'r', 'd', 's'],
  f: ['d', 'g', 'r', 'v', 't'],
  g: ['f', 'h', 't', 'b', 'y'],
  h: ['g', 'j', 'y', 'n', 'u'],
  i: ['u', 'o', 'k', 'j'],
  j: ['h', 'k', 'u', 'm', 'n'],
  k: ['j', 'l', 'i', 'm'],
  l: ['k', 'o', 'p'],
  m: ['n', 'k', 'j'],
  n: ['b', 'm', 'j', 'h'],
  o: ['i', 'p', 'l', 'k'],
  p: ['o', 'l'],
  q: ['w', 'a'],
  r: ['e', 't', 'f', 'd'],
  s: ['a', 'd', 'w', 'x', 'z'],
  t: ['r', 'y', 'g', 'f'],
  u: ['y', 'i', 'j', 'h'],
  v: ['c', 'b', 'f', 'g'],
  w: ['q', 'e', 's', 'a'],
  x: ['z', 'c', 's', 'd'],
  y: ['t', 'u', 'h', 'g'],
  z: ['a', 'x', 's'],
};

export type TypingStep =
  | { type: 'type'; text: string; delay: number }
  | { type: 'delete'; count: number; delay: number }
  | { type: 'pause'; delay: number };

export interface MistypeTarget {
  wordStart: number;
  wordEnd: number;
  word: string;
  typoCharIndex: number;
  typoChars: string;
  correctChars: string;
  backspaceCount: number;
}

/**
 * Identifies safe candidate words in plain text (outside markdown code blocks, links, and tags)
 * to introduce authentic typing slips and self-corrections.
 */
export function identifyMistypeTargets(text: string): MistypeTarget[] {
  const targets: MistypeTarget[] = [];
  if (text.length < 30) return targets;

  // Build mask of forbidden regions (code blocks ```...```, inline code `...`, links [...](...), HTML/XML tags <...>)
  const forbiddenRanges: Array<[number, number]> = [];

  // Code blocks
  const codeBlockRegex = /```[\s\S]*?```/g;
  let match: RegExpExecArray | null;
  while ((match = codeBlockRegex.exec(text)) !== null) {
    forbiddenRanges.push([match.index, match.index + match[0].length]);
  }

  // Inline code
  const inlineCodeRegex = /`[^`\n]+`/g;
  while ((match = inlineCodeRegex.exec(text)) !== null) {
    forbiddenRanges.push([match.index, match.index + match[0].length]);
  }

  // Markdown links
  const linkRegex = /\[[^\]]*\]\([^)]*\)/g;
  while ((match = linkRegex.exec(text)) !== null) {
    forbiddenRanges.push([match.index, match.index + match[0].length]);
  }

  // Tags
  const tagRegex = /<[^>]+>/g;
  while ((match = tagRegex.exec(text)) !== null) {
    forbiddenRanges.push([match.index, match.index + match[0].length]);
  }

  const isForbidden = (start: number, end: number): boolean => {
    return forbiddenRanges.some(([fStart, fEnd]) => start < fEnd && end > fStart);
  };

  // Look for clean English words with 5-10 letters in the first ~350 characters
  const wordRegex = /\b([a-zA-Z]{5,10})\b/g;
  const candidates: Array<{ word: string; start: number; end: number }> = [];

  while ((match = wordRegex.exec(text)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    const word = match[1];

    if (!isForbidden(start, end)) {
      // Prioritize common editorial words or clean conversational words
      candidates.push({ word, start, end });
    }
  }

  if (candidates.length === 0) return targets;

  // Select 1 primary candidate (between index 25 and 200, so user sees it right away)
  const primaryCandidates = candidates.filter(c => c.start >= 20 && c.start <= 220);
  const selectedFirst = primaryCandidates.length > 0
    ? primaryCandidates[Math.floor(Math.random() * primaryCandidates.length)]
    : candidates[0];

  if (selectedFirst) {
    const target = createMistypeForWord(selectedFirst);
    if (target) targets.push(target);
  }

  // For longer messages (> 450 chars), select a potential second candidate around 260-450
  if (text.length > 450) {
    const secondaryCandidates = candidates.filter(c => c.start >= 260 && c.start <= 460);
    if (secondaryCandidates.length > 0) {
      const selectedSecond = secondaryCandidates[Math.floor(Math.random() * secondaryCandidates.length)];
      const target2 = createMistypeForWord(selectedSecond);
      if (target2) targets.push(target2);
    }
  }

  return targets;
}

function createMistypeForWord(item: { word: string; start: number; end: number }): MistypeTarget | null {
  const { word, start } = item;
  if (word.length < 5) return null;

  // Pick typo position in middle of word (e.g. index 2, 3, or 4)
  const typoCharIndex = Math.min(Math.max(2, Math.floor(word.length / 2)), word.length - 2);
  const targetChar = word[typoCharIndex].toLowerCase();
  const adjacentList = ADJACENT_KEYS[targetChar];

  if (!adjacentList || adjacentList.length === 0) return null;

  const typoChar = adjacentList[Math.floor(Math.random() * adjacentList.length)];
  const isCapital = word[typoCharIndex] === word[typoCharIndex].toUpperCase();
  const adjustedTypoChar = isCapital ? typoChar.toUpperCase() : typoChar;

  // 70% of the time, human typing inertia causes typing 1 extra letter before noticing the mistake!
  const hasInertia = Math.random() < 0.7 && typoCharIndex + 1 < word.length;
  const inertiaChar = hasInertia ? word[typoCharIndex + 1] : '';

  const typoChars = adjustedTypoChar + inertiaChar;
  const backspaceCount = typoChars.length;
  const correctChars = word.slice(typoCharIndex, typoCharIndex + 1 + (hasInertia ? 1 : 0));

  return {
    wordStart: start,
    wordEnd: item.end,
    word,
    typoCharIndex: start + typoCharIndex,
    typoChars,
    correctChars,
    backspaceCount
  };
}

/**
 * Builds the complete sequence of typing, pause, typo, backspace, and correction steps.
 */
export function generateTypingScript(fullText: string): TypingStep[] {
  const steps: TypingStep[] = [];
  const mistypes = identifyMistypeTargets(fullText);
  let currentIndex = 0;
  const len = fullText.length;

  while (currentIndex < len) {
    // Check if currentIndex matches a mistype target
    const currentMistype = mistypes.find(m => m.typoCharIndex === currentIndex);

    if (currentMistype) {
      // 1. Type the typo characters (e.g., adjacent key + inertia letter)
      for (const ch of currentMistype.typoChars) {
        steps.push({
          type: 'type',
          text: ch,
          delay: Math.floor(Math.random() * 12) + 20 // 20-32ms
        });
      }

      // 2. Realization pause: Human notices the mistype!
      steps.push({
        type: 'pause',
        delay: Math.floor(Math.random() * 60) + 200 // 200-260ms pause
      });

      // 3. Backspace the mistake character by character (rapid deletion keystrokes)
      for (let b = 0; b < currentMistype.backspaceCount; b++) {
        steps.push({
          type: 'delete',
          count: 1,
          delay: Math.floor(Math.random() * 15) + 45 // 45-60ms per backspace
        });
      }

      // 4. Hesitation pause before typing the correct characters
      steps.push({
        type: 'pause',
        delay: Math.floor(Math.random() * 30) + 90 // 90-120ms
      });

      // 5. Type the correct characters and advance currentIndex
      for (const ch of currentMistype.correctChars) {
        steps.push({
          type: 'type',
          text: ch,
          delay: Math.floor(Math.random() * 10) + 22 // 22-32ms
        });
      }

      currentIndex += currentMistype.correctChars.length;
      continue;
    }

    // Normal typing of next character or small chunk for speed ramp on long texts
    const char = fullText[currentIndex];

    // Determine typing delay based on character context
    let delay = Math.floor(Math.random() * 12) + 16; // 16-28ms default

    if (char === ' ') {
      delay = Math.floor(Math.random() * 15) + 22; // 22-37ms
    } else if (char === ',' || char === ';' || char === ':') {
      delay = Math.floor(Math.random() * 40) + 60; // 60-100ms pause
    } else if (char === '.' || char === '!' || char === '?') {
      delay = Math.floor(Math.random() * 70) + 160; // 160-230ms sentence pause
    } else if (char === '\n') {
      delay = Math.floor(Math.random() * 50) + 90; // 90-140ms line pause
    }

    // Adaptive acceleration: If past character 320, slightly speed up so long messages finish smoothly
    if (currentIndex > 320 && len > 500) {
      delay = Math.max(8, Math.floor(delay * 0.55));
    }

    steps.push({
      type: 'type',
      text: char,
      delay
    });

    currentIndex++;
  }

  return steps;
}

export interface TypingSimulatorController {
  stop: () => void;
  skip: () => void;
  isRunning: () => boolean;
}

/**
 * Executes the generated typing steps, providing live text updates and instant-skip controls.
 */
export function startTypingSimulation(options: {
  fullText: string;
  onUpdate: (displayedText: string) => void;
  onComplete: () => void;
}): TypingSimulatorController {
  const { fullText, onUpdate, onComplete } = options;

  // If text is empty, complete immediately
  if (!fullText) {
    onUpdate('');
    onComplete();
    return {
      stop: () => {},
      skip: () => {},
      isRunning: () => false
    };
  }

  const steps = generateTypingScript(fullText);
  let stepIndex = 0;
  let displayedText = '';
  let activeTimeout: ReturnType<typeof setTimeout> | null = null;
  let running = true;

  const runNextStep = () => {
    if (!running) return;

    if (stepIndex >= steps.length) {
      running = false;
      onUpdate(fullText);
      onComplete();
      return;
    }

    const step = steps[stepIndex];
    stepIndex++;

    if (step.type === 'type') {
      displayedText += step.text;
      onUpdate(displayedText);
    } else if (step.type === 'delete') {
      displayedText = displayedText.slice(0, -step.count);
      onUpdate(displayedText);
    }

    // Schedule next step
    activeTimeout = setTimeout(runNextStep, step.delay);
  };

  // Begin execution
  activeTimeout = setTimeout(runNextStep, 40);

  return {
    stop: () => {
      running = false;
      if (activeTimeout) {
        clearTimeout(activeTimeout);
        activeTimeout = null;
      }
    },
    skip: () => {
      running = false;
      if (activeTimeout) {
        clearTimeout(activeTimeout);
        activeTimeout = null;
      }
      onUpdate(fullText);
      onComplete();
    },
    isRunning: () => running
  };
}
