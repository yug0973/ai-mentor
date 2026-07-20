# Assumes $token and $sessionId already exist in your current PowerShell session
# (from the interview you already started earlier).

$answers = @(
  "I'm mostly comfortable with functions and loops, I've built a couple small CLI scripts, no real projects or APIs yet.",
  "Backend development specifically - REST APIs, databases, that kind of thing.",
  "I'd say beginner to intermediate - I know Python basics but haven't worked with frameworks yet.",
  "About 4 months, and I can put in roughly 10 hours a week.",
  "I prefer learning by building real projects rather than just watching videos."
)

foreach ($answer in $answers) {
  $reply = Invoke-RestMethod -Uri "http://localhost:4000/api/interview/$sessionId/respond" `
    -Method Post -ContentType "application/json" `
    -Headers @{ Authorization = "Bearer $token" } `
    -Body (@{ message = $answer } | ConvertTo-Json)

  if ($reply.isComplete) {
    Write-Host "`n--- Interview complete ---" -ForegroundColor Green
    $reply.learnerProfile | Format-List
    break
  } else {
    Write-Host "`nMentor: $($reply.question)" -ForegroundColor Cyan
  }
}

Write-Host "`n--- Confirming saved profile via GET /api/profile ---" -ForegroundColor Yellow
$profile = Invoke-RestMethod -Uri "http://localhost:4000/api/profile" -Method Get -Headers @{ Authorization = "Bearer $token" }
$profile | Format-List

Write-Host "`n--- Generating roadmap ---" -ForegroundColor Yellow
$roadmap = Invoke-RestMethod -Uri "http://localhost:4000/api/roadmap" -Method Post -Headers @{ Authorization = "Bearer $token" }
$roadmap | ConvertTo-Json -Depth 10
