import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { ChartModule } from 'primeng/chart';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { TagModule } from 'primeng/tag';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { GastosService, Category, Expense, Summary, Trend } from './gastos.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [NgFor, NgIf, FormsModule, ButtonModule, CardModule, ChartModule,
    DialogModule, InputTextModule, TagModule, ProgressSpinnerModule],
  styles: [`
    .wrap { max-width: 1040px; margin: 0 auto; padding: 24px 16px 64px; }
    header { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
    h1 { font-size: 1.5rem; margin: 0; }
    .spacer { flex: 1; }
    .muted { color: var(--muted, #9aa3b2); }
    .month { display: flex; align-items: center; gap: 6px; }
    .month b { min-width: 150px; text-align: center; text-transform: capitalize; }
    .total-card { display: flex; align-items: baseline; gap: 12px; }
    .total { font-size: 2rem; font-weight: 700; }
    .actions { display: flex; gap: 10px; margin: 16px 0; flex-wrap: wrap; }
    .charts { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; }
    @media (max-width: 760px) { .charts { grid-template-columns: 1fr; } }
    .chart-box { height: 260px; position: relative; }
    .list { display: flex; flex-direction: column; gap: 8px; }
    .row { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border: 1px solid var(--border,#262a33);
           border-radius: 12px; background: var(--panel,#1a1d24); }
    .dot { width: 12px; height: 12px; border-radius: 50%; flex: none; }
    .row .grow { flex: 1; min-width: 0; }
    .row .grow small { color: var(--muted,#9aa3b2); }
    .amt { font-weight: 700; white-space: nowrap; }
    .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .form-grid .full { grid-column: 1 / -1; }
    .field { display: flex; flex-direction: column; gap: 6px; }
    .field label { font-size: .82rem; color: var(--muted,#9aa3b2); }
    .field input, .field select { padding: 9px 11px; border-radius: 8px; border: 1px solid var(--border,#262a33);
           background: #0f1115; color: var(--fg,#e6e8ee); }
    .scan-hint { display:flex; align-items:center; gap:8px; }
    .est { display:flex; align-items:baseline; gap:8px; margin-top:6px; }
    .est b { color:#10b981; }
  `],
  template: `
    <div class="wrap">
      <header>
        <h1>💸 Gastos</h1>
        <span class="spacer"></span>
        <div class="month">
          <p-button icon="pi pi-chevron-left" [text]="true" (onClick)="shiftMonth(-1)" />
          <b>{{ monthLabel() }}</b>
          <p-button icon="pi pi-chevron-right" [text]="true" (onClick)="shiftMonth(1)" />
        </div>
      </header>

      <p-card>
        <div class="total-card">
          <span class="muted">Total del mes</span>
          <span class="total">{{ fmt(summary()?.total ?? 0) }}</span>
          <span class="spacer"></span>
          <div class="est" *ngIf="trend() as t">
            <span class="muted">Estimado próx. mes:</span> <b>{{ fmt(t.forecastNext) }}</b>
          </div>
        </div>
      </p-card>

      <div class="actions">
        <input #file type="file" accept="image/*" hidden (change)="onFile($event)" />
        <p-button label="Escanear recibo" icon="pi pi-camera" (onClick)="file.click()"
                  [disabled]="!aiEnabled()" [loading]="scanning()" />
        <p-button label="Agregar manual" icon="pi pi-plus" [outlined]="true" (onClick)="openManual()" />
        <span class="scan-hint muted" *ngIf="!aiEnabled()">
          <i class="pi pi-info-circle"></i> El escaneo con IA requiere configurar ANTHROPIC_API_KEY.
        </span>
      </div>

      <div class="charts" *ngIf="(summary()?.byCategory?.length || 0) > 0 || (trend()?.series?.length || 0) > 0">
        <p-card header="Por categoría">
          <div class="chart-box"><p-chart type="doughnut" [data]="pieData()" [options]="pieOptions" /></div>
        </p-card>
        <p-card header="Tendencia y estimación">
          <div class="chart-box"><p-chart type="line" [data]="lineData()" [options]="lineOptions" /></div>
        </p-card>
      </div>

      <h3>Movimientos</h3>
      <div class="list">
        <div class="row" *ngFor="let e of expenses()">
          <span class="dot" [style.background]="e.categoryColor || '#9aa3b2'"></span>
          <div class="grow">
            <div>{{ e.merchant || e.description || e.categoryName || 'Gasto' }}</div>
            <small>{{ e.categoryName || 'Otros' }} · {{ e.spentOn }}
              <span *ngIf="e.source === 'scan'">· 🤖</span></small>
          </div>
          <span class="amt">{{ fmt(e.amount, e.currency) }}</span>
          <p-button icon="pi pi-trash" severity="danger" [text]="true" size="small" (onClick)="del(e.id)" />
        </div>
        <p class="muted" *ngIf="loaded() && expenses().length === 0">Sin gastos este mes. Agrega el primero 👆</p>
      </div>
    </div>

    <!-- Diálogo alta / confirmación de escaneo -->
    <p-dialog [(visible)]="dialogVisible" [modal]="true" [style]="{ width: '460px' }"
              [header]="scanned ? 'Confirmar gasto escaneado' : 'Nuevo gasto'">
      <div class="form-grid">
        <div class="field">
          <label>Monto</label>
          <input type="number" [(ngModel)]="form.amount" placeholder="0" />
        </div>
        <div class="field">
          <label>Moneda</label>
          <input type="text" [(ngModel)]="form.currency" placeholder="COP" />
        </div>
        <div class="field">
          <label>Categoría</label>
          <select [(ngModel)]="form.categorySlug">
            <option *ngFor="let c of categories()" [value]="c.slug">{{ c.name }}</option>
          </select>
        </div>
        <div class="field">
          <label>Fecha</label>
          <input type="date" [(ngModel)]="form.spentOn" />
        </div>
        <div class="field full">
          <label>Comercio / descripción</label>
          <input type="text" [(ngModel)]="form.merchant" placeholder="p. ej. Almuerzo" />
        </div>
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" [text]="true" (onClick)="dialogVisible = false" />
        <p-button label="Guardar" icon="pi pi-check" (onClick)="save()" [loading]="saving()"
                  [disabled]="!form.amount || form.amount <= 0" />
      </ng-template>
    </p-dialog>
  `,
})
export class AppComponent implements OnInit {
  private api = inject(GastosService);

  readonly month = signal<string>(new Date().toISOString().slice(0, 7)); // YYYY-MM
  readonly categories = signal<Category[]>([]);
  readonly expenses = signal<Expense[]>([]);
  readonly summary = signal<Summary | null>(null);
  readonly trend = signal<Trend | null>(null);
  readonly aiEnabled = signal<boolean>(false);
  readonly loaded = signal<boolean>(false);
  readonly scanning = signal<boolean>(false);
  readonly saving = signal<boolean>(false);

  dialogVisible = false;
  scanned = false;
  form: { amount: number | null; currency: string; categorySlug: string; merchant: string; spentOn: string } =
    this.emptyForm();

  readonly pieOptions = {
    maintainAspectRatio: false, cutout: '58%',
    plugins: { legend: { position: 'right', labels: { color: '#e6e8ee', boxWidth: 12 } } },
  };
  readonly lineOptions = {
    maintainAspectRatio: false,
    plugins: { legend: { labels: { color: '#e6e8ee' } } },
    scales: {
      x: { ticks: { color: '#9aa3b2' }, grid: { color: '#262a33' } },
      y: { ticks: { color: '#9aa3b2' }, grid: { color: '#262a33' } },
    },
  };

  readonly pieData = computed(() => {
    const bc = this.summary()?.byCategory ?? [];
    return {
      labels: bc.map((c) => c.name),
      datasets: [{ data: bc.map((c) => c.total), backgroundColor: bc.map((c) => c.color), borderWidth: 0 }],
    };
  });

  readonly lineData = computed(() => {
    const t = this.trend();
    const s = t?.series ?? [];
    const labels = s.map((p) => p.month.slice(5)).concat(['est.']);
    const real = s.map((p) => p.total).concat([null as unknown as number]);
    const last = s.length ? s[s.length - 1].total : 0;
    const est = Array(Math.max(s.length - 1, 0)).fill(null).concat([last, t?.forecastNext ?? 0]);
    return {
      labels,
      datasets: [
        { label: 'Real', data: real, borderColor: '#6c8cff', backgroundColor: 'rgba(108,140,255,.15)', fill: true, tension: 0.35 },
        { label: 'Estimación', data: est, borderColor: '#10b981', borderDash: [6, 6], tension: 0.35 },
      ],
    };
  });

  ngOnInit(): void {
    this.api.categories().subscribe((c) => this.categories.set(c));
    this.api.aiStatus().subscribe({ next: (s) => this.aiEnabled.set(s.enabled), error: () => {} });
    this.reload();
  }

  reload(): void {
    const m = this.month();
    this.api.expenses(m).subscribe({ next: (e) => { this.expenses.set(e); this.loaded.set(true); }, error: () => this.loaded.set(true) });
    this.api.summary(m).subscribe({ next: (s) => this.summary.set(s), error: () => {} });
    this.api.trend(6).subscribe({ next: (t) => this.trend.set(t), error: () => {} });
  }

  shiftMonth(delta: number): void {
    const [y, m] = this.month().split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    this.month.set(d.toISOString().slice(0, 7));
    this.reload();
  }

  monthLabel(): string {
    const [y, m] = this.month().split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('es', { month: 'long', year: 'numeric' });
  }

  openManual(): void {
    this.scanned = false;
    this.form = this.emptyForm();
    this.dialogVisible = true;
  }

  onFile(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const f = input.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(',')[1] ?? '';
      this.doScan(base64, f.type || 'image/jpeg');
    };
    reader.readAsDataURL(f);
    input.value = '';
  }

  private doScan(base64: string, mediaType: string): void {
    this.scanning.set(true);
    this.api.scan(base64, mediaType).subscribe({
      next: (s) => {
        this.scanning.set(false);
        this.scanned = true;
        this.form = {
          amount: s.amount ?? null,
          currency: s.currency || 'COP',
          categorySlug: s.categorySlug || 'otros',
          merchant: s.merchant || s.description || '',
          spentOn: s.spentOn || new Date().toISOString().slice(0, 10),
        };
        this.dialogVisible = true;
      },
      error: () => { this.scanning.set(false); alert('No se pudo leer la imagen.'); },
    });
  }

  save(): void {
    if (!this.form.amount || this.form.amount <= 0) return;
    this.saving.set(true);
    this.api.create({
      amount: this.form.amount,
      currency: this.form.currency,
      categorySlug: this.form.categorySlug,
      merchant: this.form.merchant,
      spentOn: this.form.spentOn,
      source: this.scanned ? 'scan' : 'manual',
    }).subscribe({
      next: () => { this.saving.set(false); this.dialogVisible = false; this.reload(); },
      error: () => { this.saving.set(false); alert('No se pudo guardar.'); },
    });
  }

  del(id: number): void {
    this.api.remove(id).subscribe(() => this.reload());
  }

  fmt(n: number, currency = 'COP'): string {
    try {
      return new Intl.NumberFormat('es-CO', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);
    } catch { return `${n}`; }
  }

  private emptyForm() {
    return { amount: null as number | null, currency: 'COP', categorySlug: 'otros', merchant: '',
      spentOn: new Date().toISOString().slice(0, 10) };
  }
}
