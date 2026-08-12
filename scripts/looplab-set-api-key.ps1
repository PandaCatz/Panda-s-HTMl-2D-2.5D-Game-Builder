param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("openai", "anthropic")]
  [string]$Provider,

  [Parameter(Mandatory = $true)]
  [string]$ResultPath,

  [switch]$ReadFromStdin,

  [string]$VaultDirectoryOverride
)

$ErrorActionPreference = "Stop"

function Write-SafeResult {
  param([hashtable]$Value)
  $json = $Value | ConvertTo-Json -Compress
  [System.IO.File]::WriteAllText($ResultPath, $json, (New-Object System.Text.UTF8Encoding($false)))
}

$providerLabel = if ($Provider -eq "openai") { "OpenAI API" } else { "Anthropic API" }
$credentialName = if ($Provider -eq "openai") { "OPENAI_API_KEY" } else { "ANTHROPIC_API_KEY" }
$vaultFileName = "$Provider-api-key.dpapi"
$stage = "initialize"
$plainKey = $null
$keyBytes = $null
$temporaryPath = $null

try {
  $stage = "prepare-vault"
  if ([string]::IsNullOrWhiteSpace($VaultDirectoryOverride)) {
    $localAppData = [Environment]::GetFolderPath("LocalApplicationData")
    if ([string]::IsNullOrWhiteSpace($localAppData)) { throw "LocalAppData is unavailable." }
    $vaultDirectory = Join-Path $localAppData "Looplab\secrets"
  } else {
    $vaultDirectory = [System.IO.Path]::GetFullPath($VaultDirectoryOverride)
  }
  [System.IO.Directory]::CreateDirectory($vaultDirectory) | Out-Null
  $vaultPath = Join-Path $vaultDirectory $vaultFileName

  if ($ReadFromStdin) {
    $stage = "collect-key-stdin"
    $plainKey = [Console]::In.ReadToEnd().Trim()
    if ($plainKey.Length -lt 20 -or $plainKey -match "\s") {
      throw [System.ArgumentException]::new("Incomplete API key input.")
    }
  } else {
    $stage = "create-dialog"
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    Add-Type @"
using System;
using System.Runtime.InteropServices;

public static class LooplabWindowFocus {
  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr windowHandle);
}
"@

    [System.Windows.Forms.Application]::EnableVisualStyles()
    $form = New-Object System.Windows.Forms.Form
    $form.Text = "Looplab - Connect $providerLabel"
    $form.StartPosition = "CenterScreen"
    $form.ClientSize = New-Object System.Drawing.Size(520, 250)
    $form.FormBorderStyle = "FixedDialog"
    $form.MaximizeBox = $false
    $form.MinimizeBox = $false
    $form.TopMost = $true
    $form.ShowInTaskbar = $true

    $heading = New-Object System.Windows.Forms.Label
    $heading.Text = "Connect $providerLabel to Looplab"
    $heading.Font = New-Object System.Drawing.Font("Segoe UI", 14, [System.Drawing.FontStyle]::Bold)
    $heading.Location = New-Object System.Drawing.Point(24, 20)
    $heading.Size = New-Object System.Drawing.Size(470, 34)
    $form.Controls.Add($heading)

    $instructions = New-Object System.Windows.Forms.Label
    $instructions.Text = "Paste the API key you just created. It stays out of the project, console, and exported games. Windows encrypts it for your user account."
    $instructions.Font = New-Object System.Drawing.Font("Segoe UI", 9)
    $instructions.Location = New-Object System.Drawing.Point(26, 58)
    $instructions.Size = New-Object System.Drawing.Size(465, 48)
    $form.Controls.Add($instructions)

    $keyLabel = New-Object System.Windows.Forms.Label
    $keyLabel.Text = $credentialName
    $keyLabel.Font = New-Object System.Drawing.Font("Consolas", 9, [System.Drawing.FontStyle]::Bold)
    $keyLabel.Location = New-Object System.Drawing.Point(26, 112)
    $keyLabel.Size = New-Object System.Drawing.Size(460, 22)
    $form.Controls.Add($keyLabel)

    $keyBox = New-Object System.Windows.Forms.TextBox
    $keyBox.Location = New-Object System.Drawing.Point(28, 136)
    $keyBox.Size = New-Object System.Drawing.Size(463, 27)
    $keyBox.UseSystemPasswordChar = $true
    $keyBox.AccessibleName = "$providerLabel API key"
    $form.Controls.Add($keyBox)

    $privacy = New-Object System.Windows.Forms.Label
    $privacy.Text = "Looplab verifies the key with the provider after saving it. The key value is never returned to the web app."
    $privacy.Font = New-Object System.Drawing.Font("Segoe UI", 8)
    $privacy.ForeColor = [System.Drawing.Color]::DimGray
    $privacy.Location = New-Object System.Drawing.Point(26, 170)
    $privacy.Size = New-Object System.Drawing.Size(465, 32)
    $form.Controls.Add($privacy)

    $cancelButton = New-Object System.Windows.Forms.Button
    $cancelButton.Text = "Cancel"
    $cancelButton.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
    $cancelButton.Location = New-Object System.Drawing.Point(324, 208)
    $cancelButton.Size = New-Object System.Drawing.Size(80, 30)
    $form.Controls.Add($cancelButton)

    $saveButton = New-Object System.Windows.Forms.Button
    $saveButton.Text = "Save & verify"
    $saveButton.DialogResult = [System.Windows.Forms.DialogResult]::OK
    $saveButton.Location = New-Object System.Drawing.Point(411, 208)
    $saveButton.Size = New-Object System.Drawing.Size(80, 30)
    $form.Controls.Add($saveButton)

    $form.AcceptButton = $saveButton
    $form.CancelButton = $cancelButton
    $form.Add_Shown({
      $form.WindowState = [System.Windows.Forms.FormWindowState]::Normal
      $form.Activate()
      $form.BringToFront()
      [LooplabWindowFocus]::SetForegroundWindow($form.Handle) | Out-Null
      $keyBox.Select()
    })

    $stage = "collect-key"
    while ($true) {
      $dialogResult = $form.ShowDialog()
      if ($dialogResult -ne [System.Windows.Forms.DialogResult]::OK) {
        Write-SafeResult @{ ok = $false; cancelled = $true; provider = $Provider; credentialName = $credentialName }
        exit 2
      }

      $plainKey = $keyBox.Text.Trim()
      if ($plainKey.Length -ge 20 -and $plainKey -notmatch "\s") { break }
      [System.Windows.Forms.MessageBox]::Show(
        "That does not look like a complete API key. Paste the full key without spaces.",
        "Looplab could not save the key",
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Warning
      ) | Out-Null
      $keyBox.SelectAll()
    }
  }

  $stage = "encrypt-key"
  Add-Type -AssemblyName System.Security
  $keyBytes = [System.Text.Encoding]::UTF8.GetBytes($plainKey)
  $protectedBytes = [System.Security.Cryptography.ProtectedData]::Protect(
    $keyBytes,
    $null,
    [System.Security.Cryptography.DataProtectionScope]::CurrentUser
  )
  $encryptedKey = "looplab-dpapi-v1:" + [System.Convert]::ToBase64String($protectedBytes)
  [System.Array]::Clear($keyBytes, 0, $keyBytes.Length)
  $keyBytes = $null
  if ($keyBox) { $keyBox.Clear() }
  $plainKey = $null

  $stage = "write-vault"
  $temporaryPath = "$vaultPath.new-$PID-$([Guid]::NewGuid().ToString('N'))"
  [System.IO.File]::WriteAllText($temporaryPath, $encryptedKey, (New-Object System.Text.UTF8Encoding($false)))

  $stage = "commit-vault"
  if ([System.IO.File]::Exists($vaultPath)) {
    [System.IO.File]::Replace($temporaryPath, $vaultPath, $null, $true)
  } else {
    [System.IO.File]::Move($temporaryPath, $vaultPath)
  }
  $temporaryPath = $null

  $stage = "write-result"
  Write-SafeResult @{ ok = $true; cancelled = $false; provider = $Provider; credentialName = $credentialName; storage = "windows-dpapi-current-user" }
  exit 0
} catch {
  $exceptionType = $_.Exception.GetType().Name
  Write-SafeResult @{ ok = $false; cancelled = $false; provider = $Provider; credentialName = $credentialName; error = "Windows could not complete secure key setup during the $stage stage."; errorCode = "secure-key-save-failed"; stage = $stage; exceptionType = $exceptionType; errorId = $_.FullyQualifiedErrorId; scriptLine = $_.InvocationInfo.ScriptLineNumber; commandName = $_.InvocationInfo.MyCommand.Name }
  exit 1
} finally {
  $plainKey = $null
  if ($keyBytes) { [System.Array]::Clear($keyBytes, 0, $keyBytes.Length) }
  if ($keyBox) { $keyBox.Clear() }
  if ($temporaryPath -and [System.IO.File]::Exists($temporaryPath)) { [System.IO.File]::Delete($temporaryPath) }
  if ($form) { $form.Dispose() }
}
