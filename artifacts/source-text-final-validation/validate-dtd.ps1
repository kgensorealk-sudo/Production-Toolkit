$jobs = Get-Content "$PSScriptRoot/validation-jobs.json" | ConvertFrom-Json
$results = @()
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
    $results += [pscustomobject]@{name=$job.name; expected=$job.expected; passed=($issues.Count -eq 0); issues=@($issues.ToArray())}
}
$results | ConvertTo-Json -Depth 5 | Set-Content "$PSScriptRoot/dtd-results.json"
$results | Format-Table name,expected,passed
if ($results.Where({ $_.expected -eq 'pass' -and -not $_.passed }).Count) { exit 1 }
