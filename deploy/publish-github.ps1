# One-time: create github.com/epipra/huru-gym as a fork of DuarteSantos8/openGym and push huru/main to it.
# Run from the repo root in a shell where `gh auth status` shows epipra as the active account.
# Windows PowerShell 5.1 turns a native command's stderr into an error record, so exit codes are
# checked by hand instead of using ErrorActionPreference = 'Stop'. Safe to run again.

gh repo view epipra/huru-gym --json name *> $null
if ($LASTEXITCODE -ne 0) {
  gh repo fork DuarteSantos8/openGym --fork-name huru-gym --clone=false --default-branch-only
  if ($LASTEXITCODE -ne 0) { throw 'fork failed' }
  Start-Sleep -Seconds 5
}

git remote get-url origin *> $null
if ($LASTEXITCODE -ne 0) { git remote add origin https://github.com/epipra/huru-gym.git }
git push -u origin huru/main:main
if ($LASTEXITCODE -ne 0) { throw 'push failed (upstream main may have moved: fetch upstream, merge, retry)' }

gh repo edit epipra/huru-gym --description 'Huru GYM - workout and body-weight tracker. A hosted, rebranded fork of openGym (AGPL-3.0) by AdxFuel LLC.' --homepage 'https://gym.epipra.com' --enable-issues --enable-wiki=false
# Forks start with Actions off. Turn them on so test.yml runs the suites on Linux for every push;
# the publish/pages/mirror workflows are guarded to run only in the upstream repository.
gh api -X PUT repos/epipra/huru-gym/actions/permissions -F enabled=true -f allowed_actions=all
gh repo view epipra/huru-gym --json url --jq .url
