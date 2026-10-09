import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {
  inspectKeeperXml,
  inspectKeeperPdf,
  bindKeeperQueries,
  validateArtifacts,
  dispatchKeeperTool,
  buildKeeperEvidence,
  keeperPdfLines,
  evidenceSummary,
} from "../utils/keeperEvidence.ts";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import KeeperEvidenceReport from "../components/KeeperEvidenceReport.tsx";
import { runKeeperToolLoop } from "../utils/keeperToolRunner.ts";
let checks = 0;
const check = (label, fn) => {
  fn();
  checks++;
  console.log("PASS", label);
};
const artifact = (content, id = "xml") => ({
  id,
  name: "Synthetic article.xml",
  kind: "xml",
  content,
});
const wrap = (content) =>
  `<article><item-info><ce:doi>10.1234/test</ce:doi></item-info>${content}</article>`;
const query = (id = "q1", text = "Should this be italic?", qid = "STR001") =>
  `<query id="${id}" qid="${qid}">${text}</query>`;
const report = (lines, id = "pdf") =>
  inspectKeeperPdf(id, [
    {
      page: 1,
      lines: [
        "Supplementary data to this article can be found online at https://doi.org/10.1234/test",
        ...lines,
      ],
    },
  ]);
const bind = (xml, pdf) => {
  const x = inspectKeeperXml(artifact(wrap(xml)));
  bindKeeperQueries(x, pdf);
  return x.records.filter((r) => r.kind === "query");
};
check(
  "case, intentional spaces, self closing, empty pairs, nested tags and unknown types",
  () => {
    const x = inspectKeeperXml(
      artifact(
        wrap(
          "<opt_INS> </opt_INS><opt_del>&#x20;</opt_del><opt_ins/><opt_DEL></opt_DEL><opt_comment>Question <opt_INS>x</opt_INS></opt_comment><opt_future>x</opt_future>",
        ),
      ),
    );
    assert.equal(x.records.length, 7);
    assert.equal(x.records[0].diagnostics.length, 0);
    assert.equal(x.records[1].diagnostics.length, 0);
    assert.equal(x.records[2].diagnostics[0].severity, "error");
    assert.equal(x.records[3].diagnostics[0].severity, "error");
    assert.equal(x.records[5].diagnostics[0].severity, "warning");
    assert.equal(x.records[6].diagnostics[0].severity, "warning");
  },
);
check(
  "comments, CDATA and quoted greater-than do not produce false OPT nodes",
  () => {
    const x = inspectKeeperXml(
      artifact(
        wrap(
          '<!-- <opt_INS/> --><ce:para><![CDATA[<opt_DEL/>]]></ce:para><opt_INS note=">">é</opt_INS>',
        ),
      ),
    );
    assert.equal(x.records.length, 1);
    assert.equal(x.records[0].text, "é");
  },
);
check("exact lexical evidence, Unicode and source locations retained", () => {
  const x = inspectKeeperXml(
    artifact(
      wrap("\n<opt_comment>Can José revise &amp; confirm?</opt_comment>"),
    ),
  );
  assert.equal(x.records[0].line, 2);
  assert.equal(
    x.records[0].source,
    "<opt_comment>Can José revise &amp; confirm?</opt_comment>",
  );
  assert.equal(x.records[0].text, "Can José revise & confirm?");
});
check("invalid XML is disclosed rather than silently repaired", () => {
  const x = inspectKeeperXml(artifact("<article><opt_INS>x</article>"));
  assert.equal(x.records.length, 0);
  assert.match(x.diagnostics[0], /XML structure/);
});
check("external entities are never fetched", () => {
  const x = inspectKeeperXml(
    artifact(
      '<!DOCTYPE a [<!ENTITY leak SYSTEM "file:///secret">]><a>&leak;</a>',
    ),
  );
  assert.ok(x.diagnostics.length);
});
check("strict valid response binding", () => {
  const qs = bind(
    query(),
    report(["Q1", "Query: Should this be italic?", "Answer: Yes"]),
  );
  assert.equal(qs[0].binding.state, "established");
  assert.equal(qs[0].binding.response, "Yes");
});
check("wrong article cannot bind", () => {
  const p = report(["Q1", "Query: Should this be italic?", "Answer: Yes"]);
  p.articleDois = ["10.1234/other"];
  assert.equal(bind(query(), p)[0].binding.state, "conflicting");
});
check("duplicate XML query IDs remain ambiguous", () => {
  const qs = bind(
    query() + query("Q1"),
    report(["Q1", "Query: Should this be italic?", "Answer: Yes"]),
  );
  assert.ok(qs.every((q) => q.binding.state === "ambiguous"));
});
check("duplicate PDF query IDs remain ambiguous", () => {
  assert.equal(
    bind(
      query(),
      report([
        "Q1",
        "Query: Should this be italic?",
        "Answer: Yes",
        "Q1",
        "Query: Should this be italic?",
        "Answer: No",
      ]),
    )[0].binding.state,
    "ambiguous",
  );
});
check("query wording mismatch remains unresolved", () => {
  assert.equal(
    bind(query(), report(["Q1", "Query: Change the figure?", "Answer: Yes"]))[0]
      .binding.state,
    "unresolved",
  );
});
check("empty author response remains unresolved", () => {
  assert.equal(
    bind(
      query(),
      report(["Q1", "Query: Should this be italic?", "Answer: "]),
    )[0].binding.state,
    "unresolved",
  );
});
check("contradictory explicit QID cannot bind", () => {
  assert.equal(
    bind(
      query(),
      report([
        "Q1",
        "Query: Should this be italic? QID: AUT001",
        "Answer: Yes",
      ]),
    )[0].binding.state,
    "conflicting",
  );
});
check("competing explicit QIDs remain ambiguous", () => {
  assert.equal(
    bind(
      query(),
      report([
        "Q1",
        "Query: Should this be italic? QID: STR001 QID: AUT001",
        "Answer: Yes",
      ]),
    )[0].binding.state,
    "ambiguous",
  );
});
check("reference DOI does not establish article identity", () => {
  const x = inspectKeeperXml(
    artifact(
      "<article><ce:bibliography><ce:bib-reference><ce:doi>10.1234/test</ce:doi></ce:bib-reference></ce:bibliography>" +
        query() +
        "</article>",
    ),
  );
  bindKeeperQueries(
    x,
    report(["Q1", "Query: Should this be italic?", "Answer: Yes"]),
  );
  assert.equal(x.records[0].binding.state, "unresolved");
});
check("commented original queries preserved with explicit provenance", () => {
  const x = inspectKeeperXml(artifact(wrap("<!-- " + query() + " -->")));
  assert.equal(x.records.length, 1);
  assert.equal(x.records[0].commented, true);
  assert.equal(x.records[0].queryId, "q1");
});
check("fused PDF next-query heading is supported", () => {
  const p = report([
    "Q1",
    "Query: Should this be italic?",
    "Answer: YesQ2",
    "Query: Revise title?",
    "Answer: No",
  ]);
  assert.equal(p.records.length, 2);
  assert.equal(p.records[0].binding.response, "Yes");
});
check(
  "artifact validation rejects paths as IDs, duplicate IDs and oversized payload",
  () => {
    assert.throws(() => validateArtifacts([artifact("<a/>", "../../secrets")]));
    assert.throws(() =>
      validateArtifacts([artifact("<a/>"), artifact("<b/>")]),
    );
    assert.throws(() => validateArtifacts([artifact("a".repeat(6000001))]));
  },
);
const e = await buildKeeperEvidence([artifact(wrap("<opt_INS/>" + query()))]);
check("dispatcher allowlist and arguments are enforced", () => {
  assert.ok(dispatchKeeperTool(e, "delete_file", {}).error);
  assert.ok(
    dispatchKeeperTool(e, "inspect_sandbox_evidence", { path: "C:/secret" })
      .error,
  );
  assert.ok(
    dispatchKeeperTool(e, "inspect_sandbox_evidence", { artifactId: "missing" })
      .error,
  );
  assert.ok(
    dispatchKeeperTool(e, "inspect_sandbox_evidence", { offset: -1 }).error,
  );
  assert.ok(
    dispatchKeeperTool(e, "inspect_sandbox_evidence", { limit: 11 }).error,
  );
});
check("bounded evidence pages and exact-ID retrieval", () => {
  const x = dispatchKeeperTool(e, "inspect_sandbox_evidence", { limit: 1 });
  assert.equal(x.records.length, 1);
  assert.equal(x.nextOffset, 1);
  assert.equal(
    dispatchKeeperTool(e, "inspect_sandbox_evidence", {
      recordId: e.records[1].id,
    }).records[0].kind,
    "query",
  );
});
check("XML excerpt reads only supplied artifact IDs", () => {
  const a = artifact("<article/>");
  assert.equal(
    dispatchKeeperTool(e, "read_sandbox_xml", { artifactId: "xml" }, [a])
      .source,
    a.content,
  );
  assert.ok(
    dispatchKeeperTool(e, "read_sandbox_xml", { artifactId: "C:/secret" }, [a])
      .error,
  );
});
check("long records are retrievable without silent truncation", () => {
  const x = inspectKeeperXml(
    artifact(wrap("<opt_comment>" + "a".repeat(9000) + "</opt_comment>")),
  );
  const ev = { files: [{ id: "xml" }], records: x.records };
  const first = dispatchKeeperTool(ev, "inspect_sandbox_evidence", {});
  assert.equal(first.records[0].nextTextOffset, 5000);
  const rest = dispatchKeeperTool(ev, "inspect_sandbox_evidence", {
    recordId: x.records[0].id,
    textOffset: 5000,
  });
  assert.equal(rest.records[0].text.length, 4000);
});
// Compare the adapted matcher with actual Stage-1 matchQ on equivalent records.
const stagePath =
  process.env.KEEPER_STAGE1_SOURCE ||
  "C:/Users/Kevin/Desktop/FL-Xtools/s100-s200-query-documentation-generator/src/assets/query-generator.html";
if (fs.existsSync(stagePath)) {
  const stageSource = fs.readFileSync(stagePath, "utf8");
  const stageMatch = stageSource.slice(
    stageSource.indexOf("function matchQ("),
    stageSource.indexOf(
      "function applyMatches()",
      stageSource.indexOf("function matchQ("),
    ),
  );
  check(
    "Stage-1 parity for established, mismatch, duplicate and missing-answer cases",
    () => {
      for (const variant of ["valid", "wording", "duplicate", "empty"]) {
        const q = { id: "q1", qid: "STR001", text: "Should this be italic?" },
          blocks = [
            {
              id: "Q1",
              at: 0,
              end: 3,
              ai: 2,
              query: [variant === "wording" ? "Different?" : q.text],
              answer: variant === "empty" ? [] : ["Yes"],
            },
          ];
        if (variant === "duplicate") blocks.push({ ...blocks[0] });
        const context = {
          S: {
            pdf: {
              association: { state: "established" },
              sourceIdentity: "fingerprint",
            },
            qs: [q],
          },
          caseBinding: () => true,
          nz: (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, ""),
        };
        vm.createContext(context);
        vm.runInContext(stageMatch, context);
        const expected = context.matchQ(
          q,
          ["Q1", "Query: x", "Answer: x"],
          blocks,
        ).state;
        const p = report([
          "Q1",
          "Query: " + blocks[0].query[0],
          "Answer: " + (blocks[0].answer[0] || ""),
          ...(variant === "duplicate"
            ? ["Q1", "Query: " + q.text, "Answer: Yes"]
            : []),
        ]);
        assert.equal(bind(query(), p)[0].binding.state, expected);
      }
    },
  );
} else
  console.log(
    "SKIP optional external Stage-1 parity check; set KEEPER_STAGE1_SOURCE.",
  );
let captured = [];
let count = 0;
const modelContent = {
  role: "model",
  parts: [
    {
      functionCall: { name: "inspect_sandbox_evidence", args: { limit: 1 } },
      thoughtSignature: "opaque-provider-signature",
    },
  ],
};
const mock = {
  models: {
    generateContent: async (req) => {
      captured.push(structuredClone(req));
      return count++ === 0
        ? {
            functionCalls: [
              {
                name: "inspect_sandbox_evidence",
                args: { limit: 1 },
                id: "call-1",
              },
            ],
            candidates: [{ content: modelContent }],
          }
        : { text: "Observed a self-closing OPT error; the task may continue." };
    },
  },
};
const result = await runKeeperToolLoop({
  provider: "gemini",
  client: mock,
  model: "test",
  messages: [{ role: "user", parts: [{ text: "Inspect" }] }],
  systemInstruction: "Sandbox",
  evidence: e,
  deadline: Date.now() + 5000,
});
check(
  "Gemini call/dispatch/result/explanation loop preserves model signatures",
  () => {
    assert.equal(result.trace.length, 1);
    assert.equal(captured.length, 2);
    assert.deepEqual(captured[1].contents[2], modelContent);
    assert.equal(
      captured[1].contents[3].parts[0].functionResponse.id,
      "call-1",
    );
  },
);
let rounds = 0;
const endless = {
  models: {
    generateContent: async () => {
      rounds++;
      return {
        functionCalls: [{ name: "inspect_sandbox_evidence", args: {} }],
        candidates: [{ content: modelContent }],
      };
    },
  },
};
await assert.rejects(
  runKeeperToolLoop({
    provider: "gemini",
    client: endless,
    model: "test",
    messages: [],
    systemInstruction: "",
    evidence: e,
    deadline: Date.now() + 5000,
  }),
  /limit/,
);
checks++;
console.log("PASS bounded repeated tool calls");
await assert.rejects(
  runKeeperToolLoop({
    provider: "gemini",
    client: {
      models: {
        generateContent: async () => ({ text: "I checked everything." }),
      },
    },
    model: "test",
    messages: [],
    systemInstruction: "",
    evidence: e,
    deadline: Date.now() + 5000,
  }),
  /did not inspect/,
);
checks++;
console.log("PASS unsupported inspection claims rejected");
let openaiCalls = 0;
const openaiRequests = [];
const openai = {
  chat: {
    completions: {
      create: async (req) => {
        openaiRequests.push(structuredClone(req));
        return {
          choices: [
            {
              message:
                openaiCalls++ === 0
                  ? {
                      role: "assistant",
                      content: null,
                      tool_calls: [
                        {
                          id: "c1",
                          type: "function",
                          function: {
                            name: "inspect_sandbox_evidence",
                            arguments: "{}",
                          },
                        },
                      ],
                    }
                  : { role: "assistant", content: "Evidence reviewed." },
            },
          ],
        };
      },
    },
  },
};
await runKeeperToolLoop({
  provider: "openai",
  client: openai,
  model: "test",
  messages: [{ role: "user", content: "Inspect" }],
  systemInstruction: "",
  evidence: e,
  deadline: Date.now() + 5000,
});
check("fallback provider also executes validated tools", () => {
  assert.equal(openaiRequests[1].messages.at(-1).role, "tool");
  assert.equal(openaiRequests[1].messages.at(-1).tool_call_id, "c1");
});
check(
  "PDF geometric rows ignore empty text items and preserve query heading adjacency",
  () => {
    const item = (str, x, y) => ({ str, transform: [1, 0, 0, 1, x, y] });
    const lines = keeperPdfLines([
      item("Q1", 80, 830),
      item("", 80, 805),
      item("Query:", 80, 805),
      item("Should this be italic?", 120, 805),
      item("", 80, 760),
      item("Yes", 120, 760),
      item("Answer:", 80, 760),
    ]);
    assert.deepEqual(lines, [
      "Q1",
      "Query: Should this be italic?",
      "Answer: Yes",
    ]);
    assert.equal(
      inspectKeeperPdf("pdf", [{ page: 1, lines }]).records.length,
      1,
    );
  },
);
check(
  "task-relevant kind/search filters and XML literal search stay bounded",
  () => {
    assert.equal(
      dispatchKeeperTool(e, "inspect_sandbox_evidence", {
        kind: "query",
        search: "italic",
      }).records.length,
      1,
    );
    const a = artifact("<article><ce:para>Target evidence</ce:para></article>");
    const result = dispatchKeeperTool(
      e,
      "read_sandbox_xml",
      { artifactId: "xml", search: "Target" },
      [a],
    );
    assert.equal(result.matchOffset, a.content.indexOf("Target"));
    assert.equal(
      dispatchKeeperTool(
        e,
        "read_sandbox_xml",
        { artifactId: "xml", search: "missing" },
        [a],
      ).found,
      false,
    );
  },
);
check(
  "QA component renders non-blocking issues, filenames, coverage and unresolved bindings safely",
  () => {
    const report = {
      ...evidenceSummary(e),
      retrievalCoverage: {
        recordsRetrieved: 1,
        inventoryRecords: 2,
        xmlExcerptReads: 0,
      },
    };
    report.files[0].name = "<img src=x onerror=alert(1)>";
    const html = renderToStaticMarkup(
      React.createElement(KeeperEvidenceReport, { report }),
    );
    assert.match(html, /These do not block the task/);
    assert.match(html, /1\/2/);
    assert.match(html, /Query \/ response binding/);
    assert.ok(!html.includes("<img src=x"));
    assert.ok(html.includes("&lt;img"));
  },
);
console.log(`${checks} Keeper evidence checks passed.`);
