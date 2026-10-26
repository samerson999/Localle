# Roda o Makefile dentro do container de ferramentas (infra/tools) — o host só precisa do Docker.
# Uso: .\make.ps1 <alvo>   (ex.: .\make.ps1 local, .\make.ps1 help)

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  # Docker Desktop instalado por usuário nem sempre entra no PATH
  $env:Path = "$env:LOCALAPPDATA\Programs\DockerDesktop\resources\bin;$env:ProgramFiles\Docker\Docker\resources\bin;$env:Path"
}

$repo = (Resolve-Path $PSScriptRoot).Path
# O compose chamado de dentro do container passa caminhos de bind mount ao daemon do Docker Desktop, que
# enxerga os discos do Windows em /run/desktop/mnt/host/<letra>/... — montamos o repo nesse mesmo caminho.
$drive = $repo.Substring(0, 1).ToLower()
$inner = "/run/desktop/mnt/host/$drive" + ($repo.Substring(2) -replace '\\', '/')

cmd /c "docker image inspect localle-tools >nul 2>&1"   # via cmd: no PS 5.1, stderr de nativo vira erro
if ($LASTEXITCODE -ne 0) { docker build -q -t localle-tools "$repo\infra\tools" | Out-Null }

$tty = if ([Console]::IsInputRedirected) { '-i' } else { '-it' }
docker run --rm $tty `
  -v //var/run/docker.sock:/var/run/docker.sock `
  -v "${repo}:${inner}" -w $inner `
  --add-host host.docker.internal:host-gateway `
  localle-tools make @args
exit $LASTEXITCODE
