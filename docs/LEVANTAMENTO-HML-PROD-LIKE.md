# Levantamento — HML como prod-like (POC com cliente real)

Data: 12/11/2026. Servidor: VPS Hostinger 200.141.18.98 (`app.lclfleet.com`, `gw.lclfleet.com`).
Coleta feita por SSH no servidor e leitura do código; nada foi alterado no servidor.

Contexto: a HML atende um cliente real e é a POC que valida o produto. Perder posição, perder dado ou ficar
fora do ar tem custo comercial. Este documento lista o que falta para ela se comportar como produção, em
três faixas: **P0 risco de perder dado / ser invadida**, **P1 risco de parar**, **P2 melhoria**.

## Retrato atual

| Item | Estado |
|---|---|
| Máquina | 1 vCPU, 3,8 GB RAM + 4 GB swap (771 MB em uso), disco 48 GB (37%) |
| Carga | load average 1,1 / 1,7 / 2,1 numa CPU só — saturada em picos |
| Banco da plataforma | 380 MB, 162.718 posições desde 28/10, 4 clientes, 24 rastreadores |
| Banco do Traccar | 98 MB, 210.739 posições, 23 aparelhos |
| Domínio | `app.` com Let's Encrypt (até 10/02/2027); `gw.` resolvendo; sslip mantido na transição |
| Portas de fora | 22, 80, 443 e as dos protocolos; 8000/8080/8082/6001/5432/6432 **fechadas** de fora (bom) |
| Ingestão | Forwarding do Traccar com `forward.retry.enable=true` + polling ligado + conciliação ligada |

## P0 — risco de perder dado ou de invasão

### 1. Não existe backup do banco da plataforma
Nenhum agendamento: sem cron no host, zero backups agendados no Coolify, sem `archive_mode`. O único
backup do Traccar é manual (último em 04/11; o `backup.sh` existe mas nunca foi agendado e a pasta
`backups/` está vazia). Tudo está no mesmo disco da mesma VPS — se o disco ou a VPS se perderem, perde-se
todo o histórico do cliente.

**Fazer:** `pg_dump` diário dos dois bancos (plataforma e Traccar) por cron, com rotação (7 diários + 4
semanais), **cópia para fora da VPS** (R2/Backblaze — o R2 já está planejado em
`docs/PLANO-ARMAZENAMENTO-ARQUIVOS.md`) e **um teste de restauração** num banco descartável. Conferir também
se o plano da Hostinger tem snapshot/backup semanal da VPS e ligá-lo (complementa, não substitui).
Esforço: ~2 h. Depois, na produção, pgBackRest como já previsto em `docs/PLANO-INFRA-PRODUCAO.md`.

### 2. SSH aceita senha do root, sem proteção contra força bruta
`sshd -T`: `permitrootlogin yes` e `passwordauthentication yes` (o `50-cloud-init.conf` liga a senha e
vence o `60-cloudimg-settings.conf`). 131 tentativas de login falhas no `auth.log`, sem `fail2ban`.

**Fazer:** desligar login por senha (a chave `localle_hml` já funciona — conferir que quem mais acessa
tem chave antes), `PermitRootLogin prohibit-password`, instalar `fail2ban`. O terminal do hPanel da
Hostinger continua como porta de emergência. Esforço: 30 min.

### 3. Coolify sem 2FA
A única conta do Coolify (`samersonrps@gmail.com`) não tem 2FA. Quem entrar no Coolify controla banco,
segredos, deploy e o domínio. **Fazer:** ligar 2FA no Coolify, na conta da Hostinger e no e-mail ligado a
elas. Ligar a "Proteção de Domínio" do lclfleet.com (hoje desligada, domínio no nome pessoal do Rafael).
Esforço: 15 min.

## P1 — risco de parar

### 4. Todo deploy derruba a API e o front por alguns instantes
Health check desligado nas 3 aplicações no Coolify e "Consistent Container Names" na API — com isso o
Coolify não faz troca sem queda: para o container velho e sobe o novo. Posições não se perdem (o Traccar
reenvia com `forward.retry.enable`, e o polling cobre buracos), mas o cliente vê o painel fora do ar e
erros na tela durante a subida.

**Fazer:** ligar health check (API: `GET /health`, que já existe e consulta o banco; front: `/`), avaliar
tirar o nome fixo da API trocando o `forward.url` do Traccar por um alias de rede estável, e combinar
janela de deploy (push na `hml` = deploy no cliente). Esforço: 1–2 h.

### 5. Coolify se atualiza sozinho
`is_auto_update_enabled = true`. Uma atualização do Coolify pode reiniciar o proxy (Traefik) e tirar o
painel e a API do ar sem aviso. **Fazer:** desligar e atualizar manualmente na janela. Esforço: 2 min.

### 6. Reboot pendente e rede do Traccar frágil
Existe `/var/run/reboot-required` e 18 pacotes para atualizar. Os containers sobem sozinhos
(`unless-stopped`), mas o Traccar está ligado à rede `coolify` por `docker network connect` manual — se o
container for recriado, o Forwarding para e a ingestão depende só do polling.

**Fazer:** declarar a rede `coolify` como `external` no `docker-compose.yml` do Traccar (fica permanente),
depois um reboot planejado de madrugada com conferência (posição chegando, `/health` ok). Esforço: 1 h.

### 7. Uma vCPU só
Load average acima de 1 numa CPU única; o build do Coolify roda na mesma máquina e disputa CPU com
Traccar, ingestão e banco. Com mais aparelhos do cliente isso piora. **Fazer:** subir para o plano de
2 vCPU / 8 GB (confirmar com a Hostinger que o IP não muda — o `gw.` já cobre se mudar), ou mover o
build para o GitHub Actions. Esforço: 30 min + custo mensal.

### 8. Ninguém é avisado se a plataforma cair
Não há monitor externo. **Fazer:** monitor gratuito (UptimeRobot/Better Stack) em
`https://app.lclfleet.com/api-localle/health` e na porta TCP de um protocolo do `gw.`, com alerta por
e-mail/WhatsApp. Complemento em código (pequeno): o `/health` hoje só testa o banco — incluir "última
posição recebida há menos de N minutos" para detectar ingestão parada com o resto no ar. Esforço: 1 h.

### 9. Imagens sem versão fixa
`edoburu/pgbouncer:latest` e `timescale/timescaledb-ha:pg16` (tag móvel). Um redeploy pode trazer versão
nova sem ninguém ter decidido. **Fazer:** fixar as tags (já é item do § 8 do plano de produção). 15 min.

## P2 — melhorias

10. **SMTP**: agora dá para mandar de `@lclfleet.com` com SPF/DKIM (Resend, SES ou o e-mail da Hostinger).
    Destrava convite e "esqueci a senha" sem link copiado à mão.
11. **Separar teste de dado real**: 4 clientes no banco e a retenção avisa "4 clientes sem contrato".
    Regularizar o contrato do cliente real e apagar/desativar os clientes e rastreadores de teste.
12. **Rate limit por IP no login** — anotado como débito no `auth.controller.ts`.
13. **security-review pendente** da ingestão (conciliação F1–F7) e do avatar.
14. **CORS aberto** (`app.enableCors()` sem origem): como a API é servida pelo próprio front, restringir a
    `APP_URL`.
15. **Painel do Coolify em domínio** (`coolify.lclfleet.com` com HTTPS) em vez de IP:8000 por http.
16. **Tirar o domínio sslip** do front quando o cliente estiver usando `app.lclfleet.com`.
17. **Reprogramar os rastreadores** que estão no IP para `gw.lclfleet.com` (comando remoto por modelo).

## Ordem sugerida

1. Hoje: itens 3 (2FA), 5 (auto-update) e 2 (SSH) — rápidos, só configuração.
2. Esta semana: item 1 (backup + cópia externa + teste de restauração) e item 8 (monitor).
3. Janela de madrugada: itens 6 (rede do Traccar + reboot) e 4 (health check).
4. Decisão de custo: item 7 (plano da VPS).
5. Depois: P2, começando por SMTP e limpeza dos dados de teste.

## Perguntas em aberto

- O plano da Hostinger inclui backup/snapshot automático da VPS?
- Onde guardar o backup fora da VPS (R2 já planejado? outra conta?)
- Quem mais acessa o servidor por SSH com senha hoje?
- Topa o custo de subir para 2 vCPU agora?
