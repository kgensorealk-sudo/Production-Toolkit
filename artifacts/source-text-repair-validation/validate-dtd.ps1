$validationRoot = Get-Content "$PSScriptRoot/validation-directory.txt"
$results = @()
foreach ($file in Get-ChildItem -LiteralPath $validationRoot -Filter '*.xml' | Where-Object { $_.BaseName -ne 'catalog' }) {
    $issues = [System.Collections.Generic.List[string]]::new()
    $settings = [System.Xml.XmlReaderSettings]::new()
    $settings.DtdProcessing = [System.Xml.DtdProcessing]::Parse
    $settings.ValidationType = [System.Xml.ValidationType]::DTD
    $settings.XmlResolver = [System.Xml.XmlUrlResolver]::new()
    $settings.add_ValidationEventHandler({ param($sender, $eventArgs) $issues.Add($eventArgs.Message) }.GetNewClosure())
    $reader = $null
    try {
        $reader = [System.Xml.XmlReader]::Create($file.FullName, $settings)
        while ($reader.Read()) {}
    } catch { $issues.Add($_.Exception.Message) } finally { if ($reader) { $reader.Dispose() } }
    $results += [pscustomobject]@{name=$file.BaseName; passed=($issues.Count -eq 0); issues=@($issues.ToArray())}
}
$results | ConvertTo-Json -Depth 5 | Set-Content "$PSScriptRoot/dtd-results.json"
$results | Format-Table name,passed
if ($results.Where({ -not $_.passed }).Count) { exit 1 }
