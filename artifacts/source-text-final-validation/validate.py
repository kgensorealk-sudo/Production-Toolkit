import json, re, shutil, tempfile, subprocess, pathlib, sys, xml.etree.ElementTree as ET
out=pathlib.Path(__file__).resolve().parent
records=json.loads((out/'browser-results.json').read_text()); cases={r['name']:r for r in records}
CE='{http://www.elsevier.com/xml/common/dtd}'; SB='{http://www.elsevier.com/xml/common/struct-bib/dtd}'
for r in records:
    assert not any('schema verified' in t['msg'].lower() or 'conform to standard DTD' in t['msg'] for t in r['toast']), r['name']
    if r['name']=='named-entity':
        assert r['output']==r['input'] and any('original XML retained' in a['msg'] for a in r['audit']); continue
    assert r['wellFormed'],r['name']
    original=ET.fromstring(r['input']); repaired=ET.fromstring(r['output'])
    oldids={(n.tag,n.get('id')) for n in original.iter() if n.get('id')}
    for n in repaired.iter():
        if n.get('id'): assert (n.tag,n.get('id')) in oldids, (r['name'],'new/changed ID',n.attrib)
    oldsources=list(original.iter(CE+'source-text')); newsources=list(repaired.iter(CE+'source-text'))
    for n in oldsources:
        assert any(n.get('id')==x.get('id') and ''.join(n.itertext())==''.join(x.itertext()) for x in newsources), (r['name'],'supplied text lost')
    assert all(len(n)==0 for n in newsources),r['name']
def texts(name): return [n['text'] for n in cases[name]['sourceTexts']]
assert texts('multiple-reference-children')==['Book, (2025).','Book B, (2025).']
assert texts('multiple-reference-existing-second-source')==['Book, (2025).','Supplied Book B text.']
for name in ['multiple-reference-children','multiple-reference-existing-second-source','trailing-note']:
    for b in ET.fromstring(cases[name]['output']).iter(CE+'bib-reference'):
        children=list(b)
        for i,n in enumerate(children):
            if n.tag==SB+'reference': assert children[i+1].tag==CE+'source-text', name
assert texts('misplaced-existing-source')==['Supplied text.']
assert texts('cdata-existing-source')==['Literal <token></token> text']
assert '<![CDATA[Literal <token></token> text]]>' in cases['cdata-existing-source']['output']
assert 'literal <empty>' not in texts('cdata-title-comment')[0]
assert 'Comment <word></word> text' in texts('cdata-title-comment')[0]
assert texts('inline-space')==['High quality evidence. Book, (2025).']
assert texts('comma-url')==['https://example.org/a,,b.']
assert texts('doi-display-punctuation')==['https://doi.org/10.1234/abc.']
assert 'xmlns:mml=' in cases['local-math-namespace']['output']
assert not any(n.get('id') for n in ET.fromstring(cases['missing-all-ids']['output']).iter())
for name,marker in [('existing-empty','EMPTY SOURCE'),('existing-whitespace-no-id','MISSING ID'),('existing-missing-id','MISSING ID'),('duplicate-source-id','DUPLICATE ID'),('duplicate-structured-id','DUPLICATE ID'),('misplaced-existing-source','SOURCE ASSOCIATION')]:
    for phase in ['scannerAudit','audit']: assert any(marker in a['msg'] and a['status']=='warning' for a in cases[name][phase]),(name,phase)
assert cases['existing-whitespace-no-id']['sourceTexts'][0]['id'] is None
assert [n['id'] for n in cases['duplicate-source-id']['sourceTexts']]==['se10','se10']
assert '<ce:doi>10.1234/a%28b%29</ce:doi>' in cases['doi-migration-percent-suffix']['output']
assert 'Version 2.1' in texts('doi-migration-loses-metadata')[0] and '5 Oct 2025' in texts('doi-migration-loses-metadata')[0]
(out/'semantic-results.json').write_text(json.dumps({'cases':len(records),'passed':True,'ID_assignment_in_product':False},indent=2))
print('Semantic assertions passed for '+str(len(records))+' browser scenarios.',flush=True)
if '--semantic-only' in sys.argv: sys.exit(0)
excluded={'existing-empty','existing-whitespace-no-id','duplicate-source-id','duplicate-structured-id','misplaced-existing-source','named-entity'}
positive=[r['name'] for r in records if r['name'] not in excluded]
negative=['existing-missing-id','missing-all-ids','duplicate-source-id','duplicate-structured-id','misplaced-existing-source','existing-empty']
root=pathlib.Path(tempfile.mkdtemp(prefix='source-text-final-'))
shutil.copytree(pathlib.Path(r'C:\Users\Kevin\AppData\Local\Temp\source-text-edge-native-j956r5fu')/'dtd',root/'dtd')
shutil.copytree(root/'dtd',root,dirs_exist_ok=True)
original=pathlib.Path(r'C:\Users\Kevin\Desktop\Mastercopy AI\Sample File\Older files\12-31-2025\CEJ_172259\CEJ_172259.xml').read_text(encoding='utf-8')
match=re.search(r'<ce:bib-reference\b.*?</ce:bib-reference>',original,re.S)
firstid=re.search(r' id="([^"]+)"',match[0])[1]; label=re.search(r'<ce:label\b.*?</ce:label>',match[0],re.S)[0]
required={'ce:bib-reference','sb:reference','ce:reference','ce:other-ref','ce:inter-ref','ce:source-text'}
def stage(name, assign_missing):
    # Simulate the separate ID step only in validation clones, never in the product output.
    block=''.join(re.findall(r'<ce:bib-reference\b.*?</ce:bib-reference>',cases[name]['output'],re.S))
    ids={value:'zz'+str(990000+i*5) for i,value in enumerate(dict.fromkeys(re.findall(r'\bid="([^"]+)"',block)))}
    if 'bb5' in ids: ids['bb5']=firstid
    block=re.sub(r'\bid="([^"]+)"',lambda m:'id="'+ids[m[1]]+'"',block)
    if assign_missing:
        nextid=995000
        def add_id(m):
            nonlocal nextid
            tag=m[0]; kind=m[1]
            if kind in required and not re.search(r'\sid\s*=',tag):
                nextid+=5; assigned=firstid if kind=='ce:bib-reference' else 'zz'+str(nextid)
                tag=tag.replace('<'+kind,'<'+kind+' id="'+assigned+'"',1)
            return tag
        # Ignore CDATA/comments/PIs, so literal XML is not treated as markup.
        shield=[]
        block=re.sub(r'<!\[CDATA\[[\s\S]*?\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>',lambda m:shield.append(m[0]) or '\ue000'+str(len(shield)-1)+'\ue001',block)
        block=re.sub(r'<([A-Za-z_][\w:.-]*)(?:[^<>"\']|"[^"]*"|\'[^\']*\')*>',add_id,block)
        block=re.sub(r'\uE000(\d+)\uE001',lambda m:shield[int(m[1])],block)
    block=re.sub(r'<ce:label\b.*?</ce:label>',lambda _:label,block,count=1,flags=re.S)
    result=original[:match.start()]+block+original[match.end():]
    suffix='after-id-step' if assign_missing else 'raw'
    path=root/(name+'-'+suffix+'.xml');path.write_text(result,encoding='utf-8');return path
(root/'baseline.xml').write_text(original,encoding='utf-8')
jobs=[{'name':'baseline','file':str(root/'baseline.xml'),'expected':'pass'}]
for name in positive: jobs.append({'name':name+'-after-id-step','file':str(stage(name,True)),'expected':'pass'})
for name in negative: jobs.append({'name':name+'-raw','file':str(stage(name,False)),'expected':'review'})
(out/'validation-directory.txt').write_text(str(root));(out/'validation-jobs.json').write_text(json.dumps(jobs,indent=2))
results=[];(out/'vtool-logs').mkdir(exist_ok=True)
for entry in jobs:
    name=entry['name'];job=root/('job-'+name);job.mkdir();log=job/'report'
    subprocess.run(['java','-Xmx512m','-jar',r'C:\Users\Kevin\Desktop\FL-Xtools\Vtool-5.98.2\vtool.jar','-forcecheck','-nofp','-log',str(log),'-file',entry['file']],cwd=job,capture_output=True,text=True)
    report=ET.parse(str(log)+'.xml');row={'name':name,'expected':entry['expected'],**{key:int(report.findtext('.//'+key)) for key in ['total-errors','total-warnings','total-skipped-checks']},'messages':[dict(n.attrib,message=n.text) for n in report.findall('.//message')]}
    results.append(row);shutil.copyfile(str(log)+'.xml',out/'vtool-logs'/(name+'.xml'));(out/'vtool-results.json').write_text(json.dumps(results,indent=2))
    print(json.dumps({key:row[key] for key in ['name','total-errors','total-warnings','total-skipped-checks']}),flush=True)
assert all(r['total-errors']==0 and r['total-skipped-checks']==0 for r in results if r['expected']=='pass')
assert all(r['total-errors']>0 for r in results if r['expected']=='review')
print('All native validation expectations passed.',flush=True)
