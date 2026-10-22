import React, { createContext, useContext } from 'react';
import { useStore, useStoreData } from './store';
import { registerOdometer } from './odometer';
import { people as localPeople, localBi, validateLocal, personOf, ChecklistBi } from './checklist';
import { uid, toInputDT } from './utils';

export interface CkRepo {
  remote: boolean; loading: boolean; error?: string;
  people: any[]; groups: any[]; templates: any[]; responses: any[];
  saveTemplate: (t: any) => Promise<void>; deleteTemplate: (id: string) => Promise<void>; setActive: (id: string, v: boolean) => Promise<void>;
  saveGroup: (g: any) => Promise<void>; deleteGroup: (id: string) => Promise<void>;
  saveStaff: (p: any) => Promise<void>; deleteStaff: (id: string) => Promise<void>;
  submit: (r: { templateId: string; personId: string; assetId: string; startedAt: number; answers: any }) => Promise<string>;
  bi: (from: number, to: number) => Promise<ChecklistBi>;
  photoOf: (responseId: string, questionId: string) => Promise<string | null>;
  reload: () => Promise<void>;
}
const Ctx = createContext<CkRepo | null>(null);
export const useCk = () => useContext(Ctx)!;

const normTpl = (t: any) => ({ ...t, targets: t.targets || { groupIds: [], personIds: t.driverIds || [] } });

function useLocal(): CkRepo {
  const s = useStoreData();
  return {
    remote: false, loading: false,
    people: localPeople(s), groups: s.respondentGroups || [], templates: s.checklistTemplates.map(normTpl),
    responses: s.checklistResponses.map((r: any) => ({ ...r, personId: personOf(r) })),
    saveTemplate: async (t) => { s.upsert('checklistTemplates', { ...t, driverIds: undefined }); },
    deleteTemplate: async (id) => s.remove('checklistTemplates', id),
    setActive: async (id, v) => { s.upsert('checklistTemplates', { id, active: v }); },
    saveGroup: async (g) => s.patch((st: any) => { const arr = st.respondentGroups || []; const it = g.id ? g : { ...g, id: uid('rg') }; return { respondentGroups: arr.some((x: any) => x.id === it.id) ? arr.map((x: any) => (x.id === it.id ? it : x)) : [...arr, it] }; }),
    deleteGroup: async (id) => s.patch((st: any) => ({ respondentGroups: (st.respondentGroups || []).filter((x: any) => x.id !== id) })),
    saveStaff: async (p) => s.patch((st: any) => { const arr = st.staff || []; const it = p.id ? p : { ...p, id: uid('st') }; return { staff: arr.some((x: any) => x.id === it.id) ? arr.map((x: any) => (x.id === it.id ? it : x)) : [...arr, it] }; }),
    deleteStaff: async (id) => s.patch((st: any) => ({ staff: (st.staff || []).filter((x: any) => x.id !== id) })),
    submit: async ({ templateId, personId, assetId, startedAt, answers }) => {
      const tpl = s.checklistTemplates.find((x: any) => x.id === templateId);
      const err = validateLocal(tpl, answers); if (err) return err;
      const a = { ...answers };
      tpl.questions.filter((q: any) => q.type === 'datahora').forEach((q: any) => (a[q.id] = { value: toInputDT(Date.now()) }));
      s.upsert('checklistResponses', { templateId, personId, driverId: personId, assetId, startedAt, finishedAt: Date.now(), answers: a });
      const kmQ = tpl.questions.find((q: any) => q.type === 'km' && a[q.id]?.value);
      if (kmQ && assetId) registerOdometer(assetId, +a[kmQ.id].value, 'checklist', localPeople(s).find((p: any) => p.id === personId)?.name);
      return '';
    },
    bi: async (from, to) => localBi(s, from, to),
    photoOf: async (rid, qid) => s.checklistResponses.find((r: any) => r.id === rid)?.answers?.[qid]?.photo || null,
    reload: async () => {},
  };
}

function L({ children }: { children: React.ReactNode }) { return <Ctx.Provider value={useLocal()}>{children}</Ctx.Provider>; }
// No produto real, as mesmas operações são funções do backend (fn_submit_checklist, fn_checklist_bi…):
// docs/especificacao-sql/20261017150000_checklist.sql.
export function CkProvider({ children }: { children: React.ReactNode }) { return <L>{children}</L>; }
