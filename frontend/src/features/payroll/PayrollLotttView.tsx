import React from 'react';
import {
  Users,
  CreditCard,
  Scale,
  ShieldCheck,
  Plus,
  Printer,
  Download,
  Trash2
} from 'lucide-react';
import {
  PayrollEmployee,
  calculateLotttFullBreakdown,
  openPrintablePaystub,
  downloadPdfPaystub
} from '../../utils/seniatEngine';
import { Tenant } from '../../types/fiscal';

export interface PayrollLotttViewProps {
  activeTenant: Tenant;
  tenantEmployees: PayrollEmployee[];
  payrollBreakdown: ReturnType<typeof calculateLotttFullBreakdown>;
  baseSalaryBs: number;
  setBaseSalaryBs: (val: number) => void;
  cestaticketBs: number;
  setCestaticketBs: (val: number) => void;
  riskLevel: 'MINIMO' | 'MEDIO' | 'ALTO';
  setRiskLevel: (val: 'MINIMO' | 'MEDIO' | 'ALTO') => void;
  newEmpName: string;
  setNewEmpName: (val: string) => void;
  newEmpCedula: string;
  setNewEmpCedula: (val: string) => void;
  newEmpRole: string;
  setNewEmpRole: (val: string) => void;
  newEmpSalary: number;
  setNewEmpSalary: (val: number) => void;
  onAddEmployee: (e: React.FormEvent) => void;
  onDeleteEmployee: (empId: string, empName: string) => void;
  onExportParafiscalCsv: () => void;
  onExportArt142Csv: () => void;
}

const PayrollLotttView: React.FC<PayrollLotttViewProps> = ({
  activeTenant,
  tenantEmployees,
  payrollBreakdown,
  baseSalaryBs,
  setBaseSalaryBs,
  cestaticketBs,
  setCestaticketBs,
  riskLevel,
  setRiskLevel,
  newEmpName,
  setNewEmpName,
  newEmpCedula,
  setNewEmpCedula,
  newEmpRole,
  setNewEmpRole,
  newEmpSalary,
  setNewEmpSalary,
  onAddEmployee,
  onDeleteEmployee,
  onExportParafiscalCsv,
  onExportArt142Csv
}) => {
  return (
    <div className="space-y-5">
      {/* 4 Bento KPI Cards Interactivos de Nómina LOTTT */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          type="button"
          onClick={() => document.getElementById('payroll-roster-table')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          className="ui-card p-4 space-y-2.5 text-left cursor-pointer transition-all group"
          title="Tocar para ir a la nómina activa de trabajadores"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="apple-icon-jewel apple-icon-jewel-blue w-7 h-7">
                <Users className="w-3.5 h-3.5" />
              </div>
              <span className="text-xs font-semibold text-white/85">Nómina Activa</span>
            </div>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-white/10 text-white/90">LOTTT</span>
          </div>
          <div className="text-2xl font-extrabold text-white tabular-nums tracking-tight">
            {tenantEmployees.length} <span className="text-sm font-normal opacity-70">Trabajadores</span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-[var(--muted-foreground)]">
            <span>{activeTenant.name}</span>
            <span className="text-sky-400 font-semibold group-hover:translate-x-0.5 transition-transform">Gestionar →</span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            if (tenantEmployees[0]) {
              downloadPdfPaystub(activeTenant.name, activeTenant.rif, tenantEmployees[0]);
            }
          }}
          className="ui-card p-4 space-y-2.5 text-left cursor-pointer transition-all group"
          title="Tocar para descargar el Recibo Oficial de Pago LOTTT en PDF con QR"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="apple-icon-jewel apple-icon-jewel-emerald w-7 h-7">
                <CreditCard className="w-3.5 h-3.5" />
              </div>
              <span className="text-xs font-semibold text-emerald-200">Neto + Cestaticket</span>
            </div>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300">RECIBO PDF</span>
          </div>
          <div className="text-xl font-extrabold text-emerald-400 tabular-nums tracking-tight">
            Bs. {payrollBreakdown.netPayBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="flex items-center justify-between text-[11px] text-[var(--muted-foreground)]">
            <span>Deducción 5.5%: -Bs. {payrollBreakdown.totalDeductions.toFixed(2)}</span>
            <span className="text-emerald-300 font-semibold group-hover:translate-x-0.5 transition-transform">Emitir PDF →</span>
          </div>
        </button>

        <button
          type="button"
          onClick={onExportParafiscalCsv}
          className="ui-card p-4 space-y-2.5 text-left cursor-pointer transition-all group"
          title="Tocar para descargar la Planilla Parafiscal (IVSS, FAOV, RPE, INCES) en Excel CSV"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="apple-icon-jewel apple-icon-jewel-amber w-7 h-7">
                <Scale className="w-3.5 h-3.5" />
              </div>
              <span className="text-xs font-semibold text-amber-200">Aportes Parafiscales</span>
            </div>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300">IVSS / FAOV</span>
          </div>
          <div className="text-xl font-extrabold text-amber-400 tabular-nums tracking-tight">
            Bs. {(payrollBreakdown.ivssEmployer + payrollBreakdown.faovEmployer + payrollBreakdown.rpeEmployer + payrollBreakdown.incesQuarterlyProvision).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="flex items-center justify-between text-[11px] text-[var(--muted-foreground)]">
            <span>IVSS + Banavih + INCES</span>
            <span className="text-amber-300 font-semibold group-hover:translate-x-0.5 transition-transform">Descargar CSV →</span>
          </div>
        </button>

        <button
          type="button"
          onClick={onExportArt142Csv}
          className="ui-card p-4 space-y-2.5 text-left cursor-pointer transition-all group"
          title="Tocar para descargar el Libro de Garantía de Prestaciones Sociales (Art. 142 LOTTT)"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="apple-icon-jewel apple-icon-jewel-purple w-7 h-7">
                <ShieldCheck className="w-3.5 h-3.5" />
              </div>
              <span className="text-xs font-semibold text-purple-200">Prestaciones Art. 142</span>
            </div>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-300">5 DÍAS/MES</span>
          </div>
          <div className="text-xl font-extrabold text-purple-300 tabular-nums tracking-tight">
            Bs. {payrollBreakdown.prestacionesMonthlyProvision.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="flex items-center justify-between text-[11px] text-[var(--muted-foreground)]">
            <span>Garantía Salario Integral</span>
            <span className="text-purple-300 font-semibold group-hover:translate-x-0.5 transition-transform">Exportar Libro →</span>
          </div>
        </button>
      </div>

      <div className="grid grid-cols-12 gap-5">
        <div className="col-span-12 lg:col-span-8 ui-card p-5 space-y-4">
          <h2 className="ui-heading text-lg font-bold">Motor de Nómina Venezolana (LOTTT + Parafiscales + Art. 142)</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono">
            <div>
              <label className="block mb-1 opacity-75">Salario Base Mensual (Bs.)</label>
              <input
                type="number"
                value={baseSalaryBs}
                onChange={e => setBaseSalaryBs(Number(e.target.value) || 0)}
                className="w-full p-2.5 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] tabular-nums"
              />
            </div>
            <div>
              <label className="block mb-1 opacity-75">Cestaticket Socialista (Bs.)</label>
              <input
                type="number"
                value={cestaticketBs}
                onChange={e => setCestaticketBs(Number(e.target.value) || 0)}
                className="w-full p-2.5 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] tabular-nums"
              />
            </div>
            <div>
              <label className="block mb-1 opacity-75">Nivel de Riesgo IVSS Patronal</label>
              <select
                value={riskLevel}
                onChange={e => setRiskLevel(e.target.value as 'MINIMO' | 'MEDIO' | 'ALTO')}
                className="w-full p-2.5 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)]"
              >
                <option value="MINIMO">Riesgo Mínimo (9%)</option>
                <option value="MEDIO">Riesgo Medio (10%)</option>
                <option value="ALTO">Riesgo Máximo (11%)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2 text-xs font-mono">
            <div className="p-3 rounded bg-[var(--bg-elevated)]">
              <span className="opacity-70 block">IVSS Empleado (4%)</span>
              <strong className="tabular-nums">- Bs. {payrollBreakdown.ivssEmployee.toFixed(2)}</strong>
            </div>
            <div className="p-3 rounded bg-[var(--bg-elevated)]">
              <span className="opacity-70 block">FAOV / Banavih (1%)</span>
              <strong className="tabular-nums">- Bs. {payrollBreakdown.faovEmployee.toFixed(2)}</strong>
            </div>
            <div className="p-3 rounded bg-[var(--bg-elevated)]">
              <span className="opacity-70 block">Paro Forzoso RPE (0.5%)</span>
              <strong className="tabular-nums">- Bs. {payrollBreakdown.rpeEmployee.toFixed(2)}</strong>
            </div>
            <div className="p-3 rounded bg-[var(--bg-elevated)] border border-[var(--accent-primary)]">
              <span className="opacity-70 block">Neto a Pagar Trabajador</span>
              <strong className="text-[var(--accent-primary)] tabular-nums">
                Bs. {payrollBreakdown.netPayBs.toFixed(2)}
              </strong>
            </div>
          </div>
        </div>

        <div className="col-span-12 lg:col-span-4 ui-card p-5 space-y-3 text-xs font-mono">
          <h3 className="ui-heading text-base font-bold">Cargas Patronales y Prestaciones (Art. 142 LOTTT)</h3>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span>IVSS Patronal ({riskLevel}):</span>
              <strong className="tabular-nums">Bs. {payrollBreakdown.ivssEmployer.toFixed(2)}</strong>
            </div>
            <div className="flex justify-between">
              <span>FAOV Patronal (2%):</span>
              <strong className="tabular-nums">Bs. {payrollBreakdown.faovEmployer.toFixed(2)}</strong>
            </div>
            <div className="flex justify-between">
              <span>Paro Forzoso Patronal (2%):</span>
              <strong className="tabular-nums">Bs. {payrollBreakdown.rpeEmployer.toFixed(2)}</strong>
            </div>
            <div className="flex justify-between">
              <span>Provisión INCES (2%):</span>
              <strong className="tabular-nums">Bs. {payrollBreakdown.incesQuarterlyProvision.toFixed(2)}</strong>
            </div>
            <div className="flex justify-between pt-2 border-t border-[var(--border-subtle)] text-[var(--accent-secondary)]">
              <span>Garantía Prestaciones (5 días Sal. Integral):</span>
              <strong className="tabular-nums">Bs. {payrollBreakdown.prestacionesMonthlyProvision.toFixed(2)}</strong>
            </div>
            <div className="flex justify-between pt-2 border-t border-[var(--border-subtle)] font-bold">
              <span>Total Carga Patronal Mensual:</span>
              <span className="tabular-nums">Bs. {payrollBreakdown.totalEmployerCost.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Multi-Employee LOTTT Roster & Printable Paystubs */}
        <div id="payroll-roster-table" className="col-span-12 ui-card p-5 space-y-4 text-xs font-mono">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="ui-heading text-base font-bold">Nómina Activa de Trabajadores ({activeTenant.name})</h3>
              <p className="opacity-75">Registro multi-empleado con emisión de Recibo de Pago LOTTT imprimible / PDF.</p>
            </div>
            <span className="px-2.5 py-1 rounded bg-white/10">{tenantEmployees.length} Trabajadores Activos</span>
          </div>

          <form onSubmit={onAddEmployee} className="grid grid-cols-1 md:grid-cols-5 gap-3 p-3 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
            <input
              type="text"
              required
              placeholder="Nombre y Apellido"
              value={newEmpName}
              onChange={e => setNewEmpName(e.target.value)}
              className="p-2 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)]"
            />
            <input
              type="text"
              required
              placeholder="Cédula (Ej: V-20.111.222)"
              value={newEmpCedula}
              onChange={e => setNewEmpCedula(e.target.value)}
              className="p-2 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)]"
            />
            <input
              type="text"
              placeholder="Cargo"
              value={newEmpRole}
              onChange={e => setNewEmpRole(e.target.value)}
              className="p-2 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)]"
            />
            <input
              type="number"
              placeholder="Salario Base Bs."
              value={newEmpSalary}
              onChange={e => setNewEmpSalary(Number(e.target.value) || 0)}
              className="p-2 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)] tabular-nums"
            />
            <button type="submit" className="ui-btn-primary py-2 px-3 text-xs flex items-center justify-center gap-1">
              <Plus className="w-3.5 h-3.5" /> Agregar Trabajador
            </button>
          </form>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] opacity-75">
                  <th className="py-2 px-2">Trabajador / Cédula</th>
                  <th className="py-2 px-2">Cargo</th>
                  <th className="py-2 px-2 text-right">Salario Base</th>
                  <th className="py-2 px-2 text-right">Deducciones (5.5%)</th>
                  <th className="py-2 px-2 text-right">Neto a Pagar</th>
                  <th className="py-2 px-2 text-right">Prestaciones Art. 142</th>
                  <th className="py-2 px-2 text-right">Recibo</th>
                </tr>
              </thead>
              <tbody>
                {tenantEmployees.map(emp => {
                  const b = calculateLotttFullBreakdown(emp.baseSalaryBs, emp.cestaticketBs, emp.riskLevel);
                  return (
                    <tr key={emp.id} className="border-b border-[var(--border-subtle)]/50">
                      <td className="py-2.5 px-2">
                        <div className="font-bold">{emp.fullName}</div>
                        <div className="opacity-70 text-[10px]">{emp.cedula} · Ingreso: {emp.hireDate}</div>
                      </td>
                      <td className="py-2.5 px-2">{emp.role}</td>
                      <td className="py-2.5 px-2 text-right tabular-nums">Bs. {emp.baseSalaryBs.toFixed(2)}</td>
                      <td className="py-2.5 px-2 text-right tabular-nums text-rose-400">- Bs. {b.totalDeductions.toFixed(2)}</td>
                      <td className="py-2.5 px-2 text-right tabular-nums font-bold text-[var(--accent-primary)]">
                        Bs. {b.netPayBs.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-2 text-right tabular-nums text-[var(--accent-secondary)]">
                        Bs. {b.prestacionesMonthlyProvision.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-2 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => openPrintablePaystub(activeTenant.name, activeTenant.rif, emp)}
                            title="Vista previa e impresión"
                            className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-[10px] inline-flex items-center gap-1"
                          >
                            <Printer className="w-3 h-3" /> Imprimir
                          </button>
                          <button
                            onClick={() => downloadPdfPaystub(activeTenant.name, activeTenant.rif, emp)}
                            title="Descargar Recibo Oficial PDF con QR LOTTT"
                            className="px-2 py-1 rounded bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 text-[10px] inline-flex items-center gap-1 font-bold"
                          >
                            <Download className="w-3 h-3" /> PDF QR
                          </button>
                          <button
                            onClick={() => onDeleteEmployee(emp.id, emp.fullName)}
                            title="Eliminar Trabajador de la Nómina"
                            className="p-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-[10px] transition"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {tenantEmployees.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-4 text-center opacity-60">
                      No hay trabajadores registrados aún para {activeTenant.name}. Usa el formulario superior para agregar uno.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PayrollLotttView;
