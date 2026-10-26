// Console da Locale · Equipe e auditoria: superadmins da Locale (GET /superadmin/equipe) e o registro de
// auditoria do backend (`audit_log`, GET /superadmin/auditoria) — ações de superadmin e mudanças de
// permissão/equipe feitas pelos admins dos clientes. Papel interno e dois fatores ainda não existem no schema.
import { Card, PageHeader, PageBody, Section, Grid, Table, Badge, Callout, EmptyState } from '../components/ui';
import { useStore } from '../lib/store';
import { adminApi, useAdminQuery, type AdminAuditEntry } from '../lib/localleApi';
import { fmtD, fmtDT } from '@localle/shared/utils';

const ACTION_LABEL: Record<string, string> = {
  'client.create': 'Cadastrou cliente',
  'user.create_initial_admin': 'Criou admin inicial',
  'user.create': 'Criou usuário',
};
const actionLabel = (a: string) => ACTION_LABEL[a] || a;

function detalhe(e: AdminAuditEntry): string {
  const after = (e.after || {}) as Record<string, unknown>;
  return ['name', 'email', 'role', 'imei', 'iccid'].filter((k) => after[k] != null).map((k) => String(after[k])).join(' · ');
}

const carregar = () => Promise.all([adminApi.equipe(), adminApi.auditoria()]);

export default function Equipe() {
  const session = useStore((s) => s.session);
  const { data, error, loading } = useAdminQuery(carregar);
  if (session?.role !== 'locale') return <Card><EmptyState illustration="ilu-sem-acesso" size="page" title="Acesso restrito à administração da plataforma" detail="Entre com o acesso da Locale para ver o Console da Locale." /></Card>;

  const [equipe, log] = data || [[], []];
  return (
    <div>
      <PageHeader icon="revenda" title="Equipe e auditoria" subtitle="Usuários da Locale e o registro de alterações feitas na plataforma" />
      <PageBody>
        {error && <Callout tone="crit">Não foi possível carregar: {error}</Callout>}
        <Section title="Usuários da Locale">
          <Grid cols={3} equal>
            {equipe.map((m) => (
              <Card key={m.id} icon="revenda">
                <div className="flex flex-col gap-hair">
                  <span className="text-body font-semibold">{m.email}</span>
                  <span className="text-small text-ink-2">Administrador da plataforma</span>
                  <span className="text-caption text-ink-2 num">Desde {fmtD(Date.parse(m.created_at))}</span>
                </div>
              </Card>
            ))}
          </Grid>
        </Section>
        <Section title="Registro de alterações">
          <Card>
            <Table minWidth={900} loading={loading && !data} align={['left', 'left', 'left', 'left', 'left']}
              head={['Quando', 'Quem', 'Ação', 'Cliente', 'Detalhe']}
              empty="Nenhuma alteração registrada ainda."
              rows={log.map((e) => [
                <span className="num text-small">{fmtDT(Date.parse(e.created_at))}</span>,
                <span className="text-small">{e.actor_email || '—'}<Badge tone={e.actor_type === 'superadmin' ? 'gray' : 'green'} className="ml-tight">{e.actor_type === 'superadmin' ? 'Locale' : 'Cliente'}</Badge></span>,
                actionLabel(e.action),
                e.client_name || <span className="text-ink-3">—</span>,
                <span className="text-small text-ink-2">{detalhe(e) || '—'}</span>,
              ])}
            />
          </Card>
        </Section>
      </PageBody>
    </div>
  );
}
