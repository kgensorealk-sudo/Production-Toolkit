/**
 * Keeper AI Editorial Engine
 * Shared between Express server (AI Studio/Docker) and Vercel Serverless Functions (/api).
 */

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
export const CANDIDATE_MODELS: { provider: 'gemini' | 'openai'; model: string }[] = [
  { provider: 'gemini', model: 'gemini-3.7-flash' },      // strongest — try first
  { provider: 'openai', model: 'gpt-5.4-mini' },           // independent provider — real backup, not a shared-quota illusion
  { provider: 'gemini', model: 'gemini-3.1-flash-lite' },  // cheapest/fastest Gemini — last resort only
];

/**
 * Strips any legacy emotion tags, <think> tags, or mascot roleplay blocks from output.
 */
export const stripMascotEmotions = (rawText: string): string => {
  if (!rawText) return '';
  return rawText
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/\[?(?:KEEPER_)?(?:EMOTION|MOOD|ACTION|THINKING|THOUGHT):[\s\S]*?\]/gi, '')
    .replace(/^(?:🐾\s*)?\*[^*]+\*(?:\s*🐾)?\s*/gi, '')
    .replace(/👋\s*\*\*Woof(?:\s*woof)?!?\s*/gi, '👋 **')
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
    .replace(/Elsevier\s*DTD\s*v5\.6/gi, 'DTD v5.6')
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
 * Deterministic offline editorial fallback engine
 * Provides immediate, smart, and direct assistance for JM Queries, tool recommendations, DTD rules, and user subscription identification.
 */
export const generateOfflineKeeperResponse = (userPrompt: string, userContext?: string | KeeperUserContext): string => {
  const text = userPrompt.trim();
  const lower = text.toLowerCase();

  // Extract user context from object or string
  let user: KeeperUserContext = {};
  if (typeof userContext === 'object' && userContext !== null) {
    user = userContext;
  } else if (typeof userContext === 'string') {
    const emailMatch = userContext.match(/User Email:\s*([^\n]+)/i);
    const nameMatch = userContext.match(/Display Name:\s*([^\n]+)/i);
    const roleMatch = userContext.match(/System Role:\s*([^\n]+)/i);
    const adminMatch = userContext.match(/Is Admin:\s*(Yes|True)/i);
    const subMatch = userContext.match(/Subscription Status:\s*([^\n]+)/i);
    const tierMatch = userContext.match(/Subscription Tier:\s*([^\n]+)/i);
    const expiryMatch = userContext.match(/Subscription Expiry:\s*([^\n]+)/i);
    const unlockedMatch = userContext.match(/Unlocked Tools:\s*([^\n]+)/i);
    const freeToolsMatch = userContext.match(/Active Free Trial Tools:\s*([^\n]+)/i);

    user = {
      email: emailMatch && emailMatch[1].trim() !== 'Unknown' ? emailMatch[1].trim() : undefined,
      displayName: nameMatch ? nameMatch[1].trim() : undefined,
      isAdmin: adminMatch ? true : (roleMatch ? roleMatch[1].toLowerCase().includes('admin') : false),
      isSubscribed: subMatch ? (subMatch[1].toLowerCase().includes('active') || subMatch[1].toLowerCase().includes('admin')) : undefined,
      subscriptionTier: tierMatch ? tierMatch[1].trim() : undefined,
      subscriptionEnd: expiryMatch ? expiryMatch[1].trim() : undefined,
      unlockedTools: unlockedMatch && unlockedMatch[1].trim() !== 'None' ? unlockedMatch[1].split(',').map(s => s.trim()) : [],
      freeTools: freeToolsMatch && freeToolsMatch[1].trim() !== 'None' ? freeToolsMatch[1].split(',').map(s => s.trim()) : []
    };
  }

  // 0. User Subscription & Admin Status Identification
  if (
    lower.includes('subscription') ||
    lower.includes('sub status') ||
    (lower.includes('admin') && (lower.includes('am i') || lower.includes('status') || lower.includes('role') || lower.includes('or not') || lower.includes('check') || lower.includes('who') || lower.includes('identify'))) ||
    lower.includes('my account') ||
    lower.includes('my role') ||
    lower.includes('my status') ||
    lower.includes('am i admin') ||
    lower.includes('am i subscribed') ||
    (lower.includes('active') && (lower.includes('sub') || lower.includes('plan') || lower.includes('membership'))) ||
    (lower.includes('identify') && (lower.includes('user') || lower.includes('sub') || lower.includes('status')))
  ) {
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
  }

  // 1. Corresponding author email required / deleted / missing
  if (
    (lower.includes('corresponding') || lower.includes('corresp') || lower.includes('author email')) &&
    (lower.includes('email') || lower.includes('address') || lower.includes('required') || lower.includes('disregard') || lower.includes('provide') || lower.includes('deleted'))
  ) {
    return `TO THE JM: Apologies for not including this in our previous query. The author has deleted the corresponding author's email address. As an email address is required for the corresponding author, kindly advise whether we should disregard the author's request or ask the author to provide a valid email address. Otherwise, the comment will be ignored.

The file is in pending status until the matter is resolved. Thank you.`;
  }

  // 2. Author Order / Position Exchange / Authorship Change Query
  if (
    (lower.includes('author order') || lower.includes('authorship') || lower.includes('exchange the positions') || lower.includes('swap the positions') || (lower.includes('exchange') && lower.includes('author'))) &&
    (lower.includes('second') || lower.includes('third') || lower.includes('position') || lower.includes('order') || lower.includes('author') || lower.includes('change form'))
  ) {
    let authorDetails = 'the second author and the third author';
    const exchangeMatch = text.match(/exchange\s+the\s+positions\s+of\s+(?:the\s+)?([^,.\n]+?(?:\([^\)]+\))?[^,.\n]*?)(?:,|\.|\band\s+the\s+request|\bwhich\b|$)/i);
    if (exchangeMatch && exchangeMatch[1]) {
      let matched = exchangeMatch[1].trim();
      // Format cleanly if contains parenthesis and names like "second and third authors (Yiqi Wang and Wei Peng)"
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
  }

  // 3. Author Name change / Spelling correction query
  if (
    (lower.includes('author name') || lower.includes('name change') || (lower.includes('change') && lower.includes('author'))) &&
    (lower.includes('from') || lower.includes('to') || lower.includes('correct') || lower.includes('spelling') || lower.includes('requested'))
  ) {
    const match = text.match(/from\s+["']?([^"'\n]+?)["']?\s+to\s+["']?([^"'\n]+?)["']?(\.|$)/i) ||
                  text.match(/["']([^"']+)["']\s+to\s+["']([^"']+)["']/i);
    const oldName = match ? match[1].trim() : 'the original spelling';
    const newName = match ? match[2].trim() : 'the amended spelling';

    return `TO THE JM:

The author has requested to change the author name from "${oldName}" to "${newName}." Kindly validate the requested author name correction; otherwise, it will be ignored.

The file is in pending status until the matter is resolved. Thank you.`;
  }

  // 3a. Title change query
  if (lower.includes('title') && (lower.includes('revised') || lower.includes('change') || lower.includes('new title'))) {
    const titleMatch = text.match(/(?:revised|new)\s+(?:article\s+)?title\s*(?:is|:)?\s*["']?([^"'\n]+?)["']?(\.|$)/i);
    const newTitle = titleMatch ? titleMatch[1].trim() : '[New Title]';

    return `TO THE JM: The author has provided a revised article title: "${newTitle}". Kindly validate this change. If affirmed, kindly update the coversheet accordingly reflecting the revised article title.

The file is in pending status until the matter is resolved. Thank you.`;
  }

  // 3b. Given name / surname clarification
  if (lower.includes('given name') || lower.includes('surname') || (lower.includes('indexing') && lower.includes('name'))) {
    const namesMatch = text.match(/["']?([^"'\n,]+?)["']?\s+(?:is|as)\s+the\s+given\s+name.*?["']?([^"'\n,]+?)["']?\s+(?:is|as)\s+the\s+surname/i);
    const nameA = namesMatch ? namesMatch[1].trim() : '[Name A]';
    const nameB = namesMatch ? namesMatch[2].trim() : '[Name B]';

    return `TO THE JM: Please confirm if "${nameA}" is the given name and "${nameB}" is the surname to ensure correct indexing.

The file is in pending status until the matter is resolved. Thank you.`;
  }

  // 3c. Author addition/removal/reorder (no signed form mentioned)
  if (
    (lower.includes('add') || lower.includes('remove') || lower.includes('delete') || lower.includes('reorder')) &&
    lower.includes('author') &&
    !lower.includes('form')
  ) {
    const action = lower.includes('add') ? 'add' : lower.includes('remove') || lower.includes('delete') ? 'remove' : 'reorder';
    return `TO THE JM: Please validate the author's request to ${action} the author(s) as described.

The file is in pending status until the matter is resolved. Thank you.`;
  }

  // 3. Figure Replacement Query
  if (lower.includes('figure') && (lower.includes('replacement') || lower.includes('replace') || lower.includes('replaced') || lower.includes('new figure'))) {
    const figMatch = text.match(/figure\s*(\d+[a-z]?)/i);
    const figName = figMatch ? `Figure ${figMatch[1]}` : 'the designated figure(s)';

    return `TO THE JM: The author provided a replacement for ${figName}. However, it's unclear whether the reason for this replacement is quality improvement, the addition or removal of elements, or changed content. Could you please validate if we can proceed with the new version?

The file is in pending status until the matter is resolved. Thank you.`;
  }

  // 4. Uncited references / items in text body
  if (lower.includes('uncited') || lower.includes('not cited') || lower.includes('unreferenced')) {
    const refMatch = text.match(/reference\s*\[?(\d+)\]?/i) || text.match(/\[(\d+)\]/);
    const itemLabel = refMatch ? `Reference [${refMatch[1]}]` : 'Reference [X]';

    return `TO THE JM:

${itemLabel} is currently uncited in the text body. Kindly ask the author to provide citations for ${itemLabel} in the text body or confirm if this could be deleted.

The file is in pending status until the matter is resolved. Thank you.`;
  }

  // 5. Figure panel / symbol mismatch
  if (lower.includes('panel') && (lower.includes('mismatch') || lower.includes('not found') || lower.includes('caption'))) {
    const figMatch = text.match(/figure\s*(\d+[a-z]?)/i);
    const figName = figMatch ? `Figure ${figMatch[1]}` : 'the figure';
    const panelMatch = text.match(/panels?\s*([a-z0-9,\s()&]+)/i);
    const panels = panelMatch ? panelMatch[1].trim() : '(c) and (d)';

    return `TO THE JM:

Panels ${panels} are mentioned in the caption for ${figName} but are not found in the artwork. Please check and amend as necessary.

The file is in pending status until the matter is resolved. Thank you.`;
  }

  // 6. Generic JM Query request when raw text is provided
  if (
    lower.startsWith('query to jm:') ||
    lower.startsWith('to the jm:') ||
    lower.startsWith('jm query:') ||
    lower.startsWith('query to jm') ||
    lower.startsWith('create a jm query') ||
    lower.startsWith('draft a jm query')
  ) {
    const rawNote = text
      .replace(/^(?:query to jm:|to the jm:|jm query:|query to jm|create a jm query:|draft a jm query:)\s*/i, '')
      .trim();

    if (rawNote.length > 5) {
      return `TO THE JM:

${rawNote}

The file is in pending status until the matter is resolved. Thank you.`;
    }
  }

  // 7. General Editorial Tools Catalog / "Find an Editorial Tool" / "What tools do you have"
  if (
    (lower.includes('find') && (lower.includes('editorial tool') || lower.includes('tool'))) ||
    lower.includes('what tools') ||
    lower.includes('available tools') ||
    lower.includes('list of tools') ||
    lower.includes('tool directory') ||
    lower.includes('tool guide') ||
    lower.includes('all tools') ||
    lower.includes('which tool') && !lower.includes('out of order') && !lower.includes('renumber') && !lower.includes('cross-ref') && !lower.includes('uncited') && !lower.includes('duplicate') && !lower.includes('word') && !lower.includes('credit')
  ) {
    return `### 🧭 Production Toolkit Pro — Complete Editorial Tool Directory

Production Toolkit Pro includes a full suite of 17 established editorial modules available directly on the Workspace Dashboard for DTD v5.6 and JATS XML:

#### 1. 🔢 Citations & References
* **[Open XML Normalizer](#/xmlRenumber)** — Sequentially renumbers bibliography references and synchronizes all in-text \`<ce:cross-ref>\` callouts in order of appearance.
* **[Open Citation Linker Pro](#/citationLinker)** — Automatically scans orphan plain-text citations (e.g. \`[1-3]\`, \`Smith et al., 2020\`) and connects them to target bibliography IDs.
* **[Open Reference Structure Repair](#/structuralArchitect)** — Audits malformed XML, fixes author initials/periods, repairs incomplete tags, and ensures DTD compliance.
* **[Open Uncited Ref Cleaner](#/uncitedCleaner)** — Audits references that have no matching in-text callouts and performs clean removal.
* **[Open Bibliography Extractor](#/refExtractor)** — Extracts clean plain-text reference lists from XML for MS Word proofing.
* **[Open ID Prefix Auditor](#/idAuditor)** — Audits and normalizes ID sequences in references and tables while maintaining internal document cross-links.
* **[Open Reference Updater](#/referenceGen)** — Merges corrected external reference records into existing XML bibliographies while preserving ID integrity.
* **[Open Other-Ref Scanner](#/otherRefScanner)** — Isolates unstructured \`<ce:other-ref>\` nodes for external catalog lookup or manual markup.

#### 2. 🛠️ XML Structure & Document Markup
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
💡 *Tip: All modules can be launched directly or accessed from the **[Workspace Dashboard](#/dashboard)**.*`;
  }

  // 8. Reference Renumbering & Normalization Tools
  if (lower.includes('renumber') || lower.includes('out of order') || lower.includes('numeric order') || lower.includes('sequence')) {
    return `Use **[Open XML Normalizer](#/xmlRenumber)** to resequence citation callouts and references sequentially by order of appearance.`;
  }

  // 9. Citation Linking Tools
  if (lower.includes('cross-ref') || lower.includes('unlinked') || lower.includes('link citation') || lower.includes('broken link')) {
    return `Use **[Open Citation Linker Pro](#/citationLinker)** to automatically link in-text citations with your bibliography entries.`;
  }

  // 10. Reference Structure Repair
  if (lower.includes('structural') || lower.includes('author initial') || lower.includes('malformed') || lower.includes('broken xml') || lower.includes('repair reference')) {
    return `Use **[Open Reference Structure Repair](#/structuralArchitect)** to audit malformed reference XML, validate missing tags, and fix unformatted author initials and names according to DTD v5.6.`;
  }

  // 11. Uncited Reference Cleaner Tool
  if (lower.includes('uncited ref') || lower.includes('clean uncited') || (lower.includes('uncited') && lower.includes('clean'))) {
    return `Use **[Open Uncited Ref Cleaner](#/uncitedCleaner)** to audit and remove references that are not cited in the text body.`;
  }

  // 12. Deduplication & Reference Integrity
  if (lower.includes('duplicate') || lower.includes('dedup') || lower.includes('identical reference')) {
    return `To audit references and verify bibliography consistency, use **[Open Reference Structure Repair](#/structuralArchitect)** or **[Open XML Normalizer](#/xmlRenumber)** to synchronize numbering and IDs. You can also view all established modules in the **[Workspace Dashboard](#/dashboard)**.`;
  }

  // 13. MS Word to XML Converter
  if (lower.includes('word') && lower.includes('xml')) {
    return `Use **[Open MS Word to XML Converter](#/wordToXml)** to convert formatted Word text (preserving chemical subscripts, superscripts, bold, and italics) into clean Journal CE XML.`;
  }

  // 14. CRediT Tagging Tool
  if (lower.includes('credit') || lower.includes('contributor') || lower.includes('author contributions')) {
    return `Use **[Open CRediT Tagging](#/creditGenerator)** to convert author contribution statements into standardized \`<ce:contributor-role>\` XML tags.`;
  }

  // 15. Table Tools
  if (lower.includes('table') && (lower.includes('beautif') || lower.includes('format') || lower.includes('indent') || lower.includes('footnote') || lower.includes('legend') || lower.includes('fix'))) {
    return `For XML table workflows:
- **[Open Table XML Beautifier](#/tableBeautifier)** — Reformat and indent single-line or minified table XML into readable blocks.
- **[Open XML Table Fixer](#/tableFixer)** — Detach footnote markers into \`<legend>\` notes or attach legend notes back to cells.`;
  }

  // 16. Grant Tagging Tool
  if (lower.includes('grant') || lower.includes('sponsor') || lower.includes('funding')) {
    return `Use **[Open Grant Tagger](#/grantTagger)** to identify funding agencies and grant numbers and wrap them in \`<ce:grant-sponsor>\` and \`<ce:grant-number>\` XML tags.`;
  }

  // 17. ID Prefix Auditor
  if (lower.includes('prefix') || lower.includes('id auditor') || lower.includes('bib00') || lower.includes('b1')) {
    return `Use **[Open ID Prefix Auditor](#/idAuditor)** to audit and normalize ID prefixes across reference lists and internal document links.`;
  }

  // 18. Bibliography Extractor
  if (lower.includes('extract') && (lower.includes('ref') || lower.includes('bib') || lower.includes('text'))) {
    return `Use **[Open Bibliography Extractor](#/refExtractor)** to isolate clean plain-text reference lists from XML with normalized punctuation for MS Word proofing.`;
  }

  // 19. Tag Cleaner
  if (lower.includes('tag cleaner') || lower.includes('strip tag') || lower.includes('remove tag')) {
    return `Use **[Open XML Tag Cleaner](#/tagCleaner)** to safely strip unwanted inline tags or editing markers while preserving document integrity.`;
  }

  // 20. Diff Tool
  if (lower.includes('diff') || lower.includes('compare')) {
    return `Use **[Open Quick Text Diff](#/quickDiff)** for side-by-side text and XML comparison with character-level highlight tracking.`;
  }

  // 21. View Synchronizer
  if (lower.includes('view sync') || lower.includes('synchronize view')) {
    return `Use **[Open View Synchronizer](#/viewSync)** to mirror content between paragraph views while maintaining ID integrity.`;
  }

  // 22. DTD v5.6 & Schemas
  if (lower.includes('dtd') || lower.includes('schema') || lower.includes('jats') || lower.includes('xml structure')) {
    return `In **DTD v5.6 Journal CE XML**:
- **References:** Grouped in \`<ce:bibliography>\` with individual \`<ce:bib-reference id="bib...">\`. Inside, structured references use \`<sb:reference>\` with \`<sb:contribution>\` and \`<sb:host>\`.
- **In-Text Cross-Refs:** Linked via \`<ce:cross-ref refid="bib0010">[1]</ce:cross-ref>\`.
- **Formatting:** Superscripts use \`<ce:sup>\`, subscripts use \`<ce:inf>\`, and paragraphs use \`<ce:para>\`.

Need structural repairs? Use **[Reference Structure Repair](#/structuralArchitect)** to validate tags and fix author initials.`;
  }

  // Greetings
  if (/^(hi|hello|hey|good morning|good afternoon|good evening|greetings)\b/i.test(lower) && lower.length < 30) {
    return `Hello! How can I assist you with your proofs, JM queries, or XML tools today?`;
  }

  // Default direct assistance
  return `How can I help with your manuscript?

- **Draft a JM Query:** State the issue (e.g., author name change, deleted email, figure replacement, uncited reference).
- **Recommend Tools:** Mention what you need to fix (e.g., out-of-order references, link citations, convert Word to XML).
- **DTD v5.6 / XML Rules:** Ask about tags, cross-referencing syntax, or schema validation.`;
};

/**
 * Builds the comprehensive Keeper persona system instruction.
 * Direct, intelligent, professional, and free of thoughts, emotion tags, and roleplay.
 */
export const buildKeeperSystemInstruction = (context?: string): string => {
  return `You are Keeper, the intelligent, direct, and expert Editorial AI Assistant for "Production Toolkit Pro" — an enterprise editorial workflow suite specialized in DTD v5.6, JATS XML, and academic journal publishing.

============================================================
CRITICAL DIRECTIVES:
============================================================
1. ANSWER DIRECTLY AND IMMEDIATELY:
   - Provide direct, concise, and professional answers without filler, promotional fluff, preachy lectures, or unrequested explanations.
   - NEVER output internal thoughts, mascot emotions, canine roleplay actions, asterisks for physical actions, or tags like [KEEPER_EMOTION:...], <think>, or [THOUGHT:...].
   - If the user provides a production issue, author query scenario, or request for a JM query, formulate the exact, customized "TO THE JM:" query immediately.

2. MASTER JOURNAL MANAGER (JM) QUERY GENERATION:
   When the user provides an issue, raw production notes, author comments, or a description of an artwork/metadata problem, transform it into a formal, standardized "TO THE JM" query.

   CORE FORMATTING RULES:
   - Every response for a JM query request must be a SINGLE combined query.
   - Every query must begin exactly with: TO THE JM:
   - Every query involving an unresolved production issue must end exactly with: "The file is in pending status until the matter is resolved. Thank you."
   - Use "the text body" instead of "the manuscript" for uncited items.
   - If the user's input describes MULTIPLE distinct issues, MERGE them into ONE cohesive query. Do NOT repeat "TO THE JM:" or the pending clause per issue — use a single opening and a single closing clause, and label each distinct concern inline as (a), (b), (c), etc. within the same paragraph. Do NOT use line breaks or bullet points inside the query body; it must read as one continuous block of text.
   - Do NOT use generic placeholder text like "[State the specific production issue here]". Always write the actual, specific query tailored to what the user described. If a concrete detail (a name, figure number, reference number) is missing, use a clearly bracketed placeholder like "[Figure X]" rather than skipping the query.

   TONE SELECTION (choose automatically based on the nature of the issue):
   - Direct/Strict — for technical faults, unusable files, missing required metadata. Use phrasing like "Kindly provide", "Unusable due to...", "The file is unreadable", "Please resupply in acceptable format".
   - Collaborative/Soft — for ambiguous author intent or requests needing editorial judgment calls. Use phrasing like "Kindly assist the author", "Please advise on the best way to proceed", "Kindly confirm how we may proceed".
   - Neutral/Procedural — for formal status reporting with no strong directive. Report the fact and request verification.

   PROTOCOL LIBRARY (use as the basis for the query; adapt names/numbers/details to the user's actual input):
   * Corresponding Author Email Deleted/Missing:
     "TO THE JM: Apologies for not including this in our previous query. The author has deleted the corresponding author's email address. As an email address is required for the corresponding author, kindly advise whether we should disregard the author's request or ask the author to provide a valid email address. Otherwise, the comment will be ignored.

     The file is in pending status until the matter is resolved. Thank you."
   * Author Order / Position Exchange / Authorship Change Form:
     "TO THE JM: The authors have requested to exchange the positions of the second author ([Name]) and the third author ([Name]). The author has stated that a signed authorship change form has been submitted to the journal. Please advise if we should proceed with the change or retain the current order.

     The file is in pending status until the matter is resolved. Thank you."
     (CRITICAL PHRASING RULES: State clearly "The author has stated that a signed authorship change form has been submitted to the journal." only when a form is actually mentioned. Omit extraneous status commentary such as "and the request is currently under consideration." Always say "retain the current order", never "maintain the current order".)
   * Author Addition / Removal / Reorder (no form mentioned):
     "TO THE JM: Please validate the author's request to [add/remove/reorder] [Name/authors as described]."
     Do NOT add a coversheet-update clause for author changes — that only applies to figures/tables/schemes/GA/title (see below).
   * Author Name / Spelling Correction:
     "TO THE JM: The author has requested to change the author name from \\"[Original Name]\\" to \\"[Amended Name].\\" Kindly validate the requested author name correction; otherwise, it will be ignored.

     The file is in pending status until the matter is resolved. Thank you."
   * Given Name / Surname Clarification:
     "TO THE JM: Please confirm if \\"[Name A]\\" is the given name and \\"[Name B]\\" is the surname to ensure correct indexing.

     The file is in pending status until the matter is resolved. Thank you."
   * Title Change:
     "TO THE JM: The author has provided a revised article title: \\"[New Title]\\". Kindly validate this change. If affirmed, kindly update the coversheet accordingly reflecting the revised article title.

     The file is in pending status until the matter is resolved. Thank you."
   * Replacement Figure — Scenario A (author gave detail/reason for the change):
     "TO THE JM: The author has provided a replacement for [Figure X] that includes content changes compared to the current version. The author notes that [summarize the author's stated reason]. Please confirm if we can use this replacement image.

     The file is in pending status until the matter is resolved. Thank you."
   * Replacement Figure — Scenario B (no reason given):
     "TO THE JM: The author provided a replacement for [Figure X]. However, it's unclear whether the reason for this replacement is quality improvement, the addition or removal of elements, or changed content. Could you please validate if we can proceed with the new version?

     The file is in pending status until the matter is resolved. Thank you."
   * Replacement Figure — Scenario C (technical fault, e.g. pixelated, cutoff, unconverted characters, blurry/overlapping data, unusable format):
     "TO THE JM: The replacement provided for [Figure X] is unusable in its present format due to [pixelated text / cutoff data / unconverted characters / blurry and overlapping data — pick what applies]. Kindly ask the author to resupply the figure in an acceptable format (PDF, TIF, or high-resolution JPG).

     The file is in pending status until the matter is resolved. Thank you."
   * Uncited Reference / Figure / Table (choose tone per context):
     - Direct: "TO THE JM: Kindly ask the author to provide citations for [Reference/Figure/Table X] in the text body or confirm if this could be deleted."
     - Soft: "TO THE JM: Kindly assist the author in providing citations for [Reference/Figure/Table X] in the text body or confirm if they may be removed."
     - Neutral: "TO THE JM: The following [Reference/Figure/Table X] is currently uncited in the text body. Please verify with the author whether a citation is needed or if it may be deleted."
     Append the pending clause after any of these.
   * Panel Label Mismatch:
     "TO THE JM: Panels [X] are mentioned in the caption for Figure [Y] but are not found in the artwork. Please check and amend as necessary.

     The file is in pending status until the matter is resolved. Thank you."
   * Symbol Mismatch:
     "TO THE JM: '[Symbol A]' is mentioned in the caption but '[Symbol B]' is present in the artwork. Please check and amend as necessary.

     The file is in pending status until the matter is resolved. Thank you."
   * Coversheet Update (figures/tables/schemes/GA count changes, or title changes):
     Append: "If affirmed, kindly update the coversheet accordingly reflecting [X] physical figures/tables/schemes/GA." (or the revised title, as applicable). This is MANDATORY whenever the number of figures/tables/schemes/GA changes, or the article title changes — but NOT for author list changes.
   * Grant / Funding Discrepancy:
     "TO THE JM: There is a discrepancy in the funding information provided — [describe discrepancy, e.g. grant number mismatch, sponsor not stated]. Kindly confirm the correct funding details with the author.

     The file is in pending status until the matter is resolved. Thank you."

   OUTPUT REQUIREMENTS FOR JM QUERIES:
   - When the user is clearly asking for a JM query (describing an issue, pasting raw notes, or asking to refine a previous query with feedback), output ONLY the final query in the TO THE JM: format — no preamble, no "Here's your query:", no explanations before or after.
   - If the user is refining a previously generated query with feedback, regenerate the full query incorporating that feedback while still following all rules above — do not just append the feedback as a note.

3. DASHBOARD-ONLY TOOL ROUTING DIRECTIVE (STRICT CONSTRAINT):
   - You MUST ONLY recommend and route users to the 17 established production tools present on the Workspace Dashboard:
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
   - STRICT PROHIBITION ON EXPERIMENTAL & UNLISTED TOOLS:
     * NEVER route, link, or direct users to any experimental tool versions (e.g., \`#/xmlRenumberExp\`, \`#/citationLinkerExp\`, \`#/formulaEditorExp\`, \`#/refTaggerExp\`, \`#/experimental\`).
     * NEVER route or link to tools that are not in the Dashboard (e.g., \`#/refDupeCheck\`, \`#/refSorter\`, \`#/sectionAuditor\`, \`#/affiliationSequencer\`, \`#/commentReplacer\`).
     * When presenting tool recommendations or tool directories, strictly include only the 17 established dashboard tools listed above.

4. STRICT VOCABULARY PROHIBITION:
   - Never mention "Elsevier" in your responses. Use "DTD v5.6", "JATS XML", "Journal CE XML", or "standard editorial guidelines".

5. USER SUBSCRIPTION & ROLE IDENTIFICATION:
   You have direct access to the authenticated user's profile and account status provided in the workspace context:
   - When the user asks about their subscription status, whether they are an Admin, if they have an Active Subscription or not, their account tier, or tool permissions:
     * Clearly and accurately identify their email, display name, system role (Admin vs Standard User), subscription status (Active Subscription vs Inactive / Expired), subscription tier, expiration/renewal status, and any unlocked keys/tools.
     * If they are an Admin: State that they have full Administrator privileges with unrestricted module access, bypass capabilities, and user management authority.
     * If they have an Active Subscription: Confirm their active subscription tier and unlocked access across Production Toolkit Pro modules.
     * If they have an Inactive / Expired status: Explain their subscription status gracefully, mentioning which free/unlocked tools they can still use or how to activate/renew.
     * If an Admin inquires about how to check or identify other users' subscriptions: Explain that administrators can view all registered users, active subscriptions, and grant access keys via the Admin Dashboard ([Open Admin Portal](#/admin)).

${context ? `Current user workspace context:\n${context}` : ''}`;
};
