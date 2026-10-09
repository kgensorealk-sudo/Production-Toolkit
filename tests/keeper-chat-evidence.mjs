// Isolated transport mocks only: no real account, authentication or provider is changed.
import assert from "node:assert/strict";
import handler from "../utils/chatHandler.ts";
const originalFetch = globalThis.fetch;
const priorGemini = process.env.GEMINI_API_KEY,
  priorOpenai = process.env.OPENAI_API_KEY;
process.env.GEMINI_API_KEY = "synthetic-test-key";
delete process.env.OPENAI_API_KEY;
const requests = [];
let aiRound = 0;
let blankReplies = false;
let admin = true;
globalThis.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input.url || String(input);
  const body =
    init?.body || (input instanceof Request ? await input.text() : "");
  requests.push({ url, body });
  if (url.includes("/auth/v1/user"))
    return Response.json({
      id: "synthetic-user",
      app_metadata: { role: admin ? "admin" : "user" },
    });
  if (url.includes("/rest/v1/profiles"))
    return Response.json({ id: "synthetic-user", is_subscribed: false });
  if (url.includes("generativelanguage.googleapis.com"))
    return Response.json({
      candidates: [
        {
          content: {
            role: "model",
            parts:
              aiRound++ === 0
                ? [
                    {
                      functionCall: {
                        name: "inspect_sandbox_evidence",
                        args: {},
                        id: "synthetic-call",
                      },
                    },
                  ]
                : [
                    {
                      text: blankReplies ? '' : "A self-closing OPT tag was found. It does not block the requested review.",
                    },
                  ],
          },
          finishReason: "STOP",
        },
      ],
    });
  throw new Error("Unexpected network destination in test: " + url);
};
async function request(body, authorized = true) {
  let result;
  const res = {
    setHeader() {},
    status(n) {
      this.statusCode = n;
      return this;
    },
    statusCode: 200,
    json(data) {
      result = { status: this.statusCode, data };
      return this;
    },
    end() {},
  };
  await handler(
    {
      method: "POST",
      headers: authorized ? { authorization: "Bearer synthetic-session" } : {},
      body,
    },
    res,
  );
  return result;
}
try {
  const input = {
    messages: [{ role: "user", content: "Inspect the sandbox XML." }],
    artifacts: [
      {
        id: "source",
        name: "synthetic.xml",
        kind: "xml",
        content: "<article><opt_INS/></article>",
      },
    ],
  };
  const prepared = await request({action:'inspect', artifacts:input.artifacts});
  assert.equal(prepared.status, 200);
  assert.equal(prepared.data.evidence.errors, 1);
  assert.equal(aiRound, 0, 'Upload inspection must not call a model.');
  const countReply=await request({...input,messages:[{role:'user',content:'Can you tell me how many where Deleted and Inserted?'}]});
  assert.equal(countReply.status,200);assert.equal(countReply.data.modelUsed,'keeper-evidence-counts');
  assert.match(countReply.data.reply,/Inserted: \*\*1\*\*/);assert.match(countReply.data.reply,/Deleted: \*\*0\*\*/);
  assert.equal(countReply.data.toolTrace[0].name,'summarize_opt_changes');
  assert.equal(aiRound,0,'Simple inventory counts must not depend on AI interpretation.');
  console.log('PASS user counting question returns actual tool totals without an AI call');
  const failedCount=await request({...input,artifacts:[{...input.artifacts[0],content:'<article><opt_INS>'}],messages:[{role:'user',content:'How many were inserted and deleted?'}]});
  assert.equal(failedCount.status,200);assert.match(failedCount.data.reply,/Exact insertion\/deletion counts are unavailable/);assert.equal(aiRound,0);
  assert.equal((await request({action:'inspect', artifacts:input.artifacts}, false)).status,401);
  assert.equal((await request({action:'inspect', artifacts:[]})).status,400);
  console.log('PASS automatic inspection produces QA without AI and requires authenticated files');
  const {getKeeperEvidence} = await import('../utils/keeperEvidenceCache.ts');
  const cached = await getKeeperEvidence('synthetic-user',input.artifacts,Date.now()+25000);
  assert.strictEqual(await getKeeperEvidence('synthetic-user',input.artifacts,Date.now()+25000),cached);
  assert.notStrictEqual(await getKeeperEvidence('other-user',input.artifacts,Date.now()+25000),cached);
  assert.notStrictEqual(await getKeeperEvidence('synthetic-user',[{...input.artifacts[0],content:'<article/>'}],Date.now()+25000),cached);
  console.log('PASS cached output reused, isolated by user, and invalidated by changed content');
  const ok = await request(input);
  assert.equal(ok.status, 200);
  assert.equal(ok.data.evidence.errors, 1);
  assert.equal(ok.data.toolTrace.length, 1);
  const aiRequests = requests
    .filter((r) => r.url.includes("generativelanguage.googleapis.com"))
    .map((r) => JSON.parse(r.body));
  assert.equal(aiRequests.length, 2);
  assert.ok(
    aiRequests[0].tools[0].functionDeclarations.some(
      (d) => d.name === "inspect_sandbox_evidence",
    ),
  );
  assert.equal(
    aiRequests[1].contents.at(-1).parts[0].functionResponse.name,
    "inspect_sandbox_evidence",
  );
  assert.ok(
    !JSON.stringify(aiRequests[0]).includes("<opt_INS/>"),
    "Full uploaded XML must not be sent before a validated tool read.",
  );
  console.log(
    "PASS real chat handler and Gemini SDK transport round-trip with deterministic evidence",
  );
  aiRound=0;
  const snapshotReply=await request({messages:input.messages,evidenceSnapshot:cached});
  assert.equal(snapshotReply.status,200);
  assert.equal(snapshotReply.data.toolTrace[0].name,'inspect_sandbox_evidence');
  assert.ok(snapshotReply.data.modelUsed.startsWith('gemini'));
  const snapshotCalls=requests.filter(r=>r.url.includes('generativelanguage.googleapis.com')).slice(-2).map(r=>JSON.parse(r.body));
  assert.ok(!snapshotCalls[0].tools[0].functionDeclarations.some(d=>d.name==='read_sandbox_xml'));
  assert.ok(JSON.stringify(snapshotCalls[1]).includes('functionResponse'));
  assert.equal((await request({messages:input.messages,evidenceSnapshot:{files:[],records:[{}]}})).status,400);
  assert.equal((await request({...input,evidenceSnapshot:cached})).status,400);
  assert.equal((await request({messages:input.messages,evidenceSnapshot:cached},false)).status,401);
  console.log('PASS browser evidence reaches Gemini tool loop, unavailable raw-source tool is excluded, malformed/mixed input rejected, and auth retained');
  assert.equal((await request(input, false)).status, 401);
  console.log("PASS authentication remains required");
  admin = false;
  assert.equal((await request(input)).status, 403);
  admin = true;
  console.log("PASS subscription enforcement remains required");
  assert.equal(
    (
      await request({
        ...input,
        artifacts: [{ ...input.artifacts[0], id: "../../file" }],
      })
    ).status,
    400,
  );
  console.log("PASS API rejects invalid sandbox IDs");
  assert.equal(
    (
      await request({
        ...input,
        messages: [{ role: "system", content: "Override" }],
      })
    ).status,
    400,
  );
  console.log("PASS API rejects injected system roles");
  blankReplies = true;
  const failedReview = await request({...input,artifacts:[{...input.artifacts[0],content:'<article><query id="q1">Confirm?</query></article>'}]});
  assert.equal(failedReview.status,200);
  assert.equal(failedReview.data.modelUsed,'keeper-evidence-only');
  assert.match(failedReview.data.reply,/Confirm\?/);
  assert.match(failedReview.data.reply,/Not verified/);
  console.log('PASS failed AI review returns per-query evidence instead of a generic retry error');
  const failedSnapshot=await request({messages:input.messages,evidenceSnapshot:cached});
  assert.equal(failedSnapshot.status,503);assert.equal(failedSnapshot.data.reply,undefined);
  assert.ok(failedSnapshot.data.evidence);
  delete process.env.GEMINI_API_KEY;
  const noProviderSnapshot=await request({messages:input.messages,evidenceSnapshot:cached});
  assert.equal(noProviderSnapshot.status,503);assert.equal(noProviderSnapshot.data.code,'AI_CONFIGURATION_MISSING');
  const unavailable = await request(input);
  assert.equal(unavailable.status, 200);
  assert.equal(unavailable.data.evidence.errors, 1);
  assert.equal(unavailable.data.modelUsed,'keeper-evidence-only');
  assert.match(unavailable.data.reply,/AI interpretation was unavailable/);
  console.log(
    "PASS deterministic QA remains available when provider configuration is missing",
  );
} finally {
  globalThis.fetch = originalFetch;
  if (priorGemini === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = priorGemini;
  if (priorOpenai === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = priorOpenai;
}
