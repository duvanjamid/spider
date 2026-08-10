import { Component, ElementRef, OnInit, ViewChild, computed, inject, signal } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { timeout } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { ChartModule } from 'primeng/chart';
import { DialogModule } from 'primeng/dialog';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { GastosService, Budget, Category, Expense, Monto, Recurring, Scan, Summary, Trend } from './gastos.service';

type SheetState = 'form' | 'loading' | 'error' | 'unreadable';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [NgFor, NgIf, FormsModule, ButtonModule, CardModule, ChartModule, DialogModule, ProgressSpinnerModule],
  styles: [`
    .wrap { max-width: 1100px; margin: 0 auto; padding: 22px 16px 72px; }
    header { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; flex-wrap: wrap; }
    h1 { font-size: 1.5rem; margin: 0; }
    h3 { margin: 20px 0 10px; }
    .spacer { flex: 1; }
    .muted { color: var(--muted, #9aa3b2); }
    .month { display: flex; align-items: center; gap: 6px; }
    .month b { min-width: 150px; text-align: center; text-transform: capitalize; }

    .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 6px; }
    @media (max-width: 820px) { .kpis { grid-template-columns: repeat(2, 1fr); } }
    .kpi { background: var(--panel,#1a1d24); border: 1px solid var(--border,#262a33); border-radius: 14px; padding: 16px; }
    .kpi .lbl { font-size: .8rem; color: var(--muted,#9aa3b2); display: flex; align-items: center; gap: 6px; }
    .kpi .val { font-size: 1.5rem; font-weight: 700; margin-top: 4px; }
    .kpi .sub { font-size: .8rem; margin-top: 4px; }
    .up { color: #ef4444; } .down { color: #10b981; }
    .accent { color: var(--accent,#6c8cff); }

    .charts { display: grid; grid-template-columns: 1.1fr 1.3fr; gap: 16px; margin-bottom: 8px; }
    @media (max-width: 900px) { .charts { grid-template-columns: 1fr; } }
    .chart-box { height: 250px; position: relative; }

    .list { display: flex; flex-direction: column; gap: 8px; }
    .row { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border: 1px solid var(--border,#262a33);
           border-radius: 12px; background: var(--panel,#1a1d24); }
    .dot { width: 12px; height: 12px; border-radius: 50%; flex: none; }
    .row .grow { flex: 1; min-width: 0; } .row .grow small { color: var(--muted,#9aa3b2); }
    .amt { font-weight: 700; white-space: nowrap; }
    .actions { display: flex; gap: 10px; margin: 16px 0; flex-wrap: wrap; align-items: center; }

    .sheet { display: flex; flex-direction: column; gap: 14px; padding: 4px 2px; }
    .center { text-align: center; padding: 22px 8px; display: flex; flex-direction: column; align-items: center; gap: 12px; }
    .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .field { display: flex; flex-direction: column; gap: 6px; }
    .field.full { grid-column: 1 / -1; }
    .field label { font-size: .82rem; color: var(--muted,#9aa3b2); }
    .field input, .field select { padding: 10px 12px; border-radius: 8px; border: 1px solid var(--border,#262a33);
           background: #0f1115; color: var(--fg,#e6e8ee); font-size: 1rem; }
    .montos { display: flex; flex-wrap: wrap; gap: 8px; }
    .chip { display: flex; align-items: center; gap: 8px; border: 1px solid var(--border,#262a33);
            padding: 8px 12px; border-radius: 999px; cursor: pointer; background: var(--panel,#1a1d24); }
    .chip.sel { border-color: var(--accent,#6c8cff); background: rgba(108,140,255,.14); }
    .chip small { color: var(--muted,#9aa3b2); }
    .hint { font-size: .85rem; color: #f59e0b; }

    .cat-add { display: flex; gap: 8px; align-items: center; margin-bottom: 14px; flex-wrap: wrap; }
    .cat-add input[type=text] { flex: 1; min-width: 140px; padding: 9px 11px; border-radius: 8px;
           border: 1px solid var(--border,#262a33); background: #0f1115; color: var(--fg,#e6e8ee); }
    .cat-add input[type=color] { width: 42px; height: 38px; border: none; background: none; }
    .cat-row { display: flex; align-items: center; gap: 10px; padding: 8px 4px; border-bottom: 1px solid var(--border,#262a33); }
    .cat-row input[type=number] { width: 110px; padding: 6px 8px; border-radius: 6px; border: 1px solid var(--border,#262a33); background:#0f1115; color:var(--fg,#e6e8ee); }
    .bud { display: flex; align-items: center; gap: 10px; padding: 6px 0; }
    .bud .bname { width: 120px; }
    .bud .bar { flex: 1; height: 8px; background: #0f1115; border-radius: 999px; overflow: hidden; }
    .bud .bar .fill { height: 100%; border-radius: 999px; }
    .bud .bfig { font-size: .82rem; white-space: nowrap; min-width: 140px; text-align: right; }
    .filters { display: flex; gap: 8px; align-items: center; margin-bottom: 10px; flex-wrap: wrap; }
    .filters input, .filters select { padding: 8px 10px; border-radius: 8px; border: 1px solid var(--border,#262a33); background:#0f1115; color:var(--fg,#e6e8ee); }
    .cmp { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    .cmp .col { text-align: center; } .cmp .big { font-size: 1.4rem; font-weight: 700; }
  `],
  template: `
    <div class="wrap">
      <header>
        <h1>💸 Gastos</h1>
        <p-button label="Categorías" icon="pi pi-tags" [text]="true" size="small" (onClick)="openCats()" />
        <span class="spacer"></span>
        <div class="month">
          <p-button icon="pi pi-chevron-left" [text]="true" (onClick)="shiftMonth(-1)" />
          <b>{{ monthLabel() }}</b>
          <p-button icon="pi pi-chevron-right" [text]="true" (onClick)="shiftMonth(1)" />
        </div>
      </header>

      <!-- KPIs -->
      <div class="kpis" *ngIf="summary() as s">
        <div class="kpi">
          <div class="lbl"><i class="pi pi-wallet"></i> Total del mes</div>
          <div class="val">{{ fmt(s.total) }}</div>
          <div class="sub muted">{{ s.count }} movimiento(s)</div>
        </div>
        <div class="kpi">
          <div class="lbl"><i class="pi pi-calendar"></i> Promedio diario</div>
          <div class="val">{{ fmt(s.dailyAverage) }}</div>
          <div class="sub muted">día {{ s.daysElapsed }} de {{ s.daysInMonth }}</div>
        </div>
        <div class="kpi">
          <div class="lbl"><i class="pi pi-chart-line"></i> Proyección fin de mes</div>
          <div class="val accent">{{ fmt(s.projectedEndOfMonth) }}</div>
          <div class="sub muted">a este ritmo</div>
        </div>
        <div class="kpi">
          <div class="lbl"><i class="pi pi-sync"></i> vs mes anterior</div>
          <div class="val">{{ fmt(s.previousMonthTotal) }}</div>
          <div class="sub" [class.up]="change() > 0" [class.down]="change() < 0" *ngIf="s.previousMonthTotal > 0">
            {{ change() > 0 ? '▲' : change() < 0 ? '▼' : '' }} {{ absChange() }}%
          </div>
          <div class="sub muted" *ngIf="s.previousMonthTotal === 0">sin datos previos</div>
        </div>
      </div>

      <div class="actions">
        <input #file type="file" accept="image/*" hidden (change)="onFile($event)" />
        <p-button label="Escanear recibo" icon="pi pi-camera" (onClick)="file.click()"
                  [disabled]="!aiEnabled()" [loading]="sheetState() === 'loading'" />
        <p-button label="Agregar manual" icon="pi pi-plus" [outlined]="true" (onClick)="openManual()" />
        <span class="spacer"></span>
        <p-button label="Recurrentes" icon="pi pi-replay" [text]="true" size="small" (onClick)="openRecurring()" />
        <p-button label="Comparar" icon="pi pi-sort-alt" [text]="true" size="small" (onClick)="openCompare()" />
        <p-button label="CSV" icon="pi pi-download" [text]="true" size="small" (onClick)="exportCsv()" />
      </div>
      <div class="muted" *ngIf="!aiEnabled()" style="margin:-8px 0 8px"><i class="pi pi-info-circle"></i> Configura GEMINI_API_KEY para el escaneo.</div>

      <!-- Presupuestos -->
      <p-card header="Presupuestos" *ngIf="budgeted().length">
        <div class="bud" *ngFor="let b of budgeted()">
          <span class="dot" [style.background]="b.color"></span>
          <span class="bname">{{ b.name }}</span>
          <div class="bar"><div class="fill" [style.width.%]="b.pct" [style.background]="b.over ? '#ef4444' : b.color"></div></div>
          <span class="bfig" [class.up]="b.over">{{ fmt(b.total) }} / {{ fmt(b.budget) }}</span>
          <i class="pi pi-exclamation-circle up" *ngIf="b.over" title="Presupuesto superado"></i>
        </div>
      </p-card>

      <!-- Gráficos -->
      <div class="charts" *ngIf="(summary()?.byCategory?.length || 0) > 0 || (trend()?.series?.length || 0) > 0">
        <p-card header="Distribución por categoría">
          <div class="chart-box"><p-chart type="doughnut" [data]="pieData()" [options]="pieOptions" /></div>
        </p-card>
        <p-card header="Tendencia y estimación">
          <div class="chart-box"><p-chart type="line" [data]="lineData()" [options]="lineOptions" /></div>
        </p-card>
      </div>
      <p-card header="Gasto por categoría (mes)" *ngIf="(summary()?.byCategory?.length || 0) > 0">
        <div class="chart-box"><p-chart type="bar" [data]="barData()" [options]="barOptions" /></div>
      </p-card>

      <h3>Movimientos</h3>
      <div class="filters">
        <input type="text" [(ngModel)]="query" placeholder="Buscar (comercio, descripción, NIT)…" style="flex:1;min-width:180px" />
        <select [(ngModel)]="filterCat">
          <option value="">Todas las categorías</option>
          <option *ngFor="let c of categories()" [value]="c.slug">{{ c.name }}</option>
        </select>
        <span class="muted">{{ filtered().length }} de {{ expenses().length }}</span>
      </div>
      <div class="list">
        <div class="row" *ngFor="let e of filtered()">
          <span class="dot" [style.background]="e.categoryColor || '#9aa3b2'"></span>
          <div class="grow">
            <div>{{ e.merchant || e.description || e.categoryName || 'Gasto' }}</div>
            <small>{{ e.categoryName || 'Otros' }} · {{ e.spentOn }}<span *ngIf="e.source === 'scan'"> · 🤖</span><span *ngIf="e.source === 'recurring'"> · 🔁</span></small>
          </div>
          <span class="amt">{{ fmt(e.amount, e.currency) }}</span>
          <p-button icon="pi pi-trash" severity="danger" [text]="true" size="small" (onClick)="del(e.id)" />
        </div>
        <p class="muted" *ngIf="loaded() && filtered().length === 0">Sin movimientos que coincidan.</p>
      </div>
    </div>

    <!-- Hoja inferior: escaneo / alta -->
    <p-dialog [(visible)]="sheetVisible" [modal]="true" [position]="'bottom'" [dismissableMask]="true"
              [style]="{ width: '100%', maxWidth: '560px' }" [header]="sheetTitle()">
      <div class="center" *ngIf="sheetState() === 'loading'">
        <p-progressSpinner strokeWidth="4" [style]="{ width: '48px', height: '48px' }" />
        <span class="muted">Leyendo la factura con IA…</span>
      </div>
      <div class="center" *ngIf="sheetState() === 'error'">
        <i class="pi pi-exclamation-triangle" style="font-size:2rem;color:#ef4444"></i>
        <b>No se pudo leer la imagen.</b>
        <span class="muted">Revisa tu conexión o intenta con otra foto.</span>
        <div style="display:flex;gap:8px;margin-top:6px">
          <p-button label="Reintentar" icon="pi pi-refresh" (onClick)="retry()" />
          <p-button label="Tomar otra" icon="pi pi-camera" [outlined]="true" (onClick)="pickAgain()" />
        </div>
      </div>
      <div class="center" *ngIf="sheetState() === 'unreadable'">
        <i class="pi pi-image" style="font-size:2rem;color:#f59e0b"></i>
        <b>No se pudo identificar la factura.</b>
        <span class="muted">La imagen no parece un recibo legible. Carga o toma otra foto.</span>
        <div style="display:flex;gap:8px;margin-top:6px">
          <p-button label="Reintentar" icon="pi pi-refresh" (onClick)="retry()" />
          <p-button label="Tomar otra" icon="pi pi-camera" [outlined]="true" (onClick)="pickAgain()" />
          <p-button label="Ingresar manual" [text]="true" (onClick)="toManual()" />
        </div>
      </div>
      <div class="sheet" *ngIf="sheetState() === 'form'">
        <div class="form-grid">
          <div class="field full" *ngIf="montos().length">
            <label>¿Cuál total pagaste?</label>
            <div class="montos">
              <div class="chip" *ngFor="let m of montos()" [class.sel]="form.amount === m.valor" (click)="form.amount = m.valor">
                <b>{{ fmt(m.valor) }}</b> <small>{{ m.etiqueta }}</small>
              </div>
            </div>
          </div>
          <div class="field"><label>Monto a pagar</label><input type="number" [(ngModel)]="form.amount" placeholder="0" /></div>
          <div class="field"><label>Moneda</label><input type="text" [(ngModel)]="form.currency" placeholder="COP" /></div>
          <div class="field">
            <label>Categoría</label>
            <select [(ngModel)]="form.categoryId">
              <option [ngValue]="null" disabled>Elige…</option>
              <option *ngFor="let c of categories()" [ngValue]="c.id">{{ c.name }}</option>
            </select>
            <span class="hint" *ngIf="suggested()">Sugerida por IA: “{{ suggested() }}” — créala en Categorías</span>
          </div>
          <div class="field"><label>Fecha de compra</label><input type="date" [(ngModel)]="form.spentOn" /></div>
          <div class="field"><label>Establecimiento</label><input type="text" [(ngModel)]="form.merchant" placeholder="Comercio" /></div>
          <div class="field"><label>NIT</label><input type="text" [(ngModel)]="form.nit" placeholder="NIT / ID tributario" /></div>
          <div class="field full"><label>Descripción</label><input type="text" [(ngModel)]="form.description" placeholder="Detalle" /></div>
        </div>
      </div>
      <ng-template pTemplate="footer">
        <div *ngIf="sheetState() === 'form'" style="display:flex;gap:8px;justify-content:flex-end">
          <p-button label="Cancelar" [text]="true" (onClick)="sheetVisible = false" />
          <p-button label="Guardar" icon="pi pi-check" (onClick)="save()" [loading]="saving()"
                    [disabled]="!form.amount || form.amount <= 0" />
        </div>
      </ng-template>
    </p-dialog>

    <!-- Gestión de categorías -->
    <p-dialog [(visible)]="catDialog" [modal]="true" header="Mis categorías" [style]="{ width: '440px' }">
      <div class="cat-add">
        <input type="text" [(ngModel)]="catForm.name" placeholder="Nombre de categoría" />
        <input type="color" [(ngModel)]="catForm.color" />
        <p-button [label]="catForm.id ? 'Guardar' : 'Añadir'" icon="pi pi-check" size="small"
                  (onClick)="saveCat()" [disabled]="!catForm.name" />
        <p-button *ngIf="catForm.id" label="Cancelar" [text]="true" size="small" (onClick)="resetCatForm()" />
      </div>
      <div class="cat-row" *ngFor="let c of categories()">
        <span class="dot" [style.background]="c.color"></span>
        <span class="grow" style="flex:1">{{ c.name }}</span>
        <input type="number" [value]="budgetFor(c.id)" (change)="setBudget(c.id, $any($event.target).value)"
               placeholder="Presup." title="Presupuesto mensual" />
        <p-button icon="pi pi-pencil" [text]="true" size="small" (onClick)="editCat(c)" />
        <p-button icon="pi pi-trash" severity="danger" [text]="true" size="small" (onClick)="delCat(c)" />
      </div>
    </p-dialog>

    <!-- Recurrentes -->
    <p-dialog [(visible)]="recDialog" [modal]="true" header="Gastos recurrentes" [style]="{ width: '480px' }">
      <div class="cat-add">
        <input type="text" [(ngModel)]="recForm.merchant" placeholder="Nombre (p.ej. Netflix)" style="flex:1" />
        <input type="number" [(ngModel)]="recForm.amount" placeholder="Monto" style="width:110px" />
      </div>
      <div class="cat-add">
        <select [(ngModel)]="recForm.categoryId" style="flex:1;padding:9px 11px;border-radius:8px;border:1px solid var(--border,#262a33);background:#0f1115;color:var(--fg,#e6e8ee)">
          <option [ngValue]="null">Sin categoría</option>
          <option *ngFor="let c of categories()" [ngValue]="c.id">{{ c.name }}</option>
        </select>
        <span class="muted">día</span>
        <input type="number" [(ngModel)]="recForm.dayOfMonth" min="1" max="28" style="width:70px" />
        <p-button label="Añadir" icon="pi pi-plus" size="small" (onClick)="addRecurring()"
                  [disabled]="!recForm.merchant || !recForm.amount" />
      </div>
      <div class="cat-row" *ngFor="let r of recurring()">
        <span class="dot" [style.background]="r.categoryColor || '#9aa3b2'"></span>
        <span class="grow" style="flex:1">{{ r.merchant || r.description }} <small class="muted">· día {{ r.dayOfMonth }}</small></span>
        <span>{{ fmt(r.amount, r.currency) }}</span>
        <p-button icon="pi pi-trash" severity="danger" [text]="true" size="small" (onClick)="delRecurring(r.id)" />
      </div>
      <div style="margin-top:12px;display:flex;justify-content:flex-end">
        <p-button label="Aplicar al mes actual" icon="pi pi-check" size="small" (onClick)="applyRecurring()" [loading]="applying()" />
      </div>
    </p-dialog>

    <!-- Comparar meses -->
    <p-dialog [(visible)]="cmpDialog" [modal]="true" header="Comparar meses" [style]="{ width: '460px' }">
      <div class="cat-add">
        <input type="month" [(ngModel)]="cmpA" (change)="loadCompare()" style="flex:1" />
        <span class="muted">vs</span>
        <input type="month" [(ngModel)]="cmpB" (change)="loadCompare()" style="flex:1" />
      </div>
      <div class="cmp" *ngIf="cmpSummA() && cmpSummB() as _">
        <div class="col"><div class="muted">{{ cmpA }}</div><div class="big">{{ fmt(cmpSummA()!.total) }}</div></div>
        <div class="col"><div class="muted">{{ cmpB }}</div><div class="big">{{ fmt(cmpSummB()!.total) }}</div></div>
      </div>
      <div class="chart-box" style="height:220px;margin-top:12px" *ngIf="cmpSummA() && cmpSummB()">
        <p-chart type="bar" [data]="cmpData()" [options]="barOptionsV" />
      </div>
    </p-dialog>
  `,
})
export class AppComponent implements OnInit {
  private api = inject(GastosService);
  @ViewChild('file') fileInput!: ElementRef<HTMLInputElement>;

  readonly month = signal<string>(new Date().toISOString().slice(0, 7));
  readonly categories = signal<Category[]>([]);
  readonly expenses = signal<Expense[]>([]);
  readonly summary = signal<Summary | null>(null);
  readonly trend = signal<Trend | null>(null);
  readonly aiEnabled = signal<boolean>(false);
  readonly loaded = signal<boolean>(false);

  sheetVisible = false;
  readonly sheetState = signal<SheetState>('form');
  readonly montos = signal<Monto[]>([]);
  readonly suggested = signal<string | null>(null);
  readonly saving = signal<boolean>(false);
  scanned = false;
  private lastImage: { base64: string; mediaType: string } | null = null;
  form = this.emptyForm();

  catDialog = false;
  catForm: { id: number | null; name: string; color: string } = { id: null, name: '', color: '#6c8cff' };

  readonly budgets = signal<Budget[]>([]);
  readonly recurring = signal<Recurring[]>([]);
  readonly applying = signal<boolean>(false);
  recDialog = false;
  recForm: { merchant: string; amount: number | null; categoryId: number | null; dayOfMonth: number } =
    { merchant: '', amount: null, categoryId: null, dayOfMonth: 1 };

  query = '';
  filterCat = '';
  cmpDialog = false;
  cmpA = new Date().toISOString().slice(0, 7);
  cmpB = new Date().toISOString().slice(0, 7);
  readonly cmpSummA = signal<Summary | null>(null);
  readonly cmpSummB = signal<Summary | null>(null);

  readonly barOptionsV = { maintainAspectRatio: false, plugins: { legend: { display: false } },
    scales: { x: { ticks: { color: '#e6e8ee' }, grid: { display: false } },
              y: { ticks: { color: '#9aa3b2' }, grid: { color: '#262a33' } } } };

  readonly budgeted = computed(() => {
    const bc = this.summary()?.byCategory ?? [];
    return bc.filter((c) => c.budget > 0).map((c) => ({
      name: c.name, color: c.color, total: c.total, budget: c.budget,
      pct: Math.min(100, Math.round((c.total / c.budget) * 100)), over: c.total > c.budget,
    }));
  });

  readonly filtered = computed(() => {
    const q = this.query.trim().toLowerCase();
    const cat = this.filterCat;
    return this.expenses().filter((e) => {
      if (cat && e.categorySlug !== cat) return false;
      if (!q) return true;
      return (e.merchant + ' ' + e.description + ' ' + e.nit + ' ' + e.categoryName).toLowerCase().includes(q);
    });
  });

  readonly cmpData = computed(() => ({
    labels: [this.cmpA, this.cmpB],
    datasets: [{ data: [this.cmpSummA()?.total ?? 0, this.cmpSummB()?.total ?? 0],
      backgroundColor: ['#6c8cff', '#10b981'], borderRadius: 6 }],
  }));

  readonly change = computed(() => {
    const s = this.summary();
    if (!s || s.previousMonthTotal <= 0) return 0;
    return ((s.total - s.previousMonthTotal) / s.previousMonthTotal) * 100;
  });
  absChange(): number { return Math.abs(Math.round(this.change())); }

  readonly pieOptions = { maintainAspectRatio: false, cutout: '58%',
    plugins: { legend: { position: 'right', labels: { color: '#e6e8ee', boxWidth: 12 } } } };
  readonly lineOptions = { maintainAspectRatio: false,
    plugins: { legend: { labels: { color: '#e6e8ee' } } },
    scales: { x: { ticks: { color: '#9aa3b2' }, grid: { color: '#262a33' } },
              y: { ticks: { color: '#9aa3b2' }, grid: { color: '#262a33' } } } };
  readonly barOptions = { indexAxis: 'y', maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: { x: { ticks: { color: '#9aa3b2' }, grid: { color: '#262a33' } },
              y: { ticks: { color: '#e6e8ee' }, grid: { display: false } } } };

  readonly pieData = computed(() => {
    const bc = this.summary()?.byCategory ?? [];
    return { labels: bc.map((c) => c.name),
      datasets: [{ data: bc.map((c) => c.total), backgroundColor: bc.map((c) => c.color), borderWidth: 0 }] };
  });
  readonly barData = computed(() => {
    const bc = this.summary()?.byCategory ?? [];
    return { labels: bc.map((c) => c.name),
      datasets: [{ data: bc.map((c) => c.total), backgroundColor: bc.map((c) => c.color), borderRadius: 6 }] };
  });
  readonly lineData = computed(() => {
    const t = this.trend(); const s = t?.series ?? [];
    const labels = s.map((p) => p.month.slice(5)).concat(['est.']);
    const real = s.map((p) => p.total).concat([null as unknown as number]);
    const last = s.length ? s[s.length - 1].total : 0;
    const est = Array(Math.max(s.length - 1, 0)).fill(null).concat([last, t?.forecastNext ?? 0]);
    return { labels, datasets: [
      { label: 'Real', data: real, borderColor: '#6c8cff', backgroundColor: 'rgba(108,140,255,.15)', fill: true, tension: 0.35 },
      { label: 'Estimación', data: est, borderColor: '#10b981', borderDash: [6, 6], tension: 0.35 } ] };
  });

  sheetTitle(): string {
    switch (this.sheetState()) {
      case 'loading': return 'Escaneando…';
      case 'error': return 'Error al leer';
      case 'unreadable': return 'No identificado';
      default: return this.scanned ? 'Confirmar gasto escaneado' : 'Nuevo gasto';
    }
  }

  ngOnInit(): void {
    this.loadCategories();
    this.loadBudgets();
    this.api.aiStatus().subscribe({ next: (s) => this.aiEnabled.set(s.enabled), error: () => {} });
    this.reload();
  }

  private loadCategories(): void { this.api.categories().subscribe((c) => this.categories.set(c)); }

  reload(): void {
    const m = this.month();
    this.api.expenses(m).subscribe({ next: (e) => { this.expenses.set(e); this.loaded.set(true); }, error: () => this.loaded.set(true) });
    this.api.summary(m).subscribe({ next: (s) => this.summary.set(s), error: () => {} });
    this.api.trend(6).subscribe({ next: (t) => this.trend.set(t), error: () => {} });
  }

  shiftMonth(delta: number): void {
    const [y, m] = this.month().split('-').map(Number);
    this.month.set(new Date(y, m - 1 + delta, 1).toISOString().slice(0, 7));
    this.reload();
  }
  monthLabel(): string {
    const [y, m] = this.month().split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('es', { month: 'long', year: 'numeric' });
  }

  // ── Categorías ──
  openCats(): void { this.resetCatForm(); this.loadBudgets(); this.catDialog = true; }
  resetCatForm(): void { this.catForm = { id: null, name: '', color: '#6c8cff' }; }
  editCat(c: Category): void { this.catForm = { id: c.id, name: c.name, color: c.color }; }
  saveCat(): void {
    if (!this.catForm.name) return;
    const done = () => { this.resetCatForm(); this.loadCategories(); this.reload(); };
    if (this.catForm.id) {
      this.api.updateCategory(this.catForm.id, { name: this.catForm.name, color: this.catForm.color }).subscribe(done);
    } else {
      this.api.createCategory(this.catForm.name, this.catForm.color, 'pi-wallet').subscribe(done);
    }
  }
  delCat(c: Category): void {
    if (!confirm(`¿Borrar la categoría "${c.name}"? Los gastos quedarán sin categoría.`)) return;
    this.api.deleteCategory(c.id).subscribe(() => { this.loadCategories(); this.reload(); });
  }

  // ── Presupuestos ──
  private loadBudgets(): void { this.api.budgets().subscribe((b) => this.budgets.set(b)); }
  budgetFor(id: number): number | null { return this.budgets().find((b) => b.categoryId === id)?.amount ?? null; }
  setBudget(id: number, value: string): void {
    this.api.setBudget(id, Number(value) || 0).subscribe(() => { this.loadBudgets(); this.reload(); });
  }

  // ── Recurrentes ──
  openRecurring(): void { this.loadRecurring(); this.recDialog = true; }
  private loadRecurring(): void { this.api.recurring().subscribe((r) => this.recurring.set(r)); }
  addRecurring(): void {
    if (!this.recForm.merchant || !this.recForm.amount) return;
    this.api.createRecurring({ merchant: this.recForm.merchant, amount: this.recForm.amount,
      categoryId: this.recForm.categoryId, dayOfMonth: this.recForm.dayOfMonth }).subscribe(() => {
      this.recForm = { merchant: '', amount: null, categoryId: null, dayOfMonth: 1 };
      this.loadRecurring();
    });
  }
  delRecurring(id: number): void { this.api.deleteRecurring(id).subscribe(() => this.loadRecurring()); }
  applyRecurring(): void {
    this.applying.set(true);
    this.api.applyRecurring(this.month()).subscribe({
      next: (r) => { this.applying.set(false); this.reload(); alert(`${r.created} gasto(s) recurrente(s) aplicado(s).`); },
      error: () => this.applying.set(false),
    });
  }

  // ── Comparar meses ──
  openCompare(): void {
    const [y, m] = this.month().split('-').map(Number);
    this.cmpA = this.month();
    this.cmpB = new Date(y, m - 2, 1).toISOString().slice(0, 7);
    this.loadCompare();
    this.cmpDialog = true;
  }
  loadCompare(): void {
    this.api.summary(this.cmpA).subscribe((s) => this.cmpSummA.set(s));
    this.api.summary(this.cmpB).subscribe((s) => this.cmpSummB.set(s));
  }

  // ── Exportar CSV ──
  exportCsv(): void {
    const rows = [['fecha_compra', 'monto', 'moneda', 'categoria', 'comercio', 'nit', 'descripcion', 'origen', 'registrado']];
    for (const e of this.expenses()) {
      rows.push([e.spentOn, String(e.amount), e.currency, e.categoryName, e.merchant, e.nit, e.description, e.source, e.registeredAt]);
    }
    const csv = rows.map((r) => r.map((c) => `"${(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `gastos-${this.month()}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  // ── Alta / escaneo ──
  openManual(): void { this.scanned = false; this.montos.set([]); this.suggested.set(null); this.form = this.emptyForm(); this.sheetState.set('form'); this.sheetVisible = true; }
  toManual(): void { this.scanned = false; this.montos.set([]); this.sheetState.set('form'); }

  onFile(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const f = input.files?.[0];
    if (!f) return;
    this.sheetVisible = true; this.sheetState.set('loading');
    this.downscale(f).then((img) => { this.lastImage = img; this.runScan(); }).catch(() => this.sheetState.set('error'));
    input.value = '';
  }

  private downscale(file: File): Promise<{ base64: string; mediaType: string }> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject();
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject();
        img.onload = () => {
          const max = 1600; let w = img.width, h = img.height;
          if (Math.max(w, h) > max) { const s = max / Math.max(w, h); w = Math.round(w * s); h = Math.round(h * s); }
          const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
          const cx = canvas.getContext('2d'); if (!cx) { reject(); return; }
          cx.drawImage(img, 0, 0, w, h);
          const url = canvas.toDataURL('image/jpeg', 0.8);
          resolve({ base64: url.split(',')[1] ?? '', mediaType: 'image/jpeg' });
        };
        img.src = reader.result as string;
      };
      reader.readAsDataURL(file);
    });
  }

  retry(): void { if (this.lastImage) this.runScan(); }
  pickAgain(): void { this.fileInput?.nativeElement.click(); }

  private runScan(): void {
    if (!this.lastImage) return;
    this.sheetVisible = true; this.sheetState.set('loading');
    this.api.scan(this.lastImage.base64, this.lastImage.mediaType).pipe(timeout(70000)).subscribe({
      next: (s) => this.applyScan(s), error: () => this.sheetState.set('error'),
    });
  }

  private applyScan(s: Scan): void {
    if (!s.identificado || !s.montos?.length) { this.sheetState.set('unreadable'); return; }
    this.scanned = true;
    this.montos.set(s.montos);
    this.suggested.set(s.categoriaId ? null : s.categoriaSugerida);
    this.form = { amount: s.montos[0]?.valor ?? null, currency: 'COP', categoryId: s.categoriaId ?? null,
      merchant: s.establecimiento ?? '', nit: s.nit ?? '', description: s.descripcion ?? '',
      spentOn: new Date().toISOString().slice(0, 10) };
    this.sheetState.set('form');
  }

  save(): void {
    if (!this.form.amount || this.form.amount <= 0) return;
    this.saving.set(true);
    this.api.create({ amount: this.form.amount, currency: this.form.currency, categoryId: this.form.categoryId,
      merchant: this.form.merchant, description: this.form.description, nit: this.form.nit,
      spentOn: this.form.spentOn, source: this.scanned ? 'scan' : 'manual' }).subscribe({
      next: () => { this.saving.set(false); this.sheetVisible = false; this.reload(); },
      error: () => { this.saving.set(false); alert('No se pudo guardar.'); },
    });
  }

  del(id: number): void { this.api.remove(id).subscribe(() => this.reload()); }

  fmt(n: number, currency = 'COP'): string {
    try { return new Intl.NumberFormat('es-CO', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n); }
    catch { return `${n}`; }
  }

  private emptyForm() {
    return { amount: null as number | null, currency: 'COP', categoryId: null as number | null,
      merchant: '', nit: '', description: '', spentOn: new Date().toISOString().slice(0, 10) };
  }
}
