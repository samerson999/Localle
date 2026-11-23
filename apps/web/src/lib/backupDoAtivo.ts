import { useEffect, useState } from 'react';
import { backupDoAtivo, isRealAsset, type BackupDoAtivo } from './localleApi';

const ATUALIZA_MS = 60_000; // backup costuma mandar posição de tempos em tempos; 1 min basta com o card aberto

/**
 * Backup do ativo aberto no card do Monitoramento (pedido de 23/11/2026): a última posição dele aparece no card, mas o
 * marcador no mapa continua sendo só do principal. `null` = sem backup (ou ainda carregando, ou falhou — o card só omite).
 */
export function useBackupDoAtivo(asset: { id: string } | null | undefined): BackupDoAtivo | null {
  const id = asset && isRealAsset(asset) ? asset.id : null;
  const [backup, setBackup] = useState<BackupDoAtivo | null>(null);
  useEffect(() => {
    setBackup(null);
    if (!id) return;
    let vivo = true;
    const carregar = () => backupDoAtivo(id).then((b) => { if (vivo) setBackup(b); }).catch(() => { /* sem permissão ou fora do ar: o card fica sem o bloco */ });
    carregar();
    const t = setInterval(carregar, ATUALIZA_MS);
    return () => { vivo = false; clearInterval(t); };
  }, [id]);
  return backup;
}
