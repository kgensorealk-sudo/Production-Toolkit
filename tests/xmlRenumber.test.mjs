import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../utils/xmlRenumberProfile.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { renumberWithProfile, ELSEVIER_PROFILE, parseRenumberProfile } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
const run = input => renumberWithProfile(input, ELSEVIER_PROFILE, '[', ']');
const missing = '<ce:bib-reference id="A"><ce:other-ref>Unlabelled</ce:other-ref></ce:bib-reference>';
const bib = (id, label) => `<ce:bib-reference id="${id}"><ce:label>${label}</ce:label></ce:bib-reference>`;
const cite = (id, label = '9') => `<ce:cross-ref refid="${id}">${label}</ce:cross-ref>`;

test('a missing first label cannot steal the next label or citation mapping', () => {
    const result = run(missing + bib('B', '9') + cite('A') + cite('B'));
    assert.equal(result.output, missing + bib('B', '[1]') + cite('A') + cite('B', '[1]'));
    assert.deepEqual(result.changes.map(item => item.id), ['A', 'B']);
    assert.equal(result.changes[0].missingLabel, true);
    assert.equal(result.changes[0].changed, false);
    assert.equal(result.missingLabelCount, 1);
});

test('a missing middle label leaves consecutive numbering of labelled references', () => {
    const result = run(bib('B', '9') + missing + bib('C', '10') + cite('C'));
    assert.equal(result.output, bib('B', '[1]') + missing + bib('C', '[2]') + cite('C', '[2]'));
    assert.deepEqual(result.changes.map(item => item.id), ['B', 'A', 'C']);
    assert.equal(result.missingLabelCount, 1);
});

test('an entirely unlabelled bibliography is preserved and reported as skipped', () => {
    const result = run(missing);
    assert.equal(result.output, missing);
    assert.equal(result.changes[0].missingLabel, true);
    assert.equal(result.missingLabelCount, 1);
});

test('ordinary numbering and report remain correct', () => {
    const result = run(bib('B', '[1]') + bib('C', '9') + cite('C'));
    assert.equal(result.output, bib('B', '[1]') + bib('C', '[2]') + cite('C', '[2]'));
    assert.deepEqual(result.changes.map(item => item.changed), [false, true]);
    assert.equal(result.missingLabelCount, 0);
});

test('a nested label is never used as the bibliography label', () => {
    const xml = '<ce:bib-reference id="A"><ce:other-ref><ce:label>nested</ce:label></ce:other-ref></ce:bib-reference>';
    const result = run(xml);
    assert.equal(result.output, xml);
    assert.equal(result.changes[0].missingLabel, true);
});

test('grouped citation with an unresolved target is preserved and flagged', () => {
    const citation = '<ce:cross-refs refid="B missing">9,10</ce:cross-refs>';
    const result = run(bib('B', '9') + citation);
    assert.equal(result.output, bib('B', '[1]') + citation);
    assert.ok(result.issues.some(i => i.target === 'B missing'));
});

test('label attributes, single quotes, comments and non-bibliographic citations are preserved', () => {
    const xml = `<!-- <ce:bib-reference id="fake"><ce:label>7</ce:label></ce:bib-reference> -->
<ce:figure id="fig1"/><ce:cross-ref refid="fig1">Fig. 1</ce:cross-ref>
<ce:bib-reference id='B'><ce:label role="number">9</ce:label><ce:other-ref><ce:label>nested</ce:label></ce:other-ref></ce:bib-reference>`;
    assert.equal(run(xml).output, xml.replace('<ce:label role="number">9', '<ce:label role="number">[1]'));
});

test('custom imported profile changes only its mapped elements', () => {
    const profile = parseRenumberProfile(readFileSync(new URL('../public/profiles/custom-example.json', import.meta.url), 'utf8'));
    const xml = '<!DOCTYPE article SYSTEM "custom.dtd"><article><reference id="r1"><label>8</label></reference><citation targets="r1">8</citation></article>';
    const result = renumberWithProfile(xml, profile, '(', ')');
    assert.equal(result.output, xml.replace('<label>8', '<label>(1)').replace('targets="r1">8', 'targets="r1">(1)'));
    assert.equal(result.issues.length, 0);
});

test('rejects incompatible declared DTD, malformed profile, duplicate IDs and malformed XML', () => {
    assert.throws(() => run('<!DOCTYPE article SYSTEM "other.dtd">' + bib('B', '9')), /matching profile/);
    assert.throws(() => parseRenumberProfile('{"schemaVersion":2}'), /metadata/);
    assert.throws(() => run(bib('B', '9') + bib('B', '10')), /Duplicate ID/);
    assert.throws(() => run('<ce:bib-reference></wrong>'), /Mismatched/);
});

test('required first label is enforced and custom delimiters are XML escaped', () => {
    const xml = '<ce:bib-reference id="B"><ce:other-ref/><ce:label>9</ce:label></ce:bib-reference>';
    assert.equal(run(xml).output, xml);
    assert.match(run(xml).changes[0].issue, /first child/);
    assert.equal(renumberWithProfile(bib('B', '9'), ELSEVIER_PROFILE, '&', '<').output, bib('B', '&amp;1&lt;'));
});

test('internal subset and CDATA are preserved without resolving entities', () => {
    const declaration = '<!DOCTYPE article SYSTEM "art570.dtd" [<!ENTITY sample "text">]>';
    const cdata = '<![CDATA[<ce:label>not a label</ce:label>]]>';
    assert.equal(run(declaration + cdata + bib('B', '9')).output, declaration + cdata + bib('B', '[1]'));
});

test('self-closing labels and citations receive numbers with attributes preserved', () => {
    const xml = '<ce:bib-reference id="B"><ce:label/></ce:bib-reference>';
    assert.equal(run(xml).output, bib('B', '[1]'));
    assert.equal(run(xml + '<ce:cross-ref refid="B" id="c1"/>').output,
        bib('B', '[1]') + '<ce:cross-ref refid="B" id="c1">[1]</ce:cross-ref>');
});

test('unknown prototype-property targets cannot resolve as numbers', () => {
    const citation = cite('toString');
    const result = run(bib('B', '9') + citation);
    assert.equal(result.output, bib('B', '[1]') + citation);
    assert.equal(result.issues.length, 1);
});

test('fully resolved groups collapse ranges, sort and deduplicate numbers', () => {
    const xml = bib('A', '9') + bib('B', '10') + bib('C', '11') + '<ce:cross-refs refid="C A B A">9–11</ce:cross-refs>';
    assert.ok(run(xml).output.endsWith('<ce:cross-refs refid="C A B A">[1–3]</ce:cross-refs>'));
    assert.deepEqual(run(xml).uncitedIds, []);
});

test('missing ID appears in the QC report', () => {
    const result = run('<ce:bib-reference><ce:label>9</ce:label></ce:bib-reference>');
    assert.equal(result.changes.length, 1);
    assert.match(result.changes[0].issue, /Missing reference ID/);
    assert.equal(result.processed, 0);
});

test('fake doctype inside comment does not select a DTD', () => {
    assert.equal(run('<!-- <!DOCTYPE article SYSTEM "wrong.dtd"> -->' + bib('B', '9')).processed, 1);
});

test('invalid and duplicate attributes stop processing', () => {
    for (const xml of ['<ce:bib-reference id=B/>', '<ce:bib-reference id="A" id="B"/>', '<ce:bib-reference id="A" garbage/>', '<ce:bib-reference id="A"></ce:bib-reference invalid>']) {
        assert.throws(() => run(xml), /attribute|closing tag/);
    }
});

test('encoded IDs resolve without rewriting attribute spelling', () => {
    const xml = '<ce:bib-reference id="&#66;"><ce:label>9</ce:label></ce:bib-reference>' + cite('B');
    assert.equal(run(xml).output, '<ce:bib-reference id="&#66;"><ce:label>[1]</ce:label></ce:bib-reference>' + cite('B', '[1]'));
});

test('external citation brackets are not doubled', () => {
    const xml = bib('B', '9') + '[' + cite('B') + ']';
    assert.equal(run(xml).output, bib('B', '[1]') + cite('B', '[1]'));
});

test('nested citations remain unchanged with issues rather than overlapping edits', () => {
    const citation = '<ce:cross-ref refid="B"><ce:italic>' + cite('B') + '</ce:italic></ce:cross-ref>';
    const result = run(bib('B', '9') + citation);
    assert.equal(result.output, bib('B', '[1]') + citation);
    assert.equal(result.issues.length, 2);
});

test('nested bibliography references stop processing', () => {
    assert.throws(() => run('<ce:bib-reference id="A"><ce:label>9</ce:label>' + bib('B', '10') + '</ce:bib-reference>'), /Nested bibliography/);
});

test('skipped reference targets are preserved in grouped citations', () => {
    const citation = '<ce:cross-refs refid="A B">9,10</ce:cross-refs>';
    const result = run(missing + bib('B', '9') + citation);
    assert.ok(result.output.endsWith(citation));
    assert.ok(result.issues.some(issue => issue.target === 'A B'));
});

test('comments in internal subsets do not corrupt tag boundaries', () => {
    assert.equal(run('<!DOCTYPE article SYSTEM "art570.dtd" [<!-- ] --> <!ENTITY sample "text">]>' + bib('B', '9')).processed, 1);
});
