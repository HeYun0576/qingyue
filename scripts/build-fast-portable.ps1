param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('full', 'lite')]
  [string]$Edition
)

$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$releaseRoot = [IO.Path]::GetFullPath((Join-Path $projectRoot 'release'))

if ($Edition -eq 'lite') {
  $source = [IO.Path]::GetFullPath((Join-Path $releaseRoot 'lite\win-unpacked'))
  $metadataFile = Join-Path $releaseRoot 'lite-stage\package.json'
  $metadata = Get-Content -LiteralPath $metadataFile -Raw | ConvertFrom-Json
  $baseName = "QingYue-Lite-$($metadata.version)-Fast-Portable-x64"
  $executable = 'QingYueLite.exe'
  $displayName = 'QingYue Lite'
  $dataDirectory = 'QingYueLite-Data'
} else {
  $source = [IO.Path]::GetFullPath((Join-Path $releaseRoot 'win-unpacked'))
  $metadata = Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json
  $baseName = "QingYue-$($metadata.version)-Fast-Portable-x64"
  $executable = 'QingYue.exe'
  $displayName = 'QingYue'
  $dataDirectory = 'QingYue-Data'
}

$target = [IO.Path]::GetFullPath((Join-Path $releaseRoot $baseName))
$archive = [IO.Path]::GetFullPath((Join-Path $releaseRoot "$baseName.zip"))
if ([IO.Path]::GetDirectoryName($target) -ne $releaseRoot -or [IO.Path]::GetDirectoryName($archive) -ne $releaseRoot) {
  throw 'Fast portable output escaped the release directory.'
}
if (-not (Test-Path -LiteralPath (Join-Path $source $executable))) {
  throw "Packaged executable is missing: $source\$executable"
}

if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Recurse -Force }
if (Test-Path -LiteralPath $archive) { Remove-Item -LiteralPath $archive -Force }
New-Item -ItemType Directory -Path $target | Out-Null
Get-ChildItem -LiteralPath $source -Force | Copy-Item -Destination $target -Recurse -Force

# A Fast build runs from the extracted directory. The marker keeps all user data beside the app.
$updateConfig = Join-Path $target 'resources\app-update.yml'
if (Test-Path -LiteralPath $updateConfig) { Remove-Item -LiteralPath $updateConfig -Force }
New-Item -ItemType Directory -Path (Join-Path $target $dataDirectory) -Force | Out-Null
Set-Content -LiteralPath (Join-Path $target 'QingYue-Portable.txt') -Encoding UTF8 -Value 'QingYue Fast Portable marker. Do not delete; it keeps user data beside the application.'
$notes = @"
# $displayName $($metadata.version) Fast Portable

Extract the complete folder, then run ``$executable``. Do not copy only the EXE or delete ``QingYue-Portable.txt``.

- No installation is required and startup is faster than the single-file portable build.
- Settings, history, and recovery data stay in the data directory beside the app.
- File associations record the current EXE path. Register them again after moving the folder.
"@
Set-Content -LiteralPath (Join-Path $target 'README.md') -Encoding UTF8 -Value $notes

Add-Type -AssemblyName System.IO.Compression.FileSystem
[IO.Compression.ZipFile]::CreateFromDirectory($target, $archive, [IO.Compression.CompressionLevel]::Optimal, $true)
Write-Output $archive
