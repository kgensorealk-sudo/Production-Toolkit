"""Validate generated fragment cases using the complete CE DTD, without an article.

Usage: python scripts/validate_word_scanner_dtd.py CASES_JSON DTD_DIRECTORY RESULTS_JSON
Requires lxml and a locally available complete CE DTD distribution.
"""
import json
import pathlib
import sys
from lxml import etree

cases_file, dtd_directory, output_file = map(pathlib.Path, sys.argv[1:4])
cases = json.loads(cases_file.read_text(encoding='utf-8'))
results = []
for index, case in enumerate(cases):
    version = case.get('options', {}).get('dtdVersion', '5.7')
    dtd = dtd_directory / ('art570.dtd' if version == '5.7' else 'art560.dtd')
    # ANY applies only to the harness root. Every generated CE element and all
    # of its descendants still use the unmodified external DTD declarations.
    doctype = f'''<!DOCTYPE scanner-root SYSTEM "{dtd.resolve().as_uri()}" [
<!ELEMENT scanner-root ANY>
<!ATTLIST scanner-root xmlns:ce CDATA #IMPLIED xmlns:xlink CDATA #IMPLIED>
]>'''
    document = doctype + '<scanner-root xmlns:ce="http://www.elsevier.com/xml/common/dtd" xmlns:xlink="http://www.w3.org/1999/xlink">' + case['output'] + '</scanner-root>'
    parser = etree.XMLParser(load_dtd=True, dtd_validation=True, no_network=True, resolve_entities=False)
    try:
        etree.fromstring(document.encode('utf-8'), parser)
        valid, issues = True, []
    except etree.XMLSyntaxError:
        valid, issues = False, [entry.message for entry in parser.error_log]
    expected = case.get('expectedValid', True)
    results.append({'case': case.get('name', str(index)), 'version': version, 'valid': valid, 'expectedValid': expected, 'passed': valid == expected, 'issues': issues})

output_file.parent.mkdir(parents=True, exist_ok=True)
output_file.write_text(json.dumps(results, indent=2) + '\n', encoding='utf-8')
failures = [result for result in results if not result['passed']]
print(f'Native CE DTD validation: {len(results) - len(failures)}/{len(results)} cases passed.')
for failure in failures:
    print(json.dumps(failure))
if failures:
    sys.exit(1)
