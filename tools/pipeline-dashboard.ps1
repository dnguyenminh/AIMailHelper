# ═══════════════════════════════════════════════════════════════
# AIMailHelper — Pipeline Dashboard (read-only monitor)
# Cửa sổ chỉ ĐỌC — đóng bất kỳ lúc nào, không ảnh hưởng pipeline.
# Auto-exit sau ~4h. Mở lại: powershell -File tools\pipeline-dashboard.ps1
# ═══════════════════════════════════════════════════════════════
$doc    = "C:\projects\nodejs\AIMailHelper\documents\AIMH-LOCAL"
$tdd    = "$doc\TDD.md"
$runlog = "$doc\RUN-LOG.md"
$watchPid = 25320
$maxTicks = 7200   # 2s x 7200 = ~4h

for ($i = 0; $i -lt $maxTicks; $i++) {
    Clear-Host
    "═══════ AIMailHelper — PIPELINE DASHBOARD ═══════  $(Get-Date -Format 'HH:mm:ss')"
    ""
    $p = Get-Process -Id $watchPid -ErrorAction SilentlyContinue
    if ($p) {
        (" sa-agent (PID {0})  : RUNNING  | CPU {1:N0} s (tang deu = dang lam viec) | RAM {2:N0} MB" -f $watchPid, $p.CPU, ($p.WorkingSet64/1MB))
    } else {
        " sa-agent (PID $watchPid)  : EXITED  →  cho SM quality-gate P3 → P3.7 security + P4 STP/STC song song"
    }
    if (Test-Path $tdd) {
        $f = Get-Item $tdd
        (" TDD.md            : {0:N0} bytes  @  {1:HH:mm:ss}" -f $f.Length, $f.LastWriteTime)
    } else { " TDD.md            : (chua co)" }
    ""
    " ── 6 file moi nhat trong documents/AIMH-LOCAL ──"
    Get-ChildItem $doc -Recurse -File -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending | Select-Object -First 6 |
        ForEach-Object { "   {0:HH:mm:ss}  {1,9:N0} B   {2}" -f $_.LastWriteTime, $_.Length, $_.Name }
    ""
    " ── RUN-LOG dong cuoi ──"
    $last = Get-Content $runlog -Tail 1 -ErrorAction SilentlyContinue
    if ($last) { "   " + $last.Substring(0, [Math]::Min(115, $last.Length)) }
    ""
    " (read-only — dong cua so bat ky luc nao)"
    Start-Sleep -Seconds 2
}
