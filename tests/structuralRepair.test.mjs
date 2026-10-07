import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../pages/StructuralNodeArchitect.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const compile = code => ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const helper = name => {
    const start = source.indexOf(`    const ${name} =`);
    const end = source.indexOf('\n    };', start) + '\n    };'.length;
    return compile(source.slice(start, end)) + `\nreturn ${name};`;
};

test('duplicate label detection selects direct bibliography labels, preserving nested labels', () => {
    const line = source.split('\n').find(line => line.includes('const directLabels ='));
    const directLabels = new Function(compile(line) + '\nreturn directLabels;')();
    const outer = { tagName: 'ce:label' };
    const nested = { tagName: 'ce:label' };
    const structured = { tagName: 'sb:reference', children: [nested] };
    assert.deepEqual(directLabels({ children: [outer, structured] }), [outer]);
    assert.deepEqual(directLabels({ children: [structured] }), []);
    assert.deepEqual(directLabels({ children: [outer, { tagName: 'ce:label' }, structured] }).length, 2);
    assert.equal(source.includes('Array.from(ref.getElementsByTagName("ce:label"))'), false);
});

test('XML sanitation retains empty labels in both equivalent forms', () => {
    const sanitize = new Function(helper('sanitizeXmlTags'))();
    for (const label of ['<ce:label/>', '<ce:label></ce:label>', '<ce:label> </ce:label>']) {
        const xml = '<ce:bib-reference id="bb1">' + label + '<ce:other-ref><ce:textref>Reference</ce:textref></ce:other-ref></ce:bib-reference>';
        assert.equal(sanitize(xml), xml);
    }
});

test('DOM empty-element pruning preserves a required bibliography label', () => {
    const prune = new Function(helper('pruneEmptyElements'))();
    let removed = false;
    const label = { tagName: 'ce:label', children: [], attributes: [], textContent: '', parentNode: { removeChild() { removed = true; } } };
    prune(label);
    assert.equal(removed, false);
});

test('unparseable repair fragments return their original source and a review warning', () => {
    const start = source.indexOf('                const fragmentDoc = parser.parseFromString', source.indexOf('const executeRepair'));
    const end = source.indexOf('                // Clean duplicate labels', start);
    const code = compile(source.slice(start, end));
    const run = new Function('parser', 'wrappedBlock', 'fullBlock', 'refId', 'refLabel', 'finalAudit', 'refIndex', code);
    const original = '<ce:bib-reference id="bb1"><ce:label>1</ce:label>&publisherEntity;</ce:bib-reference>';
    for (const hasError of [true, false]) {
        const audit = [];
        const parser = { parseFromString() { return { getElementsByTagName(name) { return name === 'parsererror' && hasError ? [{}] : []; } }; } };
        assert.equal(run(parser, original, original, 'bb1', '1', audit, 0), original);
        assert.equal(audit[0].status, 'warning');
        assert.match(audit[0].msg, /original XML retained/);
    }
});

// Minimal DOM fixture for exercising the actual source-text generator.
function sourceElement(tagName, content = [], attributes = {}) {
    const childNodes = typeof content === 'string' ? [] : content.map(child => typeof child === 'string' ? sourceElement('#text', child) : child);
    const children = childNodes.filter(child => child.nodeType === 1);
    const node = {
        tagName, children, childNodes, parentElement: null, nodeType: tagName === '#text' ? 3 : 1,
        cloneNode(deep) { return sourceElement(tagName, typeof content === 'string' ? content : deep ? childNodes.map(child => child.cloneNode(true)) : [], attributes); },
        appendChild(child) { children.push(child); childNodes.push(child); child.parentElement = this; return child; },
        get textContent() { return typeof content === 'string' ? content : childNodes.map(child => child.textContent).join(''); },
        getAttribute(name) { return attributes[name] ?? null; },
        getElementsByTagName(name) {
            return children.flatMap(child => [...(child.tagName === name ? [child] : []), ...child.getElementsByTagName(name)]);
        }
    };
    childNodes.forEach(child => { child.parentElement = node; });
    return node;
}

const generateSourceText = new Function(helper('generateSourceText'))();
const e = sourceElement;

test('source text emits a year-only reference once', () => {
    assert.equal(generateSourceText(e('sb:reference', [e('sb:host', [e('sb:date', '2025')])])), '(2025).');
});

test('source text keeps a host title separate from the contribution title', () => {
    const host = () => e('sb:host', [e('sb:maintitle', 'Journal title'), e('sb:date', '2025')]);
    assert.equal(generateSourceText(e('sb:reference', [host()])), 'Journal title, (2025).');
    assert.equal(generateSourceText(e('sb:reference', [e('sb:contribution', [e('sb:maintitle', 'Article title')]), host()])), 'Article title. Journal title, (2025).');
});

test('source text includes book edition, publisher, and location', () => {
    const ref = e('sb:reference', [
        e('sb:contribution', [e('sb:maintitle', 'Book title')]),
        e('sb:host', [e('sb:date', '2025'), e('sb:edition', '2nd ed.'),
            e('sb:publisher', [e('ce:name', 'Example Press'), e('ce:location', 'London')])])
    ]);
    assert.equal(generateSourceText(ref), 'Book title. (2025), 2nd ed., Example Press, London.');
});

test('source text retains an authored journal citation with DOI and pages', () => {
    const ref = e('sb:reference', [
        e('sb:contribution', [e('sb:authors', [e('sb:author', [e('ce:given-name', 'A.B.'), e('ce:surname', 'Smith')])]), e('sb:maintitle', 'Article title')]),
        e('sb:host', [e('sb:maintitle', 'Journal'), e('sb:date', '2025'), e('sb:volume-nr', '3'), e('sb:issue-nr', '2'),
            e('sb:pages', [e('sb:first-page', '10'), e('sb:last-page', '20')]), e('ce:doi', '10.1234/example')])
    ]);
    assert.equal(generateSourceText(ref), 'A.B. Smith, (2025). Article title. Journal, 3(2) 10–20, https://doi.org/10.1234/example.');
});

test('missing source text is generated after name and DOI repairs; existing content is retained', () => {
    const repair = source.slice(source.indexOf('const executeRepair'));
    const generation = repair.indexOf('const generatedText = generateSourceText(sbRef)');
    assert.ok(generation > repair.indexOf('// Name Repair'));
    assert.ok(generation > repair.indexOf('// DOI Migration'));
    const existingBranch = repair.slice(repair.indexOf('} else if (sourceText)'), repair.indexOf('// Prune empty DOM elements'));
    assert.equal(existingBranch.includes('sourceText.textContent ='), false);
});


test('source text uses sb:author with ce name fields and excludes invalid ce:author nodes', () => {
    const person = (tag, surname) => e(tag, [e('ce:given-name', 'A.'), e('ce:surname', surname)]);
    const ref = e('sb:reference', [e('sb:contribution', [
        e('sb:authors', [person('sb:author', 'First'), person('ce:author', 'Invalid'), person('sb:author', 'Second')]),
        e('sb:title', [e('sb:maintitle', 'Article title')])
    ])]);
    assert.equal(generateSourceText(ref), 'A. First, A. Second. Article title.');
});


test('source text preserves collaboration and individual author order using sb tags', () => {
    const ref = e('sb:reference', [e('sb:contribution', [e('sb:authors', [
        e('sb:collaboration', 'First Group'),
        e('sb:author', [e('ce:given-name', 'A.'), e('ce:surname', 'Smith')]),
        e('ce:collaboration', 'Invalid Group'),
        e('sb:collaboration', 'Last Group')
    ])])]);
    assert.equal(generateSourceText(ref), 'First Group, A. Smith, Last Group.');
});

test('source text keeps et-al and ellipsis markers at their original positions', () => {
    const person = surname => e('sb:author', [e('ce:given-name', 'A.'), e('ce:surname', surname)]);
    const ref = e('sb:reference', [e('sb:contribution', [e('sb:authors', [
        person('First'), e('sb:et-al'), e('sb:collaboration', 'Group'),
        person('Second'), e('sb:ellipsis'), person('Last')
    ])])]);
    assert.equal(generateSourceText(ref), 'A. First, et al., Group, A. Second, … A. Last.');
    assert.equal(generateSourceText(e('sb:reference', [e('sb:contribution', [e('sb:authors', [person('First'), e('sb:et-al')])])])), 'A. First, et al.');
});


test('source text keeps multiple hosts separate in XML order without mixing their fields', () => {
    const ref = e('sb:reference', [
        e('sb:host', [e('sb:book', [e('sb:title', [e('sb:maintitle', 'Book A')]), e('sb:date', '2001')])]),
        e('sb:host', [e('sb:book', [e('sb:title', [e('sb:maintitle', 'Book B')]), e('sb:volume-nr', '9'), e('sb:date', '2025')]),
            e('sb:pages', [e('sb:first-page', '100'), e('sb:last-page', '120')])])
    ]);
    assert.equal(generateSourceText(ref), 'Book A, (2001). Book B, 9, (2025) 100–120.');
});

test('multiple hosts include contribution and reference-level comments only once', () => {
    const ref = e('sb:reference', [
        e('sb:contribution', [e('sb:authors', [e('sb:author', [e('ce:given-name', 'A.'), e('ce:surname', 'Smith')])]), e('sb:title', [e('sb:maintitle', 'Article')])]),
        e('sb:host', [e('sb:maintitle', 'Journal A'), e('sb:date', '2001'), e('ce:doi', '10.1234/a')]),
        e('sb:host', [e('sb:maintitle', 'Journal B'), e('sb:date', '2025'), e('sb:pages', '100–120')]),
        e('sb:comment', 'Additional information')
    ]);
    assert.equal(generateSourceText(ref), 'A. Smith. Article. Journal A, (2001), https://doi.org/10.1234/a. Journal B, (2025) 100–120. Additional information.');
});


test('source text includes contribution and host subtitles without repeating punctuation', () => {
    const ref = e('sb:reference', [
        e('sb:contribution', [e('sb:title', [e('sb:maintitle', 'Main:'), e('sb:subtitle', 'Subtitle')])]),
        e('sb:host', [e('sb:book', [e('sb:title', [e('sb:maintitle', 'Book'), e('sb:subtitle', 'Book subtitle')]), e('sb:date', '2025')])])
    ]);
    assert.equal(generateSourceText(ref), 'Main: Subtitle. Book: Book subtitle, (2025).');
});

test('source text retains supplied inter-ref labels and href targets, without duplicating identical URLs', () => {
    for (const [label, href, expected] of [
        ['Publisher website', 'https://example.org/paper', 'Publisher website (https://example.org/paper).'],
        ['', 'https://example.org/paper', 'https://example.org/paper.'],
        ['https://example.org/paper', 'https://example.org/paper', 'https://example.org/paper.'],
        ['https://example.org/old', 'https://example.org/new', 'https://example.org/old (https://example.org/new).']
    ]) {
        assert.equal(generateSourceText(e('sb:reference', [e('ce:inter-ref', label, {'xlink:href': href})])), expected);
    }
});

test('source text renders identical page endpoints once and preserves real ranges', () => {
    const ref = (first, last) => e('sb:reference', [e('sb:host', [e('sb:pages', [e('sb:first-page', first), ...(last ? [e('sb:last-page', last)] : [])])])]);
    assert.equal(generateSourceText(ref('15', '15')), '15.');
    assert.equal(generateSourceText(ref('15', '20')), '15–20.');
    assert.equal(generateSourceText(ref('15', '')), '15.');
});

test('empty source generation creates no element or ID and reports a warning', () => {
    const start = source.indexOf('                        const generatedText = generateSourceText(sbRef)');
    const end = source.indexOf('\n                    }\n\n                });', start);
    const code = compile(source.slice(start, end));
    const run = new Function('generateSourceText', 'sbRef', 'fragmentDoc', 'trimmedInput', 'getNextId', 'ref', 'finalAudit', 'refId', 'refLabel', 'sourceText', code);
    const audit = [];
    const forbidden = () => { throw new Error('Empty generation must not allocate an ID or create an element'); };
    run(() => '', {}, {createElement: forbidden}, '', forbidden, {appendChild: forbidden}, audit, 'bb1', '1');
    assert.equal(audit.length, 1);
    assert.equal(audit[0].status, 'warning');
});

test('sanitation preserves literal XML inside CDATA, comments, and processing instructions', () => {
    const sanitize = new Function(helper('sanitizeXmlTags'))();
    const xml = '<root><![CDATA[Literal <token></token> text]]><!-- <empty/> --><?review <token></token>?><empty/></root>';
    assert.equal(sanitize(xml), xml.replace('<empty/></root>', '</root>'));
});

test('sanitation preserves missing-ID empty source text and explicit spacing', () => {
    const sanitize = new Function(helper('sanitizeXmlTags'))();
    for (const xml of ['<ce:source-text/>', '<ce:source-text> </ce:source-text>', '<ce:hsp/>', '<ce:vsp/>']) assert.equal(sanitize(xml), xml);
});

test('duplicate ID detection ignores CDATA, comments, processing instructions, and text', () => {
    const find = new Function(helper('findDuplicateIds'))();
    assert.deepEqual([...find('<root><node id="same"/><![CDATA[<node id="same"/>]]><!-- <node id="same"/> --><?test id="same"?>id="same"<node caption="a > b" id="other"/><node id="other"/></root>')], ['other']);
    assert.equal(find('<root><node id="same"/><node caption=" id=\'same\' "/></root>').size, 0);
});

test('namespace cleanup retains original MathML bindings and CDATA namespace literals', () => {
    const clean = new Function(helper('removeInjectedNamespaces'))();
    const original = '<ce:bib-reference><mml:math xmlns:mml="urn:math"/><ce:source-text><![CDATA[ xmlns:ce="urn:ce" ]]></ce:source-text></ce:bib-reference>';
    const serialized = original.replace('<ce:bib-reference>', '<ce:bib-reference xmlns:ce="urn:ce">');
    assert.equal(clean(original, serialized), original);
});

test('source generation preserves consecutive commas in supplied URL paths', () => {
    assert.equal(generateSourceText(e('sb:reference', [e('ce:inter-ref', 'https://example.org/a,,b', {'xlink:href': 'https://example.org/a,,b'})])), 'https://example.org/a,,b.');
});

test('DOI display punctuation uses the supplied href without creating another DOI', () => {
    assert.equal(generateSourceText(e('sb:reference', [e('ce:inter-ref', 'https://doi.org/10.1234/abc.', {'xlink:href': 'https://doi.org/10.1234/abc'})])), 'https://doi.org/10.1234/abc.');
    assert.equal(generateSourceText(e('sb:reference', [e('ce:inter-ref', 'https://doi.org/10.1234/abc.', {'xlink:href': 'https://doi.org/10.1234/abc.'})])), 'https://doi.org/10.1234/abc.');
});


test('source text normalizes DOI prefix whitespace and resolver variants', () => {
    for (const value of ['doi: 10.1234/abc', ' DOI :  10.1234/abc ', 'http://dx.doi.org/10.1234/abc', 'doi: https://doi.org/10.1234/abc']) {
        assert.equal(generateSourceText(e('sb:reference', [e('ce:doi', value)])), 'https://doi.org/10.1234/abc.');
    }
});

test('source text emits duplicate DOI nodes and links once while retaining labels and access dates', () => {
    const ref = e('sb:reference', [
        e('ce:doi', 'doi: 10.1234/abc'), e('ce:doi', '10.1234/ABC'),
        e('ce:inter-ref', 'http://dx.doi.org/10.1234/abc', {'xlink:href': 'https://doi.org/10.1234/abc'}),
        e('ce:inter-ref', 'Publisher website', {'xlink:href': 'https://doi.org/10.1234/abc'}),
        e('sb:date-accessed', [], {day: '5', month: '10', year: '2025'})
    ]);
    assert.equal(generateSourceText(ref), 'https://doi.org/10.1234/abc, Publisher website (Accessed: 5 Oct 2025).');
});

test('source text deduplicates link-only DOI targets and keeps distinct DOIs', () => {
    const ref = e('sb:reference', [
        e('ce:inter-ref', 'https://doi.org/10.1234/abc', {'xlink:href': 'http://dx.doi.org/10.1234/abc'}),
        e('ce:inter-ref', 'https://doi.org/10.1234/abc', {'xlink:href': 'https://doi.org/10.1234/abc'}),
        e('ce:doi', '10.1234/other')
    ]);
    assert.equal(generateSourceText(ref), 'https://doi.org/10.1234/other, https://doi.org/10.1234/abc.');
});

test('source text prevents duplicate DOIs across hosts without losing host details', () => {
    const ref = e('sb:reference', [
        e('sb:host', [e('sb:book', [e('sb:title', [e('sb:maintitle', 'Book')]), e('sb:date', '2025')]), e('ce:doi', '10.1234/abc')]),
        e('sb:host', [e('sb:e-host', [e('ce:inter-ref', 'https://doi.org/10.1234/abc', {'xlink:href': 'https://doi.org/10.1234/abc'})])])
    ]);
    assert.equal(generateSourceText(ref), 'Book, (2025), https://doi.org/10.1234/abc.');
});


const auditTitle = (main, subtitle) => e('sb:title', [e('sb:maintitle', main), ...(subtitle ? [e('sb:subtitle', subtitle)] : [])]);
const auditEditor = (surname, suffix) => e('sb:editor', [e('ce:given-name', 'A.'), e('ce:surname', surname), ...(suffix ? [e('ce:suffix', suffix)] : [])]);

test('source text keeps editor suffixes and does not add In to a standalone edited book', () => {
    const ref = e('sb:reference', [e('sb:host', [e('sb:edited-book', [
        e('sb:editors', [auditEditor('Smith', 'Jr.')]), auditTitle('Book'), e('sb:date', '2025')
    ])])]);
    assert.equal(generateSourceText(ref), 'A. Smith Jr. (Ed.), Book, (2025).');
});

test('source text preserves editor order and omission markers', () => {
    const ref = e('sb:reference', [e('sb:host', [e('sb:edited-book', [
        e('sb:editors', [auditEditor('First'), e('sb:et-al'), auditEditor('Second'), e('sb:ellipsis'), auditEditor('Last')]),
        auditTitle('Book'), e('sb:date', '2025')
    ])])]);
    assert.equal(generateSourceText(ref), 'A. First, et al., A. Second, … A. Last (Eds.), Book, (2025).');
});

test('source text associates series editors and volume with the series, separately from book editors', () => {
    const ref = e('sb:reference', [e('sb:host', [e('sb:edited-book', [
        e('sb:editors', [auditEditor('BookEditor')]), auditTitle('Book'),
        e('sb:book-series', [e('sb:editors', [auditEditor('SeriesEditor')]), e('sb:series', [auditTitle('Series'), e('sb:volume-nr', '4')])]),
        e('sb:date', '2025')
    ])])]);
    assert.equal(generateSourceText(ref), 'A. BookEditor (Ed.), Book, (2025). A. SeriesEditor (Ed.), Series, 4.');
});

test('source text preserves book-series titles and subtitles with their volume', () => {
    const ref = e('sb:reference', [e('sb:host', [e('sb:book', [
        auditTitle('Book'), e('sb:book-series', [e('sb:series', [auditTitle('Series', 'Subtitle'), e('sb:volume-nr', '4')])]), e('sb:date', '2025')
    ])])]);
    assert.equal(generateSourceText(ref), 'Book, (2025). Series: Subtitle, 4.');
});

test('source text retains both issue and journal titles and associates volume with the journal', () => {
    const ref = e('sb:reference', [e('sb:host', [e('sb:issue', [
        auditTitle('Special issue'), e('sb:series', [auditTitle('Journal'), e('sb:volume-nr', '4')]), e('sb:date', '2025')
    ])])]);
    assert.equal(generateSourceText(ref), 'Special issue. Journal, 4, (2025).');
});

test('source text preserves comments before, between, and after reference sections', () => {
    const ref = e('sb:reference', [
        e('sb:comment', 'Before contribution'), e('sb:contribution', [auditTitle('Article')]),
        e('sb:comment', 'Between contribution and host'), e('sb:host', [e('sb:book', [auditTitle('Book'), e('sb:date', '2025')])]),
        e('sb:comment', 'After host')
    ]);
    const before = ref.textContent;
    assert.equal(generateSourceText(ref), 'Before contribution. Article. Between contribution and host. Book, (2025). After host.');
    assert.equal(ref.textContent, before);
});

test('source text keeps repeated comments at their supplied positions between multiple hosts', () => {
    const ref = e('sb:reference', [
        e('sb:comment', 'Note'), e('sb:host', [e('sb:book', [auditTitle('Book A'), e('sb:date', '2001')])]),
        e('sb:comment', 'Note'), e('sb:host', [e('sb:book', [auditTitle('Book B'), e('sb:date', '2025')])])
    ]);
    assert.equal(generateSourceText(ref), 'Note. Book A, (2001). Note. Book B, (2025).');
});

test('source text renders embedded comment links once without losing surrounding text or href targets', () => {
    const ref = label => e('sb:reference', [
        e('sb:comment', ['Available at ', e('ce:inter-ref', label, {'xlink:href': 'https://example.org', id: 'ir1'}), ' for details']),
        e('sb:host', [e('sb:book', [e('sb:date', '2025')])])
    ]);
    assert.equal(generateSourceText(ref('https://example.org')), 'Available at https://example.org for details. (2025).');
    assert.equal(generateSourceText(ref('Website')), 'Available at Website (https://example.org) for details. (2025).');
});


const validatedGenerationCases = JSON.parse(readFileSync(new URL('./fixtures/sourceTextGeneration.json', import.meta.url), 'utf8'));
const generationFixture = data => typeof data === 'string' ? data : e(data.tag,
    typeof data.content === 'string' ? data.content : data.content.map(generationFixture), data.attrs);
for (const fixture of validatedGenerationCases) {
    test(`source text preserves supplied fields: ${fixture.name}`, () => {
        const ref = generationFixture(fixture.reference);
        const before = ref.textContent;
        assert.equal(generateSourceText(ref), fixture.expected);
        assert.equal(ref.textContent, before);
    });
}


test('restoring omission markers retains complete paired and self-closing empty elements', () => {
    const restore = new Function(helper('restoreEmptyMarkerForms'))();
    for (const tag of ['sb:et-al', 'sb:ellipsis', 'ce:ellipsis']) {
        const paired = `<${tag}></${tag}>`;
        const selfClosed = `<${tag} />`;
        assert.equal(restore(paired, `<${tag}/>`), paired);
        assert.equal(restore(selfClosed, `<${tag}/>`), selfClosed);
        assert.equal(restore(paired + selfClosed, `<${tag}/><${tag}/>`), paired + selfClosed);
    }
});

test('marker restoration ignores literal marker text inside CDATA and comments', () => {
    const restore = new Function(helper('restoreEmptyMarkerForms'))();
    const literal = '<![CDATA[<sb:et-al></sb:et-al>]]><!-- <sb:et-al /> -->';
    assert.equal(restore(literal + '<sb:et-al />', literal + '<sb:et-al/>'), literal + '<sb:et-al />');
});
