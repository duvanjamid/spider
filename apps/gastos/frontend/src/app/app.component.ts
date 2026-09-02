import { Component, ElementRef, OnDestroy, OnInit, ViewChild, computed, inject, signal } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { timeout } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { ChartModule } from 'primeng/chart';
import { DialogModule } from 'primeng/dialog';
import { TagModule } from 'primeng/tag';
import {
  Budget, CategoryShare, Category, CategoryTemplate, Connections, Expense, ExpenseItem, GastosService, Me, Monto, PriceProduct, SharedInCategory,
  Notif, Recurring, Region, Scan, ScanItem, Summary, Trend, Income, AntReport, BurnPoint, PushStatus,
} from './gastos.service';

type SheetState = 'form' | 'loading' | 'error' | 'unreadable';

// Fechas en la ZONA LOCAL del navegador (no UTC). `toISOString()` devuelve UTC,
// lo que a partir de las 7pm en GMT-5 ya marca el día/mes siguiente. Estos
// helpers usan los componentes locales para que todo siga la hora del usuario.
function localYM(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function localYMD(d: Date = new Date()): string {
  return `${localYM(d)}-${String(d.getDate()).padStart(2, '0')}`;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [NgFor, NgIf, FormsModule, ButtonModule, CardModule, ChartModule, DialogModule, TagModule],
  styles: [`
    .wrap { max-width: 1120px; margin: 0 auto; padding: 0 16px 84px; }

    /* App bar */
    .bar { position: sticky; top: 0; z-index: 20; display: flex; align-items: center; gap: 10px;
           padding: 14px 12px; margin: 0 -12px 4px; border-radius: 0 0 18px 18px;
           background: linear-gradient(180deg, color-mix(in srgb, var(--accent) 16%, var(--bg)),
                                        color-mix(in srgb, var(--accent) 7%, var(--bg)));
           backdrop-filter: blur(10px); border-bottom: 1px solid var(--accent-line); flex-wrap: wrap; }
    .brand { display: flex; align-items: center; gap: 8px; font-weight: 800; font-size: 1.2rem; }
    .brand .blogo { width: 28px; height: 28px; color: var(--accent); }
    .brand .wm { background: var(--accent-grad); -webkit-background-clip: text; background-clip: text; color: transparent; }
    .month b { color: var(--fg); }
    .mnav { width: 34px; height: 34px; border-radius: 10px; border: 1px solid var(--accent-line);
            background: var(--accent-soft); color: var(--accent); cursor: pointer; display: grid; place-items: center;
            font-size: .9rem; transition: transform .06s, background .15s; }
    .mnav:active { transform: scale(.92); }
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

    /* Editor de categoría (crear / editar con icono, color y monto) */
    .cat-editor { border: 1px solid var(--accent-line); border-radius: 16px; padding: 14px;
                  background: var(--accent-soft); margin-bottom: 16px; }
    .ce-top { display: flex; align-items: center; gap: 12px; }
    .ce-preview { width: 56px; height: 56px; border-radius: 15px; display: grid; place-items: center; color: #fff;
                  font-size: 1.45rem; flex: none; box-shadow: 0 8px 18px rgba(0,0,0,.2); }
    .ce-name { flex: 1; }
    .ce-title { font-weight: 800; font-size: 1.02rem; }
    .ce-label { font-size: .7rem; font-weight: 800; letter-spacing: .5px; text-transform: uppercase;
                color: var(--muted); margin: 13px 2px 7px; }
    .ico-row, .col-row { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 4px; scrollbar-width: thin; }
    .ico-pick { width: 42px; height: 42px; border-radius: 12px; flex: none; display: grid; place-items: center; cursor: pointer;
                border: 1px solid var(--border); background: var(--panel); color: var(--fg); font-size: 1.02rem; }
    .ico-pick.on { border-color: var(--accent); background: var(--accent-weak); color: var(--accent); }
    .col-pick { width: 34px; height: 34px; border-radius: 50%; flex: none; cursor: pointer; border: 3px solid transparent; }
    .col-pick.on { border-color: var(--fg); }
    .col-pick.custom { position: relative; display: grid; place-items: center; background: var(--panel);
                       color: var(--muted); overflow: hidden; border-color: var(--border); }
    .col-pick.custom input { position: absolute; inset: -8px; opacity: 0; cursor: pointer; }
    .ce-amount { position: relative; }
    .ce-amount .cur { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--muted); font-weight: 700; }
    .ce-amount input { padding-left: 26px; }
    .ce-hint { font-size: .78rem; color: var(--muted); margin: 6px 2px 0; }
    .ce-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 14px; }

    /* Grid de categorías (tarjetas) */
    .cat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    @media (min-width: 480px) { .cat-grid { grid-template-columns: 1fr 1fr 1fr; } }
    .cat-card { position: relative; display: flex; flex-direction: column; gap: 9px; padding: 12px;
                border-radius: 15px; border: 1px solid var(--border); background: var(--panel); cursor: pointer;
                box-shadow: var(--shadow); transition: transform .06s, border-color .12s; }
    .cat-card:hover { border-color: var(--accent); }
    .cat-card:active { transform: scale(.98); }
    .cat-card .cc-ic { width: 42px; height: 42px; border-radius: 12px; display: grid; place-items: center;
                       color: #fff; font-size: 1.1rem; }
    .cat-card .cc-name { font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .cat-card .cc-bud { font-size: .78rem; color: var(--muted); }
    .cat-card .cc-bud b { color: var(--accent); font-weight: 800; }
    .cat-card .cc-actions { position: absolute; top: 6px; right: 6px; display: flex; gap: 2px; opacity: .85; }
    .cat-card .cc-btn { width: 28px; height: 28px; border-radius: 8px; border: none; background: transparent;
                        color: var(--muted); cursor: pointer; display: grid; place-items: center; font-size: .82rem; }
    .cat-card .cc-btn:hover { background: var(--panel-2); }
    .cat-card .cc-btn.shared { color: var(--accent); }
    .cat-card .cc-btn.del:hover { color: #ef4444; }

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
    .menu button .badge { background: var(--accent); color: #fff; border-radius: 999px; font-size: .72rem;
                          font-weight: 700; padding: 1px 8px; margin-left: auto; }

    /* Mi cuenta / perfil */
    .account { display: flex; flex-direction: column; }
    .profile { border-radius: 18px; overflow: hidden; border: 1px solid var(--border);
               background: var(--panel); box-shadow: var(--shadow); }
    .pf-cover { height: 76px; background: linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 45%, #9b6cff)); }
    .pf-body { padding: 0 18px 18px; text-align: center; margin-top: -40px; }
    .pf-avatar { width: 80px; height: 80px; border-radius: 50%; margin: 0 auto 10px; background: var(--panel-2);
                 border: 3px solid var(--panel); box-shadow: 0 4px 16px rgba(0,0,0,.22); overflow: hidden;
                 display: grid; place-items: center; font-weight: 800; font-size: 1.8rem; color: var(--accent); }
    .pf-avatar img { width: 100%; height: 100%; object-fit: cover; }
    .pf-name { font-weight: 800; font-size: 1.22rem; letter-spacing: -.2px; }
    .pf-mail { color: var(--muted); font-size: .9rem; margin-top: 3px; word-break: break-all; }
    .pf-chip { display: inline-flex; align-items: center; gap: 7px; margin-top: 12px; font-size: .78rem; font-weight: 700;
               padding: 6px 12px; border-radius: 999px; background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--accent); }
    .pf-chip.guest { background: color-mix(in srgb, #f59e0b 16%, transparent); color: #f59e0b; }
    .acc-group { margin-top: 18px; }
    .acc-title { font-size: .72rem; font-weight: 800; letter-spacing: .6px; text-transform: uppercase;
                 color: var(--muted); margin: 0 4px 8px; }
    .acc-group .menu { border: 1px solid var(--border); border-radius: 14px; background: var(--panel); overflow: hidden; }
    .acc-group .menu button { padding: 14px; }
    .logout { width: 100%; display: flex; align-items: center; justify-content: center; gap: 10px; padding: 14px;
              border: 1px solid color-mix(in srgb, #ef4444 40%, var(--border)); border-radius: 14px; background: none;
              color: #ef4444; font: inherit; font-weight: 700; font-size: .96rem; cursor: pointer; }
    .logout:active { background: color-mix(in srgb, #ef4444 10%, transparent); }
    .acc-cta { margin: 14px 0 2px; }
    .acc-foot { text-align: center; color: var(--muted); font-size: .76rem; margin: 18px 0 2px; }
    .link-btn { background: none; border: none; color: var(--accent); font: inherit; font-size: .74rem; font-weight: 700; cursor: pointer; padding: 0; }
    .notif-list { border: 1px solid var(--border); border-radius: 14px; background: var(--panel); overflow: hidden; }
    .notif { width: 100%; display: flex; align-items: flex-start; gap: 12px; padding: 13px 14px; text-align: left;
             background: none; border: none; border-bottom: 1px solid var(--border); color: var(--fg); font: inherit; cursor: pointer; }
    .notif:last-child { border-bottom: none; }
    .notif.unread { background: color-mix(in srgb, var(--accent) 7%, transparent); }
    .notif:active { background: var(--panel-2); }
    .notif-ic { width: 34px; height: 34px; border-radius: 10px; flex: none; display: grid; place-items: center; color: #fff; font-size: .95rem; }
    .notif-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .notif-body b { font-size: .92rem; }
    .notif-body small { color: var(--muted); font-size: .82rem; }
    .notif-time { font-size: .72rem !important; opacity: .8; }
    .notif-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); flex: none; margin-top: 6px; }
    .bnav-ava { width: 24px; height: 24px; border-radius: 50%; overflow: hidden; display: inline-block; }
    .bnav-ava img { width: 100%; height: 100%; object-fit: cover; }
    .bnav-icwrap { position: relative; display: inline-flex; }
    .bnav-badge { position: absolute; top: -6px; right: -10px; min-width: 16px; height: 16px; padding: 0 4px;
                  border-radius: 999px; background: #ef4444; color: #fff; font-size: .64rem; font-weight: 800;
                  line-height: 16px; text-align: center; box-shadow: 0 0 0 2px var(--panel); }

    /* Cabecera de tarjeta con acción (p.ej. toggle de gráfico) */
    .card-head { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
    .card-title { font-size: 1.02rem; font-weight: 800; color: var(--accent); }
    .seg.mini { padding: 2px; }
    .seg.mini button { padding: 6px 10px; }
    .seg.mini button i { font-size: .9rem; }

    /* Donut central con labels DEBAJO */
    .donut-hero { display: flex; flex-direction: column; align-items: center; gap: 14px; }
    .donut-ring { position: relative; width: 210px; max-width: 62vw; aspect-ratio: 1/1; }
    .donut-labels { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px 14px; width: 100%; }
    .donut-labels .dl { display: inline-flex; align-items: center; gap: 7px; font-size: .86rem; }
    .donut-labels .dl .sw { width: 11px; height: 11px; border-radius: 3px; flex: none; }
    .donut-labels .dl b { font-weight: 700; } .donut-labels .dl small { color: var(--muted); }

    /* Tope global (ingresos) */
    .tope { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
    .tope .pbar { flex: 1; min-width: 160px; height: 12px; background: var(--panel-2); border-radius: 999px; overflow: hidden; }
    .tope .pbar .fill { height: 100%; border-radius: 999px; transition: width .4s ease; }
    .tope .fig b { font-size: 1.15rem; font-weight: 800; }
    .inc-row { display: flex; align-items: center; gap: 10px; padding: 9px 4px; border-bottom: 1px solid var(--border); }

    /* Gastos hormiga */
    .ant-head { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; margin-bottom: 8px; }
    .ant-head .big { font-size: 1.5rem; font-weight: 800; color: #f59e0b; letter-spacing: -.5px; }
    .ant-item { display: flex; align-items: center; gap: 10px; padding: 9px 0; border-top: 1px solid var(--border); }
    .ant-item .an { flex: 1; min-width: 0; text-transform: capitalize; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .ant-item .ac { font-size: .74rem; font-weight: 800; padding: 2px 8px; border-radius: 999px;
                    background: color-mix(in srgb, #f59e0b 18%, transparent); color: #f59e0b; white-space: nowrap; }
    .ant-item .at { font-weight: 700; white-space: nowrap; }

    /* Apariencia: temas + acento */
    .theme-picker { display: grid; grid-template-columns: repeat(auto-fit, minmax(74px, 1fr)); gap: 10px; }
    .theme-opt { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 12px 8px; cursor: pointer;
                 border: 2px solid var(--border); border-radius: 14px; background: var(--panel); color: var(--fg); font: inherit; }
    .theme-opt.on { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-weak); }
    .theme-opt .prev { width: 100%; height: 42px; border-radius: 9px; border: 1px solid var(--accent-line); position: relative; overflow: hidden; }
    .theme-opt .prev.flat { background: var(--accent-soft); }
    .theme-opt .prev.modern { background: var(--panel); box-shadow: inset 0 -14px 16px -12px var(--accent-weak), 0 4px 12px rgba(20,26,40,.16); }
    .theme-opt .prev.modern::before { content: ''; position: absolute; inset: 0 0 auto 0; height: 12px; background: var(--accent-grad); opacity: .85; }
    .theme-opt .prev.glass { background: linear-gradient(135deg, color-mix(in srgb, var(--accent) 50%, transparent), transparent);
                             backdrop-filter: blur(6px); }
    .theme-opt .prev.bold { background: var(--accent-grad); }
    .theme-opt small { font-weight: 700; }
    .swatches { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 12px; }
    .swatch { width: 30px; height: 30px; border-radius: 50%; cursor: pointer; border: 2px solid transparent; position: relative; }
    .swatch.on { border-color: var(--fg); }
    .swatch.auto { display: grid; place-items: center; background: var(--panel-2); color: var(--muted); font-size: .8rem; }

    /* Fila con interruptor (push) */
    .toggle-row { display: flex; align-items: center; gap: 12px; padding: 14px; border: 1px solid var(--border);
                  border-radius: 14px; background: var(--panel); }
    .toggle-row .tr-body { flex: 1; min-width: 0; } .toggle-row .tr-body small { color: var(--muted); font-size: .82rem; }
    .sw-toggle { width: 46px; height: 27px; border-radius: 999px; border: none; background: var(--panel-2); position: relative;
                 cursor: pointer; flex: none; transition: background .2s; }
    .sw-toggle::after { content: ''; position: absolute; top: 3px; left: 3px; width: 21px; height: 21px; border-radius: 50%;
                        background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.3); transition: transform .2s; }
    .sw-toggle.on { background: var(--accent); } .sw-toggle.on::after { transform: translateX(19px); }
    .sw-toggle:disabled { opacity: .5; cursor: not-allowed; }
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
          <span class="wm">Gastos</span> <span class="env" *ngIf="isTest()">test</span>
        </div>
        <span class="spacer"></span>
        <div class="month">
          <button class="mnav" (click)="shiftMonth(-1)" aria-label="Mes anterior"><i class="fa-solid fa-chevron-left"></i></button>
          <b>{{ monthLabel() }}</b>
          <button class="mnav" (click)="shiftMonth(1)" aria-label="Mes siguiente"><i class="fa-solid fa-chevron-right"></i></button>
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

            <!-- Tope global del mes (ingresos) -->
            <div style="margin-bottom:16px" *ngIf="summary() as s">
              <p-card>
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
                  <i class="fa-solid fa-sack-dollar" style="color:var(--accent)"></i>
                  <b style="font-size:1.02rem">Tope del mes</b>
                  <span class="spacer" style="flex:1"></span>
                  <p-button label="Ingreso" icon="pi pi-plus" size="small" [outlined]="true" (onClick)="openIncome()" />
                </div>
                <div class="tope" *ngIf="s.income > 0; else noIncome">
                  <div class="pbar">
                    <div class="fill" [style.width.%]="topePct()"
                         [style.background]="topeOver() ? '#ef4444' : 'var(--accent)'"></div>
                  </div>
                  <div class="fig">
                    <b [class.up]="topeOver()">{{ fmt(s.total) }}</b>
                    <span class="muted"> / {{ fmt(s.income) }}</span>
                  </div>
                  <div class="muted" style="width:100%;font-size:.84rem" [class.up]="topeOver()">
                    {{ topeOver() ? ('Te pasaste ' + fmt(s.total - s.income)) : ('Te quedan ' + fmt(s.income - s.total)) }}
                    · {{ topePct() }}% de tus ingresos
                  </div>
                </div>
                <ng-template #noIncome>
                  <p class="muted" style="margin:0;font-size:.9rem">
                    Registra tus <b>ingresos</b> del mes para fijar tu tope global de gasto.
                  </p>
                </ng-template>
              </p-card>
            </div>

            <div class="grid2">
              <p-card>
                <div class="card-head">
                  <span class="card-title">Distribución por categoría</span>
                  <span class="spacer" style="flex:1"></span>
                  <div class="seg mini">
                    <button [class.on]="distMode() === 'doughnut'" (click)="setDist('doughnut')" title="Disco"><i class="fa-solid fa-circle-notch"></i></button>
                    <button [class.on]="distMode() === 'pie'" (click)="setDist('pie')" title="Torta"><i class="fa-solid fa-chart-pie"></i></button>
                  </div>
                </div>
                <div class="donut-hero" *ngIf="(summary()?.byCategory?.length || 0) > 0; else noData">
                  <div class="donut-ring">
                    <p-chart [type]="distMode()" [data]="pieData()" [options]="pieHeroOptions()" />
                    <div class="donut-center" *ngIf="distMode() === 'doughnut'"><b>{{ fmt(summary()?.total || 0) }}</b><small>total</small></div>
                  </div>
                  <div class="donut-labels">
                    <span class="dl" *ngFor="let c of (summary()?.byCategory || [])">
                      <span class="sw" [style.background]="c.color"></span>
                      <span><b>{{ c.name }}</b> <small>{{ pctOf(c.total) }}%</small></span>
                    </span>
                  </div>
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
                    <div><span class="sw" [style.background]="chartAccent()"></span> Gastado <b>{{ fmt(budgetTotals().spent) }}</b></div>
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

            <div style="margin-top:16px" *ngIf="budgetBarHas(); else plainCatBar">
              <p-card header="Presupuesto vs gastado por categoría">
                <div class="chart-box" style="height:340px">
                  <p-chart type="bar" [data]="budgetBarData()" [options]="budgetBarOptions()" />
                </div>
              </p-card>
            </div>
            <ng-template #plainCatBar>
              <div style="margin-top:16px">
                <p-card header="Gasto por categoría (mes)">
                  <div class="chart-box" style="height:320px" *ngIf="(summary()?.byCategory?.length || 0) > 0; else noData">
                    <p-chart type="bar" [data]="barData()" [options]="barOptions()" />
                  </div>
                </p-card>
              </div>
            </ng-template>

            <div style="margin-top:16px">
              <p-card [header]="(summary()?.income || 0) > 0 ? 'Quema del presupuesto' : 'Cómo va el mes'">
                <div class="chart-box" style="height:300px" *ngIf="(summary()?.count || 0) > 0; else noData">
                  <p-chart type="line" [data]="burnData()" [options]="lineOptions()" />
                </div>
              </p-card>
            </div>

            <!-- Gastos hormiga -->
            <div style="margin-top:16px" *ngIf="ant() as a">
              <p-card *ngIf="a.groups.length" header="Gastos hormiga">
                <div class="ant-head">
                  <span class="big">{{ fmt(a.total) }}</span>
                  <span class="muted">en {{ a.count }} compras pequeñas (≤ {{ fmt(a.threshold) }})<span *ngIf="antPct() > 0"> · {{ antPct() }}% del mes</span></span>
                </div>
                <div class="ant-item" *ngFor="let g of a.groups">
                  <span class="an">{{ g.label }}</span>
                  <span class="ac">×{{ g.count }}</span>
                  <span class="at">{{ fmt(g.total) }}</span>
                </div>
                <p class="muted" style="margin:10px 0 0;font-size:.82rem">
                  <i class="fa-solid fa-lightbulb" style="color:#f59e0b"></i>
                  Pequeñas compras repetidas que, sumadas, pesan. Revisa si puedes recortarlas.
                </p>
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
            <div class="seg" *ngIf="household().length" style="margin-bottom:12px">
              <button [class.on]="movFilter() === 'all'" (click)="movFilter.set('all')">Todos</button>
              <button [class.on]="movFilter() === 'mine'" (click)="movFilter.set('mine')">Míos</button>
              <button [class.on]="movFilter() === 'shared'" (click)="movFilter.set('shared')">Compartidos</button>
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

      <!-- ═══ Página: Mi cuenta ═══ -->
      <section class="page" *ngIf="tab() === 5">
        <div class="account">
          <!-- Tarjeta de perfil (nombre/foto de Google) -->
          <div class="profile">
            <div class="pf-cover"></div>
            <div class="pf-body">
              <div class="pf-avatar">
                <img *ngIf="me()?.picture && !avatarBroken" [src]="me()?.picture" alt=""
                     (error)="avatarBroken = true" referrerpolicy="no-referrer" />
                <span *ngIf="!me()?.picture || avatarBroken">{{ initials() }}</span>
              </div>
              <div class="pf-name">{{ displayName() }}</div>
              <div class="pf-mail" *ngIf="me()?.email && !isGuest()">{{ me()?.email }}</div>
              <div class="pf-chip" *ngIf="!isGuest()"><i class="fa-brands fa-google"></i> Conectado con Google</div>
              <div class="pf-chip guest" *ngIf="isGuest()"><i class="fa-solid fa-user-clock"></i> Modo invitado</div>
            </div>
          </div>

          <!-- Invitado: entrar con Google -->
          <div class="acc-cta" *ngIf="isGuest()">
            <a href="/admin/" style="text-decoration:none">
              <p-button label="Entrar con Google" icon="fa-brands fa-google" [style]="{ width: '100%' }" />
            </a>
            <p class="muted" style="text-align:center;font-size:.82rem;margin:8px 4px 0">
              Inicia sesión para guardar tus gastos y compartir con tu hogar.</p>
          </div>

          <!-- Notificaciones -->
          <div class="acc-group" *ngIf="!isGuest()">
            <div class="acc-title" style="display:flex;align-items:center;gap:8px">
              Notificaciones
              <span class="pf-chip" *ngIf="unread() > 0" style="margin:0;padding:2px 8px;font-size:.66rem">{{ unread() }} nueva(s)</span>
              <span class="spacer" style="flex:1"></span>
              <button *ngIf="notifs().length" class="link-btn" (click)="markAllNotifs()">Marcar leídas</button>
            </div>
            <div class="notif-list" *ngIf="notifs().length; else noNotifs">
              <button class="notif" *ngFor="let n of notifs()" [class.unread]="!n.read" (click)="onNotif(n)">
                <span class="notif-ic" [style.background]="notifTint(n.kind)"><i [class]="notifIcon(n.kind)"></i></span>
                <span class="notif-body">
                  <b>{{ n.title }}</b>
                  <small>{{ n.body }}</small>
                  <small class="notif-time">{{ notifWhen(n.createdAt) }}</small>
                </span>
                <span class="notif-dot" *ngIf="!n.read"></span>
              </button>
            </div>
            <ng-template #noNotifs>
              <p class="muted" style="text-align:center;padding:14px 0;font-size:.86rem">Sin notificaciones por ahora.</p>
            </ng-template>
          </div>

          <!-- Herramientas -->
          <div class="acc-group">
            <div class="acc-title">Gestión</div>
            <div class="menu">
              <button (click)="openHome()"><i class="fa-solid fa-house-user"></i><span>Hogar (compartir)</span>
                <span class="badge" *ngIf="conns()?.incoming?.length">{{ conns()?.incoming?.length }}</span>
                <i class="fa-solid fa-chevron-right go"></i></button>
              <button (click)="fromMore('cats')"><i class="fa-solid fa-tags"></i><span>Mis categorías</span><i class="fa-solid fa-chevron-right go"></i></button>
              <button (click)="openIncome()"><i class="fa-solid fa-sack-dollar"></i><span>Mis ingresos (tope)</span><i class="fa-solid fa-chevron-right go"></i></button>
              <button (click)="fromMore('recurring')"><i class="fa-solid fa-rotate"></i><span>Gastos recurrentes</span><i class="fa-solid fa-chevron-right go"></i></button>
              <button (click)="fromMore('compare')"><i class="fa-solid fa-code-compare"></i><span>Comparar meses</span><i class="fa-solid fa-chevron-right go"></i></button>
              <button (click)="fromMore('csv')"><i class="fa-solid fa-file-csv"></i><span>Exportar CSV</span><i class="fa-solid fa-chevron-right go"></i></button>
            </div>
          </div>

          <!-- Apariencia: estilo + color de acento -->
          <div class="acc-group">
            <div class="acc-title">Apariencia</div>
            <div class="theme-picker">
              <button class="theme-opt" [class.on]="theme() === 'flat'" (click)="setTheme('flat')">
                <span class="prev flat"></span><small>Flat</small></button>
              <button class="theme-opt" [class.on]="theme() === 'modern'" (click)="setTheme('modern')">
                <span class="prev modern"></span><small>Moderno</small></button>
              <button class="theme-opt" [class.on]="theme() === 'glass'" (click)="setTheme('glass')">
                <span class="prev glass"></span><small>Glass</small></button>
              <button class="theme-opt" [class.on]="theme() === 'bold'" (click)="setTheme('bold')">
                <span class="prev bold"></span><small>Bold</small></button>
            </div>
            <div class="acc-title" style="margin-top:14px">Color de acento</div>
            <div class="swatches">
              <span class="swatch auto" [class.on]="accentColor() === ''" (click)="setAccent('')" title="Automático">A</span>
              <span class="swatch" *ngFor="let c of accentSwatches" [style.background]="c"
                    [class.on]="accentColor() === c" (click)="setAccent(c)"></span>
            </div>
          </div>

          <!-- Notificaciones push -->
          <div class="acc-group" *ngIf="!isGuest()">
            <div class="acc-title">Notificaciones push</div>
            <div class="toggle-row">
              <i class="fa-solid fa-bell" style="color:var(--accent);font-size:1.1rem"></i>
              <div class="tr-body">
                <b>Notificaciones en este dispositivo</b>
                <small>{{ pushHint() }}</small>
              </div>
              <button class="sw-toggle" [class.on]="pushOn()" [disabled]="pushBusy() || !pushSupported()"
                      (click)="togglePush()" [attr.aria-pressed]="pushOn()"></button>
            </div>
          </div>

          <!-- Cerrar sesión -->
          <div class="acc-group" *ngIf="!isGuest()">
            <button class="logout" (click)="logout()"><i class="fa-solid fa-arrow-right-from-bracket"></i> Cerrar sesión</button>
          </div>

          <div class="acc-foot">Gastos · Spider<span *ngIf="isTest()"> · entorno test</span></div>
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
        <button class="bnav-item" [class.on]="tab() === 5" (click)="goTab(5)" aria-label="Mi cuenta">
          <span class="bnav-icwrap">
            <span class="bnav-ava" *ngIf="me()?.picture && !avatarBroken">
              <img [src]="me()?.picture" alt="" (error)="avatarBroken = true" referrerpolicy="no-referrer" /></span>
            <i class="fa-solid fa-circle-user" *ngIf="!me()?.picture || avatarBroken"></i>
            <span class="bnav-badge" *ngIf="unread() > 0">{{ unread() > 9 ? '9+' : unread() }}</span>
          </span>
          <span>Cuenta</span></button>
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
    <p-dialog [(visible)]="catDialog" [modal]="true" header="Mis categorías" [dismissableMask]="true" [style]="{ width: '94%', maxWidth: '520px' }">
      <!-- Editor: icono + nombre, color y monto (presupuesto) -->
      <div class="cat-editor">
        <div class="ce-top">
          <span class="ce-preview" [style.background]="catForm.color"><i [class]="catForm.icon"></i></span>
          <div class="ce-name">
            <div class="ce-title">{{ catForm.id ? 'Editar categoría' : 'Nueva categoría' }}</div>
            <input class="inp" type="text" [(ngModel)]="catForm.name" placeholder="Nombre (p.ej. Mercado)" (keyup.enter)="saveCat()" />
          </div>
        </div>

        <div class="ce-label">Icono</div>
        <div class="ico-row">
          <button type="button" class="ico-pick" *ngFor="let ic of catIcons" [class.on]="catForm.icon === ic" (click)="catForm.icon = ic">
            <i [class]="ic"></i>
          </button>
        </div>

        <div class="ce-label">Color</div>
        <div class="col-row">
          <span class="col-pick" *ngFor="let col of catColors" [style.background]="col" [class.on]="catForm.color === col" (click)="catForm.color = col"></span>
          <label class="col-pick custom" title="Color personalizado"><i class="fa-solid fa-eye-dropper"></i>
            <input type="color" [(ngModel)]="catForm.color" /></label>
        </div>

        <div class="ce-label">Presupuesto mensual (opcional)</div>
        <div class="ce-amount">
          <span class="cur">$</span>
          <input class="inp" type="number" [(ngModel)]="catForm.amount" placeholder="0" min="0" />
        </div>
        <div class="ce-hint">Te avisamos cuando el gasto del mes se acerque o supere este monto.</div>

        <div class="ce-actions">
          <p-button *ngIf="catForm.id" label="Cancelar" [text]="true" (onClick)="resetCatForm()" />
          <p-button [label]="catForm.id ? 'Guardar cambios' : 'Crear categoría'" icon="pi pi-check"
                    (onClick)="saveCat()" [disabled]="!catForm.name.trim()" />
        </div>
      </div>

      <!-- Tus categorías (tocar una tarjeta para editarla) -->
      <div class="cat-grid">
        <div class="cat-card" *ngFor="let c of categories()" (click)="editCat(c)">
          <div class="cc-actions">
            <button class="cc-btn" [class.shared]="isCategoryShared(c.slug)" [disabled]="!household().length"
                    (click)="$event.stopPropagation(); toggleCategoryShare(c.slug)"
                    [title]="household().length ? (isCategoryShared(c.slug) ? 'Compartida — clic para dejar de compartir' : 'Compartir con el hogar') : 'Conecta a alguien en Hogar para compartir'">
              <i class="fa-solid" [class.fa-users]="isCategoryShared(c.slug)" [class.fa-user]="!isCategoryShared(c.slug)"></i>
            </button>
            <button class="cc-btn del" (click)="$event.stopPropagation(); delCat(c)" title="Borrar"><i class="fa-solid fa-trash"></i></button>
          </div>
          <span class="cc-ic" [style.background]="c.color"><i [class]="c.icon || 'fa-solid fa-wallet'"></i></span>
          <span class="cc-name">{{ c.name }}</span>
          <span class="cc-bud" *ngIf="budgetFor(c.id) as b; else noBud"><b>{{ fmt(b) }}</b> / mes</span>
          <ng-template #noBud><span class="cc-bud">Sin tope</span></ng-template>
        </div>
      </div>

      <!-- Categorías compartidas conmigo (del hogar): solo lectura -->
      <ng-container *ngIf="sharedInCats().length">
        <h3>Compartidas conmigo</h3>
        <div class="cat-grid">
          <div class="cat-card" *ngFor="let c of sharedInCats()" style="cursor:default">
            <span class="cc-ic" [style.background]="c.color"><i [class]="c.icon || 'fa-solid fa-wallet'"></i></span>
            <span class="cc-name">{{ c.name }}</span>
            <span class="cc-bud">de {{ c.owner }}</span>
          </div>
        </div>
      </ng-container>
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

    <!-- ═══ Ingresos (tope global) ═══ -->
    <p-dialog [(visible)]="incomeDialog" [modal]="true" header="Mis ingresos del mes" [dismissableMask]="true" [style]="{ width: '92%', maxWidth: '460px' }">
      <p class="muted" style="margin:0 0 10px;font-size:.9rem">La suma de tus ingresos del mes es tu <b>tope global</b> de gasto. Te avisamos si lo superas.</p>
      <div class="cat-add">
        <input class="inp" style="width:120px" type="number" [(ngModel)]="incForm.amount" placeholder="Monto" />
        <input class="inp" style="flex:1;min-width:120px" type="text" [(ngModel)]="incForm.source" placeholder="Fuente (salario…)" />
      </div>
      <div class="cat-add">
        <input class="inp" style="flex:1" type="date" [(ngModel)]="incForm.receivedOn" />
        <p-button label="Añadir" icon="pi pi-plus" size="small" (onClick)="addIncome()" [disabled]="!incForm.amount || incForm.amount <= 0" />
      </div>
      <div class="inc-row" *ngFor="let i of incomeList()">
        <i class="fa-solid fa-arrow-down-long" style="color:var(--accent)"></i>
        <span style="flex:1">{{ i.source || 'Ingreso' }} <small class="muted">· {{ i.receivedOn }}</small></span>
        <b>{{ fmt(i.amount) }}</b>
        <p-button icon="pi pi-trash" severity="danger" [text]="true" size="small" (onClick)="delIncome(i.id)" />
      </div>
      <div style="display:flex;justify-content:space-between;margin-top:12px;font-weight:800" *ngIf="incomeList().length">
        <span>Tope del mes</span><span>{{ fmt(incomeTotal()) }}</span>
      </div>
      <p class="muted" *ngIf="!incomeList().length" style="text-align:center;padding:14px 0">Sin ingresos registrados este mes.</p>
    </p-dialog>
  `,
})
export class AppComponent implements OnInit, OnDestroy {
  private api = inject(GastosService);
  @ViewChild('file') fileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('camera') cameraInput!: ElementRef<HTMLInputElement>;

  readonly dark = signal<boolean>(typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-color-scheme: dark)').matches : true);
  readonly isTest = signal(false);
  readonly me = signal<Me | null>(null);   // usuario actual (perfil de Google)
  readonly notifs = signal<Notif[]>([]);    // notificaciones in-app
  readonly unread = signal<number>(0);      // no leídas (badge)

  readonly month = signal<string>(localYM());
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

  // Navegación inferior (0=Estatus, 3=Movimientos, 4=Precios, 5=Mi cuenta)
  readonly tab = signal(0);
  // Hoja «Registrar gasto» (manual / texto / cámara / galería).
  // Campos planos para el two-way [(visible)] del p-dialog (como el resto de diálogos).
  pickerVisible = false;

  // Hogar / compartir
  readonly household = signal<string[]>([]);     // correos conectados (aceptados)
  readonly conns = signal<Connections | null>(null);
  readonly catShares = signal<CategoryShare[]>([]);
  readonly sharedInCats = signal<SharedInCategory[]>([]);   // categorías del hogar compartidas conmigo (solo lectura)
  readonly movFilter = signal<'all' | 'mine' | 'shared'>('all');   // filtro de movimientos
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
  catForm: { id: number | null; name: string; color: string; icon: string; amount: number | null } =
    { id: null, name: '', color: '#10b981', icon: 'fa-solid fa-wallet', amount: null };
  // Iconos y colores sugeridos para el editor de categorías.
  readonly catIcons = [
    'fa-solid fa-cart-shopping', 'fa-solid fa-utensils', 'fa-solid fa-house', 'fa-solid fa-car',
    'fa-solid fa-bolt', 'fa-solid fa-heart-pulse', 'fa-solid fa-graduation-cap', 'fa-solid fa-plane',
    'fa-solid fa-gift', 'fa-solid fa-shirt', 'fa-solid fa-mobile-screen', 'fa-solid fa-gamepad',
    'fa-solid fa-dumbbell', 'fa-solid fa-paw', 'fa-solid fa-mug-hot', 'fa-solid fa-gas-pump',
    'fa-solid fa-bus', 'fa-solid fa-wifi', 'fa-solid fa-tv', 'fa-solid fa-book',
    'fa-solid fa-pills', 'fa-solid fa-scissors', 'fa-solid fa-tree', 'fa-solid fa-futbol',
    'fa-solid fa-credit-card', 'fa-solid fa-piggy-bank', 'fa-solid fa-baby', 'fa-solid fa-music',
    'fa-solid fa-film', 'fa-solid fa-wallet',
  ];
  readonly catColors = ['#10b981', '#6c8cff', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899',
    '#14b8a6', '#0ea5e9', '#f97316', '#84cc16', '#a855f7', '#64748b'];

  readonly budgets = signal<Budget[]>([]);
  readonly recurring = signal<Recurring[]>([]);
  readonly applying = signal<boolean>(false);
  recDialog = false;
  recForm: { merchant: string; amount: number | null; categoryId: number | null; dayOfMonth: number } =
    { merchant: '', amount: null, categoryId: null, dayOfMonth: 1 };

  query = '';
  filterCat = '';
  cmpDialog = false;
  cmpA = localYM();
  cmpB = localYM();
  readonly cmpSummA = signal<Summary | null>(null);
  readonly cmpSummB = signal<Summary | null>(null);

  // ── Ingresos (tope global del mes) ──
  incomeDialog = false;
  readonly incomeList = signal<Income[]>([]);
  readonly incomeTotal = signal<number>(0);
  incForm: { amount: number | null; source: string; receivedOn: string } = { amount: null, source: '', receivedOn: localYMD() };

  // ── Gastos hormiga / quema del presupuesto ──
  readonly ant = signal<AntReport | null>(null);
  readonly burn = signal<BurnPoint[]>([]);

  // ── Apariencia: estilo de superficie + color de acento (persistidos) ──
  readonly theme = signal<'flat' | 'modern' | 'glass' | 'bold'>('modern');
  readonly accentColor = signal<string>('');
  readonly accentSwatches = ['#10b981', '#6c8cff', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#0ea5e9'];
  // Modo del gráfico de distribución: disco (doughnut) o torta (pie).
  readonly distMode = signal<'doughnut' | 'pie'>('doughnut');

  // ── Web Push ──
  readonly pushState = signal<PushStatus | null>(null);
  readonly pushBusy = signal<boolean>(false);

  constructor() {
    if (typeof window !== 'undefined' && window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)')
        .addEventListener('change', (e) => this.dark.set(e.matches));
    }
    this.loadAppearance();   // aplica tema/acento guardados antes de pintar
  }

  // Color de acento efectivo para los gráficos (el elegido o el del tema).
  readonly chartAccent = computed(() => this.accentColor() || (this.dark() ? '#34d399' : '#10b981'));

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
        backgroundColor: [over ? '#ef4444' : this.chartAccent(), this.dark() ? '#2a2f3a' : '#e2e6ef'], borderWidth: 0 }] };
  });
  readonly budgetDonutOpts = computed(() => ({ maintainAspectRatio: false, cutout: '72%',
    plugins: { legend: { display: false } } }));
  abs(n: number): number { return Math.abs(n); }

  // Donut/torta principal (labels van debajo, en HTML). El hueco depende del modo.
  readonly pieHeroOptions = computed(() => ({ maintainAspectRatio: false,
    cutout: this.distMode() === 'pie' ? '0%' : '66%',
    plugins: { legend: { display: false }, tooltip: { enabled: true } } }));
  setDist(m: 'doughnut' | 'pie'): void {
    this.distMode.set(m);
    try { localStorage.setItem('gastos.dist', m); } catch { /* noop */ }
  }

  // % de una categoría sobre el total del mes.
  pctOf(total: number): number {
    const t = this.summary()?.total ?? 0;
    return t > 0 ? Math.round((total / t) * 100) : 0;
  }

  // ── Tope global (ingresos) ──
  topePct(): number {
    const s = this.summary();
    if (!s || s.income <= 0) return 0;
    return Math.min(999, Math.round((s.total / s.income) * 100));
  }
  topeOver(): boolean { const s = this.summary(); return !!s && s.income > 0 && s.total > s.income; }

  // % de gastos hormiga sobre el total del mes.
  antPct(): number {
    const a = this.ant(); const t = this.summary()?.total ?? 0;
    return a && t > 0 ? Math.round((a.total / t) * 100) : 0;
  }

  // Presupuesto vs gastado por categoría (barras agrupadas).
  budgetBarHas(): boolean { return (this.summary()?.byCategory ?? []).some((c) => c.budget > 0); }
  readonly budgetBarData = computed(() => {
    const bc = (this.summary()?.byCategory ?? []).filter((c) => c.budget > 0);
    return { labels: bc.map((c) => c.name),
      datasets: [
        { label: 'Gastado', data: bc.map((c) => c.total),
          backgroundColor: bc.map((c) => (c.total > c.budget ? '#ef4444' : this.chartAccent())), borderRadius: 6 },
        { label: 'Presupuesto', data: bc.map((c) => c.budget),
          backgroundColor: this.dark() ? '#2a2f3a' : '#e2e6ef', borderRadius: 6 },
      ] };
  });
  readonly budgetBarOptions = computed(() => ({ maintainAspectRatio: false,
    plugins: { legend: { labels: { color: this.legend() } } },
    scales: { x: { ticks: { color: this.tick() }, grid: { display: false } },
              y: { ticks: { color: this.tick() }, grid: { color: this.gridc() }, beginAtZero: true } } }));

  // Quema del presupuesto: gasto acumulado (sube) y presupuesto restante (baja).
  readonly burnData = computed(() => {
    const s = this.summary();
    const days = s?.daysInMonth ?? 30;
    const elapsed = Math.min(s?.daysElapsed ?? days, days);
    const cum = new Array<number | null>(days).fill(null);
    for (const p of this.burn()) if (p.day >= 1 && p.day <= days) cum[p.day - 1] = p.cumulative;
    let last = 0;
    const spent: (number | null)[] = [];
    for (let d = 1; d <= days; d++) {
      const v = cum[d - 1];
      if (v != null) last = v;
      spent.push(d <= elapsed ? last : null);
    }
    const labels = Array.from({ length: days }, (_, i) => String(i + 1));
    const acc = this.chartAccent();
    const datasets: Record<string, unknown>[] = [
      { label: 'Gasto acumulado', data: spent, borderColor: acc,
        backgroundColor: 'transparent', tension: 0.3, pointRadius: 0, fill: false },
    ];
    const tope = s?.income ?? 0;
    if (tope > 0) {
      const remaining = spent.map((v) => (v == null ? null : Math.max(tope - v, 0)));
      datasets.push({ label: 'Presupuesto restante', data: remaining, borderColor: '#ef4444',
        backgroundColor: 'rgba(239,68,68,.10)', tension: 0.3, pointRadius: 0, fill: true });
      datasets.push({ label: 'Tope', data: new Array(days).fill(tope),
        borderColor: this.dark() ? '#4b5563' : '#cbd5e1', borderDash: [4, 4], pointRadius: 0, fill: false });
    }
    return { labels, datasets };
  });

  readonly filtered = computed(() => {
    const q = this.query.trim().toLowerCase();
    const cat = this.filterCat;
    const mf = this.movFilter();
    return this.expenses().filter((e) => {
      if (mf === 'mine' && e.mine === false) return false;
      if (mf === 'shared' && !(e.mine === false || e.shared)) return false;
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
      datasets: [{ data: bc.map((c) => c.total), backgroundColor: bc.map((c) => c.color),
        borderColor: this.dark() ? '#161922' : '#ffffff', borderWidth: 2, hoverOffset: 8, spacing: 2 }] };
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
        this.me.set(me);
        this.loadNotifCount();
        this.loadPushStatus();
        // Refresco periódico del contador de notificaciones (badge).
        if (!me.guest && !this.notifTimer) {
          this.notifTimer = setInterval(() => { if (this.tab() !== 5) this.loadNotifCount(); }, 45000);
        }
        this.api.categories().subscribe({
          next: (cats) => {
            this.categories.set(cats);
            if (!me.onboarded || cats.length === 0) { this.startOnboarding(); }
            else { this.loadBudgets(); this.reload(); }
          },
          error: () => { this.loadBudgets(); this.reload(); },
        });
      },
      // Sin sesión válida (401): ya no hay invitados → al login de la plataforma.
      error: () => { window.location.href = '/admin/'; },
    });

    // Navegación por gestos: el botón/gesto «atrás» del móvil cierra diálogos o
    // vuelve a Estatus en vez de cerrar la app. Mantenemos un estado «centinela».
    if (typeof window !== 'undefined') {
      history.pushState({ spider: true }, '');
      window.addEventListener('popstate', this.onPopState);
    }
  }

  ngOnDestroy(): void {
    if (typeof window !== 'undefined') window.removeEventListener('popstate', this.onPopState);
    if (this.notifTimer) clearInterval(this.notifTimer);
  }

  /** Empuja un estado centinela para «consumir» el próximo gesto de atrás. */
  private pushGuard(): void { try { history.pushState({ spider: true }, ''); } catch { /* noop */ } }

  /** Cierra el diálogo/hoja abierto de más «arriba»; true si cerró alguno. */
  private closeTopOverlay(): boolean {
    if (this.cmpDialog) { this.cmpDialog = false; return true; }
    if (this.recDialog) { this.recDialog = false; return true; }
    if (this.catDialog) { this.catDialog = false; return true; }
    if (this.textDialog) { this.textDialog = false; return true; }
    if (this.detailDialog) { this.detailDialog = false; return true; }
    if (this.sheetVisible) { this.sheetVisible = false; return true; }
    if (this.homeDialog) { this.homeDialog = false; return true; }
    if (this.pickerVisible) { this.pickerVisible = false; return true; }
    return false;
  }

  /**
   * Gesto/botón atrás del móvil: cierra el diálogo abierto o vuelve a Estatus,
   * en vez de cerrar la app. Siempre re-armamos el centinela para que el gesto
   * nunca cierre la PWA (el usuario sale con el botón de inicio del sistema).
   */
  private onPopState = (): void => {
    if (!this.closeTopOverlay() && this.tab() !== 0) this.tab.set(0);
    this.pushGuard();
  };

  /** Cambia de pestaña inferior (Estatus/Movimientos/Precios/Cuenta). */
  goTab(n: number): void {
    this.tab.set(n);
    if (n === 5) this.openNotifs();   // al entrar a Cuenta, carga y marca leídas
  }

  // ── Notificaciones ──
  private notifTimer: ReturnType<typeof setInterval> | null = null;

  private loadNotifCount(): void {
    if (this.isGuest()) return;
    this.api.notifCount().subscribe({ next: (r) => this.unread.set(r.unread || 0), error: () => {} });
  }
  /** Abre la bandeja: trae la lista y marca todo como leído (limpia el badge). */
  private openNotifs(): void {
    if (this.isGuest()) return;
    this.api.notifications().subscribe({
      next: (r) => {
        this.notifs.set(r.items || []);
        if ((r.unread || 0) > 0) this.api.markAllNotifRead().subscribe({ next: () => this.unread.set(0), error: () => {} });
        else this.unread.set(0);
      },
      error: () => {},
    });
  }
  markAllNotifs(): void {
    this.api.markAllNotifRead().subscribe({
      next: () => { this.unread.set(0); this.notifs.set(this.notifs().map((n) => ({ ...n, read: true }))); },
      error: () => {},
    });
  }
  /** Al tocar una notificación, abre lo relevante. */
  onNotif(n: Notif): void {
    if (n.kind === 'connection_invite' || n.kind === 'connection_accepted') this.openHome();
    else if (n.kind === 'category_shared') this.openCats();
    else if (n.kind === 'shared_expense') { this.tab.set(3); this.movFilter.set('shared'); }
    else if (n.kind === 'budget_exceeded') this.tab.set(0);
  }
  notifIcon(kind: string): string {
    return kind === 'connection_invite' ? 'fa-solid fa-user-plus'
      : kind === 'connection_accepted' ? 'fa-solid fa-user-check'
      : kind === 'category_shared' ? 'fa-solid fa-tags'
      : kind === 'budget_exceeded' ? 'fa-solid fa-triangle-exclamation'
      : 'fa-solid fa-cart-shopping';
  }
  notifTint(kind: string): string {
    return kind === 'connection_invite' ? '#6c8cff'
      : kind === 'connection_accepted' ? '#10b981'
      : kind === 'category_shared' ? '#f59e0b'
      : kind === 'budget_exceeded' ? '#ef4444'
      : '#8b5cf6';
  }
  notifWhen(iso: string): string {
    const d = new Date(iso); const diff = (Date.now() - d.getTime()) / 1000;
    if (isNaN(diff)) return '';
    if (diff < 60) return 'ahora';
    if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
    return d.toLocaleDateString();
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
    this.api.ant(m).subscribe({ next: (a) => this.ant.set(a), error: () => {} });
    this.api.burndown(m).subscribe({ next: (b) => this.burn.set(b), error: () => {} });
  }

  // ── Apariencia (tema + color de acento) ──
  private loadAppearance(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const t = localStorage.getItem('gastos.theme');
      if (t === 'flat' || t === 'modern' || t === 'glass' || t === 'bold') this.theme.set(t);
      const a = localStorage.getItem('gastos.accent');
      if (a) this.accentColor.set(a);
      const d = localStorage.getItem('gastos.dist');
      if (d === 'pie' || d === 'doughnut') this.distMode.set(d);
    } catch { /* almacenamiento no disponible */ }
    this.applyAppearance();
  }
  private applyAppearance(): void {
    if (typeof document === 'undefined') return;
    document.documentElement.setAttribute('data-theme', this.theme());
    const a = this.accentColor();
    if (a) document.documentElement.style.setProperty('--accent', a);
    else document.documentElement.style.removeProperty('--accent');
  }
  setTheme(t: 'flat' | 'modern' | 'glass' | 'bold'): void {
    this.theme.set(t);
    try { localStorage.setItem('gastos.theme', t); } catch { /* noop */ }
    this.applyAppearance();
  }
  setAccent(hex: string): void {
    this.accentColor.set(hex);
    try { if (hex) localStorage.setItem('gastos.accent', hex); else localStorage.removeItem('gastos.accent'); } catch { /* noop */ }
    this.applyAppearance();
  }

  // ── Ingresos (tope global) ──
  openIncome(): void { this.incForm = { amount: null, source: '', receivedOn: localYMD() }; this.loadIncome(); this.incomeDialog = true; }
  private loadIncome(): void {
    this.api.income(this.month()).subscribe({
      next: (r) => { this.incomeList.set(r.items || []); this.incomeTotal.set(r.total || 0); }, error: () => {},
    });
  }
  addIncome(): void {
    if (!this.incForm.amount || this.incForm.amount <= 0) return;
    this.api.addIncome(this.incForm.amount, this.incForm.source, this.incForm.receivedOn).subscribe({
      next: () => { this.incForm = { amount: null, source: '', receivedOn: localYMD() }; this.loadIncome(); this.reload(); },
      error: () => alert('No se pudo registrar el ingreso.'),
    });
  }
  delIncome(id: number): void { this.api.deleteIncome(id).subscribe(() => { this.loadIncome(); this.reload(); }); }

  shiftMonth(delta: number): void {
    const [y, m] = this.month().split('-').map(Number);
    this.month.set(localYM(new Date(y, m - 1 + delta, 1)));
    this.reload();
  }
  monthLabel(): string {
    const [y, m] = this.month().split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('es', { month: 'long', year: 'numeric' });
  }

  // ── Categorías ──
  openCats(): void { this.resetCatForm(); this.loadBudgets(); this.loadHome(); this.catDialog = true; }
  resetCatForm(): void { this.catForm = { id: null, name: '', color: '#10b981', icon: 'fa-solid fa-wallet', amount: null }; }
  editCat(c: Category): void {
    this.catForm = { id: c.id, name: c.name, color: c.color, icon: c.icon || 'fa-solid fa-wallet', amount: this.budgetFor(c.id) };
  }
  saveCat(): void {
    const f = this.catForm;
    if (!f.name.trim()) return;
    const amount = Number(f.amount) || 0;
    const finish = () => { this.resetCatForm(); this.loadCategories(); this.loadBudgets(); this.reload(); };
    if (f.id) {
      const id = f.id;
      this.api.updateCategory(id, { name: f.name.trim(), color: f.color, icon: f.icon })
        .subscribe(() => this.api.setBudget(id, amount).subscribe({ next: finish, error: finish }));
    } else {
      this.api.createCategory(f.name.trim(), f.color, f.icon).subscribe((c) => {
        if (amount > 0) this.api.setBudget(c.id, amount).subscribe({ next: finish, error: finish });
        else finish();
      });
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
    this.cmpB = localYM(new Date(y, m - 2, 1));
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
  // Herramientas de la página «Mi cuenta»: abre el diálogo correspondiente.
  fromMore(action: 'cats' | 'recurring' | 'compare' | 'csv'): void {
    if (action === 'cats') this.openCats();
    else if (action === 'recurring') this.openRecurring();
    else if (action === 'compare') this.openCompare();
    else if (action === 'csv') this.exportCsv();
  }

  // ── Mi cuenta / perfil ──
  avatarBroken = false;
  isGuest(): boolean { const m = this.me(); return !m || !!m.guest; }
  displayName(): string {
    const m = this.me();
    if (m?.name) return m.name;
    if (this.isGuest()) return 'Invitado';
    const e = m?.email || '';
    return e.includes('@') ? e.split('@')[0] : (e || 'Invitado');
  }
  initials(): string {
    if (this.isGuest()) return '🙂';
    const parts = this.displayName().trim().split(/\s+/).filter(Boolean);
    const a = parts[0]?.[0] ?? '';
    const b = parts.length > 1 ? parts[parts.length - 1][0] : '';
    return (a + b).toUpperCase() || '·';
  }
  logout(): void {
    this.api.logout().subscribe({
      next: () => (window.location.href = '/admin/'),
      error: () => (window.location.href = '/admin/'),
    });
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
    const fecha = this.validDate(s.fecha) ? s.fecha! : localYMD();
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
      merchant: '', nit: '', description: '', spentOn: localYMD(), spentTime: '',
      shareWith: [] as string[] };
  }

  // ── Hogar / compartir ──
  private loadHome(): void {
    this.api.household().subscribe({ next: (h) => this.household.set(h), error: () => {} });
    this.api.categoryShares().subscribe({ next: (s) => this.catShares.set(s), error: () => {} });
    this.api.sharedInCategories().subscribe({ next: (s) => this.sharedInCats.set(s), error: () => {} });
  }
  openHome(): void {
    this.homeDialog = true; this.inviteEmail = '';
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

  // ── Web Push ──
  pushSupported(): boolean {
    return typeof navigator !== 'undefined' && 'serviceWorker' in navigator
      && typeof window !== 'undefined' && 'PushManager' in window
      && (this.pushState()?.enabled ?? false);
  }
  pushOn(): boolean { return this.pushState()?.subscribed === true; }
  pushHint(): string {
    if (!this.pushState()?.enabled) return 'No disponible en este servidor.';
    if (typeof Notification !== 'undefined' && Notification.permission === 'denied')
      return 'Bloqueadas por el navegador. Actívalas en los ajustes del sitio.';
    return this.pushOn()
      ? 'Activadas: topes, invitaciones y compras compartidas.'
      : 'Recibe avisos de topes, invitaciones de hogar y compras compartidas.';
  }
  private loadPushStatus(): void {
    if (this.isGuest() || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    this.api.pushStatus().subscribe({ next: (s) => this.pushState.set(s), error: () => {} });
  }
  togglePush(): void { if (this.pushOn()) this.disablePush(); else this.enablePush(); }

  private enablePush(): void {
    const st = this.pushState();
    if (!st?.enabled || !st.key) return;
    this.pushBusy.set(true);
    const fail = (msg?: string) => { this.pushBusy.set(false); if (msg) alert(msg); };
    Notification.requestPermission().then((perm) => {
      if (perm !== 'granted') { fail('Permiso de notificaciones denegado.'); return; }
      navigator.serviceWorker.ready.then((reg) =>
        reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: this.urlB64ToUint8Array(st.key) })
      ).then((sub) => {
        const json = sub.toJSON();
        const keys = json.keys || ({} as Record<string, string>);
        this.api.pushSubscribe({ endpoint: sub.endpoint, p256dh: keys['p256dh'] || '', auth: keys['auth'] || '' }).subscribe({
          next: () => { this.pushBusy.set(false); this.pushState.set({ ...st, subscribed: true }); },
          error: () => fail('No se pudo guardar la suscripción.'),
        });
      }).catch(() => fail('No se pudo activar el push.'));
    }).catch(() => fail());
  }

  private disablePush(): void {
    const st = this.pushState();
    this.pushBusy.set(true);
    navigator.serviceWorker.ready.then((reg) => reg.pushManager.getSubscription()).then((sub) => {
      const done = () => { this.pushBusy.set(false); if (st) this.pushState.set({ ...st, subscribed: false }); };
      if (!sub) { done(); return; }
      const endpoint = sub.endpoint;
      sub.unsubscribe().finally(() => this.api.pushUnsubscribe(endpoint).subscribe({ next: done, error: done }));
    }).catch(() => { this.pushBusy.set(false); });
  }

  /** VAPID key base64url → Uint8Array para applicationServerKey. */
  private urlB64ToUint8Array(base64: string): Uint8Array {
    const padding = '='.repeat((4 - (base64.length % 4)) % 4);
    const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(b64);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }
}
