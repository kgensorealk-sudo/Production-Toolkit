import fs from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire('C:/Users/Kevin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/anchor.cjs');
const { chromium } = require('playwright');
const source = fs.readFileSync('pages/StructuralNodeArchitect.tsx', 'utf8');
const ast = ts.createSourceFile('source.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = new Set(['generateSourceText', 'fixGivenName', 'getLangAttr', 'pruneEmptyElements', 'sanitizeXmlTags', 'directLabels', 'associatedSourceText', 'hasUnassociatedSourceText', 'findDuplicateIds', 'removeInjectedNamespaces', 'auditReferenceFields', 'executeRepair', 'analyzeXml', 'getDoiMigrationPlan', 'restoreEmptyMarkerForms']);
const found = {};
function visit(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && names.has(node.name.text)) found[node.name.text] = 'const ' + node.getText(ast) + ';';
    ts.forEachChild(node, visit);
}
visit(ast);
for (const name of names) if (!found[name]) throw Error('Missing helper ' + name);
const code = ts.transpileModule(Object.values(found).join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
const NS_DECLS = 'xmlns:ce="http://www.elsevier.com/xml/common/dtd" xmlns:sb="http://www.elsevier.com/xml/common/struct-bib/dtd" xmlns:xlink="http://www.w3.org/1999/xlink"';
const host = '<sb:host><sb:book><sb:title><sb:maintitle>Book</sb:maintitle></sb:title><sb:date>2025</sb:date></sb:book></sb:host>';
const ref = (inner = host, id = 'rf5') => `<sb:reference id="${id}">${inner}</sb:reference>`;
const bib = (inner, id = 'bb5') => `<ce:bib-reference id="${id}"><ce:label>1</ce:label>${inner}</ce:bib-reference>`;
const wrap = body => `<root ${NS_DECLS}>${body}</root>`;
const title = t => `<sb:contribution><sb:title><sb:maintitle>${t}</sb:maintitle></sb:title></sb:contribution>`;
const ehost = (doi, extra = '') => `<sb:host><sb:e-host><ce:inter-ref id="ir20" xlink:href="https://doi.org/${doi}">https://doi.org/${doi}</ce:inter-ref>${extra}</sb:e-host></sb:host>`;
const cases = [
    ['existing-empty', wrap(bib(ref() + '<ce:source-text id="se10"/>'))],
    ['existing-whitespace-no-id', wrap(bib(ref() + '<ce:source-text> </ce:source-text>'))],
    ['existing-missing-id', wrap(bib(ref() + '<ce:source-text>Original supplied text.</ce:source-text>'))],
    ['duplicate-source-id', wrap(bib(ref() + '<ce:source-text id="se10">First.</ce:source-text>') + bib(ref(host, 'rf15') + '<ce:source-text id="se10">Second.</ce:source-text>', 'bb15'))],
    ['multiple-reference-children', wrap(bib(ref(host, 'rf5') + ref(host.replace('Book', 'Book B'), 'rf15')))],
    ['multiple-reference-existing-second-source', wrap(bib(ref(host, 'rf5') + ref(host.replace('Book', 'Book B'), 'rf15') + '<ce:source-text id="se20">Supplied Book B text.</ce:source-text>'))],
    ['missing-all-ids', wrap('<ce:bib-reference><ce:label>1</ce:label><sb:reference>' + host + '<sb:host><sb:e-host><ce:inter-ref xlink:href="https://example.org">Site</ce:inter-ref></sb:e-host></sb:host></sb:reference></ce:bib-reference>')],
    ['other-ref-missing-id', wrap(bib('<ce:other-ref><ce:textref>Original other reference.</ce:textref></ce:other-ref>'))],
    ['duplicate-structured-id', wrap(bib(ref(host, 'rf5') + '<ce:source-text id="se10">First.</ce:source-text>') + bib(ref(host, 'rf5') + '<ce:source-text id="se20">Second.</ce:source-text>', 'bb15'))],
    ['misplaced-existing-source', wrap(bib('<ce:source-text id="se10">Supplied text.</ce:source-text>' + ref()))],
    ['trailing-note', wrap(bib(ref() + '<ce:note><ce:simple-para id="sp30">Reference note.</ce:simple-para></ce:note>'))],
    ['named-entity', wrap(bib(ref(title('An &alpha; title') + host)))],
    ['numeric-entity-control', wrap(bib(ref(title('An &#x3B1; title') + host)))],
    ['special-character-control', wrap(bib(ref(title('A &amp; B &lt; C') + host)))],
    ['inline-space', wrap(bib(ref(title('High<ce:hsp sp="1.0"/>quality evidence') + host)))],
    ['inline-formatting-control', wrap(bib(ref(title('High <ce:italic>quality</ce:italic> evidence') + host)))],
    ['cdata-existing-source', wrap(bib(ref() + '<ce:source-text id="se10"><![CDATA[Literal <token></token> text]]></ce:source-text>'))],
    ['cdata-title-comment', wrap(bib(ref(title('<![CDATA[Literal <token></token> text]]>') + '<sb:comment><!-- literal <empty></empty> --><![CDATA[Comment <word></word> text]]></sb:comment>' + host)))],
    ['comma-url', wrap(bib(ref('<sb:host><sb:e-host><ce:inter-ref id="ir20" xlink:href="https://example.org/a,,b">https://example.org/a,,b</ce:inter-ref></sb:e-host></sb:host>')))],
    ['paired-et-al', wrap(bib(ref('<sb:contribution><sb:authors><sb:author><ce:surname>Smith</ce:surname></sb:author><sb:et-al></sb:et-al></sb:authors></sb:contribution>' + host)))],
    ['paired-ellipsis', wrap(bib(ref('<sb:contribution><sb:authors><sb:author><ce:surname>Smith</ce:surname></sb:author><sb:ellipsis></sb:ellipsis><sb:author><ce:surname>Jones</ce:surname></sb:author></sb:authors></sb:contribution>' + host)))],
    ['local-math-namespace', wrap(bib(ref(title('Test <mml:math xmlns:mml="http://www.w3.org/1998/Math/MathML" altimg="gr1"><mml:mi>x</mml:mi></mml:math> title') + host)))],
    ['doi-migration-loses-metadata', wrap(bib(ref(host + ehost('10.1234/abc', '<sb:version>Version 2.1</sb:version><sb:date>2020</sb:date><sb:date-accessed day="5" month="10" year="2025"/>'))))],
    ['doi-migration-comment-accept', wrap(bib(ref(host + '<sb:comment>Available at</sb:comment>' + ehost('10.1234/abc')))), {autoAcceptRepairs: false, refDecisions: {bb5: 'accept'}}],
    ['doi-migration-comment-retain', wrap(bib(ref(host + '<sb:comment>Available at</sb:comment>' + ehost('10.1234/abc')))), {autoAcceptRepairs: false, refDecisions: {bb5: 'retain'}}],
    ['doi-migration-same-doi', wrap(bib(ref(host.replace('</sb:host>', '<ce:doi>10.1234/abc</ce:doi></sb:host>') + ehost('10.1234/abc'))))],
    ['doi-migration-link-metadata', wrap(bib(ref(host + ehost('10.1234/abc').replace('xlink:href=', 'versiondate="2025-10-07" xlink:href='))))],
    ['doi-migration-descriptive-label', wrap(bib(ref(host + ehost('10.1234/abc').replace('>https://doi.org/10.1234/abc<', '>Publisher website<'))))],
    ['doi-migration-duplicate-doi', wrap(bib(ref(host.replace('</sb:host>', '<ce:doi>10.1234/other</ce:doi></sb:host>') + ehost('10.1234/abc'))))],
    ['doi-migration-percent-suffix', wrap(bib(ref(host + ehost('10.1234/a%28b%29'))))],
    ['doi-display-punctuation', wrap(bib(ref('<sb:host><sb:e-host><ce:inter-ref id="ir20" xlink:href="https://doi.org/10.1234/abc">https://doi.org/10.1234/abc.</ce:inter-ref></sb:e-host></sb:host>')))],
    ['url-query-control', wrap(bib(ref('<sb:host><sb:e-host><ce:inter-ref id="ir20" xlink:href="https://example.org/?a=1&amp;b=2">https://example.org/?a=1&amp;b=2</ce:inter-ref></sb:e-host></sb:host>')))]
];
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage();
const records = [];
try {
    for (const [name, input, options = {}] of cases) {
        const result = await page.evaluate(({ code, input, NS_DECLS, options }) => {
            const result = { output: '', audit: [], scannerAudit: [], toast: [] };
            const noop = () => {};
            const params = {
                input, autoAcceptRepairs: options.autoAcceptRepairs ?? true, stats: { pending: 0 }, refDecisions: options.refDecisions || {}, resultMode: 'full', fixContributionLangtype: false, NS_DECLS,
                setOutput: x => result.output = x, setAuditData: x => result.audit = x, setToast: x => result.toast.push(x),
                setRefDecisions: noop, setMatrixFilter: noop, setActiveTab: noop, setIsProcessing: noop, setStep: noop, setSuggestions: noop,
                React: { createElement: noop }, Hash: 'Hash', LinkIcon: 'LinkIcon', Trash2: 'Trash2', Eraser: 'Eraser', RefreshCw: 'RefreshCw', SortAsc: 'SortAsc'
            };
            const run = new Function(...Object.keys(params), 'result', code + '\nanalyzeXml(); const scannerAudit = JSON.parse(JSON.stringify(result.audit)); executeRepair(); return scannerAudit;');
            result.scannerAudit = run(...Object.values(params), result);
            const parsed = new DOMParser().parseFromString(result.output, 'text/xml');
            result.wellFormed = !parsed.getElementsByTagName('parsererror').length;
            result.sourceTexts = Array.from(parsed.getElementsByTagName('ce:source-text')).map(n => ({ id: n.getAttribute('id'), text: n.textContent }));
            return result;
        }, { code, input, NS_DECLS, options });
        records.push({ name, input, ...result });
        console.log(JSON.stringify({ name, wellFormed: result.wellFormed, texts: result.sourceTexts, scanner: result.scannerAudit.map(a => a.msg), audit: result.audit.map(a => a.msg), errors: result.toast.filter(t => t.type === 'error') }));
    }
} finally { await browser.close(); }
const outputDirectory = process.argv[2] || 'artifacts/source-text-edge-audit';
fs.mkdirSync(outputDirectory, { recursive: true });
fs.writeFileSync(outputDirectory + '/browser-results.json', JSON.stringify(records, null, 2));
