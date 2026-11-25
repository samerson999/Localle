// Console da Locale › API (docs/PLANO-API-PUBLICA.md): toda a gestão das chaves da API pública de consulta — as dos
// clientes (vinculadas a um cliente) e as mestras da Localle. A aba fica na URL (?aba=).
import { PageBody, PageHeader, TabPanel, Tabs, useUrlTab } from '../components/ui';
import { ChavesClientesAba } from '../components/api/ChavesClientesAba';
import { ChavesMestrasAba } from '../components/api/ChavesMestrasAba';

const ABAS = [
  { key: 'clientes', label: 'Chaves dos clientes' },
  { key: 'mestras', label: 'Chaves mestras' },
];

export default function ApiConsole() {
  const [aba, setAba] = useUrlTab('clientes');
  return (
    <div>
      <PageHeader icon="chave" title="API" subtitle={<>Chaves de acesso da API de consulta. Documentação em <a className="underline" href="/api/v1/docs" target="_blank" rel="noreferrer">/api/v1/docs</a></>} />
      <PageBody>
        <Tabs value={aba} onChange={setAba} tabs={ABAS} />
        <TabPanel id={aba}>{aba === 'mestras' ? <ChavesMestrasAba /> : <ChavesClientesAba />}</TabPanel>
      </PageBody>
    </div>
  );
}
