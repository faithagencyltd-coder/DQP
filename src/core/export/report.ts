// Documents HTML imprimables (convertis en PDF par l'application) :
// DQE (§38) et rapport d'analyse du projet (§19, §39).

import type { ProjectResult } from '../dqe';
import { exportNumbers, groupSections } from '../dqe';
import { amountInWords, formatNumber } from '../format';
import { crossCheck } from '../elements/crosscheck';
import { activeElements, effectiveStatus } from '../elements/ops';
import type { Alert, Confidence, Project } from '../types';

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const STATUS: Record<Confidence, { label: string; cls: string }> = {
  confirmed: { label: 'Confirmé', cls: 'ok' },
  to_verify: { label: 'À vérifier', cls: 'warn' },
  undetermined: { label: 'Non déterminé', cls: 'bad' },
};

const CSS = `
@page { size: A4; margin: 14mm 12mm 16mm 12mm; }
* { box-sizing: border-box; }
body { font-family: "Segoe UI", Arial, sans-serif; font-size: 9.5pt; color: #1b2430; margin: 0; }
h1 { font-size: 17pt; margin: 0 0 2mm; letter-spacing: .5px; }
h2 { font-size: 12pt; margin: 7mm 0 2mm; padding: 1.5mm 2.5mm; background: #1f3a5f; color: #fff; }
h3 { font-size: 10.5pt; margin: 4mm 0 1.5mm; color: #1f3a5f; }
.cover { text-align: center; padding: 8mm 0 4mm; border-bottom: 2px solid #1f3a5f; margin-bottom: 4mm; }
.cover .sub { font-size: 10.5pt; color: #4a5868; margin: 1mm 0; }
.cover .doc { font-size: 13pt; font-weight: 700; margin-top: 3mm; }
table { width: 100%; border-collapse: collapse; page-break-inside: auto; }
tr { page-break-inside: avoid; }
th, td { border: 0.6px solid #b8c2cc; padding: 1.2mm 1.6mm; vertical-align: top; }
th { background: #e8eef5; font-size: 8.5pt; text-transform: uppercase; }
td.n { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
td.c { text-align: center; }
tr.path td { font-weight: 700; text-decoration: underline; border-left: none; border-right: none; }
tr.sec td { font-weight: 700; font-style: italic; }
tr.sub td { font-weight: 700; font-style: italic; background: #f6f8fa; }
tr.tot td { font-weight: 800; background: #e8eef5; }
.words { font-style: italic; font-size: 8.5pt; margin: 1.5mm 0 4mm; }
.warn { background: #fff4d6; }
.bad { background: #fde2e1; }
.pill { display: inline-block; padding: 0 2mm; border-radius: 3mm; font-size: 8pt; font-weight: 600; }
.pill.ok { background: #dcfce7; color: #166534; } .pill.warn { color: #92400e; } .pill.bad { color: #991b1b; }
.kpis { display: flex; gap: 3mm; margin: 2mm 0; }
.kpi { flex: 1; border: 0.6px solid #b8c2cc; padding: 2.5mm; }
.kpi b { display: block; font-size: 13pt; }
.muted { color: #5b6878; }
.foot { margin-top: 6mm; font-size: 8pt; color: #5b6878; border-top: 0.6px solid #b8c2cc; padding-top: 2mm; }
.lot { page-break-before: auto; }
.manual { color: #1d4ed8; }
`;

function cover(project: Project, docTitle: string): string {
  const i = project.info;
  return `<div class="cover">
    <h1>${esc(i.name.toUpperCase())}</h1>
    ${i.client ? `<div class="sub">Maître d’ouvrage : ${esc(i.client)}</div>` : ''}
    ${i.location ? `<div class="sub">${esc(i.location)}</div>` : ''}
    ${i.projectType ? `<div class="sub">Type : ${esc(i.projectType)}</div>` : ''}
    <div class="doc">${esc(docTitle)}</div>
    <div class="sub">${esc([i.phase, i.date].filter(Boolean).join(' — '))}</div>
  </div>`;
}

function page(title: string, body: string): string {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${CSS}</style></head><body>${body}</body></html>`;
}

export function recapTable(project: Project, result: ProjectResult): string {
  const cur = project.settings.currency;
  const rows = project.lots
    .map((lot, i) => {
      const t = result.lots.get(lot.id)!;
      return `<tr><td class="c">${i + 1}</td><td>${esc(lot.code)} — ${esc(lot.name)}</td><td class="n">${formatNumber(t.amount, 0)}</td><td class="n">${result.totalHT ? formatNumber((t.amount / result.totalHT) * 100, 1) + ' %' : '—'}</td></tr>`;
    })
    .join('');
  const vat = project.settings.vatRate > 0;
  const final = vat ? result.totalTTC : result.totalHT;
  return `<table><thead><tr><th style="width:10mm">N°</th><th>Désignation</th><th style="width:38mm">Montant (${esc(cur)})</th><th style="width:18mm">Part</th></tr></thead><tbody>
    ${rows}
    <tr class="tot"><td></td><td>TOTAL HORS TAXES</td><td class="n">${formatNumber(result.totalHT, 0)}</td><td></td></tr>
    ${vat ? `<tr><td></td><td>TVA ${formatNumber(project.settings.vatRate)} %</td><td class="n">${formatNumber(result.vat, 0)}</td><td></td></tr>
    <tr class="tot"><td></td><td>TOTAL TOUTES TAXES COMPRISES</td><td class="n">${formatNumber(result.totalTTC, 0)}</td><td></td></tr>` : ''}
  </tbody></table>
  <p class="words">Arrêté le présent devis à la somme de : <b>${esc(amountInWords(final))}</b> ${vat ? 'TTC' : 'HT'}.</p>
  ${result.incomplete ? `<p class="muted">Attention : ${result.incomplete} ligne(s) sans quantité ou sans prix ne sont pas chiffrées dans ce total.</p>` : ''}`;
}

export function dqeHtml(project: Project, result: ProjectResult, appVersion: string): string {
  const cur = project.settings.currency;
  const numbers = exportNumbers(project);
  const lots = project.lots
    .map((lot) => {
      const lt = result.lots.get(lot.id)!;
      const body = groupSections(lot)
        .map((g) => {
          const head = g.path.length ? `<tr class="path"><td></td><td colspan="5">${esc(g.path.join(' › '))}</td></tr>` : '';
          return (
            head +
            g.sections
              .map((s) => {
                const lines = s.lines
                  .map((l) => {
                    const r = result.lines.get(l.id)!;
                    const qCls = r.quantityStatus === 'confirmed' ? '' : STATUS[r.quantityStatus].cls;
                    const pCls = l.unitPrice.status === 'confirmed' ? '' : STATUS[l.unitPrice.status].cls;
                    const manualQ = l.quantity.origin === 'manual' ? ' manual' : '';
                    const manualP = l.unitPrice.origin === 'manual' ? ' manual' : '';
                    return `<tr><td class="c">${esc(numbers.get(l.id))}</td><td>${esc(l.designation)}</td><td class="c">${esc(l.unit)}</td>
                      <td class="n ${qCls}${manualQ}">${formatNumber(r.retained)}</td><td class="n ${pCls}${manualP}">${formatNumber(l.unitPrice.value, 0)}</td><td class="n">${formatNumber(r.amount, 0)}</td></tr>`;
                  })
                  .join('');
                const st = result.sections.get(s.id)!;
                return `<tr class="sec"><td></td><td colspan="5">${esc(s.title)}</td></tr>${lines}
                  <tr class="sub"><td></td><td colspan="4">Sous-total ${esc(s.title)}</td><td class="n">${formatNumber(st.amount, 0)}</td></tr>`;
              })
              .join('')
          );
        })
        .join('');
      return `<div class="lot"><h2>${esc(lot.code)} — ${esc(lot.name.toUpperCase())}</h2>
        <table><thead><tr><th style="width:10mm">N°</th><th>Désignation</th><th style="width:13mm">Unité</th><th style="width:20mm">Quantité</th><th style="width:22mm">P.U. (${esc(cur)})</th><th style="width:28mm">Montant (${esc(cur)})</th></tr></thead>
        <tbody>${body}<tr class="tot"><td></td><td colspan="4">TOTAL ${esc(lot.code)} — ${esc(lot.name.toUpperCase())}</td><td class="n">${formatNumber(lt.amount, 0)}</td></tr></tbody></table>
        <p class="words">Arrêté le présent lot à la somme de : ${esc(amountInWords(lt.amount))}.</p></div>`;
    })
    .join('');
  const legend = `<p class="muted">Légende : <span class="pill warn warn">à vérifier</span> <span class="pill bad bad">non déterminé</span> <span class="manual">valeur modifiée manuellement</span>.</p>`;
  return page(
    `DQE — ${project.info.name}`,
    `${cover(project, 'DEVIS QUANTITATIF ET ESTIMATIF')}${legend}${lots}
     <h2>RÉCAPITULATIF GÉNÉRAL</h2>${recapTable(project, result)}
     <div class="foot">Document produit par DQP ${esc(appVersion)} le ${new Date().toLocaleDateString('fr-FR')} — montants calculés par le moteur DQP (Quantité × Prix unitaire).</div>`,
  );
}

export function analysisReportHtml(project: Project, result: ProjectResult, alerts: Alert[], appVersion: string): string {
  const i = project.info;
  const files = project.sourceFiles
    .map((f) => `<tr><td>${esc(f.name)}</td><td class="c">${esc(f.kind.toUpperCase())}</td><td class="n">${formatNumber(f.size / 1024, 0)} Ko</td><td>${new Date(f.importedAt).toLocaleString('fr-FR')}</td></tr>`)
    .join('');
  const detected = project.analyses
    .flatMap((a) => a.detected.map((d) => ({ ...d, file: a.fileName })))
    .map((d) => `<tr><td>${esc(DETECTED_LABEL[d.key])}</td><td>${esc(d.value)}</td><td><span class="pill ${STATUS[d.status].cls}">${STATUS[d.status].label}</span></td><td>${esc(d.file)}${d.source?.cell ? ' !' + esc(d.source.cell) : ''}${d.note ? '<br><span class="muted">' + esc(d.note) + '</span>' : ''}</td></tr>`)
    .join('');

  // Quantités par unité (métré issu du DQE).
  const byUnit = new Map<string, { lines: number; qty: number }>();
  for (const lot of project.lots)
    for (const s of lot.sections)
      for (const l of s.lines) {
        const r = result.lines.get(l.id)!;
        const k = l.unit || '(sans unité)';
        const e = byUnit.get(k) ?? { lines: 0, qty: 0 };
        e.lines++;
        e.qty += r.retained ?? 0;
        byUnit.set(k, e);
      }
  const units = [...byUnit].map(([u, e]) => `<tr><td class="c">${esc(u)}</td><td class="n">${e.lines}</td><td class="n">${formatNumber(e.qty)}</td></tr>`).join('');

  const lots = project.lots
    .map((lot) => {
      const t = result.lots.get(lot.id)!;
      const src = lot.sourceTotal;
      const diff = src?.value != null ? t.amount - src.value : null;
      return `<tr><td>${esc(lot.code)} — ${esc(lot.name)}</td><td class="n">${t.lines}</td><td class="n">${t.incomplete}</td><td class="n">${formatNumber(t.amount, 0)}</td>
        <td class="n">${src ? formatNumber(src.value, 0) + `<br><span class="muted">${esc(src.source.cell ?? '')}</span>` : '—'}</td>
        <td class="n ${diff && Math.abs(diff) >= 1 ? 'bad' : ''}">${diff === null ? '—' : formatNumber(Math.round(diff), 0)}</td></tr>`;
    })
    .join('');

  const allAlerts = [...project.analyses.flatMap((a) => a.fileAlerts), ...alerts];
  const alertRows = (sev: Alert['severity']) =>
    allAlerts
      .filter((a) => a.severity === sev)
      .map((a) => `<tr><td>${esc(a.message)}</td><td>${a.source ? esc(a.source.fileName) + (a.source.cell ? ' !' + esc(a.source.cell) : '') : ''}</td></tr>`)
      .join('');
  const sevBlock = (sev: Alert['severity'], title: string) => {
    const rows = alertRows(sev);
    return rows ? `<h3>${title}</h3><table><thead><tr><th>Constat</th><th style="width:45mm">Source</th></tr></thead><tbody>${rows}</tbody></table>` : '';
  };
  const grand = project.analyses.find((a) => a.sourceGrandTotal)?.sourceGrandTotal;

  return page(
    `Rapport d’analyse — ${i.name}`,
    `${cover(project, 'RAPPORT D’ANALYSE DU PROJET')}
    <h2>1. Informations générales</h2>
    <table><tbody>
      <tr><th style="width:45mm">Projet</th><td>${esc(i.name)}</td></tr>
      <tr><th>Type</th><td>${esc(i.projectType || '—')} <span class="pill ${STATUS[i.projectTypeStatus].cls}">${STATUS[i.projectTypeStatus].label}</span></td></tr>
      <tr><th>Localisation</th><td>${esc(i.location || '—')}</td></tr>
      <tr><th>Maître d’ouvrage</th><td>${esc(i.client || '—')}</td></tr>
      <tr><th>Phase / date</th><td>${esc([i.phase, i.date].filter(Boolean).join(' — ') || '—')}</td></tr>
    </tbody></table>
    <h3>Fichiers analysés</h3>
    ${files ? `<table><thead><tr><th>Fichier</th><th>Format</th><th>Taille</th><th>Importé le</th></tr></thead><tbody>${files}</tbody></table>` : '<p class="muted">Aucun fichier importé.</p>'}
    ${detected ? `<h3>Informations détectées dans les fichiers</h3><table><thead><tr><th style="width:32mm">Information</th><th>Valeur</th><th style="width:24mm">État</th><th style="width:50mm">Source</th></tr></thead><tbody>${detected}</tbody></table>` : ''}

    <h2>2. Synthèse de l’analyse</h2>
    <div class="kpis">
      <div class="kpi"><b>${project.lots.length}</b>lots</div>
      <div class="kpi"><b>${result.lineCount}</b>lignes d’ouvrage</div>
      <div class="kpi"><b>🟢 ${result.status.confirmed}</b>confirmées</div>
      <div class="kpi"><b>🟠 ${result.status.to_verify}</b>à vérifier</div>
      <div class="kpi"><b>🔴 ${result.status.undetermined}</b>non déterminées</div>
    </div>
    <p class="muted">Confirmé : valeur lue directement dans le fichier ou validée par l’utilisateur. À vérifier : valeur interprétée, nulle ou suspecte. Non déterminé : information absente — DQP n’invente aucune valeur.</p>

    ${planSection(project)}
    ${crossSection(project, result)}

    <h2>3. Quantités (métré issu du DQE)</h2>
    <table><thead><tr><th>Unité</th><th>Lignes</th><th>Quantité cumulée</th></tr></thead><tbody>${units}</tbody></table>

    <h2>4. Contrôle des totaux par lot</h2>
    <table><thead><tr><th>Lot</th><th>Lignes</th><th>Non chiffrées</th><th>Total DQP</th><th>Total du fichier</th><th>Écart</th></tr></thead><tbody>${lots}
      <tr class="tot"><td>TOTAL</td><td class="n">${result.lineCount}</td><td class="n">${result.incomplete}</td><td class="n">${formatNumber(result.totalHT, 0)}</td><td class="n">${grand ? formatNumber(grand.value, 0) : '—'}</td><td class="n">${grand?.value != null ? formatNumber(Math.round(result.totalHT - grand.value), 0) : '—'}</td></tr>
    </tbody></table>

    <h2>5. Alertes</h2>
    ${sevBlock('error', 'Erreurs et incohérences')}${sevBlock('warning', 'Éléments à vérifier')}${sevBlock('info', 'Informations')}
    ${allAlerts.length === 0 ? '<p>Aucune alerte.</p>' : ''}

    <h2>6. Estimation</h2>
    ${recapTable(project, result)}
    <div class="foot">Rapport généré par DQP ${esc(appVersion)} le ${new Date().toLocaleString('fr-FR')}. Les montants sont calculés par le moteur déterministe de DQP ; les éléments « à vérifier » et « non déterminés » doivent être contrôlés par un professionnel.</div>`,
  );
}

const DETECTED_LABEL: Record<string, string> = {
  title: 'Intitulé',
  location: 'Localisation',
  country: 'Pays',
  date: 'Date',
  phase: 'Phase',
  projectType: 'Type de projet',
  client: 'Maître d’ouvrage',
  architect: 'Architecte',
};


const ELEMENT_KIND: Record<string, string> = { level: 'Niveau', room: 'Pièce', opening: 'Menuiserie', equipment: 'Équipement', surface_total: 'Surface totale' };

function planSection(project: Project): string {
  const pages = project.analyses.flatMap((a) => (a.pages ?? []).map((pg) => ({ ...pg, file: a.fileName })));
  if (!pages.length) return '';
  const pageRows = pages
    .map((pg) => `<tr><td>${esc(pg.file)}</td><td class="c">${pg.number}</td><td>${esc(pg.title ?? '—')}</td><td>${esc(pg.level ?? 'non déterminé')}</td><td>${pg.scale ? '1/' + pg.scale : '—'}</td><td>${pg.scanned ? '<span class="pill bad">scannée, non lue</span>' : `${pg.textLines} textes, ${pg.dimensions} cotes`}</td></tr>`)
    .join('');
  const els = activeElements(project).filter((e) => e.kind !== 'level');
  const elRows = els
    .map((e) => {
      const st = effectiveStatus(e) as Confidence;
      const vals = Object.entries(e.props)
        .map(([k, v]) => `${k} : ${v.value === null ? 'non déterminé' : typeof v.value === 'number' ? formatNumber(v.value) + ' ' + (v.unit ?? '') : esc(v.value)}`)
        .join(' · ');
      return `<tr><td>${ELEMENT_KIND[e.kind]}</td><td>${esc(e.name)}</td><td>${esc(e.category)}</td><td>${esc(e.level ?? '—')}</td><td>${vals}</td><td><span class="pill ${STATUS[st].cls}">${STATUS[st].label}</span></td><td>p.${e.source.page}</td></tr>`;
    })
    .join('');
  const rejected = project.elements.length - activeElements(project).length;
  return `<h2>Plans analysés</h2>
    <table><thead><tr><th>Fichier</th><th>Page</th><th>Titre</th><th>Niveau</th><th>Échelle</th><th>Contenu</th></tr></thead><tbody>${pageRows}</tbody></table>
    <h3>Éléments détectés dans les plans${rejected ? ` (${rejected} rejeté(s) par l’utilisateur, non repris)` : ''}</h3>
    ${elRows ? `<table><thead><tr><th>Type</th><th>Nom lu</th><th>Catégorie</th><th>Niveau</th><th>Valeurs</th><th>État</th><th>Page</th></tr></thead><tbody>${elRows}</tbody></table>` : '<p class="muted">Aucun élément.</p>'}`;
}

function crossSection(project: Project, result: ProjectResult): string {
  const cmp = crossCheck(project, result);
  if (!cmp.length) return '';
  const rows = cmp
    .map((c) => `<tr class="${c.differs && !c.resolution ? 'warn' : ''}"><td>${esc(c.subject)}${c.indicative ? ' <span class="muted">(indicatif)</span>' : ''}</td><td>${c.values.map((v) => `${esc(v.source)} : <b>${v.value === null ? '—' : typeof v.value === 'number' ? formatNumber(v.value) : esc(v.value)}</b>`).join('<br>')}</td><td>${c.resolution ? `Retenu : ${esc(c.resolution.chosen)}` : c.differs ? '⚠️ à arbitrer' : 'concordant'}</td></tr>`)
    .join('');
  return `<h2>Croisement des fichiers</h2><table><thead><tr><th>Information</th><th>Valeurs par source</th><th>Décision</th></tr></thead><tbody>${rows}</tbody></table>`;
}
