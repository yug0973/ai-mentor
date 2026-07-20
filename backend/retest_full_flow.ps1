# Fully self-contained retest — does NOT depend on $token existing from
# a previous interactive session (that was the original bug: running this
# via "powershell -File ..." spawns a fresh process with no inherited vars).
#
# Uses splatting (@params) instead of backtick line-continuations, since
# backtick continuations break silently if a trailing space sneaks in
# after the backtick - and the parser error that produces points at an
# unrelated line, which is exactly what happened last run.

$ErrorActionPreference = "Stop"

# --- Register a fresh test user (random email avoids 409 collisions on rerun) ---
$rand = Get-Random -Minimum 10000 -Maximum 99999
$email = "retest$rand@test.com"
$password = "supersecret123"

Write-Host ""
Write-Host "--- Registering test user $email ---" -ForegroundColor Yellow

$registerBody = @{ name = "Retest User"; email = $email; password = $password } | ConvertTo-Json
$registerParams = @{
  Uri         = "http://localhost:4000/api/auth/register"
  Method      = "Post"
  ContentType = "application/json"
  Body        = $registerBody
}
$response = Invoke-RestMethod @registerParams

$token = $response.token
if (-not $token) {
  Write-Host "--- Registration succeeded but no token came back - check auth.service response shape ---" -ForegroundColor Red
  return
}
Write-Host "Got token for $email" -ForegroundColor Green

# --- Starting a FRESH interview on purpose - mentor_ai_engine keeps sessions
# in-memory (per its own docstring), so rebuilding the container wipes any
# old session ids. No point trying to resume an old one. ---
$startParams = @{
  Uri     = "http://localhost:4000/api/interview"
  Method  = "Post"
  Headers = @{ Authorization = "Bearer $token" }
}
$interview = Invoke-RestMethod @startParams
$sessionId = $interview.session.id
Write-Host ""
Write-Host "Mentor: $($interview.question)" -ForegroundColor Cyan

$answers = @(
  "I want to become a job-ready backend developer within 4 months.",
  "Backend development - REST APIs and databases specifically.",
  "Beginner to intermediate - I know Python basics but haven't used any frameworks yet.",
  "I can dedicate about 10 hours a week.",
  "I prefer learning by building real projects rather than watching videos."
)

$reply = $null
foreach ($answer in $answers) {
  $respondBody = @{ message = $answer } | ConvertTo-Json
  $respondParams = @{
    Uri         = "http://localhost:4000/api/interview/$sessionId/respond"
    Method      = "Post"
    ContentType = "application/json"
    Headers     = @{ Authorization = "Bearer $token" }
    Body        = $respondBody
  }
  $reply = Invoke-RestMethod @respondParams

  if ($reply.isComplete) {
    Write-Host ""
    Write-Host "--- Interview complete ---" -ForegroundColor Green
    $reply.learnerProfile | Format-List
    break
  } else {
    Write-Host ""
    Write-Host "Mentor: $($reply.question)" -ForegroundColor Cyan
  }
}

if (-not $reply.isComplete) {
  Write-Host ""
  Write-Host "--- Interview did not complete within the scripted answers ---" -ForegroundColor Red
  Write-Host "Session id: $sessionId" -ForegroundColor Yellow
  Write-Host "Keep answering manually in THIS same PowerShell window (token is still in `$token):" -ForegroundColor Yellow
  Write-Host '  $body = @{ message = "your answer" } | ConvertTo-Json' -ForegroundColor Gray
  Write-Host '  Invoke-RestMethod -Uri "http://localhost:4000/api/interview/<sessionId>/respond" -Method Post -ContentType "application/json" -Headers @{ Authorization = "Bearer $token" } -Body $body' -ForegroundColor Gray
  return
}

Write-Host ""
Write-Host "--- Confirming saved profile via GET /api/profile ---" -ForegroundColor Yellow
$profileParams = @{
  Uri     = "http://localhost:4000/api/profile"
  Method  = "Get"
  Headers = @{ Authorization = "Bearer $token" }
}
$profile = Invoke-RestMethod @profileParams
$profile | Format-List

Write-Host ""
Write-Host "--- Generating roadmap ---" -ForegroundColor Yellow
$roadmapParams = @{
  Uri     = "http://localhost:4000/api/roadmap"
  Method  = "Post"
  Headers = @{ Authorization = "Bearer $token" }
}
$roadmap = Invoke-RestMethod @roadmapParams
$roadmap | ConvertTo-Json -Depth 10
