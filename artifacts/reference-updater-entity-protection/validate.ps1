param([string[]]$CaseNames = @('dtd-character-entities','supplied-text-entity'))
$audit = Get-Content "$PSScriptRoot/results.json" -Raw -Encoding UTF8 | ConvertFrom-Json
$stage = Join-Path $env:TEMP ('reference-updater-audit-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory $stage | Out-Null
Copy-Item 'C:/Users/Kevin/AppData/Local/Temp/source-text-edge-native-j956r5fu/dtd/*' $stage -Recurse
$article = Get-Content 'C:/Users/Kevin/AppData/Local/Temp/xml-renumber-author-date-h7oB4w/baseline.xml' -Raw -Encoding UTF8
$pattern = '<ce:bib-reference\b[^>]*>[\s\S]*?</ce:bib-reference>'
$rows = @()
foreach ($name in $CaseNames) {
    $case = $audit | Where-Object name -eq $name
    foreach ($kind in @('original','output')) {
        $block = $case.$kind.Replace('"bb5"','"bb0005"').Replace('se0005','se8005').Replace('se0010','se8010')
        $matches = [regex]::Matches($article,$pattern)
        $first = $matches[0]
        $originalCount = [regex]::Matches($case.original,$pattern).Count
        $last = $matches[$originalCount - 1]
        $xml = $article.Substring(0,$first.Index) + $block + $article.Substring($last.Index+$last.Length)
        if ($kind -eq 'output' -and $name -eq 'split-with-deselected-shared-match') {
            # The user excluded original bb0010 in this scenario. Update only the
            # validation article's body links to cite the explicitly retained new entry.
            $xml = $xml.Replace('bb0010','bb3000')
        }
        if ($kind -eq 'output' -and $name -in @('candidate-switch-loses-displaced-update','split-with-deselected-shared-match')) {
            $paragraph = [regex]::new('(<ce:simple-para\b[^>]*>)')
            $xml = $paragraph.Replace($xml, '$1<ce:cross-ref id="cf8000" refid="bb3000">New reference</ce:cross-ref> ', 1)
        }
        $file = Join-Path $stage "$name-$kind.xml"
        [IO.File]::WriteAllText($file,$xml,[Text.UTF8Encoding]::new($false))
        $issues = [Collections.Generic.List[string]]::new()
        $settings = [Xml.XmlReaderSettings]::new()
        $settings.DtdProcessing = [Xml.DtdProcessing]::Parse
        $settings.ValidationType = [Xml.ValidationType]::DTD
        $settings.XmlResolver = [Xml.XmlUrlResolver]::new()
        $settings.add_ValidationEventHandler({param($s,$e) $issues.Add($e.Message)}.GetNewClosure())
        $reader=$null
        try { $reader=[Xml.XmlReader]::Create($file,$settings); while($reader.Read()) {} } catch {$issues.Add($_.Exception.Message)} finally {if($reader){$reader.Dispose()}}
        $log = Join-Path $stage "$name-$kind-report"
        Push-Location $stage
        try { & java -Xmx512m -jar 'C:/Users/Kevin/Desktop/FL-Xtools/Vtool-5.98.2/vtool.jar' -forcecheck -nofp -log $log -file $file | Out-Null } finally {Pop-Location}
        [xml]$report=Get-Content ($log+'.xml') -Raw
        $native=$report.LogReport.Log.results
        if(-not $native){throw "Incomplete report: $name $kind"}
        $rows += [pscustomobject]@{name=$name;kind=$kind;dtdIssues=@($issues.ToArray());errors=$native.'total-errors';warnings=$native.'total-warnings';skipped=$native.'total-skipped-checks';messages=@($native.message | ForEach-Object {[pscustomobject]@{code=$_.id;severity=$_.type;message=$_.InnerText}})}
        Copy-Item ($log+'.xml') "$PSScriptRoot/$name-$kind-vtool.xml"
        $rows | ConvertTo-Json -Depth 8 | Set-Content "$PSScriptRoot/validation-results.json"
        Write-Output "$name $kind DTD issues=$($issues.Count) VTool errors=$($native.'total-errors')"
    }
}
