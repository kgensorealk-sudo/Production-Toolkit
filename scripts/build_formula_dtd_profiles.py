"""Generate browser formula rules from the complete local CE DTD distributions.

Usage: python scripts/build_formula_dtd_profiles.py DTD_DIRECTORY OUTPUT_JSON
Requires lxml. Original distributions remain untouched. Prefixes are encoded in a
temporary copy because libxml2's content-model API otherwise discards them.
"""
import hashlib
import json
import pathlib
import re
import sys
import tempfile
from lxml import etree

source, destination = map(pathlib.Path, sys.argv[1:3])
files = sorted(p for p in source.rglob('*') if p.is_file() and p.suffix.lower() in {'.dtd', '.ent', '.mod'})
fingerprints = {p.relative_to(source).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
general_names = set()
for path in files:
    general_names.update(re.findall(r'<!ENTITY\s+([A-Za-z_][\w.:-]*)\s+[\'"]', path.read_text(encoding='utf-8')))
profiles = {}
for version, entry in [('5.6', 'art560.dtd'), ('5.7', 'art570.dtd')]:
    original = etree.DTD(str((source / entry).resolve()))
    names = set()
    for element in original.iterelements():
        if element.prefix:
            names.add(f'{element.prefix}:{element.name}')
        for attribute in element.iterattributes():
            if attribute.prefix:
                names.add(f'{attribute.prefix}:{attribute.name}')
    encoded = {name: 'formula_q_' + name.replace(':', '__') for name in names}
    decoded = {value: key for key, value in encoded.items()}
    prefixes = {name.split(':')[0] for name in names}
    # MathML builds some QNames by concatenating prefix parameter entities and
    # local names. Encode the prefix separator, not just literal whole QNames.
    pattern = re.compile(r'(?<![\w:.-])(' + '|'.join(re.escape(prefix) for prefix in sorted(prefixes)) + r'):')
    with tempfile.TemporaryDirectory(prefix='formula-dtd-') as folder:
        root = pathlib.Path(folder)
        for path in files:
            target = root / path.relative_to(source)
            target.parent.mkdir(parents=True, exist_ok=True)
            text = path.read_text(encoding='utf-8')
            text = text.replace('%MATHML.prefix;:', 'formula_q_mml__').replace('%XLINK.prefix;:', 'formula_q_xlink__')
            target.write_text(pattern.sub(lambda match: 'formula_q_' + match[1] + '__', text), encoding='utf-8')
        dtd = etree.DTD(str(root / entry))
        models, model_ids = [], {}
        def model(node):
            if node is None:
                return None
            value = [node.type, node.occur, decoded.get(node.name, node.name), model(node.left), model(node.right)]
            key = json.dumps(value)
            if key not in model_ids:
                model_ids[key] = len(models)
                models.append(value)
            return model_ids[key]
        attributes, attribute_ids = [], {}
        elements = {}
        for element in dtd.iterelements():
            name = decoded.get(element.name, element.name)
            attrs = {}
            for attr in element.iterattributes():
                attr_name = decoded.get(attr.name, attr.name)
                attrs[attr_name] = [attr.type, attr.default, attr.default_value, list(attr.itervalues())]
            key = json.dumps(attrs, sort_keys=True)
            if key not in attribute_ids:
                attribute_ids[key] = len(attributes)
                attributes.append(attrs)
            elements[name] = [element.type, model(element.content), attribute_ids[key]]
        assert 'mml:math' in elements and 'ce:formula' in elements
        assert set(elements) == {f'{e.prefix}:{e.name}' if e.prefix else e.name for e in original.iterelements()}
        entities = {e.name: e.content for e in original.iterentities()
                    if e.name in general_names and not e.system_url and e.orig
                    and re.fullmatch(r'(?:&#(?:x[0-9A-Fa-f]+|[0-9]+);)+', e.orig)}
        profiles[version] = {'entry': entry, 'models': models, 'attributes': attributes, 'elements': elements, 'entities': entities}
destination.parent.mkdir(parents=True, exist_ok=True)
destination.write_text(json.dumps({
    'attribution': 'CE declarations: Copyright Elsevier B.V., CC BY 4.0 https://creativecommons.org/licenses/by/4.0/. Included MathML modules: Copyright W3C (MIT, INRIA, Keio, Beihang); retain the original module notices when redistributing sources.',
    'sources': fingerprints, 'profiles': profiles
}, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
print(f'Wrote {destination}: {destination.stat().st_size} bytes; ' + ', '.join(f'{v}: {len(p["elements"])} declarations' for v, p in profiles.items()))
