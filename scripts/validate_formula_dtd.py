"""Independent native formula-fragment DTD checks using original local sources.

Usage: python scripts/validate_formula_dtd.py CASES_JSON DTD_DIRECTORY RESULTS_JSON
Only the synthetic harness root is ANY; formula descendants use original rules.
Namespace declarations are supplied by that root, like the destination article.
"""
import json
import pathlib
import re
import sys
from lxml import etree

case_path, dtd_directory, output_path = map(pathlib.Path, sys.argv[1:4])
bindings = {
    'ce': 'http://www.elsevier.com/xml/common/dtd', 'mml': 'http://www.w3.org/1998/Math/MathML',
    'sa': 'http://www.elsevier.com/xml/common/struct-aff/dtd', 'sb': 'http://www.elsevier.com/xml/common/struct-bib/dtd',
    'tb': 'http://www.elsevier.com/xml/common/table/dtd', 'xlink': 'http://www.w3.org/1999/xlink'
}
results = []
for case in json.loads(case_path.read_text(encoding='utf-8-sig')):
    version = case['version']
    if version not in {'5.6', '5.7'}:
        raise ValueError('Unknown DTD version')
    xml = case['output']
    if re.search(r'<!DOCTYPE|<!ENTITY', xml, re.I):
        raise ValueError('Document declarations are not permitted in formula test input')
    # Attach the parsed fragment beneath the same bindings. Tree serialization
    # removes redundant declarations without rewriting text or CDATA content.
    root = etree.Element('formula-root', nsmap=bindings)
    root.append(etree.fromstring(xml.encode('utf-8'), etree.XMLParser(no_network=True, resolve_entities=False)))
    dtd = dtd_directory / ('art560.dtd' if version == '5.6' else 'art570.dtd')
    attrs = ' '.join(f'xmlns:{key} CDATA #IMPLIED' for key in bindings)
    doctype = f'<!DOCTYPE formula-root SYSTEM "{dtd.resolve().as_uri()}" [<!ELEMENT formula-root ANY><!ATTLIST formula-root {attrs}>]>'
    source = doctype + etree.tostring(root, encoding='unicode')
    parser = etree.XMLParser(load_dtd=True, dtd_validation=True, no_network=True, resolve_entities=False)
    try:
        etree.fromstring(source.encode('utf-8'), parser)
        valid, issues = True, []
    except etree.XMLSyntaxError:
        valid, issues = False, [entry.message for entry in parser.error_log]
    results.append({**{key: case[key] for key in ['name', 'version', 'expectedValid']}, 'valid': valid, 'passed': valid == case['expectedValid'], 'issues': issues})
output_path.parent.mkdir(parents=True, exist_ok=True)
output_path.write_text(json.dumps(results, indent=2) + '\n', encoding='utf-8')
failures = [result for result in results if not result['passed']]
print(f'Native formula DTD validation: {len(results) - len(failures)}/{len(results)} matched browser expectations.')
for result in failures:
    print(json.dumps(result))
if failures:
    sys.exit(1)
