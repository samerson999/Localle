// Console da Locale · Equipe e auditoria: usuários da Locale e o registro de alterações (lib/audit.ts) —
// o mesmo motor de auditoria usado nos cadastros do cliente, aqui filtrado para as ações da plataforma.
import { Card, PageHeader, PageBody, Section, Grid, Badge, EmptyState } from '../components/ui';
import { Icon } from '../components/icons';
import { useStore } from '../lib/store';
import { AuditLog } from './Ativos';

interface TeamMember { id: string; name: string; email: string; role: string; twoFactor: boolean }
const TEAM: TeamMember[] = [
  { id: 't1', name: 'Rafael Lins', email: 'rafael@locale.com', role: 'Administrador da plataforma', twoFactor: true },
  { id: 't2', name: 'Camila Duarte', email: 'camila@locale.com', role: 'Financeiro', twoFactor: true },
  { id: 't3', name: 'Diego Albuquerque', email: 'diego@locale.com', role: 'Suporte', twoFactor: false },
];

export default function Equipe() {
  const session = useStore((s) => s.session);
  if (session?.role !== 'locale') return <Card><EmptyState illustration="ilu-sem-acesso" size="page" title="Acesso restrito à administração da plataforma" detail="Entre com locale@demo.com para ver o Console da Locale." /></Card>;

  return (
    <div>
      <PageHeader icon="revenda" title="Equipe e auditoria" subtitle="Usuários da Locale e o registro de todas as alterações de configuração e cobrança" />
      <PageBody>
        <Section title="Usuários da Locale">
          <Grid cols={3} equal>
            {TEAM.map((m) => (
              <Card key={m.id} icon="revenda">
                <div className="flex flex-col gap-hair">
                  <span className="text-body font-semibold">{m.name}</span>
                  <span className="text-small text-ink-2">{m.email}</span>
                  <span className="text-small text-ink-2">{m.role}</span>
                  <Badge tone={m.twoFactor ? 'green' : 'orange'} className="mt-tight">{m.twoFactor ? 'Dois fatores ativo' : 'Dois fatores desativado'}</Badge>
                </div>
              </Card>
            ))}
          </Grid>
        </Section>
        <Section title="Registro de alterações">
          <AuditLog />
        </Section>
      </PageBody>
    </div>
  );
}
