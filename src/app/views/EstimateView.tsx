import { amountInWords, formatMoney, formatNumber } from '../../core/format';
import { Panel } from '../components/ui';
import { useStore } from '../store';

export function EstimateView() {
  const s = useStore();
  const p = s.project!;
  const r = s.result!;
  const cur = p.settings.currency;
  const vat = p.settings.vatRate > 0;
  const final = vat ? r.totalTTC : r.totalHT;
  const max = Math.max(1, ...p.lots.map((l) => r.lots.get(l.id)!.amount));

  return (
    <div style={{ maxWidth: 1100 }}>
      <h1 className="title">07 — Estimation</h1>
      <p className="subtitle">Quantitatif × prix configurés = estimatif. Montant = Quantité retenue × Prix unitaire ; Total = somme des montants.</p>

      <div className="kpis">
        <div className="kpi"><div className="v">{formatMoney(r.totalHT, cur)}</div><div className="l">Total hors taxes</div></div>
        {vat && <div className="kpi"><div className="v">{formatMoney(r.vat, cur)}</div><div className="l">TVA {formatNumber(p.settings.vatRate)} %</div></div>}
        {vat && <div className="kpi"><div className="v">{formatMoney(r.totalTTC, cur)}</div><div className="l">Total TTC</div></div>}
        <div className="kpi"><div className="v">{r.lineCount - r.incomplete} / {r.lineCount}</div><div className="l">lignes chiffrées</div></div>
      </div>

      {r.incomplete > 0 && (
        <div className="notice warn">
          <b>Estimation incomplète : {r.incomplete} ligne(s) sans quantité ou sans prix</b>
          Ces lignes ne sont pas comptées. Le total réel sera supérieur une fois ces lignes complétées.{' '}
          <a href="#" onClick={(e) => { e.preventDefault(); s.go('analysis'); }}>Voir les éléments à vérifier</a>
        </div>
      )}

      <Panel title="Récapitulatif général" flush>
        <table className="t">
          <thead>
            <tr><th style={{ width: 40 }}>N°</th><th>Lot</th><th style={{ width: '28%' }}>Répartition</th><th className="n">Montant ({cur})</th><th className="n">Part</th><th className="n">Non chiffrées</th></tr>
          </thead>
          <tbody>
            {p.lots.map((lot, i) => {
              const t = r.lots.get(lot.id)!;
              return (
                <tr key={lot.id}>
                  <td className="c">{i + 1}</td>
                  <td>
                    <b>{lot.name}</b> <span className="muted small">{lot.code}</span>
                    {t.byZone.length > 1 && (
                      <div className="small muted">{t.byZone.map((z) => `${z.zone} : ${formatNumber(z.amount, 0)}`).join(' · ')}</div>
                    )}
                  </td>
                  <td style={{ verticalAlign: 'middle' }}><div className="bar"><i style={{ width: `${(t.amount / max) * 100}%` }} /></div></td>
                  <td className="n"><b>{formatNumber(t.amount, 0)}</b></td>
                  <td className="n">{r.totalHT ? formatNumber((t.amount / r.totalHT) * 100, 1) : 0} %</td>
                  <td className="n">{t.incomplete || ''}</td>
                </tr>
              );
            })}
            <tr><td /><td><b>TOTAL HORS TAXES</b></td><td /><td className="n"><b>{formatNumber(r.totalHT, 0)}</b></td><td className="n">100 %</td><td className="n">{r.incomplete || ''}</td></tr>
            {vat && (
              <>
                <tr><td /><td>TVA {formatNumber(p.settings.vatRate)} %</td><td /><td className="n">{formatNumber(r.vat, 0)}</td><td /><td /></tr>
                <tr><td /><td><b>TOTAL TOUTES TAXES COMPRISES</b></td><td /><td className="n"><b>{formatNumber(r.totalTTC, 0)}</b></td><td /><td /></tr>
              </>
            )}
          </tbody>
        </table>
        <div style={{ padding: 12 }}>
          Arrêté le présent devis à la somme de : <b>{amountInWords(final)}</b> {vat ? 'TTC' : 'HT'}.
          <div className="small muted" style={{ marginTop: 4 }}>
            TVA : {vat ? `${formatNumber(p.settings.vatRate)} %` : 'non appliquée (DQE hors taxes)'} — <a href="#" onClick={(e) => { e.preventDefault(); s.go('project'); }}>modifier</a>
          </div>
        </div>
      </Panel>
    </div>
  );
}
