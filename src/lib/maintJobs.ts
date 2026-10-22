// Rotinas de manutenção da demonstração, em qualquer tela: leitura diária do rastreador e escalonamento por e-mail.
// No produto real o equivalente é do backend: fn_daily_maintenance (docs/especificacao-sql/).
import { useEffect } from 'react';
import { useStore } from './store';
import { consolidateTrackerReadings } from './km';
import { runEscalation } from './escalation';

export function runMaintJobs(now = Date.now()) {
  const st = useStore.getState();
  if (!st.session) return;
  const odometerReadings = consolidateTrackerReadings(st, now);
  const esc = runEscalation(odometerReadings ? { ...st, odometerReadings } : st, now);
  if (odometerReadings || esc) st.patch(() => ({ ...(odometerReadings ? { odometerReadings } : {}), ...(esc || {}) }));
}

export function useMaintJobs() {
  useEffect(() => { runMaintJobs(); const t = setInterval(() => runMaintJobs(), 60000); return () => clearInterval(t); }, []);
}
