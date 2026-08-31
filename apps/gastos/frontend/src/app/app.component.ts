import { Component, ElementRef, OnInit, ViewChild, computed, inject, signal } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { timeout } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { ChartModule } from 'primeng/chart';
import { DialogModule } from 'primeng/dialog';
import { TagModule } from 'primeng/tag';
import {
  Budget, CategoryShare, Category, CategoryTemplate, Connections, Expense, ExpenseItem, GastosService, Me, Monto, PriceProduct,
  Recurring, Region, Scan, ScanItem, Summary, Trend,
} from './gastos.service';

type SheetState = 'form' | 'loading' | 'error' | 'unreadable';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [NgFor, NgIf, FormsModule, ButtonModule, CardModule, ChartModule, DialogModule, TagModule],
  styles: [`
    .wrap { max-width: 1120px; margin: 0 auto; padding: 0 16px 84px; }

    /* App bar */
    .bar { position: sticky; top: 0; z-index: 20; display: flex; align-items: center; gap: 10px;
           padding: 14px 4px; background: color-mix(in srgb, var(--bg) 86%, transparent);
           backdrop-filter: blur(10px); border-bottom: 1px solid var(--border); flex-wrap: wrap; }
    .brand { display: flex; align-items: center; gap: 8px; font-weight: 800; font-size: 1.2rem; }
    .brand .blogo { width: 28px; height: 28px; color: #10b981; }
    .env { font-size: .66rem; font-weight: 800; letter-spacing: .5px; padding: 3px 7px; border-radius: 6px;
           background: #f59e0b; color: #1a1200; text-transform: uppercase; }
    .spacer { flex: 1; }
    .month { display: flex; align-items: center; gap: 4px; }
    .month b { min-width: 132px; text-align: center; text-transform: capitalize; font-size: .95rem; }
    .muted { color: var(--muted); }

    /* Acciones primarias */
    .actions { display: flex; gap: 10px; margin: 16px 0 8px; flex-wrap: wrap; align-items: center; }
    .tools { display: flex; gap: 4px; flex-wrap: wrap; }

    /* KPIs */
    .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
    @media (max-width: 860px) { .kpis { grid-template-columns: repeat(2, 1fr); } }
    .kpi { background: var(--panel); border: 1px solid var(--border); border-radius: 16px; padding: 16px; box-shadow: var(--shadow); }
    .kpi .lbl { font-size: .78rem; color: var(--muted); display: flex; align-items: center; gap: 6px; }
    .kpi .val { font-size: 1.5rem; font-weight: 800; margin-top: 6px; letter-spacing: -.5px; }
    .kpi .sub { font-size: .8rem; margin-top: 4px; }
    .up { color: #ef4444; } .down { color: #10b981; } .accent { color: var(--accent); }

    .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    @media (max-width: 820px) { .grid2 { grid-template-columns: 1fr; } }
    .chart-box { height: 280px; position: relative; }

    /* Presupuestos */
    .bud { display: flex; align-items: center; gap: 10px; padding: 7px 0; }
    .bud .dot { width: 12px; height: 12px; border-radius: 50%; flex: none; }
    .bud .bname { width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .bud .bar { flex: 1; height: 8px; background: var(--panel-2); border-radius: 999px; overflow: hidden; }
    .bud .bar .fill { height: 100%; border-radius: 999px; transition: width .4s ease; }
    .bud .bfig { font-size: .8rem; white-space: nowrap; min-width: 140px; text-align: right; }
    /* Presupuesto: resumen con donut + barras por categoría */
    .bud-summary { display: flex; align-items: center; gap: 18px; margin-bottom: 8px; flex-wrap: wrap; }
    .donut-center { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; pointer-events: none; }
    .donut-center b { font-size: 1.25rem; font-weight: 800; } .donut-center small { color: var(--muted); font-size: .72rem; }
    .bud-legend { display: flex; flex-direction: column; gap: 4px; font-size: .9rem; }
    .bud-legend .sw { display: inline-block; width: 12px; height: 12px; border-radius: 3px; margin-right: 6px; vertical-align: middle; }
    .bud2 { padding: 10px 0; border-top: 1px solid var(--border); }
    .bud2 .dot { width: 11px; height: 11px; border-radius: 50%; }
    .bud2-top { display: flex; align-items: center; gap: 8px; }
    .bud2 .pbar { height: 10px; background: var(--panel-2); border-radius: 999px; overflow: hidden; margin-top: 7px; }
    .bud2 .pbar .fill { height: 100%; border-radius: 999px; transition: width .4s ease; }
    .bud2-foot { font-size: .8rem; color: var(--muted); margin-top: 5px; }

    /* Movimientos */
    .filters { display: flex; gap: 8px; align-items: center; margin-bottom: 12px; flex-wrap: wrap; }
    .list { display: flex; flex-direction: column; gap: 8px; }
    .row { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border: 1px solid var(--border);
           border-radius: 14px; background: var(--panel); }
    .row .dot { width: 12px; height: 12px; border-radius: 50%; flex: none; }
    .row .grow { flex: 1; min-width: 0; } .row .grow small { color: var(--muted); }
    .row .grow div { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .amt { font-weight: 800; white-space: nowrap; }
    .row.clickable { cursor: pointer; transition: border-color .12s, transform .06s; }
    .row.clickable:hover { border-color: var(--accent); }
    .row.clickable:active { transform: scale(.995); }
    /* Detalle de movimiento */
    .det { display: flex; flex-direction: column; }
    .det-amt { display: flex; align-items: center; gap: 10px; font-size: 1.4rem; font-weight: 800; padding: 2px 0 12px; }
    .det-amt .dot { width: 14px; height: 14px; border-radius: 50%; }
    .det-amt .muted { font-size: .9rem; font-weight: 500; margin-left: auto; }
    .det-row { display: flex; justify-content: space-between; gap: 12px; padding: 9px 0; border-top: 1px solid var(--border); }
    .det-row > span { color: var(--muted); flex: none; }
    .det-row > b { text-align: right; }
    .det-row.full { flex-direction: column; gap: 4px; }
    .det-row.full p { margin: 0; line-height: 1.4; }

    /* Campos (theme-aware, legibles en claro y oscuro) */
    .inp, .sel, .ta { width: 100%; padding: 10px 12px; border-radius: 10px; border: 1px solid var(--border);
           background: var(--panel-2); color: var(--fg); font-size: 1rem; font-family: inherit; }
    .inp:focus, .sel:focus, .ta:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 25%, transparent); }
    .ta { min-height: 120px; resize: vertical; }
    .field { display: flex; flex-direction: column; gap: 6px; }
    .field label { font-size: .8rem; color: var(--muted); }
    .field.full { grid-column: 1 / -1; }
    .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .hint { font-size: .82rem; color: #f59e0b; }

    /* Montos como chips */
    .montos { display: flex; flex-wrap: wrap; gap: 8px; }
    .chip { display: flex; align-items: center; gap: 8px; border: 1px solid var(--border);
            padding: 9px 12px; border-radius: 999px; cursor: pointer; background: var(--panel-2); }
    .chip.sel { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 16%, transparent); }
    .chip small { color: var(--muted); }

    /* Categorías / recurrentes rows */
    .cat-add { display: flex; gap: 8px; align-items: center; margin-bottom: 14px; flex-wrap: wrap; }
    .cat-add input[type=color] { width: 44px; height: 40px; border: none; background: none; padding: 0; }
    .cat-row { display: flex; align-items: center; gap: 10px; padding: 8px 4px; border-bottom: 1px solid var(--border); }

    /* Segmented (sub-tabs de la hoja) */
    .seg { display: inline-flex; background: var(--panel-2); border-radius: 10px; padding: 3px; gap: 3px; margin-bottom: 10px; }
    .seg button { border: none; background: transparent; color: var(--muted); padding: 7px 14px; border-radius: 8px; cursor: pointer; font-weight: 600; }
    .seg button.on { background: var(--panel); color: var(--fg); box-shadow: var(--shadow); }

    /* ═══ Animación de análisis IA (elegante) ═══ */
    .scan-anim { display: flex; flex-direction: column; align-items: center; gap: 18px; padding: 20px 8px 8px; }
    .doc { position: relative; width: 128px; height: 160px; border-radius: 12px; background: var(--panel-2);
           border: 1px solid var(--border); overflow: hidden; box-shadow: var(--shadow); }
    .doc .ln { height: 9px; margin: 14px 14px 0; border-radius: 4px; background: color-mix(in srgb, var(--fg) 14%, transparent); }
    .doc .ln.s { width: 55%; } .doc .ln.m { width: 78%; } .doc .ln.l { width: 92%; }
    .doc .laser { position: absolute; left: 0; right: 0; height: 26px; top: -26px;
           background: linear-gradient(180deg, transparent, color-mix(in srgb, var(--accent) 55%, transparent), transparent);
           animation: sweep 1.8s ease-in-out infinite; }
    .doc::after { content: ''; position: absolute; inset: 0; border-radius: 12px;
           box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--accent) 40%, transparent); animation: pulseb 1.8s ease-in-out infinite; }
    @keyframes sweep { 0% { top: -26px; } 55% { top: 160px; } 100% { top: 160px; } }
    @keyframes pulseb { 0%,100% { opacity: .35; } 50% { opacity: 1; } }
    .scan-status { text-align: center; }
    .scan-status .t { font-weight: 700; }
    .scan-status .s { color: var(--muted); font-size: .88rem; margin-top: 3px; min-height: 20px; transition: opacity .3s; }
    .beads { display: flex; gap: 6px; }
    .beads i { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); opacity: .3; animation: bead 1.2s infinite; }
    .beads i:nth-child(2){ animation-delay: .2s } .beads i:nth-child(3){ animation-delay: .4s }
    @keyframes bead { 0%,100%{ opacity:.3; transform: translateY(0) } 50%{ opacity:1; transform: translateY(-4px) } }

    /* Imagen analizada con regiones */
    .analyzed { position: relative; width: 100%; border-radius: 12px; overflow: hidden; border: 1px solid var(--border); }
    .analyzed img { display: block; width: 100%; }
    .region { position: absolute; border: 2px solid var(--accent); border-radius: 6px;
              box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 25%, transparent); }
    .region .rlbl { position: absolute; top: -20px; left: -2px; font-size: .66rem; font-weight: 700;
              background: var(--accent); color: #08130c; padding: 1px 6px; border-radius: 5px; white-space: nowrap; }

    .cmp { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    .cmp .col { text-align: center; } .cmp .big { font-size: 1.4rem; font-weight: 800; }

    /* ═══ Onboarding ═══ */
    .onb { max-width: 720px; margin: 0 auto; padding: 40px 18px 60px; }
    .onb .head { text-align: center; margin-bottom: 22px; }
    .onb .head .big { font-size: 2.6rem; }
    .onb .head h2 { margin: 10px 0 6px; }
    .tgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; }
    .tcard { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border-radius: 14px; cursor: pointer;
             border: 2px solid var(--border); background: var(--panel); transition: border-color .15s, transform .1s; }
    .tcard:hover { transform: translateY(-2px); }
    .tcard.on { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 8%, var(--panel)); }
    .tcard .ic { width: 38px; height: 38px; border-radius: 10px; display: grid; place-items: center; color: #fff; flex: none; }
    .tcard .nm { font-weight: 600; }
    .tcard .ck { margin-left: auto; color: var(--accent); }
    .onb .foot { position: sticky; bottom: 0; margin-top: 24px; padding: 14px 0; display: flex; gap: 10px;
                 align-items: center; justify-content: space-between; background: color-mix(in srgb, var(--bg) 88%, transparent); }

    /* ═══ Navegación inferior (móvil-first) con FAB central de escaneo ═══ */
    /* Las pestañas de PrimeNG se controlan desde aquí; ocultamos su barra propia. */
    :host ::ng-deep .p-tabview .p-tabview-nav-container { display: none; }
    .bnav { position: fixed; left: 0; right: 0; bottom: 0; z-index: 40; height: 64px;
            display: grid; grid-template-columns: repeat(5, 1fr); align-items: center;
            background: color-mix(in srgb, var(--bg) 92%, transparent); backdrop-filter: blur(12px);
            border-top: 1px solid var(--border); padding-bottom: env(safe-area-inset-bottom, 0); }
    .bnav-item { display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 6px 0;
                 background: none; border: none; color: var(--muted); font: inherit; font-size: .68rem;
                 cursor: pointer; transition: color .15s; }
    .bnav-item i { font-size: 1.15rem; }
    .bnav-item.on { color: var(--accent); }
    .bnav-fab { justify-self: center; width: 58px; height: 58px; margin-top: -26px; border-radius: 50%;
                border: 4px solid var(--bg); background: var(--accent); color: #fff; font-size: 1.4rem;
                cursor: pointer; display: grid; place-items: center; transition: transform .08s;
                box-shadow: 0 6px 18px color-mix(in srgb, var(--accent) 45%, transparent); }
    .bnav-fab:active { transform: scale(.94); }
    .bnav-fab:disabled { opacity: .5; cursor: not-allowed; box-shadow: none; }
    @media (min-width: 900px) { .bnav { max-width: 520px; left: 50%; transform: translateX(-50%);
                border-radius: 18px 18px 0 0; } }

    /* Hoja de elección: tomar foto / subir imagen */
    .picker { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding: 4px 2px 8px; }
    .picker button { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 22px 12px;
                     border: 1px solid var(--border); border-radius: 16px; background: var(--panel-2);
                     color: var(--fg); font: inherit; cursor: pointer; transition: border-color .15s, transform .06s; }
    .picker button:hover { border-color: var(--accent); }
    .picker button:active { transform: scale(.97); }
    .picker button i { font-size: 1.8rem; color: var(--accent); }
    .picker button b { font-weight: 700; }
    .picker button small { color: var(--muted); }
    .picker button:disabled { opacity: .45; cursor: not-allowed; }
    .picker button:disabled:hover { border-color: var(--border); }

    /* Cada pestaña es su propia página */
    .page { padding-top: 16px; }

    /* Selección de con quién compartir (chips) y etiqueta "compartido" */
    .chips-sel { display: flex; flex-wrap: wrap; gap: 8px; }
    .chips-sel .chip { border: 1px solid var(--border); }
    .shared-tag { color: var(--accent); font-weight: 600; }

    /* Precios por producto/tienda */
    .plist { display: flex; flex-direction: column; gap: 12px; }
    .pcard { border: 1px solid var(--border); border-radius: 14px; background: var(--panel); padding: 12px 14px; box-shadow: var(--shadow); }
    .pcard-h { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 6px; }
    .pcard-h b { font-size: 1.02rem; text-transform: capitalize; }
    .pcard-h .muted { font-size: .76rem; white-space: nowrap; }
    .pstore { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 0; border-top: 1px solid var(--border); }
    .pstore-n { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .pstore-p { font-weight: 700; white-space: nowrap; }
    .pstore.best .pstore-n, .pstore.best .pstore-p { color: var(--accent); }
    .pstore.best .pstore-p i { margin-left: 5px; font-size: .72rem; }

    /* Lista de productos (en el detalle y en la confirmación del escaneo) */
    .items { border-top: 1px solid var(--border); margin-top: 6px; }
    .items .it { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; padding: 7px 0; border-bottom: 1px solid var(--border); }
    .items .it .n { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .items .it .q { color: var(--muted); font-size: .8rem; }
    .items .it .p { font-weight: 700; white-space: nowrap; }

    /* Menú «Más» (lista de acciones) */
    .menu { display: flex; flex-direction: column; }
    .menu button { display: flex; align-items: center; gap: 14px; padding: 15px 6px; background: none;
                   border: none; border-bottom: 1px solid var(--border); color: var(--fg); font: inherit;
                   font-size: 1rem; cursor: pointer; text-align: left; }
    .menu button:last-child { border-bottom: none; }
    .menu button:active { background: var(--panel-2); }
    .menu button > i:first-child { width: 22px; text-align: center; color: var(--accent); font-size: 1.05rem; }
    .menu button > span { flex: 1; }
    .menu button .go { color: var(--muted); font-size: .8rem; }
  `],
  template: `
    <!-- ═══════════════ ONBOARDING (primera vez) ═══════════════ -->
    <div class="onb" *ngIf="onboarding()">
      <div class="head">
        <div class="big">💸</div>
        <h2>Elige tus categorías</h2>
        <p class="muted">Selecciona las que uses. Podrás editarlas o añadir más cuando quieras.</p>
      </div>
      <div class="tgrid">
        <div class="tcard" *ngFor="let t of templates()" [class.on]="isChosen(t.slug)" (click)="toggleChoice(t.slug)">
          <span class="ic" [style.background]="t.color"><i [class]="t.icon"></i></span>
          <span class="nm">{{ t.name }}</span>
          <i class="pi pi-check-circle ck" *ngIf="isChosen(t.slug)"></i>
        </div>
      </div>
      <div class="foot">
        <p-button label="Seleccionar todas" [text]="true" (onClick)="chooseAll()" />
        <p-button label="Continuar" icon="pi pi-arrow-right" iconPos="right"
                  (onClick)="finishOnboarding()" [loading]="saving()" [disabled]="!chosen().length" />
      </div>
    </div>

    <!-- ═══════════════ APP ═══════════════ -->
    <div class="wrap" *ngIf="!onboarding()">
      <div class="bar">
        <div class="brand">
          <svg class="blogo" viewBox="0 0 32 32" aria-hidden="true">
            <rect x="4" y="9" width="24" height="17" rx="4" fill="currentColor" opacity=".16" />
            <rect x="4" y="9" width="24" height="17" rx="4" fill="none" stroke="currentColor" stroke-width="2.4" />
            <path d="M4 14 H24 a4 4 0 0 1 4 4 v0 h-7 a3 3 0 0 0 0 6 h7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round" />
            <circle cx="22" cy="21" r="1.7" fill="currentColor" />
          </svg>
          Gastos <span class="env" *ngIf="isTest()">test</span>
        </div>
        <span class="spacer"></span>
        <div class="month">
          <p-button icon="pi pi-chevron-left" [text]="true" (onClick)="shiftMonth(-1)" aria-label="Mes anterior" />
          <b>{{ monthLabel() }}</b>
          <p-button icon="pi pi-chevron-right" [text]="true" (onClick)="shiftMonth(1)" aria-label="Mes siguiente" />
        </div>
      </div>

      <!-- Inputs ocultos: cámara y galería (se disparan desde la hoja «Registrar gasto») -->
      <input #file type="file" accept="image/*" multiple hidden (change)="onFile($event)" />
      <input #camera type="file" accept="image/*" capture="environment" hidden (change)="onFile($event)" />
      <div class="muted" *ngIf="!aiEnabled()" style="margin:10px 0 0"><i class="pi pi-info-circle"></i> Configura GEMINI_API_KEY para el escaneo con IA.</div>

      <!-- ═══ Página: Resumen ═══ -->
      <section class="page" *ngIf="tab() === 0">
            <div class="kpis" *ngIf="summary() as s" style="margin-bottom:16px">
              <div class="kpi">
                <div class="lbl"><i class="fa-solid fa-wallet"></i> Total del mes</div>
                <div class="val">{{ fmt(s.total) }}</div>
                <div class="sub muted">{{ s.count }} movimiento(s)</div>
              </div>
              <div class="kpi">
                <div class="lbl"><i class="fa-solid fa-calendar-day"></i> Promedio diario</div>
                <div class="val">{{ fmt(s.dailyAverage) }}</div>
                <div class="sub muted">día {{ s.daysElapsed }} de {{ s.daysInMonth }}</div>
              </div>
              <div class="kpi">
                <div class="lbl"><i class="fa-solid fa-arrow-trend-up"></i> Proyección fin de mes</div>
                <div class="val accent">{{ fmt(s.projectedEndOfMonth) }}</div>
                <div class="sub muted">a este ritmo</div>
              </div>
              <div class="kpi">
                <div class="lbl"><i class="fa-solid fa-rotate"></i> vs mes anterior</div>
                <div class="val">{{ fmt(s.previousMonthTotal) }}</div>
                <div class="sub" [class.up]="change() > 0" [class.down]="change() < 0" *ngIf="s.previousMonthTotal > 0">
                  {{ change() > 0 ? '▲' : change() < 0 ? '▼' : '' }} {{ absChange() }}%
                </div>
                <div class="sub muted" *ngIf="s.previousMonthTotal === 0">sin datos previos</div>
              </div>
            </div>

            <div class="grid2">
              <p-card header="Distribución por categoría">
                <div class="chart-box" *ngIf="(summary()?.byCategory?.length || 0) > 0; else noData">
                  <p-chart type="doughnut" [data]="pieData()" [options]="pieOptions()" />
                </div>
              </p-card>
              <p-card header="Presupuesto del mes" *ngIf="budgeted().length; else noBudget">
                <div class="bud-summary">
                  <div style="width:132px;height:132px;position:relative">
                    <p-chart type="doughnut" [data]="budgetDonut()" [options]="budgetDonutOpts()" />
                    <div class="donut-center">
                      <b [class.up]="budgetTotals().remaining < 0">{{ budgetTotals().pct }}%</b>
                      <small>usado</small>
                    </div>
                  </div>
                  <div class="bud-legend">
                    <div><span class="sw" style="background:#6c8cff"></span> Gastado <b>{{ fmt(budgetTotals().spent) }}</b></div>
                    <div><span class="sw" [style.background]="dark() ? '#2a2f3a' : '#e2e6ef'"></span>
                      {{ budgetTotals().remaining < 0 ? 'Excedido' : 'Restante' }}
                      <b [class.up]="budgetTotals().remaining < 0">{{ fmt(abs(budgetTotals().remaining)) }}</b></div>
                    <div class="muted">Presupuesto {{ fmt(budgetTotals().budget) }}</div>
                  </div>
                </div>
                <div class="bud2" *ngFor="let b of budgeted()">
                  <div class="bud2-top"><span class="dot" [style.background]="b.color"></span> <b>{{ b.name }}</b>
                    <span class="spacer"></span><span class="muted">{{ fmt(b.total) }} / {{ fmt(b.budget) }}</span></div>
                  <div class="pbar"><div class="fill" [style.width.%]="b.pct" [style.background]="b.over ? '#ef4444' : b.color"></div></div>
                  <div class="bud2-foot" [class.up]="b.over">
                    {{ b.over ? ('Excedido ' + fmt(b.total - b.budget)) : ('Quedan ' + fmt(b.budget - b.total)) }} · {{ b.pct }}%
                  </div>
                </div>
              </p-card>
            </div>

            <div style="margin-top:16px">
              <p-card header="Gasto por categoría (mes)">
                <div class="chart-box" style="height:320px" *ngIf="(summary()?.byCategory?.length || 0) > 0; else noData">
                  <p-chart type="bar" [data]="barData()" [options]="barOptions()" />
                </div>
              </p-card>
            </div>

            <div style="margin-top:16px">
              <p-card header="¿Cómo va el mes?">
                <div class="chart-box" style="height:300px" *ngIf="(summary()?.count || 0) > 0; else noData">
                  <p-chart type="line" [data]="lineData()" [options]="lineOptions()" />
                </div>
              </p-card>
            </div>
      </section>

      <!-- ═══ Página: Movimientos ═══ -->
      <section class="page" *ngIf="tab() === 3">
            <div class="filters">
              <input class="inp" style="flex:1;min-width:180px" type="text" [(ngModel)]="query" placeholder="Buscar (comercio, descripción, NIT)…" />
              <select class="sel" style="width:auto" [(ngModel)]="filterCat">
                <option value="">Todas las categorías</option>
                <option *ngFor="let c of categories()" [value]="c.slug">{{ c.name }}</option>
              </select>
              <span class="muted">{{ filtered().length }} de {{ expenses().length }}</span>
            </div>
            <div class="list">
              <div class="row clickable" *ngFor="let e of filtered()" (click)="openDetail(e)">
                <span class="dot" [style.background]="e.categoryColor || '#9aa3b2'"></span>
                <div class="grow">
                  <div>{{ e.merchant || e.description || e.categoryName || 'Gasto' }}</div>
                  <small>{{ e.categoryName || 'Otros' }} · {{ e.spentOn }}<span *ngIf="e.source === 'scan'"> · 🤖</span><span *ngIf="e.source === 'recurring'"> · 🔁</span><span *ngIf="e.mine === false" class="shared-tag"> · <i class="fa-solid fa-users"></i> de {{ e.sharedBy }}</span><span *ngIf="e.mine !== false && e.shared" class="shared-tag"> · <i class="fa-solid fa-users"></i> compartido</span></small>
                </div>
                <span class="amt">{{ fmt(e.amount, e.currency) }}</span>
                <i class="fa-solid fa-chevron-right" style="color:var(--muted);font-size:.8rem"></i>
              </div>
              <p class="muted" *ngIf="loaded() && filtered().length === 0" style="text-align:center;padding:24px">Sin movimientos que coincidan.</p>
            </div>
      </section>

      <!-- ═══ Página: Precios (comparativa por producto y tienda) ═══ -->
      <section class="page" *ngIf="tab() === 4">
        <div class="filters" *ngIf="prices().length">
          <input class="inp" style="flex:1;min-width:150px" type="text"
                 [ngModel]="priceQuery()" (ngModelChange)="priceQuery.set($event)" placeholder="Buscar producto…" />
          <select class="sel" style="width:auto" [ngModel]="priceCat()" (ngModelChange)="priceCat.set($event)">
            <option value="">Todas las categorías</option>
            <option *ngFor="let c of categories()" [value]="c.slug">{{ c.name }}</option>
          </select>
          <select class="sel" style="width:auto" [ngModel]="priceStore()" (ngModelChange)="priceStore.set($event)">
            <option value="">Todas las tiendas</option>
            <option *ngFor="let s of priceStores()" [value]="s">{{ s }}</option>
          </select>
        </div>

        <p class="muted" *ngIf="pricesLoaded() && prices().length === 0" style="text-align:center;padding:40px 0">
          <i class="fa-solid fa-tags" style="font-size:1.6rem;display:block;margin-bottom:10px"></i>
          Escanea facturas con detalle de productos y aquí verás dónde está más barato cada cosa.
        </p>
        <p class="muted" *ngIf="prices().length && filteredPrices().length === 0" style="text-align:center;padding:24px">
          Sin productos que coincidan con el filtro.
        </p>

        <div class="plist">
          <div class="pcard" *ngFor="let p of filteredPrices()">
            <div class="pcard-h">
              <b>{{ p.name }} <i *ngIf="p.shared" class="fa-solid fa-users shared-tag" title="incluye precios del hogar"></i></b>
              <span class="muted" *ngIf="p.storeCount > 1">{{ p.storeCount }} tiendas · ahorro {{ fmt(p.maxPrice - p.minPrice) }}</span>
            </div>
            <div class="pstore" *ngFor="let s of p.stores" [class.best]="s.store === p.cheapestStore && p.storeCount > 1">
              <span class="pstore-n">{{ s.store }} <small class="muted" *ngIf="s.count > 1">×{{ s.count }}</small><i *ngIf="s.shared" class="fa-solid fa-users shared-tag" style="margin-left:6px" title="del hogar"></i></span>
              <span class="pstore-p">{{ fmt(s.minPrice) }}<i class="fa-solid fa-arrow-down" *ngIf="s.store === p.cheapestStore && p.storeCount > 1"></i></span>
            </div>
          </div>
        </div>
      </section>

      <!-- ═══ Navegación inferior + botón central de escaneo ═══ -->
      <nav class="bnav">
        <button class="bnav-item" [class.on]="tab() === 0" (click)="tab.set(0)">
          <i class="fa-solid fa-gauge-high"></i><span>Estatus</span></button>
        <button class="bnav-item" [class.on]="tab() === 3" (click)="tab.set(3)">
          <i class="fa-solid fa-list-ul"></i><span>Movimientos</span></button>
        <button class="bnav-fab" (click)="openRegister()" aria-label="Registrar gasto">
          <i class="fa-solid fa-plus"></i></button>
        <button class="bnav-item" [class.on]="tab() === 4" (click)="openPrices()">
          <i class="fa-solid fa-tags"></i><span>Precios</span></button>
        <button class="bnav-item" (click)="moreVisible = true">
          <i class="fa-solid fa-ellipsis"></i><span>Más</span></button>
      </nav>
    </div>

    <!-- ═══ Hoja «Registrar gasto»: manual / texto / cámara / galería ═══ -->
    <p-dialog [(visible)]="pickerVisible" [modal]="true" [position]="'bottom'" [dismissableMask]="true"
              [style]="{ width: '100%', maxWidth: '600px' }" header="Registrar gasto">
      <div class="picker">
        <button (click)="chooseManual()">
          <i class="fa-solid fa-pen"></i><b>Manual</b><small>Escríbelo tú</small></button>
        <button (click)="chooseText()" [disabled]="!aiEnabled()">
          <i class="fa-solid fa-align-left"></i><b>Pegar texto</b><small>SMS o correo</small></button>
        <button (click)="takePhoto()" [disabled]="!aiEnabled()">
          <i class="fa-solid fa-camera"></i><b>Tomar foto</b><small>Cámara</small></button>
        <button (click)="uploadImage()" [disabled]="!aiEnabled()">
          <i class="fa-solid fa-image"></i><b>Subir imagen</b><small>Galería · hasta 3</small></button>
      </div>
    </p-dialog>

    <!-- ═══ Hoja «Más»: gestión y herramientas ═══ -->
    <p-dialog [(visible)]="moreVisible" [modal]="true" [position]="'bottom'" [dismissableMask]="true"
              [style]="{ width: '100%', maxWidth: '600px' }" header="Más">
      <div class="menu">
        <button (click)="openHome()"><i class="fa-solid fa-house-user"></i><span>Hogar (compartir)</span><i class="fa-solid fa-chevron-right go"></i></button>
        <button (click)="fromMore('cats')"><i class="fa-solid fa-tags"></i><span>Editar categorías</span><i class="fa-solid fa-chevron-right go"></i></button>
        <button (click)="fromMore('recurring')"><i class="fa-solid fa-rotate"></i><span>Gastos recurrentes</span><i class="fa-solid fa-chevron-right go"></i></button>
        <button (click)="fromMore('compare')"><i class="fa-solid fa-code-compare"></i><span>Comparar meses</span><i class="fa-solid fa-chevron-right go"></i></button>
        <button (click)="fromMore('csv')"><i class="fa-solid fa-file-csv"></i><span>Exportar CSV</span><i class="fa-solid fa-chevron-right go"></i></button>
      </div>
    </p-dialog>

    <!-- ═══ Hogar: conexiones + compartir ═══ -->
    <p-dialog [(visible)]="homeDialog" [modal]="true" header="Hogar" [dismissableMask]="true" [style]="{ width: '94%', maxWidth: '460px' }">
      <p class="muted" style="margin-top:0;font-size:.9rem">Comparte gastos y categorías con tu hogar. La otra persona debe aceptar la invitación.</p>
      <div class="cat-add">
        <input class="inp" style="flex:1" type="email" [(ngModel)]="inviteEmail" placeholder="correo@gmail.com" (keyup.enter)="sendInvite()" />
        <p-button label="Invitar" icon="pi pi-user-plus" (onClick)="sendInvite()" [disabled]="!inviteEmail.trim()" />
      </div>
      <ng-container *ngIf="conns() as cn">
        <div *ngIf="cn.incoming.length">
          <h3>Invitaciones recibidas</h3>
          <div class="cat-row" *ngFor="let c of cn.incoming">
            <span style="flex:1">{{ c.email }}</span>
            <p-button label="Aceptar" size="small" (onClick)="acceptConn(c.id)" />
            <p-button icon="pi pi-times" [text]="true" severity="danger" size="small" (onClick)="removeConn(c.id)" />
          </div>
        </div>
        <div *ngIf="cn.accepted.length">
          <h3>Conectados</h3>
          <div class="cat-row" *ngFor="let c of cn.accepted">
            <i class="fa-solid fa-circle-check" style="color:var(--accent)"></i>
            <span style="flex:1">{{ c.email }}</span>
            <p-button icon="pi pi-trash" [text]="true" severity="danger" size="small" (onClick)="removeConn(c.id)" />
          </div>
        </div>
        <div *ngIf="cn.outgoing.length">
          <h3>Invitaciones enviadas</h3>
          <div class="cat-row" *ngFor="let c of cn.outgoing">
            <span style="flex:1">{{ c.email }} <small class="muted">· pendiente</small></span>
            <p-button icon="pi pi-times" [text]="true" size="small" (onClick)="removeConn(c.id)" />
          </div>
        </div>
        <p class="muted" *ngIf="!cn.incoming.length && !cn.accepted.length && !cn.outgoing.length" style="text-align:center;padding:16px 0">
          Aún no tienes conexiones. Invita a alguien por su correo.
        </p>
      </ng-container>
    </p-dialog>

    <ng-template #noData><p class="muted" style="text-align:center;padding:40px 0">Aún no hay datos este mes.</p></ng-template>
    <ng-template #noBudget><p class="muted" style="text-align:center;padding:16px 0">Sin presupuestos. Defínelos en «Categorías».</p></ng-template>

    <!-- ═══ Hoja inferior: escaneo / alta ═══ -->
    <p-dialog [(visible)]="sheetVisible" [modal]="true" [position]="'bottom'" [dismissableMask]="true"
              [style]="{ width: '100%', maxWidth: '600px' }" [header]="sheetTitle()">
      <!-- Cargando (animación IA) -->
      <div class="scan-anim" *ngIf="sheetState() === 'loading'">
        <div class="doc">
          <div class="laser"></div>
          <div class="ln l"></div><div class="ln m"></div><div class="ln s"></div>
          <div class="ln m"></div><div class="ln l"></div><div class="ln s"></div>
        </div>
        <div class="scan-status">
          <div class="t">Analizando con IA<span *ngIf="imageCount() > 1"> · {{ imageCount() }} fotos</span></div>
          <div class="s">{{ scanPhase() }}</div>
        </div>
        <div class="beads"><i></i><i></i><i></i></div>
      </div>

      <!-- Error / no legible -->
      <div class="scan-anim" *ngIf="sheetState() === 'error'">
        <i class="pi pi-exclamation-triangle" style="font-size:2.4rem;color:#ef4444"></i>
        <div class="scan-status"><div class="t">No se pudo leer</div><div class="s">Revisa tu conexión o intenta de nuevo.</div></div>
        <div style="display:flex;gap:8px"><p-button label="Reintentar" icon="pi pi-refresh" (onClick)="retry()" />
          <p-button label="Otra foto" icon="pi pi-camera" [outlined]="true" (onClick)="pickAgain()" /></div>
      </div>
      <div class="scan-anim" *ngIf="sheetState() === 'unreadable'">
        <i class="pi pi-image" style="font-size:2.4rem;color:#f59e0b"></i>
        <div class="scan-status"><div class="t">No se pudo identificar</div><div class="s">No parece un comprobante legible. Prueba otra imagen o texto.</div></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center">
          <p-button label="Reintentar" icon="pi pi-refresh" (onClick)="retry()" />
          <p-button label="Otra foto" icon="pi pi-camera" [outlined]="true" (onClick)="pickAgain()" />
          <p-button label="Manual" [text]="true" (onClick)="toManual()" /></div>
      </div>

      <!-- Formulario + imagen analizada -->
      <div *ngIf="sheetState() === 'form'">
        <div class="seg" *ngIf="hasAnalyzedImage()">
          <button [class.on]="sheetTab() === 'datos'" (click)="sheetTab.set('datos')">Datos</button>
          <button [class.on]="sheetTab() === 'imagen'" (click)="sheetTab.set('imagen')"><i class="pi pi-sparkles"></i> Imagen analizada</button>
        </div>

        <div *ngIf="sheetTab() === 'datos'">
          <div class="form-grid">
            <div class="field full" *ngIf="montos().length">
              <label>¿Cuál total pagaste?</label>
              <div class="montos">
                <div class="chip" *ngFor="let m of montos()" [class.sel]="form.amount === m.valor" (click)="form.amount = m.valor">
                  <b>{{ fmt(m.valor) }}</b> <small>{{ m.etiqueta }}</small>
                </div>
              </div>
            </div>
            <div class="field"><label>Monto a pagar</label><input class="inp" type="number" [(ngModel)]="form.amount" placeholder="0" /></div>
            <div class="field"><label>Moneda</label><input class="inp" type="text" [(ngModel)]="form.currency" placeholder="COP" /></div>
            <div class="field">
              <label>Categoría</label>
              <select class="sel" [(ngModel)]="form.categoryId">
                <option [ngValue]="null" disabled>Elige…</option>
                <option *ngFor="let c of categories()" [ngValue]="c.id">{{ c.name }}</option>
              </select>
              <span class="hint" *ngIf="suggested()">Nueva categoría sugerida: “{{ suggested() }}” — se creará al guardar</span>
            </div>
            <div class="field"><label>Fecha de compra</label><input class="inp" type="date" [(ngModel)]="form.spentOn" /></div>
            <div class="field"><label>Hora de compra</label><input class="inp" type="time" [(ngModel)]="form.spentTime" /></div>
            <div class="field"><label>Establecimiento</label><input class="inp" type="text" [(ngModel)]="form.merchant" placeholder="Comercio" /></div>
            <div class="field"><label>NIT</label><input class="inp" type="text" [(ngModel)]="form.nit" placeholder="NIT / ID tributario" /></div>
            <div class="field full"><label>Descripción</label><input class="inp" type="text" [(ngModel)]="form.description" placeholder="Detalle" /></div>
            <div class="field full" *ngIf="scanItems().length">
              <label>Productos detectados ({{ scanItems().length }})</label>
              <div class="items">
                <div class="it" *ngFor="let it of scanItems()">
                  <span class="n">{{ it.nombre }}<span class="q" *ngIf="it.cantidad"> ×{{ it.cantidad }}</span><span class="q" *ngIf="it.precioUnitario"> · {{ fmt(it.precioUnitario) }} c/u</span></span>
                  <span class="p" *ngIf="it.total">{{ fmt(it.total) }}</span>
                </div>
              </div>
            </div>
            <div class="field full" *ngIf="household().length">
              <label>Compartir con el hogar</label>
              <div class="chips-sel">
                <button type="button" class="chip" *ngFor="let em of household()"
                        [class.sel]="form.shareWith.includes(em)" (click)="toggleShare(em)">
                  <i class="fa-solid" [class.fa-user]="!form.shareWith.includes(em)" [class.fa-user-check]="form.shareWith.includes(em)"></i> {{ em }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div *ngIf="sheetTab() === 'imagen' && hasAnalyzedImage()">
          <p class="muted" style="margin:0 0 10px;font-size:.86rem">La IA resaltó de dónde tomó cada dato:</p>
          <div class="analyzed">
            <img [src]="lastImageUrl()" alt="Recibo analizado" />
            <div class="region" *ngFor="let r of regiones()"
                 [style.top.%]="r.box[0]/10" [style.left.%]="r.box[1]/10"
                 [style.height.%]="(r.box[2]-r.box[0])/10" [style.width.%]="(r.box[3]-r.box[1])/10">
              <span class="rlbl">{{ r.etiqueta || r.campo }}</span>
            </div>
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

    <!-- ═══ Detalle de movimiento ═══ -->
    <p-dialog [(visible)]="detailDialog" [modal]="true" [header]="editing() ? 'Editar gasto' : 'Detalle del gasto'" [dismissableMask]="true" [style]="{ width: '92%', maxWidth: '460px' }">
      <div *ngIf="detail() as d">
        <div class="det" *ngIf="!editing()">
        <div class="det-amt">
          <span class="dot" [style.background]="d.categoryColor || '#9aa3b2'"></span>
          {{ fmt(d.amount, d.currency) }}
          <span class="muted">{{ d.categoryName || 'Sin categoría' }}</span>
        </div>
        <div class="det-row"><span>Establecimiento</span><b>{{ d.merchant || '—' }}</b></div>
        <div class="det-row"><span>NIT</span><b>{{ d.nit || '—' }}</b></div>
        <div class="det-row full"><span>Descripción</span><p>{{ d.description || '—' }}</p></div>
        <div class="det-row"><span>Comprado</span><b>{{ fmtDateTime(d.spentAt) }}</b></div>
        <div class="det-row"><span>Registrado</span><b>{{ fmtDateTime(d.registeredAt) }}</b></div>
        <div class="det-row"><span>Origen</span><b>{{ sourceLabel(d.source) }}</b></div>
        <div class="det-row" *ngIf="d.mine === false"><span>Pagado por</span><b><i class="fa-solid fa-users" style="color:var(--accent)"></i> {{ d.sharedBy }}</b></div>
        <div class="det-row" *ngIf="d.sharedWith?.length"><span>Compartido con</span><b>{{ d.sharedWith?.join(', ') }}</b></div>
        <div class="det-row" *ngIf="d.sharedCategory"><span>Categoría</span><b><i class="fa-solid fa-users" style="color:var(--accent)"></i> compartida con el hogar</b></div>
        <div *ngIf="detailItems().length" style="margin-top:10px">
          <span class="muted" style="font-size:.8rem">Productos</span>
          <div class="items">
            <div class="it" *ngFor="let it of detailItems()">
              <span class="n">{{ it.name }}<span class="q" *ngIf="it.quantity"> ×{{ it.quantity }}</span><span class="q" *ngIf="it.unitPrice"> · {{ fmt(it.unitPrice) }} c/u</span></span>
              <span class="p" *ngIf="it.lineTotal">{{ fmt(it.lineTotal) }}</span>
            </div>
          </div>
        </div>
        </div>

        <!-- Edición del movimiento -->
        <div class="form-grid" *ngIf="editing()">
          <div class="field">
            <label>Categoría</label>
            <select class="sel" [(ngModel)]="editForm.categoryId">
              <option [ngValue]="null">Sin categoría</option>
              <option *ngFor="let c of categories()" [ngValue]="c.id">{{ c.name }}</option>
            </select>
          </div>
          <div class="field"><label>Monto</label><input class="inp" type="number" [(ngModel)]="editForm.amount" /></div>
          <div class="field"><label>Fecha de compra</label><input class="inp" type="date" [(ngModel)]="editForm.spentOn" /></div>
          <div class="field"><label>Establecimiento</label><input class="inp" type="text" [(ngModel)]="editForm.merchant" /></div>
          <div class="field full"><label>Descripción</label><input class="inp" type="text" [(ngModel)]="editForm.description" /></div>
          <div class="field full" *ngIf="household().length">
            <label>Compartir con el hogar</label>
            <div class="chips-sel">
              <button type="button" class="chip" *ngFor="let em of household()"
                      [class.sel]="editForm.shareWith.includes(em)" (click)="toggleEditShare(em)">
                <i class="fa-solid" [class.fa-user]="!editForm.shareWith.includes(em)" [class.fa-user-check]="editForm.shareWith.includes(em)"></i> {{ em }}
              </button>
            </div>
          </div>
        </div>
      </div>
      <ng-template pTemplate="footer">
        <div *ngIf="!editing()" style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap">
          <p-button *ngIf="detail()?.mine !== false" label="Eliminar" icon="pi pi-trash" severity="danger" [text]="true" (onClick)="delFromDetail()" />
          <p-button *ngIf="detail()?.mine !== false" label="Editar" icon="pi pi-pencil" [outlined]="true" (onClick)="startEdit()" />
          <p-button label="Cerrar" [text]="true" (onClick)="detailDialog = false" />
        </div>
        <div *ngIf="editing()" style="display:flex;gap:8px;justify-content:flex-end">
          <p-button label="Cancelar" [text]="true" (onClick)="cancelEdit()" />
          <p-button label="Guardar" icon="pi pi-check" (onClick)="saveEdit()" [loading]="saving()" />
        </div>
      </ng-template>
    </p-dialog>

    <!-- ═══ Pegar texto ═══ -->
    <p-dialog [(visible)]="textDialog" [modal]="true" header="Pegar texto del comprobante" [style]="{ width: '92%', maxWidth: '520px' }">
      <p class="muted" style="margin:0 0 10px;font-size:.9rem">Pega el mensaje/SMS/correo del gasto y la IA lo interpreta.</p>
      <textarea class="ta" [(ngModel)]="pastedText" placeholder="Ej: Compra aprobada por $45.000 en EXITO NIT 890.900.608 el 09/08/2026…"></textarea>
      <ng-template pTemplate="footer">
        <p-button label="Cancelar" [text]="true" (onClick)="textDialog = false" />
        <p-button label="Analizar" icon="pi pi-sparkles" (onClick)="runTextScan()" [disabled]="!pastedText.trim()" />
      </ng-template>
    </p-dialog>

    <!-- ═══ Categorías ═══ -->
    <p-dialog [(visible)]="catDialog" [modal]="true" header="Mis categorías" [style]="{ width: '92%', maxWidth: '460px' }">
      <div class="cat-add">
        <input class="inp" style="flex:1;min-width:140px" type="text" [(ngModel)]="catForm.name" placeholder="Nombre de categoría" />
        <input type="color" [(ngModel)]="catForm.color" />
        <p-button [label]="catForm.id ? 'Guardar' : 'Añadir'" icon="pi pi-check" size="small" (onClick)="saveCat()" [disabled]="!catForm.name" />
        <p-button *ngIf="catForm.id" label="Cancelar" [text]="true" size="small" (onClick)="resetCatForm()" />
      </div>
      <div class="cat-row" *ngFor="let c of categories()">
        <span class="dot" [style.background]="c.color" style="width:12px;height:12px;border-radius:50%"></span>
        <span style="flex:1">{{ c.name }}</span>
        <input class="inp" style="width:120px" type="number" [value]="budgetFor(c.id)" (change)="setBudget(c.id, $any($event.target).value)"
               placeholder="Presup." title="Presupuesto mensual" />
        <p-button [icon]="isCategoryShared(c.slug) ? 'pi pi-users' : 'pi pi-user'" [text]="true" size="small"
                  [severity]="isCategoryShared(c.slug) ? 'success' : 'secondary'"
                  [disabled]="!household().length" (onClick)="toggleCategoryShare(c.slug)"
                  [title]="household().length ? (isCategoryShared(c.slug) ? 'Compartida — clic para dejar de compartir' : 'Compartir con el hogar') : 'Conecta a alguien en Hogar para compartir'" />
        <p-button icon="pi pi-pencil" [text]="true" size="small" (onClick)="editCat(c)" />
        <p-button icon="pi pi-trash" severity="danger" [text]="true" size="small" (onClick)="delCat(c)" />
      </div>
    </p-dialog>

    <!-- ═══ Recurrentes ═══ -->
    <p-dialog [(visible)]="recDialog" [modal]="true" header="Gastos recurrentes" [style]="{ width: '92%', maxWidth: '500px' }">
      <div class="cat-add">
        <input class="inp" style="flex:1" type="text" [(ngModel)]="recForm.merchant" placeholder="Nombre (p.ej. Netflix)" />
        <input class="inp" style="width:110px" type="number" [(ngModel)]="recForm.amount" placeholder="Monto" />
      </div>
      <div class="cat-add">
        <select class="sel" style="flex:1" [(ngModel)]="recForm.categoryId">
          <option [ngValue]="null">Sin categoría</option>
          <option *ngFor="let c of categories()" [ngValue]="c.id">{{ c.name }}</option>
        </select>
        <span class="muted">día</span>
        <input class="inp" style="width:70px" type="number" [(ngModel)]="recForm.dayOfMonth" min="1" max="28" />
        <p-button label="Añadir" icon="pi pi-plus" size="small" (onClick)="addRecurring()" [disabled]="!recForm.merchant || !recForm.amount" />
      </div>
      <div class="cat-row" *ngFor="let r of recurring()">
        <span class="dot" [style.background]="r.categoryColor || '#9aa3b2'" style="width:12px;height:12px;border-radius:50%"></span>
        <span style="flex:1">{{ r.merchant || r.description }} <small class="muted">· día {{ r.dayOfMonth }}</small></span>
        <span>{{ fmt(r.amount, r.currency) }}</span>
        <p-button icon="pi pi-trash" severity="danger" [text]="true" size="small" (onClick)="delRecurring(r.id)" />
      </div>
      <div style="margin-top:12px;display:flex;justify-content:flex-end">
        <p-button label="Aplicar al mes actual" icon="pi pi-check" size="small" (onClick)="applyRecurring()" [loading]="applying()" />
      </div>
    </p-dialog>

    <!-- ═══ Comparar meses ═══ -->
    <p-dialog [(visible)]="cmpDialog" [modal]="true" header="Comparar meses" [style]="{ width: '92%', maxWidth: '480px' }">
      <div class="cat-add">
        <input class="inp" style="flex:1" type="month" [(ngModel)]="cmpA" (change)="loadCompare()" />
        <span class="muted">vs</span>
        <input class="inp" style="flex:1" type="month" [(ngModel)]="cmpB" (change)="loadCompare()" />
      </div>
      <div class="cmp" *ngIf="cmpSummA() && cmpSummB()">
        <div class="col"><div class="muted">{{ cmpA }}</div><div class="big">{{ fmt(cmpSummA()!.total) }}</div></div>
        <div class="col"><div class="muted">{{ cmpB }}</div><div class="big">{{ fmt(cmpSummB()!.total) }}</div></div>
      </div>
      <div class="chart-box" style="height:220px;margin-top:12px" *ngIf="cmpSummA() && cmpSummB()">
        <p-chart type="bar" [data]="cmpData()" [options]="barOptionsV()" />
      </div>
    </p-dialog>
  `,
})
export class AppComponent implements OnInit {
  private api = inject(GastosService);
  @ViewChild('file') fileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('camera') cameraInput!: ElementRef<HTMLInputElement>;

  readonly dark = signal<boolean>(typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-color-scheme: dark)').matches : true);
  readonly isTest = signal(false);

  readonly month = signal<string>(new Date().toISOString().slice(0, 7));
  readonly categories = signal<Category[]>([]);
  readonly expenses = signal<Expense[]>([]);
  readonly summary = signal<Summary | null>(null);
  readonly trend = signal<Trend | null>(null);
  readonly aiEnabled = signal<boolean>(false);
  readonly loaded = signal<boolean>(false);

  // Onboarding
  readonly onboarding = signal<boolean>(false);
  readonly templates = signal<CategoryTemplate[]>([]);
  readonly chosen = signal<string[]>([]);

  // Navegación inferior (0=Resumen, 1=Categorías, 2=Tendencia, 3=Movimientos)
  readonly tab = signal(0);
  // Hoja «Registrar gasto» (manual / texto / cámara / galería) y menú «Más».
  // Campos planos para el two-way [(visible)] del p-dialog (como el resto de diálogos).
  pickerVisible = false;
  moreVisible = false;

  // Hogar / compartir
  readonly household = signal<string[]>([]);     // correos conectados (aceptados)
  readonly conns = signal<Connections | null>(null);
  readonly catShares = signal<CategoryShare[]>([]);
  homeDialog = false;
  inviteEmail = '';

  sheetVisible = false;
  readonly sheetState = signal<SheetState>('form');
  readonly sheetTab = signal<'datos' | 'imagen'>('datos');
  readonly montos = signal<Monto[]>([]);
  readonly regiones = signal<Region[]>([]);
  readonly suggested = signal<string | null>(null);
  readonly scanItems = signal<ScanItem[]>([]);   // productos extraídos por la IA
  readonly saving = signal<boolean>(false);
  readonly scanPhase = signal<string>('Preparando imagen…');
  private phaseTimer: ReturnType<typeof setInterval> | null = null;
  scanned = false;
  private lastImages: { base64: string; mediaType: string }[] = [];   // hasta 3 fotos de la misma factura
  readonly lastImageUrl = signal<string | null>(null);
  form = this.emptyForm();

  textDialog = false;
  pastedText = '';

  detailDialog = false;
  readonly detail = signal<Expense | null>(null);
  readonly detailItems = signal<ExpenseItem[]>([]);   // productos del gasto abierto
  readonly editing = signal(false);                   // modo edición del movimiento
  editForm = this.emptyForm();

  // Comparativa de precios por producto/tienda.
  readonly prices = signal<PriceProduct[]>([]);
  readonly pricesLoaded = signal<boolean>(false);
  // Filtros de la página Precios (signals → el filtrado reacciona al instante).
  readonly priceCat = signal<string>('');
  readonly priceStore = signal<string>('');
  readonly priceQuery = signal<string>('');
  readonly priceStores = computed(() => {
    const set = new Set<string>();
    for (const p of this.prices()) for (const s of p.stores) set.add(s.store);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  });
  readonly filteredPrices = computed(() => {
    const cat = this.priceCat(), store = this.priceStore(), q = this.priceQuery().trim().toLowerCase();
    return this.prices().filter((p) => {
      if (cat && p.categorySlug !== cat) return false;
      if (store && !p.stores.some((s) => s.store === store)) return false;
      if (q && !p.name.toLowerCase().includes(q)) return false;
      return true;
    });
  });

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

  constructor() {
    if (typeof window !== 'undefined' && window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)')
        .addEventListener('change', (e) => this.dark.set(e.matches));
    }
  }

  // ── Colores de gráficos según tema ──
  private tick(): string { return this.dark() ? '#9aa3b2' : '#5b6472'; }
  private gridc(): string { return this.dark() ? 'rgba(255,255,255,.07)' : 'rgba(20,26,40,.08)'; }
  private legend(): string { return this.dark() ? '#e6e8ee' : '#1e2330'; }

  readonly pieOptions = computed(() => ({ maintainAspectRatio: false, cutout: '62%',
    plugins: { legend: { position: 'right', labels: { color: this.legend(), boxWidth: 12, padding: 12 } } } }));
  readonly lineOptions = computed(() => ({ maintainAspectRatio: false,
    plugins: { legend: { labels: { color: this.legend() } } },
    scales: { x: { ticks: { color: this.tick() }, grid: { color: this.gridc() } },
              y: { ticks: { color: this.tick() }, grid: { color: this.gridc() } } } }));
  readonly barOptions = computed(() => ({ indexAxis: 'y', maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: { x: { ticks: { color: this.tick() }, grid: { color: this.gridc() } },
              y: { ticks: { color: this.legend() }, grid: { display: false } } } }));
  readonly barOptionsV = computed(() => ({ maintainAspectRatio: false, plugins: { legend: { display: false } },
    scales: { x: { ticks: { color: this.legend() }, grid: { display: false } },
              y: { ticks: { color: this.tick() }, grid: { color: this.gridc() } } } }));

  readonly budgeted = computed(() => {
    const bc = this.summary()?.byCategory ?? [];
    return bc.filter((c) => c.budget > 0).map((c) => ({
      name: c.name, color: c.color, total: c.total, budget: c.budget,
      pct: Math.min(100, Math.round((c.total / c.budget) * 100)), over: c.total > c.budget,
    }));
  });

  // Totales de presupuesto (gastado vs restante) para el resumen y el donut.
  readonly budgetTotals = computed(() => {
    const b = this.budgeted();
    const budget = b.reduce((a, c) => a + c.budget, 0);
    const spent = b.reduce((a, c) => a + c.total, 0);
    const remaining = budget - spent;
    const pct = budget > 0 ? Math.round((spent / budget) * 100) : 0;
    return { budget, spent, remaining, pct };
  });
  readonly budgetDonut = computed(() => {
    const t = this.budgetTotals();
    const spent = Math.min(t.spent, t.budget);
    const rest = Math.max(t.budget - t.spent, 0);
    const over = t.remaining < 0;
    return { labels: ['Gastado', 'Restante'],
      datasets: [{ data: [over ? t.budget : spent, rest],
        backgroundColor: [over ? '#ef4444' : '#6c8cff', this.dark() ? '#2a2f3a' : '#e2e6ef'], borderWidth: 0 }] };
  });
  readonly budgetDonutOpts = computed(() => ({ maintainAspectRatio: false, cutout: '72%',
    plugins: { legend: { display: false } } }));
  abs(n: number): number { return Math.abs(n); }

  readonly filtered = computed(() => {
    const q = this.query.trim().toLowerCase();
    const cat = this.filterCat;
    return this.expenses().filter((e) => {
      if (cat && e.categorySlug !== cat) return false;
      if (!q) return true;
      return (e.merchant + ' ' + e.description + ' ' + e.nit + ' ' + e.categoryName).toLowerCase().includes(q);
    });
  });

  readonly hasAnalyzedImage = computed(() => !!this.lastImageUrl() && this.regiones().length > 0);

  readonly cmpData = computed(() => ({
    labels: [this.cmpA, this.cmpB],
    datasets: [{ data: [this.cmpSummA()?.total ?? 0, this.cmpSummB()?.total ?? 0],
      backgroundColor: ['#6c8cff', '#10b981'], borderRadius: 8 }],
  }));

  readonly change = computed(() => {
    const s = this.summary();
    if (!s || s.previousMonthTotal <= 0) return 0;
    return ((s.total - s.previousMonthTotal) / s.previousMonthTotal) * 100;
  });
  absChange(): number { return Math.abs(Math.round(this.change())); }

  readonly pieData = computed(() => {
    const bc = this.summary()?.byCategory ?? [];
    return { labels: bc.map((c) => c.name),
      datasets: [{ data: bc.map((c) => c.total), backgroundColor: bc.map((c) => c.color), borderWidth: 0 }] };
  });
  readonly barData = computed(() => {
    const bc = this.summary()?.byCategory ?? [];
    return { labels: bc.map((c) => c.name),
      datasets: [{ data: bc.map((c) => c.total), backgroundColor: bc.map((c) => c.color), borderRadius: 8 }] };
  });
  // Evolución del MES EN CURSO: acumulado real por día + proyección a fin de mes.
  readonly lineData = computed(() => {
    const s = this.summary();
    const days = s?.daysInMonth ?? 30;
    const elapsed = Math.min(s?.daysElapsed ?? days, days);
    // Gasto por día del mes seleccionado.
    const perDay = new Array(days + 1).fill(0);
    for (const e of this.expenses()) {
      const d = parseInt((e.spentOn || '').slice(8, 10), 10);
      if (d >= 1 && d <= days) perDay[d] += e.amount;
    }
    const labels = Array.from({ length: days }, (_, i) => String(i + 1));
    // Acumulado real solo hasta hoy; después null (la línea se corta).
    const real: (number | null)[] = [];
    let acc = 0;
    for (let d = 1; d <= days; d++) { if (d <= elapsed) { acc += perDay[d]; real.push(acc); } else real.push(null); }
    const realToday = acc;
    const projected = s?.projectedEndOfMonth ?? realToday;
    // Proyección: recta de (hoy, gastado) → (fin de mes, proyectado).
    const proj: (number | null)[] = new Array(days).fill(null);
    if (elapsed >= 1) {
      for (let d = elapsed; d <= days; d++) {
        const f = days > elapsed ? (d - elapsed) / (days - elapsed) : 0;
        proj[d - 1] = realToday + (projected - realToday) * f;
      }
    }
    const datasets: Record<string, unknown>[] = [
      { label: 'Gastado', data: real, borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,.15)',
        fill: true, tension: 0.3, pointRadius: 0 },
      { label: 'Proyección', data: proj, borderColor: '#10b981', borderDash: [6, 6], tension: 0.3, pointRadius: 0 },
    ];
    const budget = this.budgetTotals().budget;
    if (budget > 0) datasets.push({ label: 'Presupuesto', data: new Array(days).fill(budget),
      borderColor: '#ef4444', borderDash: [2, 4], pointRadius: 0, fill: false });
    return { labels, datasets };
  });

  sheetTitle(): string {
    switch (this.sheetState()) {
      case 'loading': return 'Analizando…';
      case 'error': return 'Error al leer';
      case 'unreadable': return 'No identificado';
      default: return this.scanned ? 'Confirmar gasto' : 'Nuevo gasto';
    }
  }

  ngOnInit(): void {
    this.api.aiStatus().subscribe({ next: (s) => this.aiEnabled.set(s.enabled), error: () => {} });
    this.api.health().subscribe({ next: (h) => this.isTest.set(h.env === 'test'), error: () => {} });
    this.loadHome();
    // Decide onboarding vs dashboard: primer ingreso o sin categorías.
    this.api.me().subscribe({
      next: (me: Me) => {
        this.api.categories().subscribe({
          next: (cats) => {
            this.categories.set(cats);
            if (!me.onboarded || cats.length === 0) { this.startOnboarding(); }
            else { this.loadBudgets(); this.reload(); }
          },
          error: () => { this.loadBudgets(); this.reload(); },
        });
      },
      error: () => { this.loadCategories(); this.loadBudgets(); this.reload(); },
    });
  }

  // ── Onboarding ──
  private startOnboarding(): void {
    this.onboarding.set(true);
    this.api.categoryTemplates().subscribe({
      next: (t) => { this.templates.set(t); this.chosen.set(t.map((x) => x.slug)); },
      error: () => { this.onboarding.set(false); this.loadCategories(); this.reload(); },
    });
  }
  isChosen(slug: string): boolean { return this.chosen().includes(slug); }
  toggleChoice(slug: string): void {
    const set = new Set(this.chosen());
    set.has(slug) ? set.delete(slug) : set.add(slug);
    this.chosen.set([...set]);
  }
  chooseAll(): void { this.chosen.set(this.templates().map((t) => t.slug)); }
  finishOnboarding(): void {
    this.saving.set(true);
    this.api.onboarding(this.chosen()).subscribe({
      next: () => { this.saving.set(false); this.onboarding.set(false);
        this.loadCategories(); this.loadBudgets(); this.reload(); },
      error: () => { this.saving.set(false); alert('No se pudo guardar. Intenta de nuevo.'); },
    });
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
      this.api.createCategory(this.catForm.name, this.catForm.color, 'fa-solid fa-wallet').subscribe(done);
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
  openManual(): void {
    this.scanned = false; this.montos.set([]); this.regiones.set([]); this.lastImageUrl.set(null);
    this.suggested.set(null); this.scanItems.set([]); this.form = this.emptyForm(); this.sheetTab.set('datos');
    this.sheetState.set('form'); this.sheetVisible = true;
  }
  toManual(): void { this.scanned = false; this.montos.set([]); this.sheetTab.set('datos'); this.sheetState.set('form'); }
  openText(): void { this.pastedText = ''; this.textDialog = true; }

  onFile(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const files = Array.from(input.files ?? []).slice(0, 3);   // máx. 3 fotos de la misma factura
    input.value = '';
    if (!files.length) return;
    this.sheetVisible = true; this.sheetState.set('loading'); this.startPhases();
    this.regiones.set([]); this.lastImageUrl.set(null);
    Promise.all(files.map((f) => this.downscale(f))).then((imgs) => {
      this.lastImages = imgs;
      this.lastImageUrl.set(`data:${imgs[0].mediaType};base64,${imgs[0].base64}`);
      this.runScan();
    }).catch(() => { this.stopPhases(); this.sheetState.set('error'); });
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

  // Animación: fases del análisis (solo estética).
  private startPhases(): void {
    const phases = ['Preparando imagen…', 'Detectando establecimiento…', 'Leyendo montos…',
      'Buscando NIT y fecha…', 'Clasificando la categoría…'];
    let i = 0; this.scanPhase.set(phases[0]);
    this.stopPhases();
    this.phaseTimer = setInterval(() => { i = (i + 1) % phases.length; this.scanPhase.set(phases[i]); }, 1400);
  }
  private stopPhases(): void { if (this.phaseTimer) { clearInterval(this.phaseTimer); this.phaseTimer = null; } }

  retry(): void {
    if (this.lastImages.length) { this.sheetState.set('loading'); this.startPhases(); this.runScan(); }
    else if (this.pastedText.trim()) { this.runTextScan(); }
  }
  // Abre la hoja para elegir cómo aportar la imagen del recibo.
  // FAB central: abre la hoja para registrar un gasto (manual/texto/cámara/galería).
  openRegister(): void { this.pickerVisible = true; }
  chooseManual(): void { this.pickerVisible = false; this.openManual(); }
  chooseText(): void { this.pickerVisible = false; this.openText(); }
  takePhoto(): void { this.pickerVisible = false; this.cameraInput?.nativeElement.click(); }
  uploadImage(): void { this.pickerVisible = false; this.fileInput?.nativeElement.click(); }
  // "Otra foto": cierra la hoja de resultado y vuelve a ofrecer las opciones.
  pickAgain(): void { this.sheetVisible = false; this.openRegister(); }
  // Menú «Más»: cierra la hoja y ejecuta la acción elegida.
  fromMore(action: 'cats' | 'recurring' | 'compare' | 'csv'): void {
    this.moreVisible = false;
    if (action === 'cats') this.openCats();
    else if (action === 'recurring') this.openRecurring();
    else if (action === 'compare') this.openCompare();
    else if (action === 'csv') this.exportCsv();
  }

  imageCount(): number { return this.lastImages.length; }

  private runScan(): void {
    if (!this.lastImages.length) return;
    this.sheetVisible = true; this.sheetState.set('loading');
    const images = this.lastImages.map((i) => ({ image: i.base64, mediaType: i.mediaType }));
    this.api.scanImages(images).pipe(timeout(90000)).subscribe({
      next: (s) => this.applyScan(s), error: () => { this.stopPhases(); this.sheetState.set('error'); },
    });
  }

  runTextScan(): void {
    if (!this.pastedText.trim()) return;
    this.lastImages = []; this.lastImageUrl.set(null); this.regiones.set([]);
    this.textDialog = false; this.sheetVisible = true; this.sheetState.set('loading'); this.startPhases();
    this.api.scanText(this.pastedText).pipe(timeout(70000)).subscribe({
      next: (s) => this.applyScan(s), error: () => { this.stopPhases(); this.sheetState.set('error'); },
    });
  }

  private applyScan(s: Scan): void {
    this.stopPhases();
    if (!s.identificado || !s.montos?.length) { this.sheetState.set('unreadable'); return; }
    this.scanned = true;
    this.montos.set(s.montos);
    this.regiones.set(s.regiones ?? []);
    this.scanItems.set(s.productos ?? []);
    this.suggested.set(s.categoriaId ? null : s.categoriaSugerida);
    const fecha = this.validDate(s.fecha) ? s.fecha! : new Date().toISOString().slice(0, 10);
    const hora = this.validTime(s.hora) ? s.hora! : '';
    this.form = { amount: s.montos[0]?.valor ?? null, currency: 'COP', categoryId: s.categoriaId ?? null,
      merchant: s.establecimiento ?? '', nit: s.nit ?? '', description: s.descripcion ?? '', spentOn: fecha,
      spentTime: hora, shareWith: [] as string[] };
    this.sheetTab.set('datos');
    this.sheetState.set('form');
  }

  private validDate(d: string | null): boolean { return !!d && /^\d{4}-\d{2}-\d{2}$/.test(d); }

  save(): void {
    if (!this.form.amount || this.form.amount <= 0) return;
    this.saving.set(true);
    const sug = this.suggested();
    // #1: si la IA sugirió una categoría nueva y no elegiste otra, se crea al vuelo.
    if (sug && !this.form.categoryId) {
      this.api.createCategory(sug, this.randColor(), 'fa-solid fa-wallet').subscribe({
        next: (c) => this.persistExpense(c.id),
        error: () => this.persistExpense(null),
      });
    } else {
      this.persistExpense(this.form.categoryId);
    }
  }

  private persistExpense(categoryId: number | null): void {
    const spentAt = this.form.spentTime ? `${this.form.spentOn}T${this.form.spentTime}` : undefined;
    const items = this.scanItems();
    this.api.create({ amount: this.form.amount!, currency: this.form.currency, categoryId,
      merchant: this.form.merchant, description: this.form.description, nit: this.form.nit,
      spentOn: this.form.spentOn, spentAt, source: this.scanned ? 'scan' : 'manual',
      items: items.length ? items : undefined,
      shareWith: this.form.shareWith?.length ? this.form.shareWith : undefined }).subscribe({
      next: () => { this.saving.set(false); this.sheetVisible = false; this.loadCategories(); this.reload(); this.pricesLoaded.set(false); },
      error: () => { this.saving.set(false); alert('No se pudo guardar.'); },
    });
  }

  private randColor(): string {
    const pal = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#a855f7', '#ec4899', '#14b8a6', '#8b5cf6'];
    return pal[Math.floor(Math.random() * pal.length)];
  }

  del(id: number): void { this.api.remove(id).subscribe(() => this.reload()); }

  fmt(n: number, currency = 'COP'): string {
    try { return new Intl.NumberFormat('es-CO', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n); }
    catch { return `${n}`; }
  }

  private emptyForm() {
    return { amount: null as number | null, currency: 'COP', categoryId: null as number | null,
      merchant: '', nit: '', description: '', spentOn: new Date().toISOString().slice(0, 10), spentTime: '',
      shareWith: [] as string[] };
  }

  // ── Hogar / compartir ──
  private loadHome(): void {
    this.api.household().subscribe({ next: (h) => this.household.set(h), error: () => {} });
    this.api.categoryShares().subscribe({ next: (s) => this.catShares.set(s), error: () => {} });
  }
  openHome(): void {
    this.moreVisible = false; this.homeDialog = true; this.inviteEmail = '';
    this.api.connections().subscribe({ next: (c) => this.conns.set(c), error: () => {} });
  }
  private reloadConns(): void {
    this.api.connections().subscribe({ next: (c) => this.conns.set(c), error: () => {} });
    this.loadHome();
  }
  sendInvite(): void {
    const e = this.inviteEmail.trim().toLowerCase();
    if (!e) return;
    this.api.invite(e).subscribe({ next: () => { this.inviteEmail = ''; this.reloadConns(); },
      error: () => alert('No se pudo invitar (revisa el correo).') });
  }
  acceptConn(id: number): void { this.api.acceptConn(id).subscribe(() => this.reloadConns()); }
  removeConn(id: number): void { this.api.removeConn(id).subscribe(() => this.reloadConns()); }
  // Alterna un correo en la selección de compartir del formulario.
  toggleShare(email: string): void {
    const set = new Set(this.form.shareWith);
    if (set.has(email)) set.delete(email); else set.add(email);
    this.form.shareWith = Array.from(set);
  }
  // Compartir una categoría con todo el hogar (o dejar de compartir).
  toggleCategoryShare(slug: string): void {
    const shared = this.isCategoryShared(slug);
    const emails = shared ? [] : this.household();
    this.api.shareCategory(slug, emails).subscribe(() => { this.loadHome(); this.reload(); this.pricesLoaded.set(false); });
  }
  isCategoryShared(slug: string): boolean {
    return this.catShares().some((s) => s.slug === slug && s.emails.length > 0);
  }

  // ── Detalle de movimiento ──
  openDetail(e: Expense): void {
    this.detail.set(e); this.detailItems.set([]); this.editing.set(false); this.detailDialog = true;
    this.api.itemsOf(e.id).subscribe({ next: (it) => this.detailItems.set(it), error: () => {} });
  }

  // Editar el movimiento (al menos la categoría) sin volver a crearlo.
  startEdit(): void {
    const d = this.detail();
    if (!d) return;
    const catId = this.categories().find((c) => c.slug === d.categorySlug)?.id ?? null;
    this.editForm = { amount: d.amount, currency: d.currency || 'COP', categoryId: catId,
      merchant: d.merchant, nit: d.nit, description: d.description, spentOn: d.spentOn, spentTime: '',
      shareWith: [...(d.sharedWith ?? [])] };
    this.editing.set(true);
  }
  cancelEdit(): void { this.editing.set(false); }
  toggleEditShare(email: string): void {
    const set = new Set(this.editForm.shareWith);
    if (set.has(email)) set.delete(email); else set.add(email);
    this.editForm.shareWith = Array.from(set);
  }
  saveEdit(): void {
    const d = this.detail();
    if (!d) return;
    this.saving.set(true);
    const f = this.editForm;
    this.api.update(d.id, { amount: f.amount ?? d.amount, currency: f.currency, categoryId: f.categoryId,
      merchant: f.merchant, description: f.description, nit: f.nit, spentOn: f.spentOn,
      shareWith: f.shareWith ?? [] }).subscribe({
      next: () => { this.saving.set(false); this.editing.set(false); this.detailDialog = false;
        this.reload(); this.pricesLoaded.set(false); },
      error: () => { this.saving.set(false); alert('No se pudo guardar.'); },
    });
  }

  openPrices(): void { this.tab.set(4); if (!this.pricesLoaded()) this.loadPrices(); }

  // Carga perezosa de la comparativa de precios (solo la primera vez / tras cambios).
  loadPrices(): void {
    this.api.prices().subscribe({
      next: (p) => { this.prices.set(p); this.pricesLoaded.set(true); },
      error: () => this.pricesLoaded.set(true),
    });
  }
  delFromDetail(): void {
    const d = this.detail();
    if (!d) return;
    this.detailDialog = false;
    this.api.remove(d.id).subscribe(() => this.reload());
  }
  sourceLabel(s: string): string {
    return s === 'scan' ? 'Escaneado con IA' : s === 'recurring' ? 'Recurrente' : 'Manual';
  }
  fmtDateTime(s: string): string {
    if (!s) return '—';
    const d = new Date(s.replace(' ', 'T'));
    if (isNaN(d.getTime())) return s;
    return d.toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
  }
  private validTime(t: string | null): boolean { return !!t && /^\d{2}:\d{2}$/.test(t); }
}
