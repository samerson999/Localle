// Espelho de ponto do motorista profissional (Lei 13.103/2015) para impressão e assinatura.
import { computeDays, jornadaLimits, DayCalc } from '@localle/shared/jornada';
import { JOURNEY_TYPES } from '@localle/shared/catalog';
import { DAY, startOfDay, fmtD, fmtT, fmtDT, hm } from '@localle/shared/utils';

const WD = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
export const LEGAL_BASIS: Record<string, string> = { pausa: 'CTB art. 67-C', refeicao: 'CLT art. 235-C §2º', jornada: 'CLT art. 235-C', interjornada: 'CLT art. 235-C §3º', semanal: 'CLT art. 235-D' };
const SOURCE: Record<string, string> = { teclado: 'Teclado', app: 'App', manual: 'Ajuste manual' };

// código para conferir se o documento impresso corresponde aos registros do sistema
function verificationCode(text: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).toUpperCase().padStart(8, '0').replace(/(.{4})/, '$1-');
}

export interface SheetProps { driver: any; marks: any[]; from: number; to: number; company: { name: string; cnpj?: string; address?: string }; maxExtra: number; cfg?: any; issuedBy?: string; assetName?: string }

export function FolhaPonto({ driver, marks, from, to, company, maxExtra, cfg, issuedBy, assetName }: SheetProps) {
  const L = jornadaLimits(cfg || { maxExtra });
  const all = computeDays(marks, driver.regime, cfg || maxExtra);
  const hf = (ms: number) => { const h = Math.floor(ms / 3600000), m = Math.round((ms % 3600000) / 60000); return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`; };
  const days = all.filter((d) => d.day >= startOfDay(from) && d.day <= to);
  const byDay: Record<number, DayCalc> = Object.fromEntries(days.map((d) => [d.day, d]));
  const inPeriod = marks.filter((m) => m.ts >= startOfDay(from) && m.ts < startOfDay(to) + DAY).sort((a, b) => a.ts - b.ts);
  const calendar: number[] = [];
  for (let d = startOfDay(from); d <= Math.min(to, Date.now()); d += DAY) calendar.push(d); // dias futuros não entram
  const markOf = (d: DayCalc, type: string) => inPeriod.find((m) => m.type === type && m.ts >= d.start! && m.ts <= (d.end ?? d.start! + DAY));
  const viol = days.flatMap((d) => d.violations.map((v) => ({ d, v })));
  const sum = (k: keyof DayCalc) => days.reduce((x, d) => x + (d[k] as number || 0), 0);
  const manual = inPeriod.filter((m) => m.source === 'manual');
  const code = verificationCode(JSON.stringify([driver.id, from, to, inPeriod.map((m) => [m.ts, m.type, m.source])]));
  return (
    <section className="doc-sheet p-1">
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: 16, borderBottom: '2px solid currentColor', paddingBottom: 6, marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Espelho de ponto — motorista profissional</div>
          <div className="muted">Lei nº 13.103/2015 · CLT arts. 235-A a 235-H · CTB art. 67-C</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div><b>Período:</b> {fmtD(from)} a {fmtD(to)}</div>
          <div className="muted">Emitido em {fmtDT(Date.now())}{issuedBy ? ` por ${issuedBy}` : ''}</div>
          <div className="muted">Código de verificação: <b>{code}</b></div>
        </div>
      </header>
      <table style={{ marginBottom: 8 }}>
        <tbody>
          <tr><th style={{ width: '12%' }}>Empregador</th><td style={{ width: '38%' }}>{company.name}</td><th style={{ width: '12%' }}>CNPJ</th><td>{company.cnpj || '________________________'}</td></tr>
          <tr><th>Endereço</th><td colSpan={3}>{company.address || '__________________________________________________________'}</td></tr>
          <tr><th>Motorista</th><td>{driver.name}</td><th>CPF</th><td>{driver.cpf || '_______________'}</td></tr>
          <tr><th>CNH / categoria</th><td>{driver.cnh} · {driver.cnhCat}</td><th>Matrícula / veículo</th><td>{driver.registration || '—'}{assetName ? ` · ${assetName}` : ''}</td></tr>
          <tr><th>Atividade</th><td>{driver.regime === 'passageiros' ? `Transporte rodoviário de passageiros (direção contínua máx. ${hf(L.contPassageiros)})` : `Transporte rodoviário de cargas (direção contínua máx. ${hf(L.contCargas)})`}</td><th>Jornada contratual</th><td>{hf(L.base)} diárias · até {L.maxExtraH}h extras</td></tr>
        </tbody>
      </table>

      <div style={{ fontWeight: 700, margin: '6px 0 3px' }}>Marcações e apuração diária</div>
      <table>
        <thead><tr><th>Dia</th><th>Início</th><th>Refeição</th><th>Fim</th><th>Trabalhado</th><th>Extras</th><th>Noturno</th><th>Espera</th><th>Direção</th><th>Maior direção contínua</th><th>Interjornada</th><th>Ocorrências</th></tr></thead>
        <tbody>
          {calendar.map((day) => {
            const d = byDay[day];
            const dt = new Date(day);
            if (!d) return <tr key={day} className="off"><td style={{ whiteSpace: 'nowrap' }}>{fmtD(day)} {WD[dt.getDay()]}</td><td colSpan={11}>Sem jornada registrada (folga / descanso)</td></tr>;
            const r1 = markOf(d, 'inicio_refeicao'), r2 = markOf(d, 'fim_refeicao');
            return (
              <tr key={day} className={d.violations.length ? 'viol' : ''}>
                <td style={{ whiteSpace: 'nowrap' }}>{fmtD(day)} {WD[dt.getDay()]}</td><td>{fmtT(d.start!)}</td><td style={{ whiteSpace: 'nowrap' }}>{r1 ? `${fmtT(r1.ts)}–${r2 ? fmtT(r2.ts) : '?'}` : '—'}</td><td>{d.end ? fmtT(d.end) : 'em aberto'}</td>
                <td>{hm(d.worked)}</td><td>{d.extra ? hm(d.extra) : '—'}</td><td>{d.night ? hm(d.night) : '—'}</td><td>{d.wait ? hm(d.wait) : '—'}</td><td>{hm(d.driving)}</td><td>{hm(d.maxCont)}</td><td>{d.interjornada ? hm(d.interjornada) : '—'}</td>
                <td>{d.violations.map((v) => v.label).join('; ') || '—'}</td>
              </tr>
            );
          })}
        </tbody>
        <tbody><tr><th>Totais</th><th colSpan={3}>{days.length} dias com jornada</th><th>{hm(sum('worked'))}</th><th>{hm(sum('extra'))}</th><th>{hm(sum('night'))}</th><th>{hm(sum('wait'))}</th><th>{hm(sum('driving'))}</th><th colSpan={2}></th><th>{viol.length} ocorrência(s)</th></tr></tbody>
      </table>

      <div style={{ fontWeight: 700, margin: '10px 0 3px' }}>Infrações apuradas no período</div>
      {viol.length ? (
        <table>
          <thead><tr><th style={{ width: '10%' }}>Data</th><th style={{ width: '26%' }}>Infração</th><th>Detalhe</th><th style={{ width: '16%' }}>Base legal</th></tr></thead>
          <tbody>{viol.map(({ d, v }, i) => <tr key={i}><td>{fmtD(d.day)}</td><td>{v.label}</td><td>{v.detail}</td><td>{LEGAL_BASIS[v.code] || ''}</td></tr>)}</tbody>
        </table>
      ) : <p className="muted">Nenhuma infração apurada no período.</p>}

      <div style={{ fontWeight: 700, margin: '10px 0 3px' }}>Registro detalhado das marcações</div>
      <table style={{ fontSize: 9.5 }}>
        <thead><tr><th>Data e hora</th><th>Marcação</th><th>Origem</th><th>Data e hora</th><th>Marcação</th><th>Origem</th><th>Data e hora</th><th>Marcação</th><th>Origem</th></tr></thead>
        <tbody>
          {Array.from({ length: Math.ceil(inPeriod.length / 3) }, (_, r) => (
            <tr key={r}>{[0, 1, 2].map((c) => { const m = inPeriod[r * 3 + c]; return m ? [<td key={c + 'a'}>{fmtDT(m.ts)}</td>, <td key={c + 'b'}>{JOURNEY_TYPES[m.type]}</td>, <td key={c + 'c'} style={m.source === 'manual' ? { fontWeight: 700 } : {}}>{SOURCE[m.source] || m.source}</td>] : [<td key={c + 'a'} />, <td key={c + 'b'} />, <td key={c + 'c'} />]; })}</tr>
          ))}
        </tbody>
      </table>
      {manual.length > 0 && <p className="muted" style={{ marginTop: 3 }}>{manual.length} marcação(ões) incluída(s) por ajuste manual estão destacadas em negrito.</p>}

      <div style={{ marginTop: 12, border: '1px solid var(--doc-rule)', padding: 8 }}>
        <p>Declaro que conferi as marcações acima, que elas correspondem à jornada que cumpri no período indicado e que recebi cópia deste espelho de ponto.</p>
        <p style={{ marginTop: 6 }}>Observações do motorista: ______________________________________________________________________________________________</p>
        <p style={{ marginTop: 6 }}>______________________________________________________________________________________________________________________</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 40, marginTop: 34, textAlign: 'center' }}>
        <div style={{ borderTop: '1px solid currentColor', paddingTop: 4 }}>{driver.name}<br /><span className="muted">Motorista</span></div>
        <div style={{ borderTop: '1px solid currentColor', paddingTop: 4 }}>{company.name}<br /><span className="muted">Empregador / responsável</span></div>
        <div style={{ borderTop: '1px solid currentColor', paddingTop: 4 }}>Local e data<br /><span className="muted">________________, ____/____/______</span></div>
      </div>
    </section>
  );
}
