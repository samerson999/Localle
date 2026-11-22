import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

// Convite de usuário do cliente e "esqueci minha senha" passam de link para código de 6 dígitos (22/11/2026).
// - `token_hash` passa a guardar o HMAC de `user_id:código` (src/auth/codigo.ts). Código curto se repete entre
//   usuários e entre emissões do mesmo usuário, então o `unique` sai; a busca é pelo usuário (e-mail), não pelo hash.
// - `tentativas`: erros de código naquele convite/pedido. Ao chegar no limite, ele é revogado — 6 dígitos só
//   aguentam força bruta com esse teto.
// Convites e pedidos abertos com link antigo são revogados: o link não tem mais tela que o aceite.
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    alter table public.convites drop constraint convites_token_hash_key;
    alter table public.convites add column tentativas int not null default 0;
    update public.convites set revogado_em = now() where usado_em is null and revogado_em is null;

    alter table public.senha_redefinicoes drop constraint senha_redefinicoes_token_hash_key;
    alter table public.senha_redefinicoes add column tentativas int not null default 0;
    update public.senha_redefinicoes set revogado_em = now() where usado_em is null and revogado_em is null;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    alter table public.convites drop column tentativas;
    alter table public.senha_redefinicoes drop column tentativas;
    delete from public.convites where token_hash in (select token_hash from public.convites group by 1 having count(*) > 1);
    delete from public.senha_redefinicoes where token_hash in (select token_hash from public.senha_redefinicoes group by 1 having count(*) > 1);
    alter table public.convites add constraint convites_token_hash_key unique (token_hash);
    alter table public.senha_redefinicoes add constraint senha_redefinicoes_token_hash_key unique (token_hash);
  `);
}
