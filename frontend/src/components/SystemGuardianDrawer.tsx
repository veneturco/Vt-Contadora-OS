import React, { useEffect, useState, useCallback } from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Wrench,
  X,
  Brain,
  Scale,
  Activity,
  Sparkles
} from 'lucide-react';
import { safeApiRequest } from '../services/apiClient';

export interface GuardianInfraFinding {
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  category: string;
  message: string;
}

export interface GuardianSeniatFinding {
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  ruleCode: string;
  norm: string;
  tenantId?: string;
  invoiceId?: string;
  invoiceNumber?: string;
  message: string;
  autoFixable?: boolean;
}

export interface GuardianAlert {
  id: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  source: string;
  category: string;
  message: string;
  occurrences: number;
  status: string;
  lastSeenAt: string;
}

export interface GuardianLegalRule {
  code: string;
  norm: string;
  title: string;
  penalty: string;
}

export interface GuardianReport {
  ok: boolean;
  guardianName: string;
  checkedAt: string;
  healthScore: number;
  status: 'OPTIMO' | 'ATENCION' | 'CRITICO';
  metrics: {
    tenantsAudited: number;
    invoicesAudited: number;
    draftsAutoRepaired: number;
    criticalCount: number;
    warningCount: number;
    openAlertsCount: number;
    ocrPatternsCount: number;
    ocrTotalSamples: number;
  };
  infraFindings: GuardianInfraFinding[];
  seniatFindings: GuardianSeniatFinding[];
  openAlerts: GuardianAlert[];
  legalRulesCatalog: GuardianLegalRule[];
}

interface Props {
  isSuperAdmin: boolean;
  onRepairedRefresh?: () => void;
}

export const SystemGuardianDrawer: React.FC<Props> = ({ isSuperAdmin, onRepairedRefresh }) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [report, setReport] = useState<GuardianReport | null>(null);
  const [activeView, setActiveView] = useState<'findings' | 'alerts' | 'ocr_legal'>('findings');
  const [toast, setToast] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!isSuperAdmin) return;
    setLoading(true);
    try {
      const res = await safeApiRequest<GuardianReport>('/api/guardian/status', { timeoutMs: 12000 });
      if (res.ok && res.data) {
        setReport(res.data);
      }
    } finally {
      setLoading(false);
    }
  }, [isSuperAdmin]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    fetchStatus();
    const interval = setInterval(fetchStatus, 180000);
    return () => clearInterval(interval);
  }, [isSuperAdmin, fetchStatus]);

  async function handleRunAudit(autoRepair: boolean) {
    if (loading || repairing) return;
    if (autoRepair) setRepairing(true);
    else setLoading(true);
    setToast(null);
    try {
      const res = await safeApiRequest<GuardianReport>('/api/guardian/audit', {
        method: 'POST',
        body: JSON.stringify({ autoRepair }),
        timeoutMs: 15000
      });
      if (res.ok && res.data) {
        setReport(res.data);
        if (autoRepair) {
          setToast(
            res.data.metrics.draftsAutoRepaired > 0
              ? `Auto-reparación completada: ${res.data.metrics.draftsAutoRepaired} borrador(es) corregidos.`
              : 'No se encontraron borradores pendientes de auto-reparación.'
          );
          if (res.data.metrics.draftsAutoRepaired > 0 && onRepairedRefresh) {
            onRepairedRefresh();
          }
        } else {
          setToast(`Auditoría completada · Salud Global: ${res.data.healthScore}%`);
        }
      } else {
        setToast(res.error || 'No se pudo contactar al Guardián.');
      }
    } finally {
      setLoading(false);
      setRepairing(false);
      setTimeout(() => setToast(null), 4500);
    }
  }

  async function handleResolveAlert(alertId: string) {
    const res = await safeApiRequest<{ ok: boolean }>(`/api/guardian/alerts/${encodeURIComponent(alertId)}/resolve`, {
      method: 'POST',
      body: JSON.stringify({})
    });
    if (res.ok) {
      setReport(prev =>
        prev
          ? {
              ...prev,
              openAlerts: prev.openAlerts.filter(a => a.id !== alertId),
              metrics: {
                ...prev.metrics,
                openAlertsCount: Math.max(0, prev.metrics.openAlertsCount - 1)
              }
            }
          : prev
      );
    }
  }

  if (!isSuperAdmin) return null;

  const healthScore = report?.healthScore ?? 100;
  const status = report?.status ?? 'OPTIMO';
  const totalIssues =
    (report?.metrics.criticalCount || 0) + (report?.metrics.warningCount || 0);

  const waveGradient =
    status === 'CRITICO'
      ? 'from-rose-400 via-fuchsia-400 to-amber-300'
      : status === 'ATENCION'
      ? 'from-amber-300 via-sky-400 to-indigo-400'
      : 'from-sky-400 via-cyan-300 to-indigo-400';

  const glowBorder =
    status === 'CRITICO'
      ? 'border-rose-500/50 shadow-[0_0_28px_rgba(244,63,94,0.35)]'
      : status === 'ATENCION'
      ? 'border-amber-400/45 shadow-[0_0_26px_rgba(251,191,36,0.28)]'
      : 'border-sky-400/45 shadow-[0_0_28px_rgba(56,189,248,0.30)]';

  return (
    <>
      <style>{`
        @keyframes vtGuardianWave {
          0%, 100% { transform: scaleY(0.32); opacity: 0.65; }
          50% { transform: scaleY(1); opacity: 1; }
        }
        .vt-guardian-bar {
          transform-origin: center;
          animation: vtGuardianWave 1.35s ease-in-out infinite;
        }
        .vt-guardian-bar-fast {
          transform-origin: center;
          animation: vtGuardianWave 0.65s ease-in-out infinite;
        }
      `}</style>

      {/* Componente Flotante Inferior Estilo Óvalo de Ondas Reactivas (Gemini Live) */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 pointer-events-auto">
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            fetchStatus();
          }}
          title="Abrir Bandeja del Guardián del Sistema"
          className={`group relative flex items-center gap-3 px-4 py-2 rounded-full bg-[#111318]/92 backdrop-blur-xl border ${glowBorder} transition-all duration-300 hover:scale-[1.03] active:scale-[0.98]`}
        >
          {/* Ondas animadas dentro del óvalo */}
          <span className="flex items-center gap-[3px] h-5 px-1" aria-hidden="true">
            {[0, 140, 280, 420, 210, 90, 340].map((delay, idx) => (
              <span
                key={idx}
                style={{
                  animationDelay: `${delay}ms`,
                  height: idx === 3 ? '18px' : idx === 2 || idx === 4 ? '14px' : idx === 1 || idx === 5 ? '10px' : '7px'
                }}
                className={`w-[3px] rounded-full bg-gradient-to-t ${waveGradient} ${
                  loading || repairing ? 'vt-guardian-bar-fast' : 'vt-guardian-bar'
                }`}
              />
            ))}
          </span>

          <span className="flex flex-col items-start leading-tight pr-1">
            <span className="text-[11px] font-semibold tracking-wide text-white flex items-center gap-1.5">
              <span>Guardián VT</span>
              <span
                className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${
                  status === 'CRITICO'
                    ? 'bg-rose-500/20 text-rose-300'
                    : status === 'ATENCION'
                    ? 'bg-amber-500/20 text-amber-300'
                    : 'bg-emerald-500/20 text-emerald-300'
                }`}
              >
                {loading ? '...' : `${healthScore}%`}
              </span>
            </span>
            <span className="text-[9px] font-mono text-white/55">
              {totalIssues > 0 ? `${totalIssues} hallazgo(s) activos` : 'Sistema & SENIAT en vigilancia'}
            </span>
          </span>
        </button>
      </div>

      {/* Bandeja Desplegable del Guardián */}
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex justify-end"
          onClick={() => setOpen(false)}
        >
          <aside
            onClick={e => e.stopPropagation()}
            className="w-full max-w-xl h-full bg-[#12141A] border-l border-white/10 text-white flex flex-col shadow-2xl"
          >
            {/* Header */}
            <div className="p-5 border-b border-white/10 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-sky-500/15 border border-sky-400/30 text-sky-300">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-sm font-bold tracking-tight flex items-center gap-2">
                    <span>Guardián del Sistema VT</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/10 text-sky-300">
                      ACTIVO
                    </span>
                  </h2>
                  <p className="text-[11px] font-mono text-white/55">
                    Auditoría SENIAT 2026 · Aprendizaje OCR · Telemetría en vivo
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-2 rounded-xl hover:bg-white/10 text-white/70 hover:text-white transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* KPIs */}
            <div className="p-4 grid grid-cols-4 gap-2.5 border-b border-white/10 bg-white/[0.02]">
              <div className="p-2.5 rounded-xl bg-[#1A1D26] border border-white/10">
                <span className="text-[10px] font-mono text-white/55 block">Salud</span>
                <strong
                  className={`text-lg font-mono ${
                    status === 'CRITICO'
                      ? 'text-rose-400'
                      : status === 'ATENCION'
                      ? 'text-amber-300'
                      : 'text-emerald-400'
                  }`}
                >
                  {healthScore}%
                </strong>
              </div>
              <div className="p-2.5 rounded-xl bg-[#1A1D26] border border-white/10">
                <span className="text-[10px] font-mono text-white/55 block">Facturas</span>
                <strong className="text-lg font-mono text-white">
                  {report?.metrics.invoicesAudited ?? 0}
                </strong>
              </div>
              <div className="p-2.5 rounded-xl bg-[#1A1D26] border border-white/10">
                <span className="text-[10px] font-mono text-white/55 block">Hallazgos</span>
                <strong className="text-lg font-mono text-amber-300">{totalIssues}</strong>
              </div>
              <div className="p-2.5 rounded-xl bg-[#1A1D26] border border-white/10">
                <span className="text-[10px] font-mono text-white/55 block">Memoria OCR</span>
                <strong className="text-lg font-mono text-sky-300">
                  {report?.metrics.ocrPatternsCount ?? 0}
                </strong>
              </div>
            </div>

            {/* Action bar */}
            <div className="px-4 py-3 border-b border-white/10 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleRunAudit(false)}
                  disabled={loading || repairing}
                  className="px-3 py-1.5 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/35 text-sky-200 text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                  <span>{loading ? 'Auditando...' : 'Escanear Ahora'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleRunAudit(true)}
                  disabled={loading || repairing}
                  className="px-3 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-400/35 text-emerald-200 text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Wrench className="w-3.5 h-3.5" />
                  <span>{repairing ? 'Reparando...' : 'Auto-Reparar Borradores'}</span>
                </button>
              </div>
              {report?.checkedAt && (
                <span className="text-[10px] font-mono text-white/45">
                  Última revisión: {new Date(report.checkedAt).toLocaleTimeString()}
                </span>
              )}
            </div>

            {toast && (
              <div className="mx-4 mt-3 p-2.5 rounded-xl bg-sky-500/15 border border-sky-400/35 text-sky-200 text-xs font-mono">
                {toast}
              </div>
            )}

            {/* Sub-tabs */}
            <div className="px-4 pt-3 flex gap-2 border-b border-white/10 text-xs font-mono">
              <button
                type="button"
                onClick={() => setActiveView('findings')}
                className={`pb-2.5 px-2 border-b-2 transition flex items-center gap-1.5 ${
                  activeView === 'findings'
                    ? 'border-sky-400 text-white font-bold'
                    : 'border-transparent text-white/55 hover:text-white'
                }`}
              >
                <Scale className="w-3.5 h-3.5" />
                <span>SENIAT & Salud ({(report?.infraFindings.length || 0) + (report?.seniatFindings.length || 0)})</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveView('alerts')}
                className={`pb-2.5 px-2 border-b-2 transition flex items-center gap-1.5 ${
                  activeView === 'alerts'
                    ? 'border-sky-400 text-white font-bold'
                    : 'border-transparent text-white/55 hover:text-white'
                }`}
              >
                <Activity className="w-3.5 h-3.5" />
                <span>Alertas en Vivo ({report?.openAlerts.length || 0})</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveView('ocr_legal')}
                className={`pb-2.5 px-2 border-b-2 transition flex items-center gap-1.5 ${
                  activeView === 'ocr_legal'
                    ? 'border-sky-400 text-white font-bold'
                    : 'border-transparent text-white/55 hover:text-white'
                }`}
              >
                <Brain className="w-3.5 h-3.5" />
                <span>OCR & Leyes</span>
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 text-xs font-mono">
              {activeView === 'findings' && (
                <>
                  {(report?.infraFindings.length || 0) === 0 && (report?.seniatFindings.length || 0) === 0 ? (
                    <div className="p-6 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-center space-y-2">
                      <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-400" />
                      <div className="font-bold text-emerald-300">Cero anomalías detectadas</div>
                      <p className="text-[11px] text-white/65">
                        Infraestructura, integridad matemática y normas SENIAT 2026 verificadas sin riesgos.
                      </p>
                    </div>
                  ) : (
                    <>
                      {report?.infraFindings.map((f, idx) => (
                        <div
                          key={`infra_${idx}`}
                          className={`p-3 rounded-xl border ${
                            f.severity === 'CRITICAL'
                              ? 'bg-rose-500/10 border-rose-500/35 text-rose-200'
                              : 'bg-amber-500/10 border-amber-500/35 text-amber-200'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-bold flex items-center gap-1.5">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              INFRAESTRUCTURA · {f.category}
                            </span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/30">{f.severity}</span>
                          </div>
                          <p className="text-[11px] opacity-90">{f.message}</p>
                        </div>
                      ))}

                      {report?.seniatFindings.map((f, idx) => (
                        <div
                          key={`seniat_${idx}`}
                          className={`p-3 rounded-xl border ${
                            f.severity === 'CRITICAL'
                              ? 'bg-rose-500/10 border-rose-500/35 text-rose-200'
                              : 'bg-amber-500/10 border-amber-500/35 text-amber-200'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-bold">{f.norm}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/30">
                              {f.autoFixable ? 'AUTO-REPARABLE' : f.severity}
                            </span>
                          </div>
                          <p className="text-[11px] opacity-90">{f.message}</p>
                        </div>
                      ))}
                    </>
                  )}
                </>
              )}

              {activeView === 'alerts' && (
                <>
                  {(report?.openAlerts.length || 0) === 0 ? (
                    <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/10 text-center space-y-2">
                      <Sparkles className="w-7 h-7 mx-auto text-sky-400" />
                      <div className="font-bold text-white">Sin errores en tiempo real</div>
                      <p className="text-[11px] text-white/60">
                        Cualquier fallo inesperado en el navegador o API aparecerá aquí automáticamente.
                      </p>
                    </div>
                  ) : (
                    report?.openAlerts.map(alert => (
                      <div
                        key={alert.id}
                        className="p-3 rounded-xl bg-[#1A1D26] border border-white/10 space-y-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-amber-300">
                            {alert.category} ({alert.occurrences}x)
                          </span>
                          <button
                            type="button"
                            onClick={() => handleResolveAlert(alert.id)}
                            className="text-[10px] px-2 py-0.5 rounded-lg bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30"
                          >
                            Marcar Resuelta
                          </button>
                        </div>
                        <p className="text-[11px] text-white/85">{alert.message}</p>
                        <div className="text-[10px] text-white/45">
                          Fuente: {alert.source} · Última vez: {new Date(alert.lastSeenAt).toLocaleString()}
                        </div>
                      </div>
                    ))
                  )}
                </>
              )}

              {activeView === 'ocr_legal' && (
                <div className="space-y-4">
                  <div className="p-3.5 rounded-xl bg-sky-500/10 border border-sky-400/30 space-y-1">
                    <div className="font-bold text-sky-200 flex items-center gap-1.5">
                      <Brain className="w-4 h-4" />
                      Aprendizaje Continuo OCR Activo
                    </div>
                    <p className="text-[11px] text-white/75">
                      Patrones de proveedores aprendidos: <strong>{report?.metrics.ocrPatternsCount ?? 0}</strong> ·
                      Documentos analizados: <strong>{report?.metrics.ocrTotalSamples ?? 0}</strong>. El motor
                      inyecta estos patrones automáticamente en Gemini Vision para mejorar lecturas de facturas
                      borrosas, dobladas o con tachaduras.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="text-[10px] uppercase tracking-wider text-white/55">
                      Base Legal SENIAT Vigilada ({report?.legalRulesCatalog.length ?? 0} reglas)
                    </div>
                    {report?.legalRulesCatalog.map(rule => (
                      <div key={rule.code} className="p-3 rounded-xl bg-[#1A1D26] border border-white/10 space-y-1">
                        <div className="font-bold text-white">{rule.norm}</div>
                        <div className="text-[11px] text-sky-300">{rule.title}</div>
                        <div className="text-[10px] text-rose-300/90">Riesgo: {rule.penalty}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </aside>
        </div>
      )}
    </>
  );
};
