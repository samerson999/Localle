---
paths: apps/**, infra/**
---

# Segurança — diretrizes executáveis

Complementa `.claude/rules/backend.md` (isolamento multi-tenant, JWT). Aqui ficam as regras de SEC que se
aplicam a qualquer código novo, não só a `apps/api`.

## Regras inegociáveis

1. **Nunca confiar em entrada do cliente para decisão de autorização.** `client_id`, `role`, `is_admin` e
   qualquer campo de permissão só podem vir do JWT validado pelo `AuthGuard` — nunca de header, body, query
   string ou cookie não assinado. Isso vale também para `apps/web`: não usar estado do front como fonte de
   verdade de permissão, só para esconder/mostrar UI.
2. **Toda rota nova é autenticada por padrão.** Uma rota pública (sem `@UseGuards(AuthGuard)`) precisa de
   justificativa explícita no PR/commit — não é o caminho padrão de implementação.
3. **IDOR é o bug mais provável neste domínio** (multi-tenant com `client_id`, recursos como rastreadores,
   instalações, posições). Toda rota que recebe um `id` de recurso no path/body tem que provar, com teste,
   que um `client_id` diferente não consegue ler nem escrever esse recurso — ver critério de
   `assets.isolation.spec.ts` em `.claude/rules/backend.md`.
4. **SQL sempre parametrizado.** `pg` cru não tem ORM para proteger você — nunca concatenar string de
   usuário em query, nem em métodos customizados de repository. Usar sempre `$1, $2...` do driver `pg`.
5. **Segredos nunca em código ou log.** `JWT_SECRET`, `DATABASE_URL`, senha, token de sessão, token do
   Traccar — nunca em commit, nunca em `console.log`/`Logger`, nunca em mensagem de erro devolvida ao
   cliente. Erros genéricos para o usuário final, detalhe completo só no log do servidor.
6. **Rate limiting e brute force em endpoints de auth.** Login, reset de senha e qualquer endpoint que
   aceite credencial repetidamente precisa de proteção contra tentativa em massa (rate limit por IP/conta) —
   se ainda não existir, sinalizar como débito ao tocar nesses endpoints, não ignorar silenciosamente.
7. **Dependências e supply chain:** não adicionar pacote novo sem necessidade real; preferir pacote já usado
   no monorepo. Ao atualizar dependência de auth/crypto (`bcryptjs`, `jsonwebtoken`), checar changelog antes.
8. **Upload e ingestão de dado externo (Traccar, assets) é fronteira de confiança.** Validar tipo, tamanho e
   forma do payload antes de persistir ou repassar a outro serviço; nunca deserializar payload externo sem
   schema/DTO.
9. **CORS e cookies:** `apps/api` não deve liberar `*` em produção; cookie de sessão (se usado) precisa de
   `httpOnly`, `secure` e `SameSite` apropriados.
10. **Nunca desativar verificação de segurança para "fazer funcionar"** (ex.: `rejectUnauthorized: false` em
    TLS do Postgres, pular validação de DTO, comentar um guard) sem decisão explícita do usuário registrada
    no commit/PR.

## Quando tocar código sensível (auth, pagamento/faturamento, isolamento multi-tenant, ingestão Traccar)

- Ler `docs/ARQUITETURA-BACKEND.md` e `.claude/rules/backend.md` antes de implementar.
- Teste de isolamento/autorização nasce junto com a mudança, não depois (mesma premissa de
  `.claude/rules/testing.md`).
- Para mudança de superfície de ataque relevante (nova rota pública, nova integração externa, mudança em
  `AuthGuard`/JWT/RLS), rodar a skill `security-review` antes de considerar a tarefa concluída.
- Para validar robustez de isolamento/autorização de um módulo novo ou alterado, usar os agentes
  `pentester-isolamento` e `pentester-input` (`.claude/agents/`) — eles tentam ativamente quebrar a
  proteção em vez de só ler o código.
