$jobs = Get-Content "$PSScriptRoot/validation-jobs.json" | ConvertFrom-Json
$dtdResults = @()
$nativeResults = @()
New-Item -ItemType Directory -Force "$PSScriptRoot/vtool-logs" | Out-Null
foreach ($job in $jobs) {
    $issues = [System.Collections.Generic.List[string]]::new()
    $settings = [System.Xml.XmlReaderSettings]::new()
    $settings.DtdProcessing = [System.Xml.DtdProcessing]::Parse
    $settings.ValidationType = [System.Xml.ValidationType]::DTD
    $settings.XmlResolver = [System.Xml.XmlUrlResolver]::new()
    $settings.add_ValidationEventHandler({ param($sender, $eventArgs) $issues.Add($eventArgs.Message) }.GetNewClosure())
    $reader = $null
    try {
        $reader = [System.Xml.XmlReader]::Create($job.file, $settings)
        while ($reader.Read()) {}
    } catch { $issues.Add($_.Exception.Message) } finally { if ($reader) { $reader.Dispose() } }
    $dtdResults += [pscustomobject]@{name=$job.name; passed=($issues.Count -eq 0); issues=@($issues.ToArray())}
    $dtdResults | ConvertTo-Json -Depth 6 | Set-Content "$PSScriptRoot/dtd-results.json"
    $jobDir = Join-Path (Split-Path $job.file) ("job-" + $job.name)
    New-Item -ItemType Directory -Force $jobDir | Out-Null
    $logBase = Join-Path $jobDir 'report'
    Push-Location $jobDir
    try { & java -Xmx512m -jar 'C:/Users/Kevin/Desktop/FL-Xtools/Vtool-5.98.2/vtool.jar' -forcecheck -nofp -log $logBase -file $job.file | Out-Null } finally { Pop-Location }
    [xml]$report = Get-Content ($logBase + '.xml') -Raw
    $results = $report.LogReport.Log.results
    if (-not $results) { throw "Incomplete native report for $($job.name)" }
    $row = [pscustomobject]@{
        name=$job.name
        errors=[int]$results.'total-errors'
        warnings=[int]$results.'total-warnings'
        skipped=[int]$results.'total-skipped-checks'
        messages=@($results.message | ForEach-Object { [pscustomobject]@{code=$_.id; severity=$_.type; message=$_.InnerText} })
    }
    $nativeResults += $row
    Copy-Item -LiteralPath ($logBase + '.xml') -Destination "$PSScriptRoot/vtool-logs/$($job.name).xml"
    $nativeResults | ConvertTo-Json -Depth 6 | Set-Content "$PSScriptRoot/vtool-results.json"
    Write-Output "$($job.name): DTD=$($issues.Count -eq 0), VTool errors=$($row.errors), warnings=$($row.warnings), skipped=$($row.skipped)"
}
if ($dtdResults.Where({ -not $_.passed }).Count -or $nativeResults.Where({ $_.errors -ne 0 -or $_.skipped -ne 0 }).Count) { exit 1 }
