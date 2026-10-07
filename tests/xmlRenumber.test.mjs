import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../utils/xmlRenumberProfile.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { renumberWithProfile, ELSEVIER_PROFILE, parseRenumberProfile, accountRenumberProfile } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
const run = input => renumberWithProfile(input, ELSEVIER_PROFILE, '[', ']');
const missing = '<ce:bib-reference id="A"><ce:other-ref>Unlabelled</ce:other-ref></ce:bib-reference>';
const bib = (id, label) => `<ce:bib-reference id="${id}"><ce:label>${label}</ce:label></ce:bib-reference>`;
const cite = (id, label = '9') => `<ce:cross-ref refid="${id}">${label}</ce:cross-ref>`;

test('outer citation brackets adopt configured delimiters without double wrapping', () => {
    const cases = [
        '[' + cite('B') + ']',
        '[' + cite('B') + ', p. 25]',
        '[' + cite('B', '<ce:italic>9</ce:italic>') + ', ' + cite('C', '10') + ']',
        '(' + cite('B') + ', pp. 25–27)'
    ];
    for (const content of cases) {
        const xml = bib('B', '9') + bib('C', '10') + '<ce:para>' + content + '</ce:para>';
        for (const [prefix, suffix] of [['(', ')'], ['{', '}'], ['', '']]) {
            const result = renumberWithProfile(xml, ELSEVIER_PROFILE, prefix, suffix);
            const expected = prefix + content.slice(1, -1).replace('>9<', '>1<').replace('>10<', '>2<') + suffix;
            assert.ok(result.output.endsWith('<ce:para>' + expected + '</ce:para>'));
            assert.equal(result.issues.length, 0);
            assert.equal(renumberWithProfile(result.output, ELSEVIER_PROFILE, prefix, suffix).output, result.output);
        }
    }
    const empty = '<ce:para>[' + cite('B', '') + ']</ce:para>';
    const result = renumberWithProfile(bib('B', '9') + empty, ELSEVIER_PROFILE, '(', ')');
    assert.ok(result.output.endsWith(empty));
    assert.match(result.issues[0].message, /Empty bibliography citation/);
});

test('previous text affixes are inferred from original labels, never guessed from prose', () => {
    for (const [prefix, suffix] of [['Ref. ', ''], ['ref-', '.'], ['<', '&>']]) {
        const first = renumberWithProfile(bib('B', '9') + cite('B', '<ce:italic>9, p. 25</ce:italic>'), ELSEVIER_PROFILE, prefix, suffix);
        const result = run(first.output);
        assert.equal(result.output, bib('B', '[1]') + cite('B', '<ce:italic>[1, p. 25]</ce:italic>'));
        assert.equal(result.issues.length, 0);
        assert.equal(run(result.output).output, result.output);
    }
    const unmatched = run(bib('B', '9') + cite('B', 'Ref. 9'));
    assert.ok(unmatched.output.endsWith(cite('B', 'Ref. 9')));
    assert.ok(unmatched.issues.length);
});

test('existing curly-brace citations adopt the configured format and retain locators', () => {
    for (const [before, after] of [
        ['{9}', '[1]'],
        ['{9, p. 25}', '[1, p. 25]'],
        ['<ce:italic>{9, pp. 25–27}</ce:italic>', '<ce:italic>[1, pp. 25–27]</ce:italic>']
    ]) {
        const result = run(bib('B', '{9}') + cite('B', before));
        assert.equal(result.output, bib('B', '[1]') + cite('B', after));
        assert.equal(result.issues.length, 0);
        assert.equal(run(result.output).output, result.output);
    }
    const grouped = '<ce:cross-refs refid="B C">{9,10}</ce:cross-refs>';
    const result = run(bib('B', '{9}') + bib('C', '{10}') + grouped);
    assert.ok(result.output.endsWith(grouped.replace('{9,10}', '[1,2]')));
    assert.equal(result.issues.length, 0);
    const first = renumberWithProfile(bib('B', '9') + cite('B'), ELSEVIER_PROFILE, '{', '}');
    assert.equal(run(first.output).output, bib('B', '[1]') + cite('B', '[1]'));
    const ambiguous = run(bib('B', '9') + cite('B', '{see 9}'));
    assert.ok(ambiguous.output.endsWith(cite('B', '{see 9}')));
    assert.ok(ambiguous.issues.length);
});

test('shared outer brackets and external page locators do not acquire inner brackets', () => {
    for (const [before, after] of [
        ['[' + cite('B') + ', p. 25]', '[' + cite('B', '1') + ', p. 25]'],
        ['[' + cite('B') + ', ' + cite('C', '10') + ']', '[' + cite('B', '1') + ', ' + cite('C', '2') + ']'],
        ['[' + cite('B', '<ce:italic>9</ce:italic>') + ', pp. 25–27]', '[' + cite('B', '<ce:italic>1</ce:italic>') + ', pp. 25–27]'],
        ['[' + cite('B') + '–' + cite('C', '10') + ']', '[' + cite('B', '1') + '–' + cite('C', '2') + ']']
    ]) {
        const result = run(bib('B', '9') + bib('C', '10') + '<ce:para id="p1">' + before + '</ce:para>');
        assert.ok(result.output.endsWith('<ce:para id="p1">' + after + '</ce:para>'));
        assert.equal(result.issues.length, 0);
        assert.equal(run(result.output).output, result.output);
    }
});

test('bracket detection does not cross unrelated markup or paragraph boundaries', () => {
    const xml = bib('B', '9') + '<ce:para>[see ' + cite('B') + ', p. 25]</ce:para><ce:para>[' + cite('B') + '</ce:para><ce:para>, p. 25]</ce:para>';
    const result = run(xml);
    assert.equal((result.output.match(/>\[1\]<\/ce:cross-ref>/g) || []).length, 2);
});

test('automatic citation ID repair is optional, unique, reported, and repeatable', () => {
    const xml = bib('B', '9') + '<ce:cross-ref id="cf0005" refid="B">9</ce:cross-ref><ce:cross-ref id="cf&#48;005" refid="B"><ce:italic>9</ce:italic></ce:cross-ref><ce:cross-refs id="cf0005" refid="B">9</ce:cross-refs><ce:para id="cf0006">Text</ce:para>';
    assert.throws(() => run(xml), /Duplicate citation ID/);
    const result = renumberWithProfile(xml, ELSEVIER_PROFILE, '[', ']', true, true, true);
    assert.ok(result.output.includes('id="cf0005" refid="B">[1]'));
    assert.ok(result.output.includes('id="cf0007" refid="B"><ce:italic>[1]</ce:italic>'));
    assert.ok(result.output.includes('id="cf0008" refid="B">[1]'));
    assert.equal(result.issues.filter(issue => /ID repaired/.test(issue.message)).length, 2);
    const again = renumberWithProfile(result.output, ELSEVIER_PROFILE, '[', ']', true, true, true);
    assert.equal(again.output, result.output);
    assert.equal(again.issues.length, 0);
});

test('automatic ID repair keeps other owners and refuses ambiguous incoming links', () => {
    const citation = '<ce:cross-ref id="cf1" refid="B">9</ce:cross-ref>';
    const xml = bib('B', '9') + citation + '<ce:para id="cf1">Text</ce:para>';
    const result = renumberWithProfile(xml, ELSEVIER_PROFILE, '[', ']', true, true, true);
    assert.ok(result.output.includes('<ce:cross-ref id="cf2" refid="B">[1]'));
    assert.ok(result.output.endsWith('<ce:para id="cf1">Text</ce:para>'));
    for (const link of ['<ce:cross-ref refid="cf1">link</ce:cross-ref>', '<ce:link href="#cf1"/>']) {
        assert.throws(() => renumberWithProfile(xml + link, ELSEVIER_PROFILE, '[', ']', true, true, true), /cannot determine the intended target/);
    }
});

test('automatic ID repair respects custom mappings and quoted attributes', () => {
    const profile = { ...ELSEVIER_PROFILE, elements: { reference: 'ref', label: 'label', singleCitation: 'cite', groupedCitation: 'cites' }, attributes: { id: 'key', targets: 'target' } };
    const xml = "<ref key='r1'><label>9</label></ref><cite key = 'c' target='r1'>9</cite><cite key='c' target='r1'>9</cite>";
    const result = renumberWithProfile(xml, profile, '[', ']', true, true, true);
    assert.ok(result.output.endsWith("<cite key='c_2' target='r1'>[1]</cite>"));
});

test('duplicate bibliography citation IDs stop numbering, including collisions with other elements', () => {
    const single = '<ce:cross-ref id="cf1" refid="B">9</ce:cross-ref>';
    const grouped = '<ce:cross-refs id="cf1" refid="B C">9,10</ce:cross-refs>';
    for (const collision of [single, grouped, '<ce:para id="cf1">Text</ce:para>', '<ce:cross-ref id="cf&#49;" refid="B">9</ce:cross-ref>']) {
        assert.throws(() => run(bib('B', '9') + bib('C', '10') + single + collision), /Duplicate citation ID cf1/);
    }
    const missingLabel = '<ce:bib-reference id="B"><ce:other-ref><ce:textref>Unlabelled</ce:textref></ce:other-ref></ce:bib-reference>';
    assert.throws(() => run(missingLabel + single + single), /Duplicate citation ID cf1/);
});

test('repeated reference targets are allowed and unrelated duplicate IDs stay outside numbering scope', () => {
    const citations = '<ce:cross-ref id="cf1" refid="B">9</ce:cross-ref><ce:cross-ref id="cf2" refid="B">9</ce:cross-ref>';
    const result = run(bib('B', '9') + citations);
    assert.equal(result.issues.length, 0);
    assert.ok(result.output.endsWith(citations.replaceAll('>9<', '>[1]<')));
    const unrelated = '<ce:figure id="f1"/><ce:cross-ref id="figureLink" refid="f1">Fig. 1</ce:cross-ref><ce:cross-ref id="figureLink" refid="f1">Fig. 1</ce:cross-ref>';
    assert.ok(run(bib('B', '9') + unrelated).output.endsWith(unrelated));
});

test('duplicate citation detection respects custom profile attribute and element mappings', () => {
    const profile = { ...ELSEVIER_PROFILE, elements: { reference: 'ref', label: 'label', singleCitation: 'cite', groupedCitation: 'cites' }, attributes: { id: 'key', targets: 'target' } };
    const xml = '<ref key="r1"><label>9</label></ref><cite key="c1" target="r1">9</cite><cites key="c1" target="r1">9</cites>';
    assert.throws(() => renumberWithProfile(xml, profile, '[', ']'), /Duplicate citation ID c1/);
});

test('configured citation affixes work on existing text and repeated output', () => {
    for (const [prefix, suffix] of [['{', '}'], ['Ref. ', ''], ['', '.'], ['<', '&>'], [' ', ' ']]) {
        for (const formatted of [false, true]) {
            const content = formatted ? '<ce:italic>9, p. 25</ce:italic>' : '9, p. 25';
            const xml = bib('B', '9') + cite('B', content);
            const first = renumberWithProfile(xml, ELSEVIER_PROFILE, prefix, suffix);
            assert.equal(first.issues.length, 0);
            const second = renumberWithProfile(first.output, ELSEVIER_PROFILE, prefix, suffix);
            assert.equal(second.issues.length, 0);
            assert.equal(second.output, first.output);
        }
    }
    const result = renumberWithProfile(bib('B', '9') + cite('B', '{9}'), ELSEVIER_PROFILE, '{', '}');
    assert.equal(result.output, bib('B', '{1}') + cite('B', '{1}'));
    assert.equal(result.issues.length, 0);
});

test('encoded citation digits and locator whitespace renumber without losing entity spelling', () => {
    for (const text of ['&#57;', '&#x39;', '&#91;&#57;, p.&#160;25&#93;']) {
        const result = run(bib('B', '9') + cite('B', text));
        assert.equal(result.issues.length, 0);
        assert.equal(result.output, bib('B', '[1]') + cite('B', text.includes('p.') ? '[1, p.&#160;25]' : '[1]'));
        assert.equal(run(result.output).output, result.output);
    }
    const grouped = '<ce:cross-refs refid="A B"><ce:italic>&#57;&#44;&#x31;0</ce:italic></ce:cross-refs>';
    const result = run(bib('A', '9') + bib('B', '10') + grouped);
    assert.equal(result.issues.length, 0);
    assert.ok(result.output.endsWith('<ce:cross-refs refid="A B"><ce:italic>[1,2]</ce:italic></ce:cross-refs>'));
    const unresolved = run(bib('B', '9') + cite('B', '9, p.&unknown;25'));
    assert.ok(unresolved.issues.length);
    assert.ok(unresolved.output.endsWith(cite('B', '9, p.&unknown;25')));
});

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

test('self-closing labels receive numbers but empty citations remain unchanged for review', () => {
    const xml = '<ce:bib-reference id="B"><ce:label/></ce:bib-reference>';
    assert.equal(run(xml).output, bib('B', '[1]'));
    assert.equal(run(xml + '<ce:cross-ref refid="B" id="c1"/>').output,
        bib('B', '[1]') + '<ce:cross-ref refid="B" id="c1"/>');
});

test('empty bibliography citations are preserved and flagged for author-correction review', () => {
    for (const content of ['', ' \n ', '&#160;', '<ce:italic></ce:italic>', '<ce:italic/>']) {
        const citation = `<ce:cross-ref id="cf1" refid="B">${content}</ce:cross-ref>`;
        const result = run(bib('B', '9') + citation);
        assert.equal(result.output, bib('B', '[1]') + citation);
        assert.equal(result.issues.length, 1);
        assert.match(result.issues[0].message, /Empty bibliography citation \(cf1\).*intentionally deleted.*author's corrections/);
    }
    const grouped = '<ce:cross-refs id="cf2" refid="B C"/>';
    const result = run(bib('B', '9') + bib('C', '10') + grouped);
    assert.ok(result.output.endsWith(grouped));
    assert.match(result.issues[0].message, /Empty bibliography citation/);
    const unrelated = '<ce:figure id="f1"/><ce:cross-ref refid="f1"/>';
    assert.equal(run(bib('B', '9') + unrelated).issues.length, 0);
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

test('citation formatting and nested IDs survive renumbering', () => {
    const citation = '<ce:cross-ref refid="B">\n  <ce:italic id="style1"><ce:bold>9</ce:bold></ce:italic>\n</ce:cross-ref>';
    const link = cite('style1', 'linked text');
    const result = run(bib('B', '9') + citation + link);
    assert.equal(result.output, bib('B', '[1]') + citation.replace('>9<', '>[1]<') + link);
    assert.equal(result.issues.length, 0);
    assert.equal(run(result.output).output, result.output);
});

test('external brackets normalize without deleting citation formatting', () => {
    const citation = '<ce:cross-ref refid="B"><ce:sup id="s1">9</ce:sup></ce:cross-ref>';
    assert.equal(run(bib('B', '9') + '[' + citation + ']').output, bib('B', '[1]') + citation.replace('>9<', '>[1]<'));
});

test('ambiguous or unsupported citation markup remains unchanged and flagged', () => {
    for (const content of ['<ce:italic id="i1">9</ce:italic>,<ce:bold>10</ce:bold>', '<unknown id="u1">9</unknown>', '<ce:italic>see 9</ce:italic>', '<ce:italic><!-- note -->9</ce:italic>', '<!-- note -->9', '<![CDATA[9]]>']) {
        const citation = '<ce:cross-ref refid="B">' + content + '</ce:cross-ref>';
        const result = run(bib('B', '9') + citation);
        assert.equal(result.output, bib('B', '[1]') + citation);
        assert.ok(result.issues.some(issue => /Complex citation markup/.test(issue.message)));
    }
});

test('grouped numeric citation can keep a formatting wrapper', () => {
    const citation = '<ce:cross-refs refid="A B"><ce:bold id="b1">9,10</ce:bold></ce:cross-refs>';
    assert.equal(run(bib('A', '9') + bib('B', '10') + citation).output, bib('A', '[1]') + bib('B', '[2]') + citation.replace('>9,10<', '>[1,2]<'));
});

test('formatting toggle defaults to retain and can remove unlinked wrappers', () => {
    const citation = '<ce:cross-ref refid="B"><ce:italic id="unused"><ce:bold>9</ce:bold></ce:italic></ce:cross-ref>';
    const xml = bib('B', '9') + citation;
    assert.equal(run(xml).output, bib('B', '[1]') + citation.replace('>9<', '>[1]<'));
    const result = renumberWithProfile(xml, ELSEVIER_PROFILE, '[', ']', false);
    assert.equal(result.output, bib('B', '[1]') + cite('B', '[1]'));
    assert.equal(result.issues.length, 0);
});

test('remove formatting protects linked IDs and leaves unrelated links alone', () => {
    const citation = '<ce:cross-ref refid="B"><ce:italic id="style1">9</ce:italic></ce:cross-ref>';
    const link = cite('style1', 'linked text');
    const result = renumberWithProfile(bib('B', '9') + citation + link, ELSEVIER_PROFILE, '[', ']', false);
    assert.equal(result.output, bib('B', '[1]') + citation.replace('>9<', '>[1]<') + link);
    assert.ok(result.issues.some(issue => /linked ID/.test(issue.message)));
});

test('single-reference page locators survive renumbering and a second pass', () => {
    for (const text of ['[9, p. 25]', '9, pp. 25–27', ' [9,  pp. 25-27, 30] ']) {
        const xml = bib('B', '9') + cite('B', text);
        const result = run(xml);
        assert.ok(result.output.includes(text.includes('pp.') ? 'pp.' : 'p.'));
        assert.ok(result.output.includes('25'));
        assert.equal(result.issues.length, 0);
        assert.equal(run(result.output).output, result.output);
    }
    assert.equal(run(bib('B', '9') + cite('B', '[9, p. 25]')).output, bib('B', '[1]') + cite('B', '[1, p. 25]'));
});

test('formatted page locators survive both formatting-toggle modes', () => {
    const xml = bib('B', '9') + '<ce:cross-ref refid="B"><ce:italic>9, pp. 25–27</ce:italic></ce:cross-ref>';
    assert.equal(run(xml).output, bib('B', '[1]') + '<ce:cross-ref refid="B"><ce:italic>[1, pp. 25–27]</ce:italic></ce:cross-ref>');
    assert.equal(renumberWithProfile(xml, ELSEVIER_PROFILE, '[', ']', false).output, bib('B', '[1]') + cite('B', '[1, pp. 25–27]'));
});

test('ambiguous plain text and grouped page locators are left unchanged with QC issues', () => {
    for (const citation of [cite('B', 'see 9'), cite('B', '9,10'), '<ce:cross-refs refid="B C">9,10, p. 25</ce:cross-refs>']) {
        const result = run(bib('B', '9') + bib('C', '10') + citation);
        assert.ok(result.output.endsWith(citation));
        assert.ok(result.issues.some(issue => /Ambiguous citation text/.test(issue.message)));
    }
});

test('label formatting defaults to retained and respects prefix and suffix', () => {
    const xml = '<ce:bib-reference id="B"><ce:label><ce:italic>9</ce:italic></ce:label></ce:bib-reference>' + cite('B');
    assert.equal(run(xml).output, xml.replace('>9</ce:italic>', '>[1]</ce:italic>').replace('>9</ce:cross-ref>', '>[1]</ce:cross-ref>'));
    assert.equal(renumberWithProfile(xml, ELSEVIER_PROFILE, '(', ')').output, xml.replace('>9</ce:italic>', '>(1)</ce:italic>').replace('>9</ce:cross-ref>', '>(1)</ce:cross-ref>'));
    const result = renumberWithProfile(xml, ELSEVIER_PROFILE, '', '', true, false);
    assert.equal(result.output, bib('B', '1') + cite('B', '1'));
    assert.equal(run(run(xml).output).output, run(xml).output);
    assert.equal(run(run(xml).output).changes[0].changed, false);
});

test('complex labels preserve their structure and citations for review', () => {
    const xml = '<ce:bib-reference id="B"><ce:label><ce:italic>9</ce:italic><ce:bold>a</ce:bold></ce:label></ce:bib-reference>' + cite('B');
    const result = run(xml);
    assert.equal(result.output, xml);
    assert.equal(result.processed, 0);
    assert.ok(result.changes[0].issue);
});

test('custom profiles belong to the importing administrator only', () => {
    const custom = parseRenumberProfile(readFileSync(new URL('../public/profiles/custom-example.json', import.meta.url), 'utf8'));
    const profiles = { adminA: custom };
    assert.equal(accountRenumberProfile(true, 'adminA', profiles).name, custom.name);
    assert.equal(accountRenumberProfile(true, 'adminB', profiles), ELSEVIER_PROFILE);
    assert.equal(accountRenumberProfile(false, 'regularUser', profiles), ELSEVIER_PROFILE);
    assert.equal(accountRenumberProfile(false, 'adminA', profiles), ELSEVIER_PROFILE);
    assert.equal(accountRenumberProfile(true, undefined, profiles), ELSEVIER_PROFILE);
    assert.equal(accountRenumberProfile(true, 'adminA', { adminA: {} }), ELSEVIER_PROFILE);
});
