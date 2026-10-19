"""Derive the scanner's supported element rules from a locally supplied CE DTD.

Requires lxml. Usage: python scripts/build_word_scanner_dtd_profile.py DTD_FILE OUTPUT_JSON
This produces browser rules; independent native DTD validation remains necessary.
"""
import hashlib
import json
import pathlib
import sys
from lxml import etree

source, destination = map(pathlib.Path, sys.argv[1:3])
dtd = etree.DTD(str(source.resolve()))
supported = {
    'ce:bold', 'ce:italic', 'ce:sup', 'ce:inf', 'ce:underline', 'ce:small-caps',
    'ce:para', 'ce:simple-para', 'ce:section-title', 'ce:label', 'ce:list', 'ce:list-item',
    'ce:abstract', 'ce:abstract-sec', 'ce:acknowledgment', 'ce:conflict-of-interest',
    'ce:data-availability', 'ce:section', 'ce:sections', 'ce:appendices',
    'ce:keywords', 'ce:keyword', 'ce:text', 'ce:table', 'ce:caption', 'ce:br',
    'tgroup', 'colspec', 'thead', 'tbody', 'row', 'entry',
}
qualified = {name.split(':')[-1]: name for name in supported}
assert len(qualified) == len(supported), 'Supported local names must be unambiguous.'
def model(node):
    if node is None:
        return None
    result = {'type': node.type, 'occur': node.occur}
    if node.name:
        result['name'] = qualified.get(node.name, node.name)
    if node.left is not None:
        result['left'] = model(node.left)
    if node.right is not None:
        result['right'] = model(node.right)
    return result

def mixed_children(node):
    if node is None:
        return set()
    names = {qualified.get(node.name, node.name)} if node.type == 'element' else set()
    return names | mixed_children(node.left) | mixed_children(node.right)

elements = {}
for element in dtd.iterelements():
    name = f'{element.prefix}:{element.name}' if element.prefix else element.name
    if name not in supported:
        continue
    attributes = {}
    for attribute in element.iterattributes():
        attr_name = f'{attribute.prefix}:{attribute.name}' if attribute.prefix else attribute.name
        attributes[attr_name] = {
            'type': attribute.type,
            'required': attribute.default == 'required',
            'fixed': attribute.default_value if attribute.default == 'fixed' else None,
            'values': list(attribute.itervalues()),
        }
    elements[name] = {
        'type': element.type,
        'model': None if element.type == 'mixed' else model(element.content),
        'allowedChildren': sorted(mixed_children(element.content)) if element.type == 'mixed' else [],
        'attributes': attributes,
    }
missing = supported - elements.keys()
# Older DTD versions may not declare newer back-matter sections.
profile = {
    'name': f'CE article {source.stem.removeprefix("art")[0]}.{source.stem.removeprefix("art")[1]} snippet rules',
    'source': source.name,
    'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
    'commonSha256': hashlib.sha256((source.parent / ('common170.ent' if '570' in source.name else 'common160.ent')).read_bytes()).hexdigest(),
    'attribution': 'Derived from the CE common element pool and article DTD, CC BY 4.0. Copyright Elsevier B.V. Original source attribution and license: https://creativecommons.org/licenses/by/4.0/',
    'unsupportedInVersion': sorted(missing),
    'elements': elements,
}
destination.parent.mkdir(parents=True, exist_ok=True)
destination.write_text(json.dumps(profile, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f'{source.name}: {len(elements)} supported element models -> {destination}')
