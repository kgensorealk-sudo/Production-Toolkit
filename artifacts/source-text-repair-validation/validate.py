import json, re, shutil, tempfile, subprocess, pathlib, xml.etree.ElementTree as ET
out = pathlib.Path(__file__).resolve().parent
records = json.loads((out/'browser-results.json').read_text())
names = ['trailing-note','paired-et-al','paired-ellipsis','doi-migration-loses-metadata','doi-migration-duplicate-doi','doi-migration-percent-suffix','doi-migration-same-doi','doi-migration-link-metadata','doi-migration-descriptive-label','doi-migration-comment-accept','doi-migration-comment-retain']
selected = {r['name']:r for r in records if r['name'] in names}
assert len(selected)==11
for r in selected.values():
    assert r['wellFormed'], r['name']
    ET.fromstring(r['output'])
r=selected['trailing-note']['output']; assert r.index('<ce:source-text') < r.index('<ce:note')
for name,tag in [('paired-et-al','sb:et-al'),('paired-ellipsis','sb:ellipsis')]:
    assert re.search('<'+tag+r'\b[^>]*></'+tag+'>',selected[name]['output'])
r=selected['doi-migration-loses-metadata']['output']
for value in ['Version 2.1','2020','date-accessed','5 Oct 2025','<sb:e-host>']: assert value in r
r=selected['doi-migration-percent-suffix']['output']; assert '<ce:doi>10.1234/a%28b%29</ce:doi>' in r and r.count('10.1234/a%28b%29')==2
r=selected['doi-migration-same-doi']['output']; assert r.count('<ce:doi>')==1 and r.count('<sb:host>')==1
r=selected['doi-migration-duplicate-doi']['output']; assert r.count('<ce:doi>')==1 and '<sb:e-host>' in r and '10.1234/other' in r and '10.1234/abc' in r
assert 'versiondate="2025-10-07"' in selected['doi-migration-link-metadata']['output']
assert '>Publisher website</ce:inter-ref>' in selected['doi-migration-descriptive-label']['output']
for name in ['doi-migration-comment-accept','doi-migration-comment-retain']: assert '<sb:comment>Available at</sb:comment>' in selected[name]['output']
assert '<ce:doi>' in selected['doi-migration-comment-accept']['output']
assert '<sb:e-host>' in selected['doi-migration-comment-retain']['output'] and '<ce:doi>' not in selected['doi-migration-comment-retain']['output']
root=pathlib.Path(tempfile.mkdtemp(prefix='source-text-repair-'))
shutil.copytree(pathlib.Path(r'C:\Users\Kevin\AppData\Local\Temp\source-text-edge-native-j956r5fu')/'dtd',root/'dtd')
shutil.copytree(root/'dtd',root,dirs_exist_ok=True)
original=pathlib.Path(r'C:\Users\Kevin\Desktop\Mastercopy AI\Sample File\Older files\12-31-2025\CEJ_172259\CEJ_172259.xml').read_text(encoding='utf-8')
match=re.search(r'<ce:bib-reference\b.*?</ce:bib-reference>',original,re.S)
firstid=re.search(r' id="([^"]+)"',match[0])[1]; label=re.search(r'<ce:label\b.*?</ce:label>',match[0],re.S)[0]
(root/'baseline.xml').write_text(original,encoding='utf-8')
for name,r in selected.items():
    block=re.search(r'<ce:bib-reference\b.*?</ce:bib-reference>',r['output'],re.S)[0]
    ids={value:'zz'+str(990000+i*5) for i,value in enumerate(re.findall(r'\bid="([^"]+)"',block))}; ids['bb5']=firstid
    block=re.sub(r'\bid="([^"]+)"',lambda m:'id="'+ids[m[1]]+'"',block)
    block=re.sub(r'<ce:label\b.*?</ce:label>',lambda _:label,block,count=1,flags=re.S)
    (root/(name+'.xml')).write_text(original[:match.start()]+block+original[match.end():],encoding='utf-8')
(out/'validation-directory.txt').write_text(str(root))
results=[]; (out/'vtool-logs').mkdir(exist_ok=True)
for name in ['baseline']+names:
    job=root/('job-'+name); job.mkdir(); log=job/'report'
    p=subprocess.run(['java','-Xmx512m','-jar',r'C:\Users\Kevin\Desktop\FL-Xtools\Vtool-5.98.2\vtool.jar','-forcecheck','-nofp','-log',str(log),'-file',str(root/(name+'.xml'))],cwd=job,capture_output=True,text=True)
    report=ET.parse(str(log)+'.xml'); row={'name':name,**{key:int(report.findtext('.//'+key)) for key in ['total-errors','total-warnings','total-skipped-checks']},'messages':[dict(n.attrib,message=n.text) for n in report.findall('.//message')]}
    results.append(row); shutil.copyfile(str(log)+'.xml',out/'vtool-logs'/(name+'.xml'))
    (out/'vtool-results.json').write_text(json.dumps(results,indent=2)); print(json.dumps(row),flush=True)
assert all(r['total-errors']==0 and r['total-skipped-checks']==0 for r in results)
print('11 semantic regression cases passed; native reports parsed successfully.',flush=True)
