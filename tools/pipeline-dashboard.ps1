# ═══════════════════════════════════════════════════════════════
# AIMailHelper — Pipeline Dashboard v2 (phase-agnostic monitor)
# Cửa sổ chỉ ĐỌC — đóng bất kỳ lúc nào. Auto-exit sau ~4h.
# Mở lại: powershell -File tools\pipeline-dashboard.ps1
# ═══════════════════════════════════════════════════════════════
$root = "C:\projects\nodejs\AIMailHelper"
$doc  = "$root\documents\AIMH-LOCAL"
$maxTicks = 7200

for ($i = 0; $i -lt $maxTicks; $i++) {
    Clear-Host
    "═══════ AIMailHelper — PIPELINE DASHBOARD v2 ═══════  $(Get-Date -Format 'HH:mm:ss')"
    ""
    " ── Phase hiện tại (STATUS.json) ──"
    try {
        $s = Get-Content "$doc\STATUS.json" -Raw | ConvertFrom-Json
        "   ticket: $($s.ticket)   |   phase: $($s.currentPhase)"
        $s.phases.PSObject.Properties | Where-Object { $_.Value.status -eq 'in_progress' } |
            ForEach-Object { "   ▶ in_progress: $($_.Name)" }
        "   circuitBreaker: $($s.circuitBreaker.state) (failures: $($s.circuitBreaker.consecutiveFailures))"
    } catch { "   (STATUS.json đọc lỗi: $_)" }
    ""
    " ── Git log (3 commit mới nhất) ──"
    git -C $root log --oneline -3 2>$null | ForEach-Object { "   $_" }
    ""
    " ── 8 file mới nhất ──"
    Get-ChildItem $doc -Recurse -File -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending | Select-Object -First 8 |
        ForEach-Object { "   {0:HH:mm:ss}  {1,9:N0} B   {2}" -f $_.LastWriteTime, $_.Length, $_.Name }
    ""
    " ── RUN-LOG 3 dòng cuối ──"
    Get-Content "$doc\RUN-LOG.md" -Tail 3 -ErrorAction SilentlyContinue |
        ForEach-Object { "   " + $_.Substring(0, [Math]::Min(112, $_.Length)) }
    ""
    " (read-only — dong cua so bat ky luc nao)"
    Start-Sleep -Seconds 3
}
