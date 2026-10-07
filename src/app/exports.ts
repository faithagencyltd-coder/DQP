import { useCallback, useState } from 'react';
import { exportDqeExcel } from '../core/export/excel';
import { analysisReportHtml, dqeHtml } from '../core/export/report';
import { journal } from '../core/project';
import { api } from './browserApi';
import { useStore } from './store';

export type ExportFormat = 'xlsx' | 'pdf-dqe' | 'pdf-report';

export interface GeneratedDoc {
  path: string;
  label: string;
  at: string;
}

const LABEL: Record<ExportFormat, string> = {
  xlsx: 'DQE Excel',
  'pdf-dqe': 'DQE PDF',
  'pdf-report': 'Rapport d’analyse PDF',
};

function stamp() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

export function useExports() {
  const s = useStore();
  const [busy, setBusy] = useState(false);
  const [docs, setDocs] = useState<GeneratedDoc[]>([]);

  const run = useCallback(
    async (format: ExportFormat) => {
      const { project, folder, result, alerts } = s;
      if (!project || !folder || !result) return;
      setBusy(true);
      try {
        const base = project.info.name.replace(/[^\p{L}\p{N} _-]+/gu, ' ').trim().replace(/\s+/g, '_') || 'Projet';
        const all = [...project.analyses.flatMap((a) => a.fileAlerts), ...alerts];
        let path: string;
        if (format === 'xlsx') {
          const bytes = await exportDqeExcel(project, result, all, api.appVersion);
          path = await api.writeProjectFile(folder, 'Exports', `DQE_${base}_${stamp()}.xlsx`, bytes);
        } else if (format === 'pdf-dqe') {
          path = await api.htmlToPdf(folder, 'Exports', `DQE_${base}_${stamp()}.pdf`, dqeHtml(project, result, api.appVersion));
        } else {
          path = await api.htmlToPdf(folder, 'Documents', `Rapport_analyse_${base}_${stamp()}.pdf`, analysisReportHtml(project, result, alerts, api.appVersion));
        }
        setDocs((d) => [{ path, label: LABEL[format], at: new Date().toISOString() }, ...d]);
        s.update((p) => journal(p, format === 'pdf-report' ? 'Rapport d’analyse généré' : `Export ${LABEL[format]}`, path));
        s.toast('success', `${LABEL[format]} enregistré : ${path}`, api.platform === 'electron' ? { label: 'Ouvrir', run: () => void api.openPath(path) } : undefined);
      } catch (e) {
        s.toast('error', `Export impossible : ${(e as Error).message}`);
      } finally {
        setBusy(false);
      }
    },
    [s],
  );

  return { run, busy, docs };
}

export type Exporter = ReturnType<typeof useExports>;
