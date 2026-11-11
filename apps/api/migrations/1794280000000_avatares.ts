import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

// Foto do avatar do próprio usuário (Minha conta, 11/11/2026). Fica em tabela à parte, não como coluna de `users`/
// `superadmins`: os `select *` do login, do AuthGuard e da lista de usuários não passam a carregar a imagem.
// A imagem é um data URL pequeno (o front reduz para 256 px em JPEG) — guardada no banco até o armazenamento de
// arquivos existir (docs/PLANO-ARMAZENAMENTO-ARQUIVOS.md); aí a coluna vira a chave do objeto.
// - `usuario_avatares` tem `client_id` e FK composta (user_id, client_id) → users(id, client_id): a foto não tem como
//   ficar presa a um cliente diferente do dono. Um por usuário (PK user_id); some junto com o usuário.
// - `superadmin_avatares`: equipe da Localle, fora da hierarquia de clientes (como `superadmins`).
// - O check só aceita JPEG/PNG/WebP em base64 e até 90.000 caracteres (~66 KB): SVG fica de fora (pode carregar
//   script) e o limite cabe no corpo JSON padrão da API (100 KB). A API valida antes (avatar.ts); o check é a rede.
const CHECK_IMAGEM = `imagem ~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$' and length(imagem) <= 90000`;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    alter table public.users add constraint users_id_client_uniq unique (id, client_id);

    create table public.usuario_avatares (
      user_id uuid primary key,
      client_id uuid not null references public.clients(id) on delete cascade,
      imagem text not null check (${CHECK_IMAGEM}),
      atualizado_em timestamptz not null default now(),
      foreign key (user_id, client_id) references public.users(id, client_id) on delete cascade
    );

    create table public.superadmin_avatares (
      superadmin_id uuid primary key references public.superadmins(id) on delete cascade,
      imagem text not null check (${CHECK_IMAGEM}),
      atualizado_em timestamptz not null default now()
    );
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    drop table public.superadmin_avatares;
    drop table public.usuario_avatares;
    alter table public.users drop constraint users_id_client_uniq;
  `);
}
