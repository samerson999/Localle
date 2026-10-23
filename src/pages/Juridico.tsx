// Console da Locale · Jurídico: reservada para contratos, termos de comodato, fidelidade e multas contratuais.
// Sem regra automática por enquanto — a definir com o jurídico (docs/PLANO-SETUP-ADMIN.md, seção 0).
import { Card, PageHeader, PageBody, EmptyState } from '../components/ui';
import { useStore } from '../lib/store';

export default function Juridico() {
  const session = useStore((s) => s.session);
  if (session?.role !== 'locale') return <Card><EmptyState illustration="ilu-sem-acesso" size="page" title="Acesso restrito à administração da plataforma" detail="Entre com locale@demo.com para ver o Console da Locale." /></Card>;

  return (
    <div>
      <PageHeader icon="documento" title="Jurídico" subtitle="Contratos, termos de comodato, fidelidade e multas contratuais" />
      <PageBody>
        <Card>
          <EmptyState icon="documento" title="Reservada para o jurídico" detail="A data de vencimento do contrato já existe no cadastro do cliente, em Clientes, mas sem regra automática além do aviso de vencimento. Fidelidade, comodato e multas contratuais são definidos junto com o jurídico." />
        </Card>
      </PageBody>
    </div>
  );
}
