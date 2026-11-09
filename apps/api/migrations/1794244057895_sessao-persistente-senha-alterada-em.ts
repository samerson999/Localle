import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

// Sessão persistente (docs/PLANO-APK-TWA.md §§ 2-3): o front passa a guardar o token em storage que
// sobrevive ao fechamento do app e a renová-lo via POST /auth/renovar (já existia, nunca era chamado) em
// vez de reautenticar — o que vale a pena para push (abrir pelo toque na notificação sem precisar logar
// de novo). Sem `senha_alterada_em`, um token emitido antes de uma troca de senha continuaria sendo aceito
// e renovável por até `SESSAO_MAX_DIAS` (jwt.ts) mesmo depois da troca — hoje isso já seria um problema
// pequeno (token morre em 8h de qualquer jeito); com sessão de dias, vira real. O AuthGuard passa a
// comparar o `iat` do token com esta coluna (auth/active-user.repository.ts).
//
// `default now()`: ao subir esta migration, todo token já emitido antes dela fica com `iat` anterior ao
// valor gravado aqui — efeito colateral esperado e aceito (força um novo login uma única vez no deploy
// desta mudança; é o comportamento correto para uma coluna de segurança nova, não um bug).
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    alter table public.users add column senha_alterada_em timestamptz not null default now();
    alter table public.superadmins add column senha_alterada_em timestamptz not null default now();
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    alter table public.superadmins drop column senha_alterada_em;
    alter table public.users drop column senha_alterada_em;
  `);
}
