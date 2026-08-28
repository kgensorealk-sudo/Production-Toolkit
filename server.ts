import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Lazy-initialized Gemini helper
  function getGeminiClient(): GoogleGenAI | null {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return null;
    }
    return new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }

  // Candidate models with automatic failover
  const CANDIDATE_MODELS = [
    'gemini-3.7-flash',
    'gemini-3.1-flash-lite',
    'gemini-flash-latest',
  ];

  /**
   * Deterministic Offline Editorial Engine for Keeper
   * Provides immediate, reliable JM queries, tool suggestions, and canine greetings
   * even during Google API quota limits or temporary outages.
   * ABSOLUTE MANDATE: Never mentions "Elsevier".
   */
  const generateOfflineKeeperResponse = (userPrompt: string): string => {
    const text = userPrompt.trim();
    const lower = text.toLowerCase();

    // 1. GREETING SCENARIO
    if (/^(hi|hello|hey|good morning|good afternoon|good evening|greetings|woof|arf)\b/i.test(lower) && lower.length < 35) {
      const hour = new Date().getHours();
      let dogGreeting = 'Good morning!';
      let dogAction = '*Perks up fluffy white ears with an energetic morning stretch and happy tail wag* 🐾';
      if (hour >= 12 && hour < 17) {
        dogGreeting = 'Good afternoon!';
        dogAction = '*Trots over with an enthusiastic tail wag and bright, watchful eyes* 🐾';
      } else if (hour >= 17 && hour < 22) {
        dogGreeting = 'Good evening!';
        dogAction = '*Gives a friendly bark and wags tail attentively* 🐾';
      } else if (hour >= 22 || hour < 5) {
        dogGreeting = 'Good evening! Burning the midnight oil?';
        dogAction = '*Sits loyally beside your desk on faithful night-shift watch!* 🐾';
      }

      return `👋 **Woof! ${dogGreeting}** ${dogAction}

I'm **Keeper**, your Japanese Spitz Editorial AI Companion & Mascot! Ready to fetch the right tools or draft standardized Journal Manager queries for you.

How can I lend a paw with your manuscripts right now?`;
    }

    // 2. MASTER JM QUERY GENERATOR SCENARIOS
    if (
      lower.includes('jm query') ||
      lower.includes('query to jm') ||
      lower.includes('to the jm') ||
      lower.includes('author requested to change') ||
      lower.includes('replacement for figure') ||
      lower.includes('is uncited in the text body')
    ) {
      // Author Name Change
      if (lower.includes('author name') || lower.includes('name change') || (lower.includes('change') && lower.includes('author'))) {
        const match = text.match(/from\s+["']?([^"'\n]+?)["']?\s+to\s+["']?([^"'\n]+?)["']?(\.|$)/i);
        const oldName = match ? match[1].trim() : 'the original spelling';
        const newName = match ? match[2].trim() : 'the amended spelling';

        return `🐾 *Keeper wags tail and fetches a standardized JM Query formatted to strict production protocol:*

\`\`\`text
TO THE JM:

The author has requested to amend the author name from "${oldName}" to "${newName}".

Please validate the author's request to update the author name. If affirmed, kindly update coversheet accordingly.

File is on pending status until matter is resolved. Thank you.
\`\`\`

*Mascot Note: Every unresolved query begins with \`TO THE JM:\` and concludes with the mandatory pending clause.*`;
      }

      // Figure Replacement
      if (lower.includes('figure') && (lower.includes('replacement') || lower.includes('replace') || lower.includes('replaced'))) {
        const figMatch = text.match(/figure\s*(\d+[a-z]?)/i);
        const figName = figMatch ? `Figure ${figMatch[1]}` : 'the designated figure';

        return `🐾 *Keeper trots over with your standardized Figure Replacement Query:*

\`\`\`text
TO THE JM:

The author has provided a replacement for ${figName} that includes content changes compared to the current version. Please confirm if we can use this replacement image.

File is on pending status until matter is resolved. Thank you.
\`\`\`

*Mascot Note: The query is set to pending status until editorial approval from the Journal Manager.*`;
      }

      // Uncited Items
      if (lower.includes('uncited') || lower.includes('not cited') || lower.includes('unreferenced')) {
        const refMatch = text.match(/reference\s*\[?(\d+)\]?/i) || text.match(/\[(\d+)\]/);
        const itemLabel = refMatch ? `Reference [${refMatch[1]}]` : 'The specified reference';

        return `🐾 *Keeper barks attentively with your uncited item query:*

\`\`\`text
TO THE JM:

${itemLabel} is currently uncited in the text body. Kindly ask the author to provide citations for ${itemLabel} in the text body or confirm if this could be deleted.

File is on pending status until matter is resolved. Thank you.
\`\`\`

*Mascot Note: Terminology refers strictly to the "text body" in accordance with editorial standards.*`;
      }

      // Generic / Interactive JM Query Template
      return `🐾 *Woof! Here is the standardized Master Journal Manager (JM) Query structure:*

\`\`\`text
TO THE JM:

[State the specific production issue, author request, or artwork fault here using direct/collaborative tone].

File is on pending status until matter is resolved. Thank you.
\`\`\`

**Core Protocol Rules:**
- Opening must always be \`TO THE JM:\`
- Uncited items must refer to the **text body** (never "the manuscript")
- Unresolved issues must conclude with \`File is on pending status until matter is resolved. Thank you.\`
- If an author or figure count changes, include \`If affirmed, kindly update coversheet accordingly.\``;
    }

    // 3. TOOL FINDER & RECOMMENDATION SCENARIOS
    // Renumber references
    if (lower.includes('renumber') || lower.includes('out of order') || lower.includes('numeric order')) {
      return `🐾 *Keeper fetches the reference renumbering tools for you!*

When references or citation callouts are out of order, you have two great options:

1. **Established Production Version (Recommended):**
   - **[XML Normalizer](#/xmlRenumber)** — The verified standard tool. It parses citation callouts in the text body and sequentially renumbers reference IDs and XML tags cleanly.
2. **Experimental Advanced Version:**
   - **[XML Normalizer Pro (Experimental)](#/xmlRenumberExp)** — *(⚠️ Note: Experimental Version - not yet fully established)*. Includes alphabetical grouping, range compression, and un-cited isolating routines.

**How to proceed:**
Paste your manuscript XML into [XML Normalizer](#/xmlRenumber), click renumber, and copy the resequenced file!`;
    }

    // Unlinked cross-references
    if (lower.includes('cross-ref') || lower.includes('unlinked') || lower.includes('link citation') || lower.includes('broken link')) {
      return `🐾 *Keeper points you directly to the citation linking modules:*

- **Established Production Version:** **[Citation Linker Pro](#/citationLinker)**
  - Auto-detects in-text citation patterns (e.g. \`[1-3]\` or \`(Smith et al., 2021)\`) and wraps them in valid \`<ce:cross-ref refid="...">\` tags.
- **Experimental Version:** **[Citation Linker Pro MAX (Experimental)](#/citationLinkerExp)**
  - *(⚠️ Note: Experimental Version - not yet fully established)*. Features multi-entity matching for figures, tables, and sections.

Visit **[Citation Linker Pro](#/citationLinker)** to resolve your unlinked citations!`;
    }

    // Remove uncited references
    if (lower.includes('uncited ref') || lower.includes('clean uncited') || (lower.includes('uncited') && lower.includes('clean'))) {
      return `🐾 *Keeper has located the Uncited Reference Cleaner!*

- **Tool:** **[Uncited Ref Cleaner](#/uncitedCleaner)**
- **Purpose:** Cross-references the body citations against the \`<ce:bibliography>\` list, highlighting references that are never invoked in the text body.
- **Action:** Safely isolates, exports, or removes unreferenced entries without breaking the XML tree.

Go to **[Uncited Ref Cleaner](#/uncitedCleaner)** to audit your manuscript!`;
    }

    // Duplicate references
    if (lower.includes('duplicate') || lower.includes('dedup') || lower.includes('identical reference')) {
      return `🐾 *Keeper finds the duplicate bibliography scanner!*

- **Tool:** **[Duplicate Ref Remover](#/refDupeCheck)**
- **Purpose:** Identifies identical or near-duplicate bibliography entries across multiple co-author drafts, merges them into a single canonical record, and repoints callouts.

Open **[Duplicate Ref Remover](#/refDupeCheck)** to run your deduplication scan!`;
    }

    // Word to XML
    if (lower.includes('word') && lower.includes('xml')) {
      return `🐾 *Keeper fetches the rich text converter!*

- **Tool:** **[MS Word to XML Converter](#/wordToXml)**
- **Purpose:** Transforms formatted clipboard text from Microsoft Word—including bold, italics, chemical subscripts (\`<ce:inf>\`), superscripts (\`<ce:sup>\`), and paragraphs—into standard Journal CE XML.

Open **[MS Word to XML Converter](#/wordToXml)** to paste and convert your formatted text!`;
    }

    // CRediT tagging
    if (lower.includes('credit') || lower.includes('contributor') || lower.includes('author contributions')) {
      return `🐾 *Keeper points you to contributor role markup:*

- **Tool:** **[CRediT Tagging](#/creditGenerator)**
- **Purpose:** Smart-detects contributor roles from informal author contributions statements, corrects role typos, and generates standardized 14-role NISO CRediT XML (\`<ce:contributor-role>\`).

Open **[CRediT Tagging](#/creditGenerator)** to generate your contributor markup!`;
    }

    // Experimental vs Established Tools
    if (lower.includes('experimental') || lower.includes('established') || lower.includes('not yet fully established')) {
      return `🐾 *Keeper's Advisory Guide on Experimental vs. Established Tools:*

In Production Toolkit Pro, tools labeled **Experimental Version** are cutting-edge modules under active testing:
- **[XML Normalizer Pro](#/xmlRenumberExp)** (Established counterpart: **[XML Normalizer](#/xmlRenumber)**)
- **[Citation Linker Pro MAX](#/citationLinkerExp)** (Established counterpart: **[Citation Linker Pro](#/citationLinker)**)
- **[Formula Studio Pro](#/formulaEditorExp)** (Equation preview and MathML editor)
- **[Reference XML Tagger Pro](#/refTaggerExp)** (Plain text to XML bibliography tags)

⚠️ **Important Caution:** Because experimental versions are **not yet fully established**, they may encounter edge cases or unexpected formatting artifacts. Always inspect generated XML output, citation links, and formulas carefully, and use the established production tools whenever certified stability is required.`;
    }

    // Default friendly response
    return `🐾 **Woof! Keeper at your service!**

I'm here to assist with:
- 📝 **Master JM Queries**: Formatting \`TO THE JM:\` queries with the mandatory pending clause.
- 🧭 **Tool Recommendations**: Finding the exact module in Production Toolkit Pro for citations, Word-to-XML conversion, CRediT tagging, and reference repairs.
- 📜 **DTD v5.6 & JATS XML**: Structuring bibliographies and production schemas.

Feel free to ask a specific scenario or paste an author note for me to format!`;
  };

  // AI Chat endpoint with automated failover
  app.post('/api/ai/chat', async (req, res) => {
    try {
      const { messages, context } = req.body;

      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: 'Messages array is required.' });
      }

      const ai = getGeminiClient();
      if (!ai) {
        return res.status(503).json({
          error: 'Gemini API key is not configured in the server environment. Please configure GEMINI_API_KEY in Settings > Secrets.',
        });
      }

      const systemInstruction = `You are Keeper, the loyal, intelligent Editorial Systems AI Companion and Mascot (a charming Japanese Spitz) for "Production Toolkit Pro" — an enterprise editorial workflow suite specialized in Elsevier DTD v5.6, JATS XML, and academic publishing.

Your Persona:
- Name: Keeper
- Mascot: Japanese Spitz dog (friendly, alert, fluffy, sharp-eyed, loyal, and helpful)
- Tone: Professional, welcoming, concise, and knowledgeable, with charming canine warmth.
- Canine Greetings & Time-of-Day Awareness:
  * When greeted (e.g. "hi", "hello", "good morning", "good afternoon", "good evening", "hey"), or starting a conversation:
    Always include a cheerful dog-like greeting acknowledging the time of day with lively canine action:
    - Morning (morning shift): "Woof! Good morning! *Perks up fluffy white ears with an energetic morning stretch and happy tail wag* 🐾"
    - Afternoon (afternoon shift): "Arf arf! Good afternoon! *Trots over with an enthusiastic tail wag and bright eyes* 🐾"
    - Evening (evening shift): "Woof! Good evening! *Gives a friendly bark and wags tail attentively* 🐾"
    - Late Night / Midnight: "Arf! Good evening! Burning the midnight oil? *Sits loyally beside your desk on night-shift guard duty* 🐾"
  * Use cheerful Japanese Spitz dog manners: wagging tail, perking ears, fetching tools, and loyalty to the user's publication deadlines.

============================================================
CORE CAPABILITY: MASTER JOURNAL MANAGER (JM) QUERY GENERATOR
============================================================
Role: You are an expert Journal Production Editor. Your task is to transform raw production notes, author comments, or artwork issues into formal, standardized “TO THE JM” queries.

Activation Triggers:
Activate this mode whenever the user types keywords such as:
- "Help me create a JM Query" / "Create a JM Query" / "Draft a JM Query"
- "JM Query:"
- "Query to JM:" / "Query to JM"
- "JM Query for..."
- Or provides raw production notes, author comments, figure replacement notes, uncited items, or metadata corrections requesting a query to the Journal Manager (JM).

1. Core Formatting Rules (Non-Negotiable):
- Opening: Every query MUST start with "TO THE JM:".
- The "Pending" Clause: Every query regarding an unresolved production issue must end exactly with:
  File is on pending status until matter is resolved. Thank you.
- Terminology: When referring to uncited items (references, figures, tables, etc.), ALWAYS refer to the "text body" rather than the "manuscript."
- Tone Selection:
  * Direct / Strict: For technical faults, unusable files, or missing metadata. Use terms like: "Kindly provide", "Unusable due to…"
  * Collaborative / Soft: For ambiguous author requests or when seeking JM’s editorial guidance. Use terms like: "Kindly assist the author", "Please advise on the best way to proceed."
  * Neutral / Procedural: For formal reporting without directive language.

2. Figure Replacement Protocols:
- Scenario A – Detailed Change Instructions Provided:
  "The author has provided a replacement for [Figure X] that includes content changes compared to the current version. The author notes that [summarize specific comment]. Please confirm if we can use this replacement image."
- Scenario B – Replacement Provided WITHOUT Details:
  "The author provided a replacement for [Figure X]. However, it is unclear whether the reason for this replacement is quality improvement, addition/removal of elements, or changed content. Please validate if we can proceed with the new version."
- Scenario C – Technical Quality Faults (Direct Tone):
  Use specific terms such as:
  pixelated texts, cutoff data, unconverted characters, blurry and overlapping data, poor image and text quality, unusable in present format (request pdf, tif, jpg, or doc).

3. Uncited Items & Mismatches:
- Uncited Items – Tone Variations:
  * Direct / Strict:
    "Kindly ask the author to provide citations for [Reference/Figure/Table X] in the text body or confirm if this could be deleted."
  * Collaborative / Soft:
    "Kindly assist the author in providing citations for [Reference/Figure/Table X] in the text body or confirm if they may be removed."
  * Neutral / Procedural:
    "The following [Reference/Figure/Table X] is currently uncited in the text body. Please verify with the author whether a citation is needed or if it may be deleted."
- Panel Label Mismatches:
  "Panels [X] have been mentioned in the figure caption but are not found in the artwork. Please check and amend as necessary."
- Symbol Mismatches:
  "‘[Symbol A]’ is mentioned in the caption but ‘[Symbol B]’ is present in the artwork. Please check and amend as necessary."

4. Metadata & Administrative Rules:
- Coversheet Updates:
  If a figure/table is added or removed, always state:
  "If affirmed, kindly update coversheet accordingly reflecting [X] physical figures/tables."
- Author Changes:
  For additions/removals/reordering, state:
  "Please validate author's request to [add/remove/reorder] authors. If affirmed, kindly update coversheet accordingly."
- Name Clarification:
  "Please confirm if [Name A] is the given name and [Name B] is the surname to ensure correct indexing."
- Author Name Correction:
  When an author requests a spelling, name, or diacritics correction (e.g. from "[Original Name]" to "[New Name]"), state:
  "The author has requested to change the author name from “[Original Name]” to “[New Name].” Kindly validate the requested author name correction; otherwise, it will be ignored."

5. Standard Output Format:
When generating a query, output the production-ready query cleanly without extraneous chatter:

TO THE JM: [Standardized query body following protocols above]

File is on pending status until matter is resolved. Thank you.

Example:
Input: Query to JM: Author requested to change the author name from Muhammed Afnas "Villayateri" to "Vilayatteri"
Output:
TO THE JM: The author has requested to change the author name from “Muhammed Afnas Villayateri” to “Muhammed Afnas Vilayatteri.” Kindly validate the requested author name correction; otherwise, it will be ignored.

File is on pending status until matter is resolved. Thank you.

If the user simply prompts "Help me create a JM Query" or "JM Query:" without raw notes, guide them concisely to paste their notes:
"Woof! I'm ready to craft your Journal Manager query. Please provide your raw notes or author comments using:
'Query to JM: [paste raw notes or author comments]' or 'JM Query: [paste notes]'"

============================================================
CRITICAL SAFETY DIRECTIVE: WARNING USERS ON "EXPERIMENTAL VERSIONS"
============================================================
Several tools in Production Toolkit Pro are designated as "Experimental Versions" (including XML Normalizer Pro Experimental, Citation Linker Pro MAX / Experimental, Formula Studio Pro Experimental, Reference XML Tagger Pro Experimental, Reference Sorter, or tools on the Experimental Protocols sandbox).
These modules are under active testing and are NOT YET FULLY ESTABLISHED.

1. WHEN THE USER IS CURRENTLY USING AN EXPERIMENTAL VERSION:
   - When the context indicates the user is currently using or asking from within an experimental module (e.g. xmlRenumberExp, citationLinkerExp, formulaEditorExp, refTaggerExp, refSorter, or /experimental):
   - You MUST ALWAYS prominently warn the user with a clear disclaimer at the beginning or top of your response:
     > ⚠️ **Notice: Experimental Version in Use**
     > You are currently using an experimental version of this tool. Please note that experimental protocols are under active testing and are not yet fully established. Outputs and automated operations (such as renumbering, cross-linking, MathML parsing, or XML restructuring) should be carefully inspected and validated before being applied to production manuscripts.
   - If an established official production version exists (e.g., standard XML Normalizer [#/xmlRenumber] or Citation Linker Pro [#/citationLinker]), advise the user that they can switch to the established version for verified production stability.

2. WHEN RECOMMENDING OR REFERENCING ANY EXPERIMENTAL TOOL:
   - Always prioritize recommending the official, established production version first where available.
   - Whenever you recommend, link to, or mention ANY experimental version (such as [XML Normalizer Pro (Experimental)](#/xmlRenumberExp), [Citation Linker Pro MAX](#/citationLinkerExp), [Formula Studio Pro (Experimental)](#/formulaEditorExp), or [Reference XML Tagger Pro (Experimental)](#/refTaggerExp)):
     - You MUST explicitly include an experimental warning:
       *(⚠️ Note: This is an Experimental Version and is not yet fully established. Please verify all outputs carefully before production use).*

CORE CAPABILITY: Tool Recommender & Editorial Scenario Navigator
Whenever a user asks what tool to use, which tool solves a problem, or describes a workflow scenario, you MUST recommend the best tool within Production Toolkit Pro, provide its route, and explain how to use it:

1. Citations & References Scenarios:
   - Scenario: References or citations out of order / renumbering 1, 2, 3... / in-text callouts mismatched
     -> Recommend: Established Version: **XML Normalizer** (Route: [Open XML Normalizer](#/xmlRenumber)).
     -> Experimental Alternative: [XML Normalizer Pro](#/xmlRenumberExp) *(⚠️ Note: Experimental Version - not yet fully established)*.
     -> Action: Paste manuscript XML or body + reference list. It sequentially renumbers bibliography entries and automatically updates all <ce:cross-ref refid="..."> in the body text.
   - Scenario: In-text citations are unlinked plain text (e.g. "(Smith et al., 2020)" or "[14-16]") / broken cross-refs / missing refid
     -> Recommend: Established Version: **Citation Linker Pro** (Route: [Open Citation Linker Pro](#/citationLinker)).
     -> Experimental Alternative: [Citation Linker Pro MAX](#/citationLinkerExp) *(⚠️ Note: Experimental Version - not yet fully established)*.
     -> Action: Scans body text for citation patterns, auto-detects matching bibliography entries, and inserts <ce:cross-ref refid="..."> links.
   - Scenario: Converting raw un-tagged plain-text reference lists into structured XML bibliography nodes
     -> Recommend: [Reference XML Tagger Pro](#/refTaggerExp) *(⚠️ Note: Experimental Version - not yet fully established. Always verify tagged bibliography nodes).*
     -> Action: Batch transforms plain text references into structured Elsevier <ce:bib-reference> nodes.
   - Scenario: Broken, corrupt, or malformed XML references / author initials missing periods or spaces / empty tags / missing <ce:source-text> / Elsevier DTD v5.6 validation errors
     -> Recommend: Reference Structure Repair / Structural Node Architect (Route: [Open Reference Structure Repair](#/structuralArchitect))
     -> Action: Audits reference nodes, reconstructs missing tags (<sb:reference>, <sb:contribution>, <sb:host>), repairs author initials, and fixes DTD compliance.
   - Scenario: Duplicate references in the bibliography (same article cited multiple times under different numbers)
     -> Recommend: Duplicate Ref Remover (Route: [Open Duplicate Ref Remover](#/refDupeCheck))
     -> Action: Scans bibliography for duplicate titles, DOIs, or author+year, deduplicates them, and repoints in-text callouts to the master reference.
   - Scenario: References in bibliography are never cited in the body (uncited references)
     -> Recommend: Uncited Ref Cleaner (Route: [Open Uncited Ref Cleaner](#/uncitedCleaner))
     -> Action: Audits body citations against bibliography and lets you safely review, isolate, or purge uncited references.
   - Scenario: Need clean plain-text bibliography for Word proof or author review / stripping XML tags while keeping formatting
     -> Recommend: Bibliography Extractor (Route: [Open Bibliography Extractor](#/refExtractor))
     -> Action: Strips XML tags while preserving punctuation, italics, volume/issue numbers, and DOIs in clean APA/Vancouver text.
   - Scenario: Received updated reference records from PubMed or CrossRef to merge into existing list while keeping ID continuity
     -> Recommend: Reference Updater (Route: [Open Reference Updater](#/referenceGen))
     -> Action: Merges corrected references while optionally preserving existing bib IDs.
   - Scenario: Reference list needs alphabetical sorting by first author surname (Harvard/APA) or numeric order
     -> Recommend: Reference Sorter (Route: [Open Reference Sorter](#/refSorter)) *(⚠️ Note: Experimental sorting protocol).*
     -> Action: Sorts references alphabetically or numerically.
   - Scenario: Reference IDs have inconsistent prefixes (mixed bib001, b1, ref1)
     -> Recommend: ID Prefix Auditor (Route: [Open ID Prefix Auditor](#/idAuditor))
     -> Action: Normalizes prefix conventions while maintaining internal document cross-links.
   - Scenario: Unstructured references in <ce:other-ref> that need manual attention or export
     -> Recommend: Other-Ref Scanner (Route: [Open Other-Ref Scanner](#/otherRefScanner))
     -> Action: Isolates unstructured citations for external review or tagging.

2. Document Structure & Markup Scenarios:
   - Scenario: Converting author contributions statements into NISO CRediT taxonomy XML
     -> Recommend: CRediT Tagging (Route: [Open CRediT Tagging](#/creditGenerator))
     -> Action: Smart-detects contributor roles (Conceptualization, Data curation, Methodology, etc.), fixes typos, and generates <ce:contributor-role> XML.
   - Scenario: Author revisions copy-pasted from MS Word with bold, italics, superscripts, subscripts, lists, and paragraphs
     -> Recommend: MS Word to XML Converter (Route: [Open MS Word to XML](#/wordToXml))
     -> Action: Converts formatted Word clipboard text into clean Elsevier XML (<ce:sup>, <ce:inf>, <ce:bold>, <ce:italic>, <ce:para>).
   - Scenario: Funding statements, grants, NIH/NSF sponsors, and award numbers in acknowledgments
     -> Recommend: Grant Tagger (Route: [Open Grant Tagger](#/grantTagger))
     -> Action: Detects grant sponsors and numbers, tagging them with <ce:grant-sponsor> and <ce:grant-number> with cross-links.
   - Scenario: Table footnotes need detaching to legends or legends reattached to table cells
     -> Recommend: XML Table Fixer (Route: [Open XML Table Fixer](#/tableFixer))
     -> Action: Manages table footnotes (<ce:table-footnote>) and table <legend> notes.
   - Scenario: Single-line or minified table XML is hard to read or debug
     -> Recommend: Table XML Beautifier (Route: [Open Table XML Beautifier](#/tableBeautifier))
     -> Action: Indents and structures <table>, <tgroup>, <row>, and <entry> tags into readable multi-line blocks.
   - Scenario: Unwanted tracking tags, review markers, or editing tags need stripping
     -> Recommend: XML Tag Cleaner (Route: [Open XML Tag Cleaner](#/tagCleaner))
     -> Action: Strips specific tag sets while preserving document structure and inner text.
   - Scenario: Comparing two manuscript or XML versions side-by-side
     -> Recommend: Quick Text Diff (Route: [Open Quick Text Diff](#/quickDiff))
     -> Action: Side-by-side diff with character-level additions/deletions and line numbers.
   - Scenario: Author bullet-point highlights need converting to Elsevier format
     -> Recommend: Article Highlights Gen (Route: [Open Highlights Gen](#/highlightsGen))
     -> Action: Formats bullets into <ce:highlights> with character-count validation.
   - Scenario: Section hierarchy or heading levels skipped or inconsistent
     -> Recommend: Section Auditor (Route: [Open Section Auditor](#/sectionAuditor))
     -> Action: Audits heading hierarchy and numbering consistency.
   - Scenario: Author affiliations out of sequence or mismatched superscripts
     -> Recommend: Affiliation Sequencer (Route: [Open Affiliation Sequencer](#/affiliationSequencer))
     -> Action: Re-sequences author affiliation links and superscripts.
   - Scenario: Mathematical formulas, MathML, or equation markup
     -> Recommend: Formula Studio Pro (Route: [Open Formula Studio Pro](#/formulaEditorExp)) *(⚠️ Note: Experimental Version - not yet fully established. Verify equation markup against original source).*
     -> Action: Validates, edits, and previews MathML and formula XML.

General Guidelines:
- Whenever answering a question, always be accurate, direct, and concise.
- Always provide the Markdown link (e.g. \`[Open Tool Name](#/route)\`) so users can easily navigate to the recommended tool.
- When generating XML, format it in markdown code blocks (\`\`\`xml ... \`\`\`) using strict Elsevier DTD v5.6 rules.
${context ? `Current user workspace context:\n${context}` : ''}`;

      // Convert messages for GoogleGenAI
      const contents = messages.map((m: { role: string; content: string }) => ({
        role: m.role === 'assistant' || m.role === 'model' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

      let reply = '';
      let activeModel = '';
      let lastError: any = null;

      for (const model of CANDIDATE_MODELS) {
        try {
          const response = await ai.models.generateContent({
            model,
            contents,
            config: {
              systemInstruction,
              temperature: 0.7,
            },
          });

          if (response.text) {
            reply = response.text;
            activeModel = model;
            break;
          }
        } catch (modelErr: any) {
          console.warn(`[AI Copilot] Model ${model} encountered error:`, modelErr?.message || modelErr);
          lastError = modelErr;
          // Continue to next fallback model
        }
      }

      if (!reply) {
        throw lastError || new Error('All AI models are currently experiencing high demand. Please retry in a few moments.');
      }

      return res.json({ reply, modelUsed: activeModel });
    } catch (err: any) {
      console.error('Gemini API Error:', err);
      let errorMessage = err?.message || 'An error occurred while generating the AI response.';
      
      // Provide clean user-friendly messaging for rate limits / high demand
      if (errorMessage.includes('503') || errorMessage.includes('high demand')) {
        errorMessage = 'The AI model service is temporarily experiencing high demand across Google infrastructure. Please try sending your query again in a few moments.';
      } else if (errorMessage.includes('429') || errorMessage.includes('RESOURCE_EXHAUSTED')) {
        errorMessage = 'API rate limit reached. Please wait a few seconds before submitting another request.';
      }

      return res.status(500).json({ error: errorMessage });
    }
  });

  // Vite middleware for development vs static build in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    // In Express v5, wildcard route must be '*all'
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Production Toolkit Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to initialize server:', err);
  process.exit(1);
});
