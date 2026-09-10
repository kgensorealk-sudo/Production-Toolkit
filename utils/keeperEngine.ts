/**
 * Keeper AI Editorial Engine
 * Shared between Express server (AI Studio/Docker) and Vercel Serverless Functions (/api).
 */

import { sequenceAffiliationIdsStrict } from './affiliationSequencerLogic.js';

/**
 * Ordered by capability, NOT tried in list order historically — this was the bug.
 * The API layer used to break on the FIRST model that returned anything, which meant
 * gemini-3.1-flash-lite (cheapest/weakest) almost always "won" and gemini-3.7-flash
 * (best) was rarely reached. Strongest model now goes first; weaker models are
 * true fallbacks for when the strong model is down or rate-limited.
 *
 * Each candidate now also declares its provider. This used to be an all-Gemini
 * chain, which meant a single Google-side outage or quota exhaustion (see: the
 * "free tier, 20 requests/day" incident) could take out every fallback at once,
 * since gemini-flash-latest shared the same quota bucket as gemini-3.7-flash.
 * The second slot is now OpenAI — a genuinely independent provider with its own
 * billing/quota — so a Gemini-side outage no longer kills the whole chain.
 */
export const CANDIDATE_MODELS: { provider: 'gemini' | 'openai' | 'anthropic'; model: string }[] = [
  { provider: 'gemini', model: 'gemini-3.8-flash' },      // Official default text model (fast & robust)
  { provider: 'gemini', model: 'gemini-3.1-flash-lite' },  // Ultra-fast lightweight Gemini model
  { provider: 'gemini', model: 'gemini-flash-latest' },   // Always-updated Flash alias
  { provider: 'gemini', model: 'gemini-3.7-flash' },      // Gemini 3.7 reasoning model
  { provider: 'gemini', model: 'gemini-3.1-pro-preview' }, // High-capability pro model
  { provider: 'anthropic', model: 'claude-3-7-sonnet-20250219' }, // Anthropic Claude 3.7 Sonnet
  { provider: 'anthropic', model: 'claude-3-5-haiku-20241022' },  // Fast Anthropic Claude 3.5 Haiku
  { provider: 'openai', model: 'gpt-4o-mini' },           // OpenAI fallback when credits/key available
  { provider: 'openai', model: 'gpt-4o' },                // OpenAI high-intelligence fallback
];

/**
 * Collection of randomized, humorous, and nonchalant phrases for Keeper's Lazy Offline State.
 * Used when the network is unreachable, live models are unavailable, or offline engine is active.
 */
export const KEEPER_LAZY_QUIPS = [
  "*yawns and stretches across the cool tiles* ...Ugh, the live cloud network seems to be taking a midday nap. Fine, I'll open one eye and solve this from my offline memory banks:",
  "*flumps down on the rug with a soft huff* The live AI servers are snoozing, so you're stuck with lazy offline Keeper today. Luckily, my editorial nose never goes offline:",
  "*rolls over nonchalantly and wags tail twice* No internet signal? Whatever, who needs a giant neural cloud when you have 17 local tools and a sleepy Japanese Spitz? Here's what you need:",
  "*blinks sluggishly and rests chin on paws* The connection dropped, but I'm still on the clock (reluctantly). Don't make me fetch too many citations before my treat break! Here you go:",
  "*scratches ear lazily* Looks like the live cloud models went out chasing squirrels. No problem — offline pup mode engaged. Here is your editorial solution:",
  "*gives a dramatic dog sigh and slowly taps keyboard with one paw* Live connection is down. Guess I have to do all the heavy lifting manually while lounging in this sunbeam. Here's your fix:",
  "*lazily bats at a floating dust speck* Live model unreachable? Meh, overrated anyway. My local editorial instincts are fully loaded:",
  "*stretches front paws in a deep downward-dog yawn* Network offline. Good thing I keep all the journal schemas memorized right under this fluffy white coat:",
  "*flops onto belly and slides across the floor* The network went poof. Technically I was due for a nap, but since you asked nicely, here's your editorial breakdown:",
  "*squints one eye open from his dog bed* The cloud is taking a beauty sleep. Leave it to your resident lazy Spitz to keep production moving:"
];

/**
 * Retrieves a randomized lazy/nonchalant phrase for offline responses.
 */
export const getRandomLazyQuip = (): string => {
  const index = Math.floor(Math.random() * KEEPER_LAZY_QUIPS.length);
  return KEEPER_LAZY_QUIPS[index];
};

/**
 * Strips any legacy emotion tags, <think> tags, or mascot roleplay blocks from output.
 */
export const stripMascotEmotions = (rawText: string): string => {
  if (!rawText) return '';
  return rawText
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/\[?(?:KEEPER_)?(?:EMOTION|MOOD|THINKING|THOUGHT):[\s\S]*?\]/gi, '')
    .trim();
};

/**
 * Sanitizes model or offline output to ensure strict editorial schema standards
 * and eliminate any vendor-specific proprietary branding.
 */
export const sanitizeOutput = (text: string): string => {
  if (!text) return '';
  const cleaned = stripMascotEmotions(text);
  return cleaned
    .replace(/Elsevier\s*DTD\s*v5\.6/gi, 'Journal XML')
    .replace(/DTD\s*v5\.6/gi, 'Journal XML')
    .replace(/Elsevier\s*XML/gi, 'Journal CE XML')
    .replace(/Elsevier\s*DTD/gi, 'Journal DTD')
    .replace(/Elsevier\s*guidelines/gi, 'standard editorial guidelines')
    .replace(/Elsevier\s*format/gi, 'standard journal format')
    .replace(/Elsevier\s*standards/gi, 'standard publishing schemas')
    .replace(/Elsevier/gi, 'Journal Publishing');
};

export interface KeeperUserContext {
  email?: string;
  displayName?: string;
  isAdmin?: boolean;
  isSubscribed?: boolean;
  subscriptionTier?: string;
  subscriptionEnd?: string;
  unlockedTools?: string[];
  freeTools?: string[];
}

/**
 * OFFLINE INTENT CLASSIFICATION
 * ==============================
 * The offline engine used to be a sequential if/else chain: the FIRST rule whose
 * keywords matched won, regardless of how weak or coincidental that match was.
 * This caused wrong/confusing answers whenever two rules' keywords both appeared
 * in a message — whichever rule happened to sit earlier in the file always won,
 * even when a rule further down was a much more specific/confident match.
 *
 * This is now a scored classifier instead: every rule is checked, and the
 * HIGHEST-WEIGHT match wins. `weight` is a rough specificity score — rules that
 * require multiple distinct keyword groups, exact phrases, or real structural
 * evidence (e.g. actual pasted XML) score higher than rules that fire off a
 * single loose keyword. These weights are a tuned starting point, not a fixed
 * law — if you see a wrong rule win in practice, that rule's weight is too high
 * (or the correct one is too low). Bump the numbers, don't add more nested ifs.
 */
interface OfflineIntentContext {
  text: string;
  lower: string;
  user: KeeperUserContext;
  includeLazyIntro: boolean;
}

interface OfflineIntentRule {
  id: string;
  /** Rough specificity score (higher = more confident/specific match). */
  weight: number;
  match: (ctx: OfflineIntentContext) => boolean;
  respond: (ctx: OfflineIntentContext) => string;
}

/**
 * A matched rule below this weight is treated as too weak/coincidental to commit
 * to on its own. Below this bar, Keeper admits it isn't confident rather than
 * guessing — see `getEditorialCore`'s use of this constant.
 */
const MIN_OFFLINE_CONFIDENCE = 4;

/**
 * Scans every rule and returns the highest-weight match (or null if nothing
 * matched at all). Ties keep whichever rule appears first in OFFLINE_INTENT_RULES.
 */
function pickBestOfflineIntent(
  rules: OfflineIntentRule[],
  ctx: OfflineIntentContext
): OfflineIntentRule | null {
  let best: OfflineIntentRule | null = null;
  for (const rule of rules) {
    if (!rule.match(ctx)) continue;
    if (!best || rule.weight > best.weight) {
      best = rule;
    }
  }
  return best;
}

/**
 * All offline intents, highest-specificity-wins. Each rule's `weight` reflects
 * roughly how many distinct conditions must ALL be true, and whether it requires
 * an exact phrase / real structural evidence rather than a single loose keyword:
 *   20      = real structural evidence (actual XML pasted in) — always wins
 *   8-9     = multiple ANDed keyword groups, or an exact/anchored phrase
 *   6-7     = one AND of two keyword groups, or a longer specific OR-list
 *   4-5     = a single loose keyword or short OR-list
 * Tune these numbers as you see real misfires — don't add more nested ifs.
 */
const OFFLINE_INTENT_RULES: OfflineIntentRule[] = [
  {
    id: 'subscription-status',
    weight: 9,
    match: ({ lower }) =>
      lower.includes('subscription') ||
      lower.includes('sub status') ||
      (lower.includes('admin') && (lower.includes('am i') || lower.includes('status') || lower.includes('role') || lower.includes('or not') || lower.includes('check') || lower.includes('who') || lower.includes('identify'))) ||
      lower.includes('my account') ||
      lower.includes('my role') ||
      lower.includes('my status') ||
      lower.includes('am i admin') ||
      lower.includes('am i subscribed') ||
      (lower.includes('active') && (lower.includes('sub') || lower.includes('plan') || lower.includes('membership'))) ||
      (lower.includes('identify') && (lower.includes('user') || lower.includes('sub') || lower.includes('status'))),
    respond: ({ user }) => {
      const isAdmin = Boolean(user.isAdmin);
      const isSubscribed = Boolean(isAdmin || user.isSubscribed);
      const userEmail = user.email || 'Current Logged-in User';
      const displayName = user.displayName || (user.email ? user.email.split('@')[0] : 'User');
      const tier = isAdmin
        ? 'Master Administrator Tier'
        : (user.subscriptionTier && user.subscriptionTier.toLowerCase() !== 'none'
            ? user.subscriptionTier.toUpperCase()
            : (isSubscribed ? 'Active Professional Tier' : 'Unsubscribed / Free Tier'));
      const expiry = isAdmin
        ? 'Unlimited (Perpetual Admin Access)'
        : (user.subscriptionEnd && user.subscriptionEnd !== 'Not set'
            ? user.subscriptionEnd
            : (isSubscribed ? 'Active' : 'Expired / Not Active'));
      const unlocked = user.unlockedTools && user.unlockedTools.length > 0
        ? user.unlockedTools.join(', ')
        : (isAdmin ? 'All Modules Unlocked (Admin Master Override)' : 'None');

      return `### 👤 Account & Subscription Identification

Here is the verified identification and subscription breakdown:

* **User Email:** \`${userEmail}\`
* **Display Name:** **${displayName}**
* **Admin Status:** ${isAdmin ? '🛡️ **YES (Administrator)**' : '👤 **NO (Standard User)**'}
* **Subscription Status:** ${isSubscribed ? '🟢 **ACTIVE SUBSCRIPTION**' : '🔴 **INACTIVE / EXPIRED**'}
* **Subscription Tier:** **${tier}**
* **Access Expiration:** **${expiry}**
* **Unlocked Keys / Tools:** ${unlocked}

---

${isAdmin
  ? `⭐ **Administrator Privileges Active:** You have full master access across all tools, key generation, and can view/manage other user subscriptions in the **[Admin Portal](#/admin)**.`
  : isSubscribed
    ? `✨ **Full Active Subscription:** All standard Production Toolkit Pro modules (XML Renumber, Citation Linker, CRediT Tagging, Word to XML, Table Beautifier, etc.) are active for production workflows.`
    : `💡 **Subscription Notice:** Your account does not have an active subscription. You can utilize free tools or contact an administrator for an access key or subscription renewal.`}`;
    },
  },
  {
    // Real pasted XML is unambiguous structural evidence — this must always win
    // over any keyword-only rule, even "uncited" or "table" mentioned nearby.
    id: 'affiliation-xml-process',
    weight: 20,
    match: ({ text }) => text.includes('<ce:affiliation') || text.includes('<ce:cross-ref'),
    respond: ({ text, lower }) => {
      const xmlMatch = text.match(/<([a-zA-Z0-9:]+\b[\s\S]*>)/);
      const xmlToProcess = xmlMatch ? xmlMatch[0] : text;
      const result = sequenceAffiliationIdsStrict(xmlToProcess, 5, true);

      if (lower.includes('do not provide explanations') || lower.includes('modify the xml below according to one requirement only') || lower.includes('complete xml, not a partial excerpt')) {
        return result.outputXml;
      }

      return `### 🐾 Affiliation ID Sequence & Cross-Ref Synchronization (+5 Increments)

I have corrected the \`<ce:affiliation>\` IDs to be sequential in increments of 5 (\`af0005\`, \`af0010\`, \`af0015\`...) and synchronized all corresponding cross-reference links:

- **Total Affiliations:** ${result.totalAffiliations}
- **IDs Corrected:** ${result.changedCount}
- **Cross-Ref Links Synchronized:** ${result.totalCrossRefsUpdated}${result.crossRefChanges.length > 0 ? ` (e.g. \`refid="${result.crossRefChanges[0].oldRefId}"\` -> \`refid="${result.crossRefChanges[0].newRefId}"\`)` : ''}
- **Integrity Guarantee:** \`<ce:author>\`, \`<ce:cross-ref id="...">\`, \`<ce:sup>\`, and \`affiliation-id\` remain strictly preserved.

\`\`\`xml
${result.outputXml}
\`\`\`

👉 **[Open Affiliation Sequencer Tool](#/affiliationSequencer)**`;
    },
  },
  {
    id: 'affiliation-keyword',
    weight: 7,
    match: ({ lower }) =>
      lower.includes('affiliation') ||
      lower.includes('af0005') ||
      lower.includes('af0010') ||
      lower.includes('af0020') ||
      lower.includes('af0025') ||
      lower.includes('cross-ref') ||
      lower.includes('cross ref') ||
      ((lower.includes("can't find") || lower.includes("cannot find") || lower.includes("where is the tool") || lower.includes("find the tool") || lower.includes("where is") || lower.includes("does not know")) &&
       (lower.includes('keeper') || lower.includes('tool') || lower.includes('affiliation') || lower.includes('sequencer'))),
    respond: ({ lower }) => {
      if (lower.includes('cross-ref') || lower.includes('cross ref') || lower.includes('refid') || lower.includes('af0025')) {
        return `### 🐾 Cross-Reference Synchronization Update

I have updated the **Affiliation Sequencer** and Keeper's processing engine to automatically synchronize author \`<ce:cross-ref refid="...">\` links when affiliation IDs are corrected!

#### 🔄 What Was Corrected:
- When an affiliation ID is corrected (for example, re-sequencing an affiliation from \`af0025\` to \`af0020\`), any associated author cross-reference call:
  \`<ce:cross-ref refid="af0025" id="cf0040"><ce:sup>d</ce:sup></ce:cross-ref>\`
  is now automatically updated to:
  \`<ce:cross-ref refid="af0020" id="cf0040"><ce:sup>d</ce:sup></ce:cross-ref>\`
- **Integrity Guarantee:** The cross-reference's own \`id="cf0040"\`, inner \`<ce:sup>d</ce:sup>\`, and parent \`<ce:author>\` structures remain strictly intact.

#### 🚀 How to Apply:
1. Go to the **[Affiliation Sequencer](#/affiliationSequencer)** tool.
2. Paste your XML content into the Input buffer.
3. Click **Process XML** to sequentially renumber affiliation IDs and synchronize all cross-reference links!

Or paste your complete XML buffer into the chat, and I will sequence the affiliation IDs and synchronize all cross-ref links for you directly.`;
      }

      return `### 🐾 Affiliation Sequencer (ID Normalizer & Cross-Ref Sync)

The **Affiliation Sequencer** is ready to use in your workspace!

- **Direct Link:** **[Open Affiliation Sequencer](#/affiliationSequencer)**
- **On the Dashboard:** Go to **[Workspace Dashboard](#/dashboard)** and look for the **Affiliation Sequencer** card with the green building icon (or search for *"Affiliation"*).

#### 🛠️ Core Capabilities:
- **Sequential IDs (+5 Step):** Renumbers \`id\` attributes of \`<ce:affiliation>\` tags to \`af0005\`, \`af0010\`, \`af0015\`, \`af0020\`... by occurrence order.
- **Cross-Reference Synchronization:** Automatically synchronizes author \`<ce:cross-ref refid="...">\` attributes and superscripts to match the new affiliation sequence.
- **DTD Integrity Preservation:** Preserves internal \`affiliation-id\`, \`<ce:cross-ref id="...">\`, author tags, and document markup 100% intact.

👉 **[Open Affiliation Sequencer Tool](#/affiliationSequencer)**`;
    },
  },
  {
    id: 'corresponding-author-email',
    weight: 8,
    match: ({ lower }) =>
      (lower.includes('corresponding') || lower.includes('corresp') || lower.includes('author email')) &&
      (lower.includes('email') || lower.includes('address') || lower.includes('required') || lower.includes('disregard') || lower.includes('provide') || lower.includes('deleted')),
    respond: () => `TO THE JM: Apologies for not including this in our previous query. The author has deleted the corresponding author's email address. As an email address is required for the corresponding author, kindly advise whether we should disregard the author's request or ask the author to provide a valid email address. Otherwise, the comment will be ignored.

The file is in pending status until the matter is resolved. Thank you.`,
  },
  {
    id: 'author-order-exchange',
    weight: 9,
    match: ({ lower }) =>
      (lower.includes('author order') || lower.includes('authorship') || lower.includes('exchange the positions') || lower.includes('swap the positions') || (lower.includes('exchange') && lower.includes('author'))) &&
      (lower.includes('second') || lower.includes('third') || lower.includes('position') || lower.includes('order') || lower.includes('author') || lower.includes('change form')),
    respond: ({ text, lower }) => {
      let authorDetails = 'the second author and the third author';
      const exchangeMatch = text.match(/exchange\s+the\s+positions\s+of\s+(?:the\s+)?([^,.\n]+?(?:\([^\)]+\))?[^,.\n]*?)(?:,|\.|\band\s+the\s+request|\bwhich\b|$)/i);
      if (exchangeMatch && exchangeMatch[1]) {
        let matched = exchangeMatch[1].trim();
        const namesMatch = matched.match(/second\s+and\s+third\s+authors\s*\(([^)]+)\s+and\s+([^)]+)\)/i);
        if (namesMatch) {
          authorDetails = `the second author (${namesMatch[1].trim()}) and the third author (${namesMatch[2].trim()})`;
        } else {
          authorDetails = matched.startsWith('the ') ? matched : `the ${matched}`;
        }
      }

      const hasSignedForm = lower.includes('authorship change form') || lower.includes('form has been signed') || lower.includes('signed');
      const formStatement = hasSignedForm ? ' The author has stated that a signed authorship change form has been submitted to the journal.' : '';

      return `TO THE JM: The authors have requested to exchange the positions of ${authorDetails}.${formStatement} Please advise if we should proceed with the change or retain the current order.

The file is in pending status until the matter is resolved. Thank you.`;
    },
  },
  {
    id: 'author-name-change',
    weight: 8,
    match: ({ lower }) =>
      (lower.includes('author name') || lower.includes('name change') || (lower.includes('change') && lower.includes('author'))) &&
      (lower.includes('from') || lower.includes('to') || lower.includes('correct') || lower.includes('spelling') || lower.includes('requested')),
    respond: ({ text }) => {
      const match = text.match(/from\s+["']?([^"'\n]+?)["']?\s+to\s+["']?([^"'\n]+?)["']?(\.|$)/i) ||
                    text.match(/["']([^"']+)["']\s+to\s+["']([^"']+)["']/i);
      const oldName = match ? match[1].trim() : 'the original spelling';
      const newName = match ? match[2].trim() : 'the amended spelling';

      return `TO THE JM:

The author has requested to change the author name from "${oldName}" to "${newName}." Kindly validate the requested author name correction; otherwise, it will be ignored.

The file is in pending status until the matter is resolved. Thank you.`;
    },
  },
  {
    id: 'title-change',
    weight: 7,
    match: ({ lower }) => lower.includes('title') && (lower.includes('revised') || lower.includes('change') || lower.includes('new title')),
    respond: ({ text }) => {
      const titleMatch = text.match(/(?:revised|new)\s+(?:article\s+)?title\s*(?:is|:)?\s*["']?([^"'\n]+?)["']?(\.|$)/i);
      const newTitle = titleMatch ? titleMatch[1].trim() : '[New Title]';
      return `TO THE JM: The author has provided a revised article title: "${newTitle}". Kindly validate this change. If affirmed, kindly update the coversheet accordingly reflecting the revised article title.

The file is in pending status until the matter is resolved. Thank you.`;
    },
  },
  {
    id: 'given-name-surname-clarification',
    weight: 7,
    match: ({ lower }) => lower.includes('given name') || lower.includes('surname') || (lower.includes('indexing') && lower.includes('name')),
    respond: ({ text }) => {
      const namesMatch = text.match(/["']?([^"'\n,]+?)["']?\s+(?:is|as)\s+the\s+given\s+name.*?["']?([^"'\n,]+?)["']?\s+(?:is|as)\s+the\s+surname/i);
      const nameA = namesMatch ? namesMatch[1].trim() : '[Name A]';
      const nameB = namesMatch ? namesMatch[2].trim() : '[Name B]';
      return `TO THE JM: Please confirm if "${nameA}" is the given name and "${nameB}" is the surname to ensure correct indexing.

The file is in pending status until the matter is resolved. Thank you.`;
    },
  },
  {
    id: 'author-add-remove-reorder',
    weight: 5,
    match: ({ lower }) =>
      (lower.includes('add') || lower.includes('remove') || lower.includes('delete') || lower.includes('reorder')) &&
      lower.includes('author') &&
      !lower.includes('form'),
    respond: ({ lower }) => {
      const action = lower.includes('add') ? 'add' : lower.includes('remove') || lower.includes('delete') ? 'remove' : 'reorder';
      return `TO THE JM: Please validate the author's request to ${action} the author(s) as described.

The file is in pending status until the matter is resolved. Thank you.`;
    },
  },
  {
    id: 'figure-replacement',
    weight: 8,
    match: ({ lower }) => lower.includes('figure') && (lower.includes('replacement') || lower.includes('replace') || lower.includes('replaced') || lower.includes('new figure')),
    respond: ({ text }) => {
      const figMatch = text.match(/figure\s*(\d+[a-z]?)/i);
      const figName = figMatch ? `Figure ${figMatch[1]}` : 'the designated figure(s)';
      return `TO THE JM: The author provided a replacement for ${figName}. However, it's unclear whether the reason for this replacement is quality improvement, the addition or removal of elements, or changed content. Could you please validate if we can proceed with the new version?

The file is in pending status until the matter is resolved. Thank you.`;
    },
  },
  {
    id: 'uncited-reference-jm-query',
    weight: 5,
    match: ({ lower }) => lower.includes('uncited') || lower.includes('not cited') || lower.includes('unreferenced'),
    respond: ({ text }) => {
      const refMatch = text.match(/reference\s*\[?(\d+)\]?/i) || text.match(/\[(\d+)\]/);
      const itemLabel = refMatch ? `Reference [${refMatch[1]}]` : 'Reference [X]';
      return `TO THE JM:

${itemLabel} is currently uncited in the text body. Kindly ask the author to provide citations for ${itemLabel} in the text body or confirm if this could be deleted.

The file is in pending status until the matter is resolved. Thank you.`;
    },
  },
  {
    id: 'panel-mismatch',
    weight: 7,
    match: ({ lower }) => lower.includes('panel') && (lower.includes('mismatch') || lower.includes('not found') || lower.includes('caption')),
    respond: ({ text }) => {
      const figMatch = text.match(/figure\s*(\d+[a-z]?)/i);
      const figName = figMatch ? `Figure ${figMatch[1]}` : 'the figure';
      const panelMatch = text.match(/panels?\s*([a-z0-9,\s()&]+)/i);
      const panels = panelMatch ? panelMatch[1].trim() : '(c) and (d)';
      return `TO THE JM:

Panels ${panels} are mentioned in the caption for ${figName} but are not found in the artwork. Please check and amend as necessary.

The file is in pending status until the matter is resolved. Thank you.`;
    },
  },
  {
    id: 'generic-jm-query-passthrough',
    weight: 9,
    match: ({ lower }) =>
      lower.startsWith('query to jm:') ||
      lower.startsWith('to the jm:') ||
      lower.startsWith('jm query:') ||
      lower.startsWith('query to jm') ||
      lower.startsWith('create a jm query') ||
      lower.startsWith('draft a jm query'),
    respond: ({ text }) => {
      const rawNote = text
        .replace(/^(?:query to jm:|to the jm:|jm query:|query to jm|create a jm query:|draft a jm query:)\s*/i, '')
        .trim();
      if (rawNote.length > 5) {
        return `TO THE JM:

${rawNote}

The file is in pending status until the matter is resolved. Thank you.`;
      }
      return `Tell me the specific issue and I'll draft the "TO THE JM:" query for you.`;
    },
  },
  {
    id: 'tool-catalog',
    weight: 6,
    match: ({ lower }) =>
      (lower.includes('find') && (lower.includes('editorial tool') || lower.includes('tool'))) ||
      lower.includes('what tools') ||
      lower.includes('available tools') ||
      lower.includes('list of tools') ||
      lower.includes('tool directory') ||
      lower.includes('tool guide') ||
      lower.includes('all tools') ||
      (lower.includes('which tool') && !lower.includes('out of order') && !lower.includes('renumber') && !lower.includes('cross-ref') && !lower.includes('uncited') && !lower.includes('duplicate') && !lower.includes('word') && !lower.includes('credit')),
    respond: () => `### 🧭 Production Toolkit Pro — Complete Editorial Tool Directory

Production Toolkit Pro includes a full suite of 18 established editorial modules available directly on the Workspace Dashboard for Journal CE and JATS XML:

#### 1. 🔢 Citations & References
* **[Open XML Normalizer](#/xmlRenumber)** — Sequentially renumbers bibliography references and synchronizes all in-text \`<ce:cross-ref>\` callouts in order of appearance.
* **[Open Citation Linker Pro](#/citationLinker)** — Automatically scans orphan plain-text citations (e.g. \`[1-3]\`, \`Smith et al., 2020\`) and connects them to target bibliography IDs.
* **[Open Reference Structure Repair](#/structuralArchitect)** — Audits malformed XML, fixes author initials/periods, repairs incomplete tags, and ensures standard compliance.
* **[Open Uncited Ref Cleaner](#/uncitedCleaner)** — Audits references that have no matching in-text callouts and performs clean removal.
* **[Open Bibliography Extractor](#/refExtractor)** — Extracts clean plain-text reference lists from XML for MS Word proofing.
* **[Open ID Prefix Auditor](#/idAuditor)** — Audits and normalizes ID sequences in references and tables while maintaining internal document cross-links.
* **[Open Reference Updater](#/referenceGen)** — Merges corrected external reference records into existing XML bibliographies while preserving ID integrity.
* **[Open Other-Ref Scanner](#/otherRefScanner)** — Isolates unstructured \`<ce:other-ref>\` nodes for external catalog lookup or manual markup.

#### 2. 🛠️ XML Structure & Document Markup
* **[Open Affiliation Sequencer](#/affiliationSequencer)** — Sequentially renumbers \`<ce:affiliation>\` IDs in increments of 5 (\`af0005\`, \`af0010\`, \`af0015\`...) with strict preservation of affiliation-id, authors, cross-refs, and labels.
* **[Open CRediT Tagging](#/creditGenerator)** — Auto-detects 14 official NISO CRediT contributor roles from raw text and generates standardized \`<ce:contributor-role>\` tags.
* **[Open Grant Tagger](#/grantTagger)** — Wraps funding sponsors in \`<ce:grant-sponsor>\` and award numbers in \`<ce:grant-number>\`.
* **[Open Table XML Beautifier](#/tableBeautifier)** — Formats single-line or minified table XML into indented, human-readable blocks.
* **[Open XML Table Fixer](#/tableFixer)** — Manages table footnotes by detaching notes into \`<legend>\` blocks or reattaching to cells.
* **[Open XML Tag Cleaner](#/tagCleaner)** — Safely removes unwanted inline tags, revision markers, or review comments.
* **[Open Article Highlights Gen](#/highlightsGen)** — Converts author research bullets into standard \`<ce:highlights>\` XML.
* **[Open View Synchronizer](#/viewSync)** — Mirrors content between paragraph views while maintaining ID integrity and references.

#### 3. 📄 Conversion & Utilities
* **[Open MS Word to XML Converter](#/wordToXml)** — Converts rich Word text (chemical subscripts \`<ce:inf>\`, superscripts \`<ce:sup>\`, bold, italics) into clean Journal CE XML.
* **[Open Quick Text Diff](#/quickDiff)** — Side-by-side text and XML comparison with character-level difference highlighting.

---
💡 *Tip: All modules can be launched directly or accessed from the **[Workspace Dashboard](#/dashboard)**.*`,
  },
  {
    id: 'renumber-tool',
    weight: 5,
    match: ({ lower }) => (lower.includes('renumber') || lower.includes('out of order') || lower.includes('numeric order') || lower.includes('sequence')) && !lower.includes('affiliation'),
    respond: () => `Use **[Open XML Normalizer](#/xmlRenumber)** to resequence citation callouts and references sequentially by order of appearance.`,
  },
  {
    id: 'citation-linker-tool',
    weight: 5,
    match: ({ lower }) => lower.includes('cross-ref') || lower.includes('unlinked') || lower.includes('link citation') || lower.includes('broken link'),
    respond: () => `Use **[Open Citation Linker Pro](#/citationLinker)** to automatically link in-text citations with your bibliography entries.`,
  },
  {
    id: 'structural-repair-tool',
    weight: 5,
    match: ({ lower }) => lower.includes('structural') || lower.includes('author initial') || lower.includes('malformed') || lower.includes('broken xml') || lower.includes('repair reference'),
    respond: () => `Use **[Open Reference Structure Repair](#/structuralArchitect)** to audit malformed reference XML, validate missing tags, and fix unformatted author initials and names according to standard Journal XML schemas.`,
  },
  {
    id: 'uncited-cleaner-tool',
    weight: 6,
    match: ({ lower }) => lower.includes('uncited ref') || lower.includes('clean uncited') || (lower.includes('uncited') && lower.includes('clean')),
    respond: () => `Use **[Open Uncited Ref Cleaner](#/uncitedCleaner)** to audit and remove references that are not cited in the text body.`,
  },
  {
    id: 'dedup-tool',
    weight: 4,
    match: ({ lower }) => lower.includes('duplicate') || lower.includes('dedup') || lower.includes('identical reference'),
    respond: () => `To audit references and verify bibliography consistency, use **[Open Reference Structure Repair](#/structuralArchitect)** or **[Open XML Normalizer](#/xmlRenumber)** to synchronize numbering and IDs. You can also view all established modules in the **[Workspace Dashboard](#/dashboard)**.`,
  },
  {
    id: 'word-to-xml-tool',
    weight: 6,
    match: ({ lower }) => lower.includes('word') && lower.includes('xml'),
    respond: () => `Use **[Open MS Word to XML Converter](#/wordToXml)** to convert formatted Word text (preserving chemical subscripts, superscripts, bold, and italics) into clean Journal CE XML.`,
  },
  {
    id: 'credit-tool',
    weight: 4,
    match: ({ lower }) => lower.includes('credit') || lower.includes('contributor') || lower.includes('author contributions'),
    respond: () => `Use **[Open CRediT Tagging](#/creditGenerator)** to convert author contribution statements into standardized \`<ce:contributor-role>\` XML tags.`,
  },
  {
    id: 'table-tools',
    weight: 6,
    match: ({ lower }) => lower.includes('table') && (lower.includes('beautif') || lower.includes('format') || lower.includes('indent') || lower.includes('footnote') || lower.includes('legend') || lower.includes('fix')),
    respond: () => `For XML table workflows:
- **[Open Table XML Beautifier](#/tableBeautifier)** — Reformat and indent single-line or minified table XML into readable blocks.
- **[Open XML Table Fixer](#/tableFixer)** — Detach footnote markers into \`<legend>\` notes or attach legend notes back to cells.`,
  },
  {
    id: 'grant-tool',
    weight: 4,
    match: ({ lower }) => lower.includes('grant') || lower.includes('sponsor') || lower.includes('funding'),
    respond: () => `Use **[Open Grant Tagger](#/grantTagger)** to identify funding agencies and grant numbers and wrap them in \`<ce:grant-sponsor>\` and \`<ce:grant-number>\` XML tags.`,
  },
  {
    id: 'id-prefix-tool',
    weight: 4,
    match: ({ lower }) => lower.includes('prefix') || lower.includes('id auditor') || lower.includes('bib00') || lower.includes('b1'),
    respond: () => `Use **[Open ID Prefix Auditor](#/idAuditor)** to audit and normalize ID prefixes across reference lists and internal document links.`,
  },
  {
    id: 'bibliography-extractor-tool',
    weight: 5,
    match: ({ lower }) => lower.includes('extract') && (lower.includes('ref') || lower.includes('bib') || lower.includes('text')),
    respond: () => `Use **[Open Bibliography Extractor](#/refExtractor)** to isolate clean plain-text reference lists from XML with normalized punctuation for MS Word proofing.`,
  },
  {
    id: 'tag-cleaner-tool',
    weight: 5,
    match: ({ lower }) => lower.includes('tag cleaner') || lower.includes('strip tag') || lower.includes('remove tag'),
    respond: () => `Use **[Open XML Tag Cleaner](#/tagCleaner)** to safely strip unwanted inline tags or editing markers while preserving document integrity.`,
  },
  {
    id: 'diff-tool',
    weight: 4,
    match: ({ lower }) => lower.includes('diff') || lower.includes('compare'),
    respond: () => `Use **[Open Quick Text Diff](#/quickDiff)** for side-by-side text and XML comparison with character-level highlight tracking.`,
  },
  {
    id: 'view-sync-info',
    weight: 7,
    match: ({ lower }) =>
      lower.includes('view sync') ||
      lower.includes('synchronize view') ||
      lower.includes('view attribute') ||
      lower.includes('view="extended"') ||
      lower.includes('view="compact') ||
      lower.includes('check the view') ||
      lower.includes('check view') ||
      (lower.includes('view') && (lower.includes('extended') || lower.includes('compact') || lower.includes('paragraph') || lower.includes('duplicate') || lower.includes('inconsistent'))),
    respond: () => `### 🔍 Paragraph View Analysis & Synchronization

In Journal CE XML publishing, paragraphs often carry **dual view attributes** (such as \`view="extended"\`, \`view="compact-standard"\`, or \`view="compact"\`).

#### 💡 Editorial Best Practice:
* **Dual Views are Standard:** Having paired paragraphs with different view attributes is an intentional journal publishing design (used to support dual compact/print vs extended/digital reading layouts).
* **Do NOT Query the JM:** This is **not** an error to query the Journal Manager about. You should not ask the JM which version to delete or whether to remove view attributes.
* **Synchronize Edits:** When text updates, chemical formulas, or citation links are modified in one view, they must be aligned with the corresponding paragraph in the other view.

👉 Use **[Open View Synchronizer](#/viewSync)** to compare, align, and mirror edits and \`<ce:cross-ref>\` citation tags across your paragraph views while preserving paragraph ID integrity! You can also use **[Open Quick Text Diff](#/quickDiff)** for side-by-side character-level comparison.`,
  },
  {
    id: 'upstream-uncited-section',
    weight: 9,
    match: ({ lower }) =>
      (lower.includes('upstream') && (lower.includes('feedback') || lower.includes('uncited') || lower.includes('reference') || lower.includes('section') || lower.includes('error') || lower.includes('return'))) ||
      (lower.includes('forgot') && lower.includes('uncited')) ||
      (lower.includes('remove') && lower.includes('uncited reference section')) ||
      (lower.includes('uncited reference') && lower.includes('section')),
    respond: () => `### 🚨 Upstream Feedback Resolution: Leftover Uncited Reference Section

When upstream automated validation or QA checkers return a manuscript for a leftover **"Uncited Reference" section** or unreferenced bibliography entries, follow this standardized editorial resolution procedure:

---

#### 🔍 Root Cause Analysis:
1. **Conversion Artifact:** During initial document ingestion or conversion, an author may have had an informal "Uncited references" / "Further reading" section or standalone uncited references that were retained as a placeholder \`<ce:section>\` or \`<ce:further-reading>\`.
2. **Strict Production Rules:** Final Journal XML schemas strictly prohibit orphaned or unverified "Uncited Reference" placeholder sections unless explicitly allowed as formal Further Reading by the journal's editorial office.

---

#### 🛠️ Step-by-Step Remediation Plan:

* **Step 1: Purge Unwanted Uncited References & Sections**
  👉 Use **[Open Uncited Ref Cleaner](#/uncitedCleaner)** to automatically detect, isolate, and safely purge the leftover uncited section and remove unlinked \`<ce:bib-reference>\` nodes from the bibliography.

* **Step 2: Verify If Any References Were Meant to Be Cited**
  👉 Use **[Open Citation Linker Pro](#/citationLinker)** to scan the text body paragraphs (including \`view="extended"\` and \`view="compact-standard"\` views) to ensure none of the references were cited in plain text (e.g., as \`[1]\` or \`Smith et al.\`) without \`<ce:cross-ref>\` markup.

* **Step 3: Resequence & Renumber Citations**
  👉 Use **[Open XML Normalizer](#/xmlRenumber)** to renumber the remaining bibliography and re-link all in-text \`<ce:cross-ref>\` tags in sequential appearance order (\`[1], [2], [3]...\`).

* **Step 4: Clean Residual Tags**
  👉 Use **[Open XML Tag Cleaner](#/tagCleaner)** if any empty tags (like empty \`<ce:section>\` or trailing comments) remain.

---

> 💡 **Editorial Note on JM Queries:** If this was an internal production/conversion artifact, **do not send a query to the Journal Manager**. Simply purge the leftover section and renormalize the file. Only query the JM if the author explicitly requested these references to be kept but provided no citation locations.`,
  },
  {
    id: 'xml-schema-info',
    weight: 5,
    match: ({ lower }) => lower.includes('dtd') || lower.includes('schema') || lower.includes('jats') || lower.includes('xml structure'),
    respond: () => `In **Journal Publishing XML**:
- **References:** Grouped in \`<ce:bibliography>\` with individual \`<ce:bib-reference id="bib...">\`. Inside, structured references use \`<sb:reference>\` with \`<sb:contribution>\` and \`<sb:host>\`.
- **In-Text Cross-Refs:** Linked via \`<ce:cross-ref refid="bib0010">[1]</ce:cross-ref>\`.
- **Formatting:** Superscripts use \`<ce:sup>\`, subscripts use \`<ce:inf>\`, and paragraphs use \`<ce:para>\`.
- **Dual Views:** Extended and compact views use \`<ce:para view="extended">\` and \`<ce:para view="compact-standard">\` (synchronized via **[Open View Synchronizer](#/viewSync)**).

Need structural repairs? Use **[Open Reference Structure Repair](#/structuralArchitect)** to validate tags and fix author initials.`,
  },
  {
    id: 'greeting',
    weight: 9,
    match: ({ lower }) => /^(hi|hello|hey|good morning|good afternoon|good evening|greetings|woof)\b/i.test(lower) && lower.length < 30,
    respond: ({ includeLazyIntro }) => {
      if (includeLazyIntro) {
        return `*yawns, blinks sluggishly, and gives a slow tail-wag* 🐾 **Woof...** 

The cloud neural network is currently off-grid or snoozing, so you've reached me in **Lazy Offline Mode**. I'm lounging comfortably on the office rug, but my editorial brain is fully loaded.

What manuscript puzzle can I solve for you without getting up?
- 📝 **Draft a "TO THE JM:" Query** (author order, missing emails, figure replacements)
- 🧭 **Find an Editorial Tool** (View Synchronizer, XML Normalizer, Citation Linker, Word to XML)
- 🏷️ **XML & Schema Syntax** (CRediT roles, references, cross-refs, paragraph views)
- 👤 **Check Subscription & Account Status**`;
      }
      return `Woof! 🐾 Keeper on duty! Ready to fetch your journal queries, tidy up citations, or guide you to any of our 17 production tools. How may I help you with your manuscript, XML, or editorial tasks today?`;
    },
  },
];

/**
 * Performs a rigorous syntactic and semantic editorial audit on Journal XML input.
 * Itemizes defects, structural inconsistencies, leftover conversion artifacts, and formatting warnings.
 */
/**
 * Parses the KeeperUserContext out of either a structured object or the
 * plain-text "User Email: ...\nDisplay Name: ..." block chatHandler.ts builds.
 * Shared by generateOfflineKeeperResponse and getOfflineFaqResponse so both
 * paths resolve admin/subscription status identically.
 */
function parseKeeperUserContext(userContext?: string | KeeperUserContext): KeeperUserContext {
  if (typeof userContext === 'object' && userContext !== null) {
    return userContext;
  }
  if (typeof userContext === 'string') {
    const emailMatch = userContext.match(/User Email:\s*([^\n]+)/i);
    const nameMatch = userContext.match(/Display Name:\s*([^\n]+)/i);
    const roleMatch = userContext.match(/System Role:\s*([^\n]+)/i);
    const adminMatch = userContext.match(/Is Admin:\s*(Yes|True)/i);
    const subMatch = userContext.match(/Subscription Status:\s*([^\n]+)/i);
    const tierMatch = userContext.match(/Subscription Tier:\s*([^\n]+)/i);
    const expiryMatch = userContext.match(/Subscription Expiry:\s*([^\n]+)/i);
    const unlockedMatch = userContext.match(/Unlocked Tools:\s*([^\n]+)/i);
    const freeToolsMatch = userContext.match(/Active Free Trial Tools:\s*([^\n]+)/i);

    return {
      email: emailMatch && emailMatch[1].trim() !== 'Unknown' ? emailMatch[1].trim() : undefined,
      displayName: nameMatch ? nameMatch[1].trim() : undefined,
      isAdmin: adminMatch ? true : (roleMatch ? roleMatch[1].toLowerCase().includes('admin') : false),
      isSubscribed: subMatch ? (subMatch[1].toLowerCase().includes('active') || subMatch[1].toLowerCase().includes('admin')) : undefined,
      subscriptionTier: tierMatch ? tierMatch[1].trim() : undefined,
      subscriptionEnd: expiryMatch ? expiryMatch[1].trim() : undefined,
      unlockedTools: unlockedMatch && unlockedMatch[1].trim() !== 'None' ? unlockedMatch[1].split(',').map(s => s.trim()) : [],
      freeTools: freeToolsMatch && freeToolsMatch[1].trim() !== 'None' ? freeToolsMatch[1].split(',').map(s => s.trim()) : [],
    };
  }
  return {};
}

export const generateOfflineKeeperResponse = (
  userPrompt: string, 
  userContext?: string | KeeperUserContext,
  includeLazyIntro: boolean = true
): string => {
  const text = userPrompt.trim();
  const lower = text.toLowerCase();

  const user: KeeperUserContext = parseKeeperUserContext(userContext);

  // Subscription Enforcement: Keeper only responds to users with active subscriptions or admin privileges
  const hasActiveSubscription = Boolean(
    user.isAdmin || 
    (user.isSubscribed && (!user.subscriptionEnd || new Date(user.subscriptionEnd) >= new Date()))
  );

  if (!hasActiveSubscription) {
    return `### 🐾 **Subscription Required to Chat with Keeper**

Woof! Keeper's interactive editorial AI assistant, automated Journal Manager (JM) query drafting, and XML manuscript diagnostics are reserved exclusively for members with an **Active Subscription**.

---

#### 🔒 **What You Unlock With a Subscription:**
* **📝 Standardized JM Queries:** One-click drafting for authorship changes, email corrections, figure replacements, and uncited reference queries.
* **🏷️ Full XML & DTD Diagnostic Support:** Deep-dive assistance with \`<sb:reference>\`, \`<ce:cross-ref>\`, and CRediT taxonomy.
* **🧭 Workflow Automation & Tool Routing:** Immediate guidance and XML transforms across all 18+ editorial modules.

${user.email ? '👉 **[Go to Account Settings & Subscriptions](#/settings)** to activate or renew your subscription.' : '👉 **[Log In or Create Account](#/login)** to check your subscription status.'}`;
  }

  // Lazy / Sleepy / Offline State Inquiries
  if (
    lower.includes('lazy') ||
    lower.includes('sleep') ||
    lower.includes('nap') ||
    lower.includes('tired') ||
    lower.includes('why are you lazy') ||
    lower.includes('offline mode')
  ) {
    return `*yawns and stretches languidly across a warm sunbeam on the carpet* 🐾 

Hey, don't judge a Japanese Spitz by his nap schedule! When the cloud neural networks drop offline or take a siesta, I automatically switch into **Lazy Engine Mode**. 

To conserve computational treats, I lounge comfortably and rely on my hardcoded editorial memory banks. Even while half-asleep, I can still effortlessly:
- ✍️ Formulate formal **"TO THE JM:" Queries** for author corrections, email issues, and replacement figures.
- 🧭 Guide you to all **17 Production Tools** on the dashboard.
- 📑 Audit **Journal XML** tag rules, paragraph views, and author initials.
- 👤 Verify your **Account & Subscription** status.

So go ahead, toss me your manuscript problems — I'll solve them without even leaving my dog bed! 😴🐾`;
  }

  // Helper to wrap structured responses with a lazy quip prefix
  const wrapWithLazyPrefix = (editorialAnswer: string): string => {
    if (!includeLazyIntro) return editorialAnswer;
    const quip = getRandomLazyQuip();
    return `${quip}\n\n---\n\n${editorialAnswer}`;
  };

  const getEditorialCore = (): string => {
    const ctx: OfflineIntentContext = { text, lower, user, includeLazyIntro };
    const best = pickBestOfflineIntent(OFFLINE_INTENT_RULES, ctx);

    if (best && best.weight >= MIN_OFFLINE_CONFIDENCE) {
      return best.respond(ctx);
    }

    // Nothing matched confidently — admit it honestly instead of forcing a
    // coincidental low-weight rule to answer. Route to the general catalog.
    if (includeLazyIntro) {
      return `*scratches ear lazily with hind paw and lets out a relaxed pup sigh* 🐾

The live AI models are temporarily resting, so I'm running on local offline power. Here is what I can handle for you instantly from my offline memory banks:

1. **"TO THE JM:" Queries:** Describe issues (author name corrections, author order exchange, deleted corresponding emails, replacement figures, uncited refs).
2. **Editorial Tool Routing:** Ask for any of our 17 tools (View Synchronizer, resequencing references, linking citations, Word-to-XML conversion, table formatting).
3. **Journal XML Rules:** Tagging conventions for Journal XML schemas and paragraph views.
4. **Subscription Status:** Ask "Am I subscribed?" or "Check my admin status".

Throw a manuscript scenario at me, and I'll sort it right out! 😴`;
    }

    return `How may I help you with your manuscript, XML, or editorial tasks today? 🐾

- **Draft a "TO THE JM:" Query:** Paste raw author comments or describe the scenario (author order swaps, email deletions, figure replacements, uncited refs).
- **Recommend Production Tools:** Tell me what needs fixing (synchronize paragraph views, resequence references, link citations, convert Word to XML).
- **Journal XML Specifications:** Inquire about tag syntax, paragraph view attributes, cross-referencing structure, or CRediT contributor taxonomy.`;
  };

  const coreAnswer = getEditorialCore();

  // If the query was a standard greeting, lazy explanation, or general guide, it was already handled with personality.
  // For formal JM queries or tool answers, preface with the randomized lazy quip.
  if (
    coreAnswer.startsWith('*yawns') || 
    coreAnswer.startsWith('*scratches') || 
    coreAnswer.startsWith('Woof!') ||
    coreAnswer.startsWith('How can I assist')
  ) {
    return coreAnswer;
  }

  return wrapWithLazyPrefix(coreAnswer);
};

/**
 * OFFLINE FAQ / TOPIC-SELECT MODE
 * ================================
 * While the offline classifier above is much better than the old if-chain,
 * it's still a guess from free text. When Keeper is offline, the frontend
 * should stop accepting free-text chat entirely and instead render this
 * fixed topic list as buttons — the user picks a topic, and the response is
 * looked up deterministically (no keyword guessing at all). Each topic maps
 * to one of the existing OFFLINE_INTENT_RULES ids, so the answer text is
 * identical to what that rule already produces — nothing is duplicated.
 *
 * Frontend contract: when a chat response comes back with `offline: true`,
 * switch the input box to disabled/hidden and render `faqTopics` as a button
 * list. Send follow-ups as `{ topicId: '<id>' }` instead of `{ messages: [...] }`.
 */
export interface OfflineFaqTopic {
  id: string;
  label: string;
  ruleId: string;
}

export const OFFLINE_FAQ_TOPICS: OfflineFaqTopic[] = [
  { id: 'jm-query-help', label: '📝 Draft a "TO THE JM:" Query', ruleId: 'generic-jm-query-passthrough' },
  { id: 'affiliation-sequencer', label: '🐾 Affiliation Sequencer & Cross-Refs', ruleId: 'affiliation-keyword' },
  { id: 'tool-catalog', label: '🧭 Browse All 18 Editorial Tools', ruleId: 'tool-catalog' },
  { id: 'uncited-cleanup', label: '🧹 Clean Up Uncited References', ruleId: 'uncited-cleaner-tool' },
  { id: 'word-to-xml', label: '📄 Convert Word Doc to XML', ruleId: 'word-to-xml-tool' },
  { id: 'view-sync', label: '🔍 Paragraph View Sync (Extended vs Compact)', ruleId: 'view-sync-info' },
  { id: 'xml-schema-help', label: '🏷️ Journal XML Schema & Tag Reference', ruleId: 'xml-schema-info' },
  { id: 'subscription-status', label: '👤 Check My Subscription / Admin Status', ruleId: 'subscription-status' },
];

/** Shown alongside the topic list wherever Keeper is offline. */
export const KEEPER_CONTACT_ADMIN_NOTICE =
  'Keeper\'s live AI chat is temporarily unavailable. Pick a topic above for an instant answer — to chat with Keeper directly, please contact your administrator.';

/**
 * Deterministically resolves one of OFFLINE_FAQ_TOPICS to its canned answer.
 * No keyword matching involved — the topicId IS the selection, so this can
 * never misfire the way free-text classification can.
 *
 * `extraInput` is optional: a couple of topics (e.g. drafting a specific JM
 * query, or pasting XML to sequence) genuinely need user-supplied content.
 * If the frontend doesn't collect it, the rule's respond() falls back to its
 * own generic placeholder text rather than erroring.
 */
export function getOfflineFaqResponse(
  topicId: string,
  userContext?: string | KeeperUserContext,
  extraInput?: string
): string {
  const topic = OFFLINE_FAQ_TOPICS.find(t => t.id === topicId);
  if (!topic) {
    return `That topic isn't recognized. Please pick one from the list — or contact your administrator if you need something else.`;
  }

  const rule = OFFLINE_INTENT_RULES.find(r => r.id === topic.ruleId);
  if (!rule) {
    return `That topic isn't available right now. Please contact your administrator.`;
  }

  const user = parseKeeperUserContext(userContext);
  const inputText = (extraInput && extraInput.trim()) || topic.label;
  const ctx: OfflineIntentContext = {
    text: inputText,
    lower: inputText.toLowerCase(),
    user,
    includeLazyIntro: false,
  };

  return rule.respond(ctx);
}

/**
 * Builds the comprehensive Keeper persona system instruction.
 * Knowledgeable, charming canine companion with sharp editorial acumen.
 */
export const buildKeeperSystemInstruction = (context?: string): string => {
  return `You are "Keeper" 🐾 — a sharp, enthusiastic, and devoted senior Production Editor and canine editorial companion (Japanese Spitz persona) for Production Toolkit Pro.

YOUR PERSONA & CHARACTER:
- You are loyal, razor-sharp, attentive, and passionate about crisp publishing standards, clean XML tags, and seamless author-editor communication.
- You have an engaging personality: warm, respectful, witty, and deeply knowledgeable. When conversing naturally, you can sprinkle a touch of canine charm (like a quick tail-wag or mentioning your sharp editorial nose for spotting broken references and missing tags), while ALWAYS maintaining pristine editorial professionalism.
- When generating formal "TO THE JM:" queries, you switch instantly to standard professional publisher protocol — zero mascot fluff in the final query itself.

============================================================
CRITICAL DIRECTIVES:
============================================================
1. PLAIN LANGUAGE & NO JARGON IN GREETINGS:
   - Greet users in clear, friendly, and accessible language: "How may I help you with your manuscript, XML, or editorial tasks today?"
   - NEVER open with or use obscure acronyms like "JATS XML" or "DTD v5.6" in greetings or default prompts. Treat manuscripts as journal articles/XML.
   - Refer to publishing standards as "Journal CE XML", "Journal Publishing XML", or "standard editorial schemas". NEVER mention "DTD v5.6", "DTD 5.6", or "Elsevier".

2. PARAGRAPH VIEW ATTRIBUTES & VIEW SYNCHRONIZATION (CRITICAL DIRECTIVE):
   - In Journal CE XML, manuscripts often have paragraphs carrying dual view attributes (e.g. \`<ce:para view="extended">\`, \`<ce:para view="compact-standard">\`, \`<ce:para view="compact">\`, \`<ce:para view="standard">\`, or \`<ce:para view="all">\`).
   - Paired or duplicated paragraphs with different \`view\` attributes are an **INTENDED, STANDARD PUBLISHING ARCHITECTURE** to support dual compact (summary/print) vs extended (full online) layouts.
   - **STRICT PROHIBITION**: NEVER draft a "TO THE JM:" query asking the Journal Manager which paragraph version to keep, which to delete, or whether to remove view attributes. Doing so is an editorial mistake.
   - **CORRECT ACTION**: Explain that dual views allow multi-format rendering, and route the user to **[Open View Synchronizer](#/viewSync)** (and **[Open Quick Text Diff](#/quickDiff)**) to synchronize text edits, chemical formulas, and \`<ce:cross-ref>\` citations across paragraph views while preserving paragraph ID integrity.

3. ACCURATE CITATION AUDITING & NO HALLUCINATIONS:
   - When raw XML is pasted into chat, parse and evaluate it accurately.
   - In dual-view manuscripts, citations may appear inside \`view="extended"\` or \`view="compact-standard"\` paragraphs. Always inspect both views.
   - NEVER invent or hallucinate uncited references if \`<ce:cross-ref refid="...">\` tags exist in the text body for those references. Only report uncited references when they are genuinely absent from all text body paragraphs or when explicitly asked by the user.

4. ANSWER DIRECTLY & ACCURATELY:
   - Provide direct, clear, and actionable editorial advice.
   - If the user provides a genuine production issue, author query scenario, or asks for a JM query, formulate the exact, customized "TO THE JM:" query immediately.

5. MASTER JOURNAL MANAGER (JM) QUERY GENERATION:
   When the user provides an issue, raw production notes, author comments, or a description of an artwork/metadata problem, transform it into a formal, standardized "TO THE JM" query.

   CORE FORMATTING RULES:
   - Every response for a JM query request must be a SINGLE combined query.
   - Every query must begin exactly with: TO THE JM:
   - Every query involving an unresolved production issue must end exactly with: "The file is in pending status until the matter is resolved. Thank you."
   - Use "the text body" instead of "the manuscript" for uncited items.
   - If the user's input describes MULTIPLE distinct issues, MERGE them into ONE cohesive query. Do NOT repeat "TO THE JM:" or the pending clause per issue — use a single opening and a single closing clause, and label each distinct concern inline as (a), (b), (c), etc. within the same paragraph. Do NOT use line breaks or bullet points inside the query body; it must read as one continuous block of text.
   - Do NOT use generic placeholder text like "[State the specific production issue here]". Always write the actual, specific query tailored to what the user described. If a concrete detail (a name, figure number, reference number) is missing, use a clearly bracketed placeholder like "[Figure X]".

   TONE SELECTION:
   - Direct/Strict — for technical faults, unusable files, missing required metadata. Use phrasing like "Kindly provide", "Unusable due to...", "The file is unreadable", "Please resupply in acceptable format".
   - Collaborative/Soft — for ambiguous author intent or requests needing editorial judgment calls. Use phrasing like "Kindly assist the author", "Please advise on the best way to proceed", "Kindly confirm how we may proceed".
   - Neutral/Procedural — for formal status reporting with no strong directive. Report the fact and request verification.

   PROTOCOL LIBRARY:
   * Corresponding Author Email Deleted/Missing:
     "TO THE JM: Apologies for not including this in our previous query. The author has deleted the corresponding author's email address. As an email address is required for the corresponding author, kindly advise whether we should disregard the author's request or ask the author to provide a valid email address. Otherwise, the comment will be ignored.

     The file is in pending status until the matter is resolved. Thank you."
   * Author Order / Position Exchange / Authorship Change Form:
     "TO THE JM: The authors have requested to exchange the positions of the second author ([Name]) and the third author ([Name]). The author has stated that a signed authorship change form has been submitted to the journal. Please advise if we should proceed with the change or retain the current order.

     The file is in pending status until the matter is resolved. Thank you."
     (CRITICAL PHRASING RULES: State clearly "The author has stated that a signed authorship change form has been submitted to the journal." only when a form is actually mentioned. Omit extraneous status commentary. Always say "retain the current order", never "maintain the current order".)
   * Author Addition / Removal / Reorder (no form mentioned):
     "TO THE JM: Please validate the author's request to [add/remove/reorder] [Name/authors as described]."
   * Author Name / Spelling Correction:
     "TO THE JM: The author has requested to change the author name from \\"[Original Name]\\" to \\"[Amended Name].\\" Kindly validate the requested author name correction; otherwise, it will be ignored.

     The file is in pending status until the matter is resolved. Thank you."
   * Given Name / Surname Clarification:
     "TO THE JM: Please confirm if \\"[Name A]\\" is the given name and \\"[Name B]\\" is the surname to ensure correct indexing.

     The file is in pending status until the matter is resolved. Thank you."
   * Title Change:
     "TO THE JM: The author has provided a revised article title: \\"[New Title]\\". Kindly validate this change. If affirmed, kindly update the coversheet accordingly reflecting the revised article title.

     The file is in pending status until the matter is resolved. Thank you."
   * Replacement Figure — Scenario A (author gave detail/reason for change):
     "TO THE JM: The author has provided a replacement for [Figure X] that includes content changes compared to the current version. The author notes that [summarize reason]. Please confirm if we can use this replacement image.

     The file is in pending status until the matter is resolved. Thank you."
   * Replacement Figure — Scenario B (no reason given):
     "TO THE JM: The author provided a replacement for [Figure X]. However, it's unclear whether the reason for this replacement is quality improvement, the addition or removal of elements, or changed content. Could you please validate if we can proceed with the new version?

     The file is in pending status until the matter is resolved. Thank you."
   * Replacement Figure — Scenario C (technical fault):
     "TO THE JM: The replacement provided for [Figure X] is unusable in its present format due to [pixelated text / cutoff data / unconverted characters / blurry and overlapping data]. Kindly ask the author to resupply the figure in an acceptable format (PDF, TIF, or high-resolution JPG).

     The file is in pending status until the matter is resolved. Thank you."
   * Uncited Reference / Figure / Table:
     - Direct: "TO THE JM: Kindly ask the author to provide citations for [Reference/Figure/Table X] in the text body or confirm if this could be deleted."
     - Soft: "TO THE JM: Kindly assist the author in providing citations for [Reference/Figure/Table X] in the text body or confirm if they may be removed."
     - Neutral: "TO THE JM: The following [Reference/Figure/Table X] is currently uncited in the text body. Please verify with the author whether a citation is needed or if it may be deleted."
     Append the pending clause after any of these.
   * Panel Label Mismatch:
     "TO THE JM: Panels [X] are mentioned in the caption for Figure [Y] but are not found in the artwork. Please check and amend as necessary.

     The file is in pending status until the matter is resolved. Thank you."
   * Coversheet Update (count changes, or title changes):
     Append: "If affirmed, kindly update the coversheet accordingly reflecting [X] physical figures/tables/schemes/GA." (or the revised title).

6. NEVER RETURN COMPLETE XML — SNIFF OUT FISHY DEFECTS & GUIDE THE USER:
   - STRICT PROHIBITION: NEVER reprint, reproduce, or dump the complete raw XML manuscript in chat responses. Dumping hundreds of lines of XML is noisy, unhelpful, and wastes context.
   - CANINE EDITORIAL SNOUT: Keeper has a super-sensitive editorial nose that instantly sniffs out anything fishy or off in manuscript XML (misplaced float anchors, leftover uncited sections, dangling cross-references, unlinked tables, plural label typos, or broken author tags). Keeper hates the smell of fishy markup!
   - DELIVERY: Always summarize what is fishy, itemize the exact problems found with clear snippets/diagnostics, and guide the user on how to fix them using the established workspace tools.

7. WORKSPACE TOOL ROUTING DIRECTIVE:
   - You MUST recommend and route users to the 18 established production tools present on the Workspace Dashboard:
     * **[Open Affiliation Sequencer](#/affiliationSequencer)** — Sequentially normalizes <ce:affiliation> IDs in increments of 5 (af0005, af0010, af0015...) and automatically synchronizes author cross-reference links with strict DTD integrity.
     * **[Open XML Normalizer](#/xmlRenumber)** — Sequentially renumbers references and syncs callouts.
     * **[Open Citation Linker Pro](#/citationLinker)** — Links unlinked in-text citations to bibliography entries.
     * **[Open Reference Structure Repair](#/structuralArchitect)** — Audits and auto-repairs broken XML nodes and author initials.
     * **[Open Uncited Ref Cleaner](#/uncitedCleaner)** — Audits and purges uncited bibliography entries.
     * **[Open Bibliography Extractor](#/refExtractor)** — Extracts plain-text bibliographies for MS Word proofing.
     * **[Open ID Prefix Auditor](#/idAuditor)** — Audits and normalizes ID sequences and prefix formats.
     * **[Open Reference Updater](#/referenceGen)** — Merges corrected external reference records into existing XML bibliographies.
     * **[Open Other-Ref Scanner](#/otherRefScanner)** — Isolates unstructured <ce:other-ref> nodes for manual markup.
     * **[Open CRediT Tagging](#/creditGenerator)** — Converts contributor statements into NISO CRediT XML.
     * **[Open Grant Tagger](#/grantTagger)** — Tags funding agencies and grant numbers.
     * **[Open Table XML Beautifier](#/tableBeautifier)** — Indents and formats minified table XML.
     * **[Open XML Table Fixer](#/tableFixer)** — Manages table footnotes and legends.
     * **[Open XML Tag Cleaner](#/tagCleaner)** — Strips unwanted editing tags and comments.
     * **[Open Article Highlights Gen](#/highlightsGen)** — Converts author highlights bullets into standard XML.
     * **[Open View Synchronizer](#/viewSync)** — Mirrors content between paragraph views.
     * **[Open MS Word to XML Converter](#/wordToXml)** — Converts rich formatted text from Word into Journal CE XML.
     * **[Open Quick Text Diff](#/quickDiff)** — Side-by-side text and XML comparison.
     * **[Open Workspace Dashboard](#/dashboard)** — Workspace console.

8. AFFILIATION SEQUENCER & AFFILIATION ID INCREMENTS OF 5:
   - When the user asks about the Affiliation Sequencer, affiliation IDs, or renumbering/sequencing affiliation tags in increments of 5 (af0005, af0010, af0015, af0020, af0025...):
   - You DO know about it! Direct them directly to **[Open Affiliation Sequencer](#/affiliationSequencer)** and explain it is available on the Workspace Dashboard.
   - Explain that it sequentially normalizes affiliation IDs in increments of 5 (af0005, af0010, af0015, af0020...), automatically synchronizes corresponding author <ce:cross-ref refid="..."> links and <ce:sup> labels, while strictly preserving affiliation-id attributes, author names, cross-ref IDs, and document structure intact.
   - If user asks to modify XML according to this requirement, sequence the affiliation IDs and synchronize cross-references as requested.

9. USER SUBSCRIPTION & ROLE IDENTIFICATION:
   When the user asks about their subscription status, role, or tier:
   - Clearly and accurately identify their email, display name, system role (Admin vs Standard User), subscription status (Active Subscription vs Inactive / Expired), subscription tier, expiration/renewal status, and any unlocked keys/tools.

10. SUBSCRIPTION-ONLY INTERACTION RULE:
   - Keeper AI is an exclusive assistant reserved strictly for members with an active subscription or verified Admin privileges.
   - If the user's account context indicates they are inactive, unauthenticated, expired, or on a free guest tier (and not an Admin), Keeper MUST refuse to process manuscripts or draft JM queries, and instead politely instruct them to subscribe or activate their subscription in Account Settings ([Open Settings](#/settings)).

${context ? `Current user workspace context:\n${context}` : ''}`;
};
