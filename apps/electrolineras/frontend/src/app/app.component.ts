import { AfterViewInit, Component, ElementRef, OnInit, ViewChild, computed, inject, signal } from '@angular/core';
import { NgFor, NgIf, SlicePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { TabViewModule } from 'primeng/tabview';
import { TagModule } from 'primeng/tag';
import * as L from 'leaflet';
import { Charger, Comment, ElectrolinerasService, Report, Station, StationFull } from './electrolineras.service';

type Tab = 'map' | 'near' | 'trip' | 'info';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [NgFor, NgIf, SlicePipe, FormsModule, ButtonModule, DialogModule, TabViewModule, TagModule],
  styles: [`
    :host { display: block; --hdr: 56px; --nav: 62px; }
    .app { min-height: 100vh; display: flex; flex-direction: column; background: var(--bg); }

    /* Header */
    .hdr { position: sticky; top: 0; z-index: 30; height: var(--hdr); display: flex; align-items: center; gap: 10px;
           padding: 0 14px; background: color-mix(in srgb, var(--bg) 90%, transparent); backdrop-filter: blur(12px); border-bottom: 1px solid var(--border); }
    .brand { display: flex; align-items: center; gap: 10px; font-weight: 800; font-size: 1.12rem; }
    .brand > i { font-size: .95rem; color: #fff; width: 32px; height: 32px; border-radius: 10px; display: grid; place-items: center; background: var(--grad); box-shadow: var(--glow); }
    /* Hero */
    .hero { position: relative; overflow: hidden; border-radius: 22px; padding: 22px 20px 18px; margin-bottom: 16px; background: var(--panel); border: 1px solid var(--border); box-shadow: var(--shadow); }
    .hero::before { content: ''; position: absolute; inset: 0; background: var(--grad-soft); }
    .hero-glow { position: absolute; top: -50px; right: -34px; width: 170px; height: 170px; border-radius: 50%; background: var(--grad); filter: blur(46px); opacity: .32; }
    .hero > * { position: relative; }
    .hero .hi { font-size: .72rem; font-weight: 800; letter-spacing: .5px; text-transform: uppercase; color: var(--accent); }
    .hero h1 { margin: 7px 0 3px; font-size: 1.95rem; font-weight: 800; letter-spacing: -.6px; background: var(--grad); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
    .hero p { margin: 0 0 14px; color: var(--muted); }
    .hchips { display: flex; gap: 8px; flex-wrap: wrap; }
    .hchip { display: inline-flex; align-items: center; gap: 7px; padding: 7px 12px; border-radius: 999px; font-size: .82rem; font-weight: 600; background: var(--glass); backdrop-filter: blur(8px); border: 1px solid var(--border); cursor: pointer; }
    .hchip i { color: var(--accent); }
    .hchip .pulse { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); animation: pdot 1.8s infinite; }
    @keyframes pdot { 0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent) 55%, transparent); } 70% { box-shadow: 0 0 0 7px transparent; } 100% { box-shadow: 0 0 0 0 transparent; } }
    @keyframes fadeUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
    .env { font-size: .62rem; font-weight: 800; letter-spacing: .5px; padding: 2px 7px; border-radius: 6px; background: #f59e0b; color: #1a1200; text-transform: uppercase; }
    .spacer { flex: 1; }
    .icon-btn { width: 40px; height: 40px; border-radius: 12px; border: 1px solid var(--border); background: var(--panel); color: var(--fg); cursor: pointer; font-size: 1.05rem; }
    .muted { color: var(--muted); }

    /* Screen area */
    .screen { flex: 1; position: relative; isolation: isolate; background: var(--bg); }
    section.scr { position: absolute; inset: 0; display: flex; flex-direction: column; z-index: 0; background: var(--bg); }
    /* Que [hidden] realmente oculte el mapa (si no, tapa el resto de pantallas). */
    section.scr[hidden] { display: none !important; }
    .scroll { flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; padding: 14px 14px calc(var(--nav) + 20px); }
    .s-head { padding: 6px 2px 12px; } .s-head h1 { margin: 0; font-size: 1.5rem; letter-spacing: -.5px; } .s-head p { margin: 4px 0 0; color: var(--muted); }

    /* Map screen */
    .map-search { position: absolute; top: 12px; left: 12px; right: 12px; z-index: 20; display: flex; align-items: center; gap: 8px;
           background: var(--glass); backdrop-filter: blur(14px); border: 1px solid var(--border); border-radius: 16px; padding: 10px 14px; box-shadow: var(--shadow); }
    .map-search i { color: var(--muted); }
    .map-search input { flex: 1; border: none; background: none; color: var(--fg); font-size: 1rem; outline: none; }
    .map-search button { width: 34px; height: 34px; border-radius: 10px; border: none; background: var(--panel-2); color: var(--muted); cursor: pointer; }
    .map-search button.on { background: var(--accent); color: #08130c; }
    /* z-index:0 CONFINA los z-index internos de Leaflet (controles llegan a 1000)
       para que no tapen el header, la nav ni el drawer. */
    .map { position: absolute; inset: 0; z-index: 0; }

    /* Station cards */
    .cards { display: flex; flex-direction: column; gap: 10px; }
    .scard { position: relative; overflow: hidden; display: flex; gap: 13px; padding: 15px 15px 15px 20px; border: 1px solid var(--border); border-radius: 18px; background: var(--panel); box-shadow: var(--shadow); cursor: pointer; transition: transform .14s ease, box-shadow .18s ease, border-color .18s ease; animation: fadeUp .34s ease both; }
    .scard::before { content: ''; position: absolute; left: 0; top: 12px; bottom: 12px; width: 4px; border-radius: 0 4px 4px 0; background: var(--c); }
    .scard:hover { transform: translateY(-3px); box-shadow: var(--glow); border-color: color-mix(in srgb, var(--c) 40%, var(--border)); }
    .scard:active { transform: scale(.99); }
    .scard .ic { position: relative; width: 48px; height: 48px; border-radius: 15px; display: grid; place-items: center; font-size: 1.3rem; flex: none; color: var(--c); background: color-mix(in srgb, var(--c) 15%, var(--panel)); }
    .scard .ic .livedot { position: absolute; top: -2px; right: -2px; width: 12px; height: 12px; border-radius: 50%; background: var(--c); border: 2px solid var(--panel); animation: pdot 1.8s infinite; }
    .scard .grow { flex: 1; min-width: 0; }
    .scard .nm { font-weight: 700; }
    .scard .meta { color: var(--muted); font-size: .84rem; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .scard .chips { display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap; }
    .scard .right { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; flex: none; }
    .scard .km { font-weight: 700; font-size: .9rem; white-space: nowrap; }
    .chip { display: inline-flex; align-items: center; gap: 5px; font-size: .72rem; padding: 4px 10px; border-radius: 999px; background: var(--panel-2); border: 1px solid var(--border); white-space: nowrap; color: var(--muted); }
    .chip i { color: var(--accent); font-size: .68rem; }

    /* Progress bar */
    .pbar { height: 8px; border-radius: 999px; background: var(--panel-2); overflow: hidden; }
    .pbar > i { display: block; height: 100%; border-radius: 999px; transition: width .4s ease; }
    .prow { display: flex; align-items: center; gap: 10px; }
    .prow .lbl { font-size: .8rem; color: var(--muted); min-width: 92px; }

    /* Location prompt */
    .prompt { text-align: center; padding: 40px 20px; }
    .prompt .big { font-size: 2.4rem; } .prompt h2 { margin: 12px 0 6px; }

    /* Trip */
    .field { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border: 1px solid var(--border); border-radius: 14px; background: var(--panel); margin-bottom: 10px; }
    .field > i { width: 18px; text-align: center; }
    .field input { flex: 1; border: none; background: none; color: var(--fg); font-size: 1rem; outline: none; }
    .kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 14px 0; }
    .kpi { background: var(--panel); border: 1px solid var(--border); border-radius: 14px; padding: 12px; text-align: center; box-shadow: var(--shadow); }
    .kpi .v { font-size: 1.45rem; font-weight: 800; background: var(--grad); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; } .kpi .l { color: var(--muted); font-size: .74rem; margin-top: 2px; }
    .trow { display: flex; align-items: center; gap: 10px; padding: 11px 12px; border: 1px solid var(--border); border-radius: 12px; margin-bottom: 8px; cursor: pointer; background: var(--panel); }
    .trow.stop { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, var(--panel)); }
    .trow .dot, .scard .dot { width: 10px; height: 10px; border-radius: 50%; flex: none; }
    .trow .grow { flex: 1; min-width: 0; } .trow .nm { font-weight: 600; } .trow .ds { color: var(--muted); font-size: .8rem; }
    .stopbadge { font-size: .68rem; font-weight: 800; color: #08130c; background: var(--accent); padding: 2px 8px; border-radius: 999px; }

    /* Info screen */
    .stat { display: flex; align-items: center; gap: 12px; padding: 14px; border: 1px solid var(--border); border-radius: 16px; background: var(--panel); margin-bottom: 10px; }
    .stat { animation: fadeUp .3s ease both; }
    .stat .n { font-size: 1.7rem; font-weight: 800; min-width: 56px; text-align: center; background: var(--grad); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
    .legend { display: flex; gap: 14px; flex-wrap: wrap; margin: 8px 0; } .legend span { display: flex; align-items: center; gap: 6px; font-size: .85rem; }
    .legend .d { width: 12px; height: 12px; border-radius: 50%; }
    .note { background: color-mix(in srgb, var(--accent) 8%, var(--panel)); border: 1px solid color-mix(in srgb, var(--accent) 30%, var(--border)); border-radius: 14px; padding: 14px; }

    /* Bottom navigation */
    .bottomnav { position: fixed; bottom: 0; left: 0; right: 0; z-index: 40; height: calc(var(--nav) + env(safe-area-inset-bottom));
           padding-bottom: env(safe-area-inset-bottom); display: flex; background: color-mix(in srgb, var(--bg) 92%, transparent);
           backdrop-filter: blur(12px); border-top: 1px solid var(--border); }
    .bottomnav button { position: relative; flex: 1; border: none; background: none; color: var(--muted); cursor: pointer; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; font-size: .68rem; font-weight: 600; transition: color .2s; }
    .bottomnav button i { font-size: 1.15rem; transition: transform .2s ease; z-index: 1; }
    .bottomnav button span { z-index: 1; }
    .bottomnav button.on { color: var(--accent); }
    .bottomnav button.on i { transform: translateY(-2px) scale(1.1); }
    .bottomnav button::before { content: ''; position: absolute; top: 7px; left: 50%; transform: translateX(-50%) scale(.6); width: 48px; height: 30px; border-radius: 12px; background: color-mix(in srgb, var(--accent) 15%, transparent); opacity: 0; transition: opacity .2s, transform .2s; }
    .bottomnav button.on::before { opacity: 1; transform: translateX(-50%) scale(1); }

    /* Drawer */
    .scrim { position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 1990; }
    .drawer { position: fixed; top: 0; right: 0; bottom: 0; width: min(86vw, 340px); z-index: 2000; background: var(--panel); border-left: 1px solid var(--border);
           box-shadow: var(--shadow); transform: translateX(100%); transition: transform .24s ease; display: flex; flex-direction: column; }
    .drawer.open { transform: translateX(0); }
    .drawer .dh { display: flex; align-items: center; padding: 16px; border-bottom: 1px solid var(--border); font-weight: 800; }
    .drawer .db { padding: 16px; overflow-y: auto; display: flex; flex-direction: column; gap: 16px; }
    .drawer label { font-size: .78rem; color: var(--muted); font-weight: 700; text-transform: uppercase; letter-spacing: .5px; display: block; margin-bottom: 6px; }
    .sel { width: 100%; padding: 10px 12px; border-radius: 10px; border: 1px solid var(--border); background: var(--panel-2); color: var(--fg); }

    /* Detail sheet */
    .d-head { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 6px; }
    .d-head .grow { flex: 1; } .d-head h2 { margin: 0; font-size: 1.15rem; }
    .d-meta { color: var(--muted); font-size: .85rem; margin-top: 2px; }
    .kv { display: flex; gap: 8px; flex-wrap: wrap; margin: 10px 0; }
    .kv .k { display: inline-flex; align-items: center; gap: 6px; padding: 5px 10px; border-radius: 999px; background: var(--panel-2); font-size: .8rem; }
    .report-btns { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 6px; }
    .charger { display: flex; align-items: center; gap: 10px; padding: 11px 0; border-top: 1px solid var(--border); flex-wrap: wrap; }
    .charger .grow { flex: 1; min-width: 120px; } .charger .nm { font-weight: 600; }
    .cbtns { display: flex; gap: 6px; }
    .cmt { padding: 10px 0; border-top: 1px solid var(--border); } .cmt .who { font-weight: 600; font-size: .84rem; } .cmt .who small { color: var(--muted); font-weight: 400; margin-left: 6px; }
    .cmt-form { display: flex; gap: 8px; margin: 6px 0 12px; }
    .cmt-form textarea { flex: 1; min-height: 44px; padding: 10px; border-radius: 10px; border: 1px solid var(--border); background: var(--panel-2); color: var(--fg); font-family: inherit; resize: vertical; }
    .act { display: flex; align-items: center; gap: 8px; padding: 7px 0; border-top: 1px solid var(--border); font-size: .84rem; }
    h3.sec { margin: 4px 0 8px; font-size: .95rem; }
  `],
  template: `
    <div class="app">
      <!-- Header -->
      <header class="hdr">
        <div class="brand"><i class="fa-solid fa-charging-station"></i> Electrolineras <span class="env" *ngIf="isTest()">test</span></div>
        <span class="spacer"></span>
        <button class="icon-btn" (click)="drawer.set(true)" aria-label="Menú"><i class="fa-solid fa-sliders"></i></button>
      </header>

      <!-- Screens -->
      <div class="screen">
        <!-- MAPA -->
        <section class="scr" [hidden]="tab() !== 'map'">
          <div class="map-search">
            <i class="fa-solid fa-magnifying-glass"></i>
            <input [(ngModel)]="query" (ngModelChange)="applyFilters()" placeholder="Buscar estación o ciudad…" />
            <button [class.on]="!!userPos()" (click)="locate()" title="Mi ubicación"><i class="fa-solid fa-location-crosshairs"></i></button>
          </div>
          <div #mapEl class="map"></div>
        </section>

        <!-- CERCA -->
        <section class="scr" *ngIf="tab() === 'near'">
          <div class="scroll">
            <div class="hero">
              <div class="hero-glow"></div>
              <div class="hi">⚡ Energía para tu ruta</div>
              <h1>Electrolineras</h1>
              <p>{{ userPos() ? filtered().length + ' cerca de ti' : (meta()?.total ?? '—') + ' estaciones en Colombia' }}</p>
              <div class="hchips">
                <span class="hchip"><span class="pulse"></span> {{ activeCount() }} activas</span>
                <span class="hchip"><i class="fa-solid fa-city"></i> {{ meta()?.cities ?? 0 }} ciudades</span>
                <span class="hchip" (click)="locate()"><i class="fa-solid fa-location-crosshairs"></i> {{ userPos() ? 'Ubicado' : 'Ubicarme' }}</span>
              </div>
            </div>
            <div class="prompt" *ngIf="!userPos()">
              <div class="big">📍</div><h2>¿Dónde estás?</h2>
              <p class="muted">Comparte tu ubicación para ver las electrolineras más cercanas primero.</p>
              <p-button label="Usar mi ubicación" icon="fa-solid fa-location-crosshairs" (onClick)="locate()" [loading]="locating()" styleClass="mt" />
            </div>
            <div class="cards">
              <div class="scard" *ngFor="let s of filtered()" (click)="openDetail(s)" [style.--c]="statusColor(s.communityStatus)">
                <span class="ic"><i class="fa-solid fa-bolt"></i><span class="livedot" *ngIf="s.communityStatus === 'active'"></span></span>
                <div class="grow">
                  <div class="nm">{{ s.name }}</div>
                  <div class="meta">{{ s.operator || 'Operador' }} · {{ s.city }}</div>
                  <div class="chips">
                    <span class="chip" *ngIf="s.speed"><i class="fa-solid fa-gauge-high"></i> {{ s.speed }}</span>
                    <span class="chip" *ngIf="s.connectors"><i class="fa-solid fa-plug"></i> {{ s.connectors.length > 18 ? (s.connectors | slice:0:18) + '…' : s.connectors }}</span>
                  </div>
                </div>
                <div class="right">
                  <span class="km" *ngIf="dist(s)">{{ dist(s) }}</span>
                  <p-tag [value]="statusLabel(s.communityStatus)" [severity]="statusSeverity(s.communityStatus)" />
                </div>
              </div>
              <p class="muted" *ngIf="loaded() && !filtered().length" style="text-align:center;padding:24px">No hay estaciones que coincidan.</p>
            </div>
          </div>
        </section>

        <!-- VIAJE -->
        <section class="scr" *ngIf="tab() === 'trip'">
          <div class="scroll">
            <div class="s-head"><h1>Planear viaje</h1><p>Traza tu ruta y encuentra dónde cargar en el camino.</p></div>
            <div class="field"><i class="fa-solid fa-location-dot" style="color:#3b82f6"></i><input [(ngModel)]="tripOrigin" placeholder="Origen (o «mi ubicación»)" /></div>
            <div class="field"><i class="fa-solid fa-flag-checkered" style="color:var(--accent)"></i><input [(ngModel)]="tripDest" placeholder="Destino: ciudad o dirección" (keyup.enter)="plan()" /></div>
            <div class="field"><i class="fa-solid fa-battery-three-quarters muted"></i><input type="number" [(ngModel)]="tripAutonomy" placeholder="Autonomía (km) — opcional" /></div>
            <div style="display:flex;gap:8px">
              <p-button label="Planear ruta" icon="fa-solid fa-route" (onClick)="plan()" [loading]="planning()" [disabled]="!tripDest.trim()" styleClass="grow-btn" />
              <p-button *ngIf="tripInfo()" label="Limpiar" [outlined]="true" (onClick)="clearTrip()" />
            </div>
            <p class="muted" *ngIf="tripMsg()" style="margin:10px 0">{{ tripMsg() }}</p>

            <div *ngIf="tripInfo() as t">
              <div class="kpis">
                <div class="kpi"><div class="v">{{ t.distanceKm }}</div><div class="l">km</div></div>
                <div class="kpi"><div class="v">{{ fmtDur(t.durationMin) }}</div><div class="l">duración</div></div>
                <div class="kpi"><div class="v">{{ tripStations().length }}</div><div class="l">en ruta</div></div>
              </div>
              <div class="prow" *ngIf="tripAutonomy" style="margin-bottom:14px">
                <span class="lbl">Autonomía</span>
                <div class="pbar" style="flex:1"><i [style.width.%]="autonomyPct(t.distanceKm)" [style.background]="autonomyPct(t.distanceKm) >= 100 ? '#ef4444' : 'var(--accent)'"></i></div>
                <span class="muted" style="font-size:.8rem;white-space:nowrap">{{ tripStopsCount() }} parada(s)</span>
              </div>
              <p-button label="Ver ruta en el mapa" icon="fa-solid fa-map-location-dot" [text]="true" (onClick)="setTab('map')" />
              <h3 class="sec" style="margin-top:12px">Estaciones en la ruta</h3>
              <div class="trow" *ngFor="let s of tripStations()" (click)="openDetail(s)" [class.stop]="isStop(s)">
                <span class="dot" [style.background]="statusColor(s.communityStatus)"></span>
                <div class="grow"><div class="nm">{{ s.name }}</div><div class="ds">{{ s.city }} · km {{ routeKm(s) }}</div></div>
                <span class="stopbadge" *ngIf="isStop(s)"><i class="fa-solid fa-bolt"></i> parada</span>
              </div>
              <p class="muted" *ngIf="!tripStations().length" style="padding:8px 0">No hay estaciones cerca de esta ruta con los datos actuales. Con cobertura nacional (Open Charge Map) habrá muchas más.</p>
            </div>
          </div>
        </section>

        <!-- INFO -->
        <section class="scr" *ngIf="tab() === 'info'">
          <div class="scroll">
            <div class="s-head"><h1>Información</h1><p>De dónde salen los datos y cómo funciona.</p></div>
            <div class="stat"><div class="n">{{ meta()?.total ?? '—' }}</div><div><div style="font-weight:700">Estaciones cargadas</div><div class="muted" style="font-size:.84rem">en {{ meta()?.cities ?? 0 }} ciudad(es)</div></div></div>
            <h3 class="sec">Fuentes de datos</h3>
            <div class="stat" *ngFor="let s of meta()?.bySource || []"><div class="n">{{ s.count }}</div><div><div style="font-weight:700">{{ sourceLabel(s.source) }}</div><div class="muted" style="font-size:.84rem">{{ sourceDesc(s.source) }}</div></div></div>
            <h3 class="sec">Estado (reportado por la comunidad)</h3>
            <div class="legend">
              <span><i class="d" style="background:#22c55e"></i> Activa</span>
              <span><i class="d" style="background:#ef4444"></i> Inactiva</span>
              <span><i class="d" style="background:#9aa3b2"></i> Sin reportes</span>
            </div>
            <p class="muted" style="font-size:.86rem">El estado en vivo no está en datos abiertos; lo construimos entre todos. Cuando uses una estación, reporta si está activa/ocupada y comenta.</p>
            <div class="note" *ngIf="meta() && !meta().openChargeMap" style="margin-top:12px">
              <b>Cobertura nacional activa</b> vía OpenStreetMap (comunidad) + EPM. Se puede sumar el catálogo de Open Charge Map como fuente extra opcional; no es necesario para usar la app.
            </div>
          </div>
        </section>
      </div>

      <!-- Bottom nav -->
      <nav class="bottomnav">
        <button [class.on]="tab() === 'near'" (click)="setTab('near')"><i class="fa-solid fa-house"></i><span>Inicio</span></button>
        <button [class.on]="tab() === 'map'" (click)="setTab('map')"><i class="fa-solid fa-map-location-dot"></i><span>Mapa</span></button>
        <button [class.on]="tab() === 'trip'" (click)="setTab('trip')"><i class="fa-solid fa-route"></i><span>Viaje</span></button>
        <button [class.on]="tab() === 'info'" (click)="setTab('info')"><i class="fa-solid fa-circle-info"></i><span>Info</span></button>
      </nav>

      <!-- Drawer (filtros / ajustes) -->
      <div class="scrim" *ngIf="drawer()" (click)="drawer.set(false)"></div>
      <aside class="drawer" [class.open]="drawer()">
        <div class="dh"><i class="fa-solid fa-sliders" style="margin-right:8px;color:var(--accent)"></i> Filtros
          <span class="spacer" style="flex:1"></span>
          <button class="icon-btn" (click)="drawer.set(false)"><i class="fa-solid fa-xmark"></i></button></div>
        <div class="db">
          <div><label>Ciudad</label>
            <select class="sel" [(ngModel)]="cityFilter" (ngModelChange)="applyFilters()">
              <option value="">Todas</option><option *ngFor="let c of cities()" [value]="c">{{ c }}</option>
            </select></div>
          <div><label>Tipo de conector</label>
            <select class="sel" [(ngModel)]="connectorFilter" (ngModelChange)="applyFilters()">
              <option value="">Todos</option><option value="CCS2">CCS2</option><option value="CHAdeMO">CHAdeMO</option><option value="Tipo 2">Tipo 2</option><option value="GB/T">GB/T</option>
            </select></div>
          <div><label>Velocidad</label>
            <select class="sel" [(ngModel)]="speedFilter" (ngModelChange)="applyFilters()">
              <option value="">Todas</option><option *ngFor="let s of speeds()" [value]="s">{{ s }}</option>
            </select></div>
          <p-button label="Limpiar filtros" [outlined]="true" icon="fa-solid fa-eraser" (onClick)="clearFilters()" />
          <p class="muted" style="font-size:.82rem">Tema claro/oscuro automático según tu dispositivo.</p>
        </div>
      </aside>

      <!-- Detalle (bottom sheet con tabs) -->
      <p-dialog [(visible)]="detailVisible" [modal]="true" [position]="'bottom'" [dismissableMask]="true"
                [style]="{ width: '100%', maxWidth: '640px' }" [header]="' '">
        <div *ngIf="detail() as d">
          <div class="d-head">
            <span class="dot" [style.background]="statusColor(d.communityStatus)" style="width:16px;height:16px;border-radius:50%;margin-top:5px"></span>
            <div class="grow"><h2>{{ d.name }}</h2>
              <div class="d-meta">{{ d.operator }}<span *ngIf="d.city"> · {{ d.city }}</span><span *ngIf="dist(d) as km"> · a {{ km }}</span></div></div>
            <p-tag [value]="statusLabel(d.communityStatus)" [severity]="statusSeverity(d.communityStatus)" />
          </div>

          <p-tabView>
            <p-tabPanel header="Info" leftIcon="fa-solid fa-circle-info">
              <ng-template pTemplate="content">
                <div class="kv">
                  <span class="k" *ngIf="d.speed"><i class="fa-solid fa-gauge-high"></i> {{ d.speed }}</span>
                  <span class="k" *ngIf="d.hours"><i class="fa-solid fa-clock"></i> {{ d.hours }}</span>
                  <a class="k" *ngIf="d.website" [href]="d.website" target="_blank" rel="noopener"><i class="fa-solid fa-up-right-from-square"></i> Sitio</a>
                </div>
                <div class="d-meta" *ngIf="d.address" style="margin-bottom:10px"><i class="fa-solid fa-location-dot"></i> {{ d.address }}</div>
                <h3 class="sec">¿Está funcionando?</h3>
                <div class="report-btns">
                  <p-button label="Activa" icon="fa-solid fa-circle-check" severity="success" [outlined]="d.communityStatus !== 'active'" (onClick)="reportStation('active')" />
                  <p-button label="Inactiva" icon="fa-solid fa-circle-xmark" severity="danger" [outlined]="d.communityStatus !== 'inactive'" (onClick)="reportStation('inactive')" />
                </div>
              </ng-template>
            </p-tabPanel>

            <p-tabPanel header="Cargadores" leftIcon="fa-solid fa-plug">
              <ng-template pTemplate="content">
                <div class="prow" style="margin:2px 0 14px" *ngIf="d.chargers?.length">
                  <span class="lbl">{{ freeCount(d) }} de {{ d.chargers.length }} libres</span>
                  <div class="pbar" style="flex:1"><i [style.width.%]="freePct(d)" style="background:#22c55e"></i></div>
                </div>
                <div class="charger" *ngFor="let c of d.chargers">
                  <div class="grow">
                    <div class="nm">{{ c.label }}</div>
                    <div class="muted" style="font-size:.82rem">{{ c.connectorType || '—' }}<span *ngIf="c.powerKw"> · {{ c.powerKw }} kW</span>
                      <span *ngIf="c.status"> · <b [style.color]="chargerColor(c.status)">{{ chargerLabel(c.status) }}</b></span></div>
                  </div>
                  <div class="cbtns">
                    <p-button label="Libre" size="small" severity="success" [text]="true" (onClick)="reportCharger(c, 'free')" />
                    <p-button label="Ocupado" size="small" severity="warn" [text]="true" (onClick)="reportCharger(c, 'busy')" />
                    <p-button label="Dañado" size="small" severity="danger" [text]="true" (onClick)="reportCharger(c, 'broken')" />
                  </div>
                </div>
                <p class="muted" *ngIf="!d.chargers?.length" style="padding:8px 0">Sin detalle de cargadores para esta estación.</p>
              </ng-template>
            </p-tabPanel>

            <p-tabPanel header="Comentarios" leftIcon="fa-solid fa-comments">
              <ng-template pTemplate="content">
                <div class="cmt-form">
                  <textarea [(ngModel)]="newComment" placeholder="Deja un comentario…"></textarea>
                  <p-button icon="fa-solid fa-paper-plane" (onClick)="sendComment()" [disabled]="!newComment.trim()" />
                </div>
                <div class="cmt" *ngFor="let k of comments()"><div class="who">{{ k.by }} <small>{{ fmtWhen(k.at) }}</small></div><div>{{ k.body }}</div></div>
                <p class="muted" *ngIf="!comments().length">Sé el primero en comentar.</p>
                <h3 class="sec" *ngIf="reports().length" style="margin-top:12px">Actividad reciente</h3>
                <div class="act" *ngFor="let r of reports()">
                  <span [style.color]="anyColor(r.status)">●</span>
                  <span>{{ r.by }} reportó <b>{{ anyLabel(r.status) }}</b><span *ngIf="r.charger"> en {{ r.charger }}</span></span>
                  <span class="spacer" style="flex:1"></span><span class="muted">{{ fmtWhen(r.at) }}</span>
                </div>
              </ng-template>
            </p-tabPanel>
          </p-tabView>
        </div>
      </p-dialog>
    </div>
  `,
})
export class AppComponent implements OnInit, AfterViewInit {
  private api = inject(ElectrolinerasService);
  @ViewChild('mapEl') mapEl!: ElementRef<HTMLDivElement>;

  readonly isTest = signal(false);
  readonly tab = signal<Tab>('near');
  readonly drawer = signal(false);
  readonly stations = signal<Station[]>([]);
  readonly filtered = signal<Station[]>([]);
  readonly loaded = signal(false);
  readonly meta = signal<any>(null);
  query = ''; cityFilter = ''; connectorFilter = ''; speedFilter = '';
  readonly cities = computed(() => [...new Set(this.stations().map((s) => s.city).filter(Boolean))].sort());
  readonly speeds = computed(() => [...new Set(this.stations().map((s) => s.speed).filter(Boolean))].sort());
  readonly activeCount = computed(() => this.stations().filter((s) => s.communityStatus === 'active').length);

  readonly detail = signal<StationFull | null>(null);
  detailVisible = false;
  readonly comments = signal<Comment[]>([]);
  readonly reports = signal<Report[]>([]);
  newComment = '';

  // Ubicación
  readonly userPos = signal<[number, number] | null>(null);
  readonly locating = signal(false);

  // Viaje
  tripOrigin = ''; tripDest = ''; tripAutonomy: number | null = null;
  readonly planning = signal(false);
  readonly tripMsg = signal('');
  readonly tripInfo = signal<{ distanceKm: number; durationMin: number } | null>(null);
  readonly tripStations = signal<Station[]>([]);
  readonly tripStops = signal<Set<number>>(new Set());
  private routePos = new Map<number, number>();

  private map?: L.Map;
  private markers = L.layerGroup();
  private routeLayer = L.layerGroup();
  private userMarker?: L.Marker;

  ngOnInit(): void {
    this.api.health().subscribe({ next: (h) => this.isTest.set(h.env === 'test'), error: () => {} });
    this.api.meta().subscribe({ next: (m) => this.meta.set(m), error: () => {} });
    this.api.stations().subscribe({
      next: (s) => { this.stations.set(s); this.applyFilters(); this.loaded.set(true); this.renderMarkers(); },
      error: () => this.loaded.set(true),
    });
  }

  private tiles?: L.TileLayer;
  private isDark(): boolean { return typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)').matches : false; }
  private tileUrl(): string {
    // Calles coloridas (voyager) de día, oscuro de noche. El tinte verde
    // temático se aplica por CSS sobre las teselas.
    return this.isDark()
      ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
      : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
  }

  ngAfterViewInit(): void {
    this.map = L.map(this.mapEl.nativeElement, { zoomControl: false, attributionControl: true }).setView([4.65, -74.1], 6);
    L.control.zoom({ position: 'bottomright' }).addTo(this.map);
    this.tiles = L.tileLayer(this.tileUrl(), { maxZoom: 20, subdomains: 'abcd', detectRetina: true, attribution: '© OpenStreetMap · © CARTO' }).addTo(this.map);
    window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', () => this.tiles?.setUrl(this.tileUrl()));
    this.markers.addTo(this.map);
    this.routeLayer.addTo(this.map);
    this.renderMarkers();
    this.locate();
  }

  setTab(t: Tab): void {
    this.tab.set(t);
    if (t === 'map') setTimeout(() => { this.map?.invalidateSize(); this.fitVisible(); }, 80);
  }
  clearFilters(): void { this.cityFilter = ''; this.connectorFilter = ''; this.speedFilter = ''; this.query = ''; this.applyFilters(); this.drawer.set(false); }
  tint(s: string | null): string { const c = this.statusColor(s); return `linear-gradient(135deg, ${c}26, ${c}0d)`; }

  // ── Ubicación ──
  locate(): void {
    if (!navigator.geolocation) return;
    this.locating.set(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this.locating.set(false);
        const p: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        this.userPos.set(p);
        if (this.map) {
          if (this.tab() === 'map') this.map.setView(p, 12);
          const icon = L.divIcon({ className: '', html: '<div class="me"></div>', iconSize: [18, 18], iconAnchor: [9, 9] });
          if (this.userMarker) this.userMarker.setLatLng(p); else this.userMarker = L.marker(p, { icon, zIndexOffset: 1000 }).addTo(this.map);
        }
        this.applyFilters();
      },
      () => this.locating.set(false),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }
  private distanceKm(a: [number, number], b: [number, number]): number {
    const R = 6371, toRad = (x: number) => (x * Math.PI) / 180;
    const dLat = toRad(b[0] - a[0]), dLon = toRad(b[1] - a[1]);
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  }
  dist(s: { lat: number; lon: number }): string {
    const u = this.userPos();
    if (!u || s.lat == null || s.lon == null) return '';
    const km = this.distanceKm(u, [s.lat, s.lon]);
    return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
  }

  // ── Filtros / mapa ──
  private matchConnector(connectors: string, type: string): boolean {
    const u = (connectors || '').toUpperCase();
    if (type === 'CCS2') return u.includes('CCS') || u.includes('COMBO');
    if (type === 'CHAdeMO') return u.includes('CHADEMO');
    if (type === 'Tipo 2') return u.includes('MENNEKES') || u.includes('TIPO 2') || u.includes('TYPE 2') || u.includes('EUROPEO');
    if (type === 'GB/T') return u.includes('GBT') || u.includes('GB/T') || u.includes('GB T');
    return true;
  }
  applyFilters(): void {
    const q = this.query.trim().toLowerCase(), city = this.cityFilter, conn = this.connectorFilter, speed = this.speedFilter, u = this.userPos();
    const list = this.stations().filter((s) => {
      if (city && s.city !== city) return false;
      if (speed && s.speed !== speed) return false;
      if (conn && !this.matchConnector(s.connectors, conn)) return false;
      if (!q) return true;
      return (s.name + ' ' + s.city + ' ' + s.address + ' ' + s.connectors).toLowerCase().includes(q);
    });
    if (u) list.sort((a, b) => this.distanceKm(u, [a.lat, a.lon]) - this.distanceKm(u, [b.lat, b.lon]));
    this.filtered.set(list);
    this.renderMarkers();
  }
  private renderMarkers(): void {
    if (!this.map) return;
    this.markers.clearLayers();
    for (const s of this.filtered()) {
      if (s.lat == null || s.lon == null) continue;
      const color = this.statusColor(s.communityStatus);
      const live = s.communityStatus === 'active' ? ' live' : '';
      const icon = L.divIcon({ className: '', html: `<div class="pin${live}" style="background:${color};color:${color}"><i class="fa-solid fa-bolt"></i></div>`, iconSize: [30, 30], iconAnchor: [15, 30] });
      L.marker([s.lat, s.lon], { icon }).addTo(this.markers).on('click', () => this.openDetail(s));
    }
    this.fitVisible();
  }
  private fitVisible(): void {
    if (this.tripInfo()) return; // no re-encuadrar si hay una ruta activa
    const pts = this.filtered().filter((s) => s.lat != null && s.lon != null).map((s) => [s.lat, s.lon] as [number, number]);
    if (this.map && pts.length) { try { this.map.fitBounds(L.latLngBounds(pts).pad(0.2), { maxZoom: 13 }); } catch { } }
  }

  // ── Detalle ──
  openDetail(s: Station): void {
    this.detail.set(null); this.comments.set([]); this.reports.set([]); this.newComment = '';
    this.detailVisible = true;
    this.api.station(s.id).subscribe({ next: (d) => this.detail.set(d), error: () => {} });
    this.api.comments(s.id).subscribe({ next: (c) => this.comments.set(c), error: () => {} });
    this.api.reports(s.id).subscribe({ next: (r) => this.reports.set(r), error: () => {} });
  }
  private refreshDetail(): void {
    const d = this.detail(); if (!d) return;
    this.api.station(d.id).subscribe({ next: (x) => this.detail.set(x), error: () => {} });
    this.api.reports(d.id).subscribe({ next: (r) => this.reports.set(r), error: () => {} });
    this.api.stations().subscribe({ next: (s) => { this.stations.set(s); this.applyFilters(); }, error: () => {} });
  }
  reportStation(status: string): void { const d = this.detail(); if (d) this.api.report(d.id, null, status).subscribe({ next: () => this.refreshDetail(), error: () => {} }); }
  reportCharger(c: Charger, status: string): void { const d = this.detail(); if (d) this.api.report(d.id, c.id, status).subscribe({ next: () => this.refreshDetail(), error: () => {} }); }
  sendComment(): void {
    const d = this.detail(); if (!d || !this.newComment.trim()) return;
    this.api.addComment(d.id, this.newComment).subscribe({ next: () => { this.newComment = ''; this.api.comments(d.id).subscribe((c) => this.comments.set(c)); }, error: () => {} });
  }
  freeCount(d: StationFull): number { return (d.chargers || []).filter((c) => c.status === 'free').length; }
  freePct(d: StationFull): number { const n = d.chargers?.length || 0; return n ? (this.freeCount(d) / n) * 100 : 0; }

  // ── Viaje ──
  fmtDur(min: number): string { const h = Math.floor(min / 60), m = Math.round(min % 60); return h ? `${h}h ${m}m` : `${m}m`; }
  isStop(s: Station): boolean { return this.tripStops().has(s.id); }
  routeKm(s: Station): number { return Math.round(this.routePos.get(s.id) ?? 0); }
  tripStopsCount(): number { return this.tripStops().size; }
  autonomyPct(distanceKm: number): number { const a = this.tripAutonomy; return a && a > 0 ? Math.min(100, Math.round((distanceKm / a) * 100)) : 0; }
  clearTrip(): void { this.routeLayer.clearLayers(); this.tripInfo.set(null); this.tripStations.set([]); this.tripStops.set(new Set()); this.tripMsg.set(''); }

  plan(): void {
    if (!this.tripDest.trim()) return;
    this.planning.set(true); this.tripMsg.set('');
    this.resolveOrigin().then((origin) => {
      if (!origin) { this.planning.set(false); this.tripMsg.set('No pude ubicar el origen. Escríbelo o usa «mi ubicación».'); return; }
      this.api.geocode(this.tripDest).subscribe({
        next: (places) => {
          if (!places.length) { this.planning.set(false); this.tripMsg.set('No encontré ese destino en Colombia.'); return; }
          const dest: [number, number] = [places[0].lat, places[0].lon];
          this.api.route(origin, dest).subscribe({
            next: (r) => { this.planning.set(false); this.drawRoute(origin, dest, r); },
            error: () => { this.planning.set(false); this.tripMsg.set('No pude calcular la ruta (intenta de nuevo).'); },
          });
        },
        error: () => { this.planning.set(false); this.tripMsg.set('No pude buscar el destino.'); },
      });
    });
  }
  private resolveOrigin(): Promise<[number, number] | null> {
    const o = this.tripOrigin.trim().toLowerCase();
    if (!o || o === 'mi ubicación' || o === 'mi ubicacion') {
      const u = this.userPos();
      if (u) return Promise.resolve(u);
      return new Promise((res) => {
        if (!navigator.geolocation) { res(null); return; }
        navigator.geolocation.getCurrentPosition((p) => { const pt: [number, number] = [p.coords.latitude, p.coords.longitude]; this.userPos.set(pt); res(pt); }, () => res(null), { timeout: 8000 });
      });
    }
    return new Promise((res) => { this.api.geocode(this.tripOrigin).subscribe({ next: (pl) => res(pl.length ? [pl[0].lat, pl[0].lon] : null), error: () => res(null) }); });
  }
  private drawRoute(origin: [number, number], dest: [number, number], r: { distanceKm: number; durationMin: number; coordinates: [number, number][] }): void {
    if (!r || !r.coordinates || !r.coordinates.length) { this.tripMsg.set('Ruta no disponible.'); return; }
    this.tripInfo.set({ distanceKm: r.distanceKm, durationMin: r.durationMin });
    this.routeLayer.clearLayers();
    L.polyline(r.coordinates as L.LatLngExpression[], { color: '#22c55e', weight: 5, opacity: 0.85 }).addTo(this.routeLayer);
    const mk = (cls: string) => L.divIcon({ className: '', html: `<div class="od ${cls}"></div>`, iconSize: [16, 16], iconAnchor: [8, 8] });
    L.marker(origin, { icon: mk('o') }).addTo(this.routeLayer);
    L.marker(dest, { icon: mk('d') }).addTo(this.routeLayer);
    if (this.map) { this.map.invalidateSize(); this.map.fitBounds(L.latLngBounds(r.coordinates as L.LatLngExpression[]).pad(0.15)); }
    this.computeAlongRoute(r.coordinates);
  }
  private computeAlongRoute(coords: [number, number][]): void {
    const cum: number[] = [0];
    for (let i = 1; i < coords.length; i++) cum[i] = cum[i - 1] + this.distanceKm(coords[i - 1], coords[i]);
    const THRESH = 8, step = Math.max(1, Math.floor(coords.length / 400));
    const near: { s: Station; pos: number }[] = [];
    this.routePos.clear();
    for (const s of this.stations()) {
      if (s.lat == null || s.lon == null) continue;
      let best = Infinity, bestIdx = 0;
      for (let i = 0; i < coords.length; i += step) { const d = this.distanceKm([s.lat, s.lon], coords[i]); if (d < best) { best = d; bestIdx = i; } }
      if (best <= THRESH) { near.push({ s, pos: cum[bestIdx] }); this.routePos.set(s.id, cum[bestIdx]); }
    }
    near.sort((a, b) => a.pos - b.pos);
    this.tripStations.set(near.map((n) => n.s));
    const stops = new Set<number>(); const a = this.tripAutonomy;
    if (a && a > 0 && near.length) {
      const range = a * 0.9; let lastPos = 0, candidate: { s: Station; pos: number } | null = null;
      for (const n of near) { if (n.pos - lastPos <= range) candidate = n; else { if (candidate) { stops.add(candidate.s.id); lastPos = candidate.pos; } candidate = n; } }
    }
    this.tripStops.set(stops);
  }

  // ── Estado / colores / textos ──
  statusColor(s: string | null): string { return s === 'active' ? '#22c55e' : s === 'inactive' ? '#ef4444' : '#9aa3b2'; }
  statusLabel(s: string | null): string { return s === 'active' ? 'Activa' : s === 'inactive' ? 'Inactiva' : 'Sin reportes'; }
  statusSeverity(s: string | null): 'success' | 'danger' | 'secondary' { return s === 'active' ? 'success' : s === 'inactive' ? 'danger' : 'secondary'; }
  chargerColor(s: string): string { return s === 'free' ? '#22c55e' : s === 'busy' ? '#f59e0b' : s === 'broken' ? '#ef4444' : '#9aa3b2'; }
  chargerLabel(s: string): string { return s === 'free' ? 'Libre' : s === 'busy' ? 'Ocupado' : s === 'broken' ? 'Dañado' : s; }
  anyColor(s: string): string { return s === 'active' || s === 'free' ? '#22c55e' : s === 'inactive' || s === 'broken' ? '#ef4444' : s === 'busy' ? '#f59e0b' : '#9aa3b2'; }
  anyLabel(s: string): string { const m: Record<string, string> = { active: 'activa', inactive: 'inactiva', free: 'libre', busy: 'ocupado', broken: 'dañado' }; return m[s] || s; }
  sourceLabel(s: string): string {
    return s === 'datos_gov_epm' ? 'datos.gov.co (EPM)' : s === 'openstreetmap' ? 'OpenStreetMap' : s === 'openchargemap' ? 'Open Charge Map' : s;
  }
  sourceDesc(s: string): string {
    return s === 'datos_gov_epm' ? 'Datos abiertos del gobierno · Antioquia'
      : s === 'openstreetmap' ? 'Comunidad OSM · cobertura nacional'
      : s === 'openchargemap' ? 'Comunidad · cobertura nacional' : 'Fuente de datos';
  }
  fmtWhen(s: string): string { if (!s) return ''; const d = new Date(s.replace(' ', 'T')); return isNaN(d.getTime()) ? s : d.toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }); }
}
