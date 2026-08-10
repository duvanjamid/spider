import { Component, ElementRef, OnInit, ViewChild, computed, inject, signal } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { timeout } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { ChartModule } from 'primeng/chart';
import { DialogModule } from 'primeng/dialog';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { GastosService, Category, Expense, Monto, Scan, Summary, Trend } from './gastos.service';

type SheetState = 'form' | 'loading' | 'error' | 'unreadable';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [NgFor, NgIf, FormsModule, ButtonModule, CardModule, ChartModule,
    DialogModule, ProgressSpinnerModule],
  styles: [`
    .wrap { max-width: 1040px; margin: 0 auto; padding: 24px 16px 64px; }
    header { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
    h1 { font-size: 1.5rem; margin: 0; }
    .spacer { flex: 1; }
    .muted { color: var(--muted, #9aa3b2); }
    .month { display: flex; align-items: center; gap: 6px; }
    .month b { min-width: 150px; text-align: center; text-transform: capitalize; }
    .total-card { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
    .total { font-size: 2rem; font-weight: 700; }
    .actions { display: flex; gap: 10px; margin: 16px 0; flex-wrap: wrap; align-items: center; }
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
    /* Hoja inferior */
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
          <div *ngIf="trend() as t"><span class="muted">Estimado próx. mes:</span>
            <b style="color:#10b981"> {{ fmt(t.forecastNext) }}</b></div>
        </div>
      </p-card>

      <div class="actions">
        <input #file type="file" accept="image/*" hidden (change)="onFile($event)" />
        <p-button label="Escanear recibo" icon="pi pi-camera" (onClick)="file.click()"
                  [disabled]="!aiEnabled()" [loading]="sheetState() === 'loading'" />
        <p-button label="Agregar manual" icon="pi pi-plus" [outlined]="true" (onClick)="openManual()" />
        <span class="muted" *ngIf="!aiEnabled()"><i class="pi pi-info-circle"></i> Configura GEMINI_API_KEY para el escaneo.</span>
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
            <small>{{ e.categoryName || 'Otros' }} · {{ e.spentOn }}<span *ngIf="e.source === 'scan'"> · 🤖</span></small>
          </div>
          <span class="amt">{{ fmt(e.amount, e.currency) }}</span>
          <p-button icon="pi pi-trash" severity="danger" [text]="true" size="small" (onClick)="del(e.id)" />
        </div>
        <p class="muted" *ngIf="loaded() && expenses().length === 0">Sin gastos este mes. Agrega el primero 👆</p>
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
              <div class="chip" *ngFor="let m of montos()" [class.sel]="form.amount === m.valor"
                   (click)="form.amount = m.valor">
                <b>{{ fmt(m.valor) }}</b> <small>{{ m.etiqueta }}</small>
              </div>
            </div>
          </div>
          <div class="field">
            <label>Monto a pagar</label>
            <input type="number" [(ngModel)]="form.amount" placeholder="0" />
          </div>
          <div class="field">
            <label>Moneda</label>
            <input type="text" [(ngModel)]="form.currency" placeholder="COP" />
          </div>
          <div class="field">
            <label>Categoría</label>
            <select [(ngModel)]="form.categoryId">
              <option [ngValue]="null" disabled>Elige…</option>
              <option *ngFor="let c of categories()" [ngValue]="c.id">{{ c.name }}</option>
            </select>
            <span class="hint" *ngIf="suggested()">Sugerida por IA: “{{ suggested() }}” (créala en tus categorías si quieres)</span>
          </div>
          <div class="field">
            <label>Fecha de compra</label>
            <input type="date" [(ngModel)]="form.spentOn" />
          </div>
          <div class="field">
            <label>Establecimiento</label>
            <input type="text" [(ngModel)]="form.merchant" placeholder="Comercio" />
          </div>
          <div class="field">
            <label>NIT</label>
            <input type="text" [(ngModel)]="form.nit" placeholder="NIT / ID tributario" />
          </div>
          <div class="field full">
            <label>Descripción</label>
            <input type="text" [(ngModel)]="form.description" placeholder="Detalle de la compra" />
          </div>
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

  readonly pieOptions = {
    maintainAspectRatio: false, cutout: '58%',
    plugins: { legend: { position: 'right', labels: { color: '#e6e8ee', boxWidth: 12 } } },
  };
  readonly lineOptions = {
    maintainAspectRatio: false,
    plugins: { legend: { labels: { color: '#e6e8ee' } } },
    scales: { x: { ticks: { color: '#9aa3b2' }, grid: { color: '#262a33' } },
              y: { ticks: { color: '#9aa3b2' }, grid: { color: '#262a33' } } },
  };

  readonly pieData = computed(() => {
    const bc = this.summary()?.byCategory ?? [];
    return { labels: bc.map((c) => c.name),
      datasets: [{ data: bc.map((c) => c.total), backgroundColor: bc.map((c) => c.color), borderWidth: 0 }] };
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
    this.month.set(new Date(y, m - 1 + delta, 1).toISOString().slice(0, 7));
    this.reload();
  }
  monthLabel(): string {
    const [y, m] = this.month().split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('es', { month: 'long', year: 'numeric' });
  }

  openManual(): void {
    this.scanned = false; this.montos.set([]); this.suggested.set(null);
    this.form = this.emptyForm(); this.sheetState.set('form'); this.sheetVisible = true;
  }
  toManual(): void { this.scanned = false; this.montos.set([]); this.sheetState.set('form'); }

  onFile(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const f = input.files?.[0];
    if (!f) return;
    this.sheetVisible = true; this.sheetState.set('loading');
    this.downscale(f)
      .then((img) => { this.lastImage = img; this.runScan(); })
      .catch(() => this.sheetState.set('error'));
    input.value = '';
  }

  /** Reescala la foto (máx 1600px, JPEG 0.8) para enviar algo liviano y legible. */
  private downscale(file: File): Promise<{ base64: string; mediaType: string }> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject();
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject();
        img.onload = () => {
          const max = 1600;
          let w = img.width, h = img.height;
          if (Math.max(w, h) > max) { const s = max / Math.max(w, h); w = Math.round(w * s); h = Math.round(h * s); }
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          const cx = canvas.getContext('2d');
          if (!cx) { reject(); return; }
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
      next: (s) => this.applyScan(s),
      error: () => this.sheetState.set('error'),
    });
  }

  private applyScan(s: Scan): void {
    if (!s.identificado || !s.montos?.length) { this.sheetState.set('unreadable'); return; }
    this.scanned = true;
    this.montos.set(s.montos);
    this.suggested.set(s.categoriaId ? null : s.categoriaSugerida);
    this.form = {
      amount: s.montos[0]?.valor ?? null,
      currency: 'COP',
      categoryId: s.categoriaId ?? null,
      merchant: s.establecimiento ?? '',
      nit: s.nit ?? '',
      description: s.descripcion ?? '',
      spentOn: new Date().toISOString().slice(0, 10),
    };
    this.sheetState.set('form');
  }

  save(): void {
    if (!this.form.amount || this.form.amount <= 0) return;
    this.saving.set(true);
    this.api.create({
      amount: this.form.amount, currency: this.form.currency, categoryId: this.form.categoryId,
      merchant: this.form.merchant, description: this.form.description, nit: this.form.nit,
      spentOn: this.form.spentOn, source: this.scanned ? 'scan' : 'manual',
    }).subscribe({
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
