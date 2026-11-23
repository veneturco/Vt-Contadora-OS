import React, { useState, useEffect, useMemo } from 'react';
import {
  BookOpen,
  X,
  Search,
  CheckCircle2,
  Circle,
  AlertTriangle,
  ArrowUpRight,
  HelpCircle,
  Building2,
  UserPlus,
  ScanLine,
  FileSpreadsheet,
  Scale,
  Users
} from 'lucide-react';
import { ActiveTabId, OperationStepId } from '../types/fiscal';
import { safeGetStorage, safeSetStorage } from '../utils/storage';

interface GuideStep {
  title: string;
  detail: string;
}

interface GuideTroubleshoot {
  q: string;
  a: string;
}

interface GuideModule {
  id: string;
  badge: string;
  title: string;
  routeLabel: string;
  targetTab: ActiveTabId;
  targetStep?: OperationStepId;
  icon: React.FC<{ className?: string }>;
  summary: string;
  steps: GuideStep[];
  troubleshoot: GuideTroubleshoot[];
  checklist: string;
}

const GUIDE_MODULES: GuideModule[] = [
  {
    id: 'empresas',
    badge: 'Módulo 1 · Inicio',
    title: 'Creación y Alta de Empresas',
    routeLabel: 'Cartera & Radar Fiscal → + Nueva Empresa',
    targetTab: 'clients',
    icon: Building2,
    summary:
      'Registra un nuevo cliente jurídico o firma personal con su régimen tributario SENIAT y bóveda aislada.',
    steps: [
      {
        title: '1. Abrir el formulario de alta',
        detail:
          'Ingresa a «Cartera & Radar Fiscal» y pulsa el botón «+ Nueva Empresa» en la parte superior derecha.'
      },
      {
        title: '2. Ingresar Razón Social y RIF',
        detail:
          'Escribe el nombre legal exacto y el RIF venezolano con guiones (ej. J-40918273-8). El sistema valida automáticamente el dígito verificador.'
      },
      {
        title: '3. Seleccionar Régimen SENIAT',
        detail:
          'Elige entre SPE (Sujeto Pasivo Especial), ORDINARIO o FORMAL. Esto define si se aplican retenciones de IVA (75%/100%) e ISLR.'
      },
      {
        title: '4. Plan y Código Telegram',
        detail:
          'Selecciona el plan y guarda. El sistema genera un código único (ej. VT-BODE-9A41F2) para vincular el Bot de Telegram del cliente.'
      }
    ],
    troubleshoot: [
      {
        q: '¿Qué hago si el sistema marca "RIF inválido"?',
        a: 'Verifica que incluya el prefijo (J, V, E, G o C) y los 9 dígitos con el dígito verificador exacto del certificado SENIAT.'
      },
      {
        q: '¿Qué pasa si elegí mal el régimen (ej. Ordinario en vez de SPE)?',
        a: 'Puedes ajustar el régimen directamente en el perfil de la empresa dentro de Cartera sin perder las facturas ya cargadas.'
      }
    ],
    checklist: 'La empresa aparece en el selector superior y cuenta con su código VT-... activo.'
  },
  {
    id: 'usuarios',
    badge: 'Módulo 2 · Accesos',
    title: 'Adición de Usuarios y Sub-cuentas',
    routeLabel: 'Cartera & Radar Fiscal → Tarjeta de Empresa → Invitar Sub-cuenta',
    targetTab: 'clients',
    icon: UserPlus,
    summary:
      'Crea accesos independientes para el cliente administrador o asistentes contables con permisos controlados.',
    steps: [
      {
        title: '1. Ubicar la empresa en Cartera',
        detail:
          'En «Cartera & Radar Fiscal», localiza la tarjeta de la empresa y pulsa el botón para gestionar o invitar sub-cuenta.'
      },
      {
        title: '2. Llenar datos del usuario',
        detail:
          'Introduce Nombre de Contacto, Teléfono WhatsApp (+58...), Correo electrónico corporativo y el Rol (ej. ADMIN_EMPRESA).'
      },
      {
        title: '3. Tarifa y comisión (B2B2B)',
        detail:
          'Verifica la tarifa mensual en USD si aplica y el porcentaje de comisión para tu firma contable (20% por defecto).'
      },
      {
        title: '4. Credenciales y primer ingreso',
        detail:
          'Al confirmar se genera una contraseña temporal segura. El usuario deberá cambiarla obligatoriamente al iniciar sesión por primera vez.'
      }
    ],
    troubleshoot: [
      {
        q: '¿El usuario olvidó su clave o escribí mal el correo?',
        a: 'Abre de nuevo el modal de sub-cuenta en la tarjeta de la empresa, corrige el correo y reenvía la invitación para reemplazar el acceso previo.'
      },
      {
        q: '¿Qué diferencia hay entre rol Contador (Admin) y Cliente?',
        a: 'El Contador audita libros, aprueba borradores IA, gestiona nómina y exporta declaraciones. El Cliente solo carga facturas en su portal móvil y ve su suscripción.'
      }
    ],
    checklist: 'El usuario recibió su correo/clave temporal y su estado cambió a ACTIVA o TRIAL.'
  },
  {
    id: 'ingesta',
    badge: 'Módulo 3 · Captura',
    title: 'Ingesta OCR, Ráfaga y Telegram',
    routeLabel: 'Operaciones SENIAT & Banco → Escáner / Ingesta',
    targetTab: 'operations',
    targetStep: 'scanner',
    icon: ScanLine,
    summary:
      'Digitaliza facturas de compra y venta con el motor híbrido VNDE v4.0 sin errores ni gasto innecesario de tokens.',
    steps: [
      {
        title: '1. Prioridad de lectura (0 Tokens)',
        detail:
          'El motor lee primero el Código QR SENIAT o aplica OCR local en el navegador (0 tokens). Solo usa Visión Neural IA si la foto está borrosa o arrugada.'
      },
      {
        title: '2. Carga individual o Modo Ráfaga',
        detail:
          'Arrastra una factura o selecciona múltiples imágenes/PDFs a la vez. La cola procesa cada documento secuencialmente en vivo.'
      },
      {
        title: '3. Ingesta vía Bot de Telegram',
        detail:
          'Comparte al cliente su código VT-... para que envíe fotos desde su teléfono. Todas entran a revisión como BORRADOR_IA.'
      },
      {
        title: '4. Gestión de plantillas de prueba',
        detail:
          'Si aparecen botones de prueba rápida (ej. Maxi Embutidos o Traki), puedes borrarlos con su «×» individual o pulsar «Borrar todas».'
      }
    ],
    troubleshoot: [
      {
        q: '¿Qué hago si el OCR confundió un dígito o monto?',
        a: 'Ninguna factura entra al libro oficial automáticamente. Queda en BORRADOR_IA para que corrijas el campo antes de aprobar; el sistema memoriza tu corrección.'
      },
      {
        q: '¿Qué significa "Sin RIF Comprador (Alerta Art. 10.4)"?',
        a: 'Es un ticket de máquina fiscal sin el RIF de tu cliente impreso. Según la normativa del SENIAT, ese IVA no es deducible como crédito fiscal.'
      }
    ],
    checklist: 'Todas las facturas del período están cargadas sin errores de RIF ni montos descuadrados.'
  },
  {
    id: 'libros',
    badge: 'Módulo 4 · Auditoría',
    title: 'Libros de Compras, Ventas y BCV',
    routeLabel: 'Operaciones SENIAT & Banco → Libros Fiscales',
    targetTab: 'operations',
    targetStep: 'books',
    icon: FileSpreadsheet,
    summary:
      'Revisión de borradores, conversión bimonetaria a tasa BCV del día, notas de crédito/débito y exportación SENIAT.',
    steps: [
      {
        title: '1. Filtrar por Semáforo Fiscal',
        detail:
          'Usa los filtros CONFORME, ADVERTENCIA o PENDIENTE para priorizar los documentos que requieren atención manual.'
      },
      {
        title: '2. Validar tasa BCV del día',
        detail:
          'Para documentos en USD, el sistema aplica la tasa oficial BCV de la fecha de emisión para expresar los montos en Bolívares (VES).'
      },
      {
        title: '3. Notas de Crédito (03) o Débito (02)',
        detail:
          'Para ajustar o anular una factura ya aprobada, usa la opción de ajuste sobre el documento afectado y vincula la nota correspondiente.'
      },
      {
        title: '4. Aprobar y Exportar',
        detail:
          'Cambia el estado de BORRADOR_IA a APROBADA. Al cierre de quincena o mes, exporta los libros en CSV/TXT para el portal SENIAT.'
      }
    ],
    troubleshoot: [
      {
        q: '¿Qué hago si aprobé una factura con un dato equivocado?',
        a: 'No la borres si ya tiene impacto fiscal: genera una Nota de Crédito (tipo 03) vinculada o devuélvela a revisión antes del cierre.'
      },
      {
        q: '¿Por qué aparece alerta roja en canal CONTINGENCIA?',
        a: 'Las facturas emitidas en talonario manual de contingencia deben reportarse al portal del SENIAT en menos de 24 horas.'
      }
    ],
    checklist: 'Cero documentos en BORRADOR_IA y libro cuadrado al cierre del período.'
  },
  {
    id: 'retenciones',
    badge: 'Módulo 5 · Impuestos',
    title: 'Retenciones IVA, ISLR e IGTF',
    routeLabel: 'Operaciones SENIAT & Banco → Libros & Retenciones',
    targetTab: 'operations',
    targetStep: 'books',
    icon: Scale,
    summary:
      'Cálculo exacto de porcentajes de retención para Sujetos Pasivos Especiales (SPE), emisión de comprobantes e IGTF 3%.',
    steps: [
      {
        title: '1. Verificar condición de SPE',
        detail:
          'Cuando el comprador es Sujeto Pasivo Especial, el sistema habilita la retención de IVA (75% estándar o 100% según el proveedor).'
      },
      {
        title: '2. Aplicar Retención de ISLR',
        detail:
          'Indica el porcentaje de ISLR correspondiente (ej. 2% según Decreto 1808) sobre la base imponible del servicio o compra.'
      },
      {
        title: '3. Desglosar IGTF (3%)',
        detail:
          'Si el pago se realizó en divisas, confirma que el 3% de IGTF figure separado y no altere la base imponible del IVA.'
      }
    ],
    troubleshoot: [
      {
        q: '¿El IGTF suma base para calcular el IVA?',
        a: 'No. El IGTF (3%) es una alícuota adicional sobre el pago en moneda extranjera y nunca se mezcla con la base gravada al 16%.'
      },
      {
        q: '¿Cuándo retengo 100% de IVA en lugar de 75%?',
        a: 'Cuando el proveedor no aparece inscrito, la factura incumple requisitos formales o así lo exige la providencia aplicable.'
      }
    ],
    checklist: 'Comprobantes de retención emitidos en TXT/XML/PDF dentro de la quincena.'
  },
  {
    id: 'nomina',
    badge: 'Módulo 6 · RRHH y Banco',
    title: 'Nómina LOTTT y Conciliación Bancaria',
    routeLabel: 'Nómina LOTTT / Operaciones → Conciliación',
    targetTab: 'payroll',
    icon: Users,
    summary:
      'Control de trabajadores, cálculo de deducciones parafiscales de ley y cruce contra estados de cuenta bancarios.',
    steps: [
      {
        title: '1. Registrar trabajadores en Nómina LOTTT',
        detail:
          'Agrega a cada empleado con cédula, cargo, salario pactado (en VES o indexado en USD) y fecha de ingreso.'
      },
      {
        title: '2. Cálculo de Parafiscales',
        detail:
          'El sistema calcula automáticamente las retenciones de SSO (Seguro Social), SPF (Paro Forzoso) y FAOV (Vivienda y Hábitat).'
      },
      {
        title: '3. Conciliación Bancaria',
        detail:
          'En «Operaciones → Conciliación», importa el estado de cuenta CSV para cruzar pagos y transferencias contra tus facturas aprobadas.'
      }
    ],
    troubleshoot: [
      {
        q: '¿Un movimiento bancario no cruza con ninguna factura?',
        a: 'Verifica si el pago fue fraccionado, si incluye comisiones bancarias o si falta cargar el documento fiscal en la bandeja de Ingesta.'
      }
    ],
    checklist: 'Recibos de nómina emitidos y movimientos bancarios conciliados al 100%.'
  }
];

interface AccountantHelpDrawerProps {
  open: boolean;
  onClose: () => void;
  onNavigate: (tab: ActiveTabId, step?: OperationStepId) => void;
}

export const AccountantHelpDrawer: React.FC<AccountantHelpDrawerProps> = ({
  open,
  onClose,
  onNavigate
}) => {
  const [activeId, setActiveId] = useState<string>('empresas');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [completedIds, setCompletedIds] = useState<string[]>(() =>
    safeGetStorage<string[]>('vt_guide_done_v1', [])
  );

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const filteredModules = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return GUIDE_MODULES;
    return GUIDE_MODULES.filter(m => JSON.stringify(m).toLowerCase().includes(q));
  }, [searchQuery]);

  const activeModule = useMemo(
    () => GUIDE_MODULES.find(m => m.id === activeId) || GUIDE_MODULES[0],
    [activeId]
  );

  function toggleCompleted(id: string) {
    setCompletedIds(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      safeSetStorage('vt_guide_done_v1', next);
      return next;
    });
  }

  if (!open) return null;

  const isDone = completedIds.includes(activeModule.id);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm">
      <div
        className="w-full max-w-4xl h-full flex flex-col border-l shadow-2xl overflow-hidden"
        style={{
          backgroundColor: 'var(--bg-base, #090b0f)',
          borderColor: 'var(--border-highlight)',
          color: 'var(--text-primary)'
        }}
      >
        {/* Header */}
        <div
          className="px-5 py-4 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-3"
          style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--bg-elevated)' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="p-2 rounded-xl border"
              style={{
                borderColor: 'var(--accent-primary)',
                color: 'var(--accent-primary)',
                backgroundColor: 'rgba(255,255,255,0.03)'
              }}
            >
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold tracking-tight">Guía Interactiva · Contadora OS</h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full border border-[var(--border-subtle)] text-[var(--text-muted)]">
                  Progreso: {completedIds.length}/{GUIDE_MODULES.length}
                </span>
              </div>
              <p className="text-xs text-[var(--text-muted)]">
                Manual paso a paso y solución de dudas para operar toda la aplicación.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:w-56">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Buscar: empresa, usuario, IVA..."
                className="w-full pl-8 pr-3 py-1.5 rounded-lg border text-xs bg-transparent focus:outline-none"
                style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
              />
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg border hover:opacity-80 transition"
              style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}
              title="Cerrar Guía (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-12 overflow-hidden">
          {/* Sidebar */}
          <div
            className="md:col-span-4 border-b md:border-b-0 md:border-r p-3 space-y-1.5 overflow-y-auto"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            {filteredModules.length > 0 ? (
              filteredModules.map(mod => {
                const Icon = mod.icon;
                const active = mod.id === activeModule.id;
                const done = completedIds.includes(mod.id);
                return (
                  <button
                    key={mod.id}
                    type="button"
                    onClick={() => setActiveId(mod.id)}
                    className="w-full text-left p-2.5 rounded-xl border transition flex items-start justify-between gap-2"
                    style={{
                      borderColor: active ? 'var(--accent-primary)' : 'transparent',
                      backgroundColor: active ? 'var(--bg-elevated)' : 'transparent'
                    }}
                  >
                    <div className="flex items-start gap-2.5">
                      <Icon
                        className="w-4 h-4 mt-0.5 shrink-0"
                        style={{ color: active ? 'var(--accent-primary)' : 'var(--text-muted)' } as any}
                      />
                      <div>
                        <div className="text-[10px] font-mono text-[var(--text-muted)]">{mod.badge}</div>
                        <div
                          className="text-xs font-semibold mt-0.5"
                          style={{ color: active ? 'var(--accent-primary)' : 'var(--text-primary)' }}
                        >
                          {mod.title}
                        </div>
                      </div>
                    </div>
                    {done ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-1" />
                    ) : (
                      <Circle className="w-3.5 h-3.5 text-[var(--text-muted)] opacity-35 shrink-0 mt-1" />
                    )}
                  </button>
                );
              })
            ) : (
              <div className="p-4 text-xs text-[var(--text-muted)] text-center">
                Sin coincidencias para «{searchQuery}»
              </div>
            )}
          </div>

          {/* Detail Content */}
          <div className="md:col-span-8 p-5 overflow-y-auto space-y-5">
            <div
              className="pb-4 border-b flex flex-col sm:flex-row sm:items-start justify-between gap-3"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              <div>
                <div className="text-[11px] font-mono" style={{ color: 'var(--accent-primary)' }}>
                  {activeModule.routeLabel}
                </div>
                <h3 className="text-base font-bold mt-1">{activeModule.title}</h3>
                <p className="text-xs text-[var(--text-secondary)] mt-1 leading-relaxed">
                  {activeModule.summary}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    onNavigate(activeModule.targetTab, activeModule.targetStep);
                    onClose();
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
                  style={{
                    backgroundColor: 'var(--accent-primary)',
                    color: '#090b0f'
                  }}
                >
                  <span>Llévame allí</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => toggleCompleted(activeModule.id)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium border transition"
                  style={{
                    borderColor: isDone ? '#10b981' : 'var(--border-subtle)',
                    color: isDone ? '#34d399' : 'var(--text-secondary)'
                  }}
                >
                  {isDone ? '✓ Dominado' : 'Marcar aprendido'}
                </button>
              </div>
            </div>

            {/* Steps */}
            <div className="space-y-2.5">
              <div className="text-[11px] font-mono uppercase tracking-wider text-[var(--text-muted)]">
                Procedimiento Paso a Paso
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {activeModule.steps.map(step => (
                  <div
                    key={step.title}
                    className="p-3 rounded-xl border"
                    style={{
                      borderColor: 'var(--border-subtle)',
                      backgroundColor: 'var(--bg-elevated)'
                    }}
                  >
                    <div className="text-xs font-semibold">{step.title}</div>
                    <p className="text-xs text-[var(--text-secondary)] mt-1 leading-relaxed">
                      {step.detail}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Troubleshooting */}
            <div className="space-y-2.5 pt-2 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
              <div className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-amber-400">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>¿Te confundiste? Solución de errores frecuentes</span>
              </div>
              <div className="space-y-2">
                {activeModule.troubleshoot.map(item => (
                  <div
                    key={item.q}
                    className="p-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.04]"
                  >
                    <div className="text-xs font-semibold flex items-center gap-1.5">
                      <HelpCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span>{item.q}</span>
                    </div>
                    <p className="text-xs text-[var(--text-secondary)] mt-1 pl-5 leading-relaxed">
                      {item.a}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Verification Checklist */}
            <div
              className="p-3 rounded-xl border flex items-center gap-2 text-xs"
              style={{
                borderColor: 'var(--border-subtle)',
                backgroundColor: 'var(--bg-elevated)'
              }}
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                <strong className="text-emerald-400">Meta de verificación:</strong>{' '}
                <span className="text-[var(--text-secondary)]">{activeModule.checklist}</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
