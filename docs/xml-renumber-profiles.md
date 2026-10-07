# XML Renumber profiles

XML Renumber accepts a JSON profile through **Import Profile**. Profiles contain data, not executable code. The active profile is kept in the browser tab's session storage. Switching profiles clears the previous results and requires processing again.

Download `public/profiles/elsevier-art570.json` as a starting point. Its reference and citation rules were read from `dtd/art570.dtd` and `dtd/common170.ent` inside the supplied Vtool distribution. The profile encodes only rules relevant to renumbering, not the complete DTD.

## Another publisher or DTD version

1. Copy the custom template in `public/profiles/custom-example.json`.
2. Set `name` and `source` to identify the reviewed DTD and version.
3. Set `systemId` to its DTD filename. When a document declares an external DTD, a mismatched filename stops processing. This is a filename check, not proof that two DTDs have the same contents. If your workflow has no external system identifier, omit this optional field.
4. Map the exact qualified element names: `reference`, `label`, `singleCitation`, `groupedCitation`, and optionally `otherReference`.
5. Map the ID and citation-target attribute names in `attributes`.
6. Set `labelRequired` and `labelFirst` according to the publisher's rules.
7. Review the mappings, import the JSON, and process a representative XML file.

The custom profile and accompanying `custom-example.xml` demonstrate different names. They are examples, not a verified publisher DTD. Download them from the running site's `/profiles/` directory. After importing the custom profile, open its sample XML and process it: `r1` and `r2`, plus their citations, should become `[1]` and `[2]`.

## Scope and preservation

The engine looks only at direct child labels, preserves opening tags and attributes, and escapes new label text. Missing, misplaced, or ambiguous labels are reported and left unchanged. Duplicate bibliography IDs stop processing. Citations are updated only when every target can be numbered; known non-bibliographic links remain unchanged. Comments, CDATA, declarations, and external entity references are preserved without fetching or expanding external resources.

Profiles currently support one element mapping for each role and whitespace-separated citation target IDs. XML names are matched literally, including prefixes. Publishers using different structures, target encodings, namespace prefixes, or citation semantics need a reviewed extension to this contract rather than a misleading mapping.

These are **profile checks**, not full DTD validation. The scanner checks tag boundaries and nesting, but is not a validating XML parser. DTD validity, entity expansion, default attributes, and the complete publisher grammar require a separate validator such as Vtool. XML fragments with no DOCTYPE use the selected profile explicitly.

The existing rich-text extraction and tool recommendations remain Elsevier-specific; the generic profile engine controls renumbering and citation checks.

## Verification

Run `node --test tests/*.test.mjs`, `npm run lint`, and `npm run build`. The regression suite covers profile processing, malformed input, unresolved targets, source preservation, diff line numbering, clipboard rejection, and storage quota failures.

The diff compares the last processed input with its output. Later edits to input or label settings mark that result stale. Clear cancels queued processing, and CSV export includes reference failures and citation issues.
