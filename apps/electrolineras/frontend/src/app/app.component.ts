import { AfterViewInit, Component, ElementRef, NgZone, OnInit, ViewChild, computed, inject, signal } from '@angular/core';
import { NgFor, NgIf, SlicePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { TabViewModule } from 'primeng/tabview';
import { TagModule } from 'primeng/tag';
import * as L from 'leaflet';
import '@maplibre/maplibre-gl-leaflet'; // añade L.maplibreGL (capa base vectorial)
import { Charger, Comment, ElectrolinerasService, Report, Station, StationFull } from './electrolineras.service';

type Tab = 'map' | 'near' | 'trip' | 'info';

/** Una opción de ruta ya analizada (estaciones, compatibilidad, alcance). */
interface RouteOpt {
  distanceKm: number;
  durationMin: number;
  via: string;                     // vías principales por las que pasa
  coordinates: [number, number][];
  stations: Station[];              // estaciones cercanas a esta ruta (ordenadas)
  routePos: Map<number, number>;    // id → km sobre la ruta
  stops: Set<number>;              // paradas de carga sugeridas (compatibles)
  compatible: number;              // nº de estaciones compatibles en la ruta
  total: number;                   // nº total de estaciones en la ruta
  reachKm: number;                 // hasta dónde alcanzas encadenando cargas compatibles
  reachable: boolean;              // ¿llegas al destino?
  reachableWithAdapter: boolean;   // ¿llegarías si usaras un adaptador?
}

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
    .scard .ic .livedot { position: absolute; top: -2px; right: -2px; width: 12px; height: 12px; border-radius: 50%; background: #22c55e; color: #22c55e; border: 2px solid var(--panel); animation: pdot 1.8s infinite; }
    .scard .grow { flex: 1; min-width: 0; }
    .scard .nm { font-weight: 700; }
    .scard .meta { color: var(--muted); font-size: .84rem; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .scard .chips { display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap; }
    .scard .right { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; flex: none; }
    .scard .km { font-weight: 700; font-size: .9rem; white-space: nowrap; }
    .chip { display: inline-flex; align-items: center; gap: 5px; font-size: .72rem; padding: 4px 10px; border-radius: 999px; background: var(--panel-2); border: 1px solid var(--border); white-space: nowrap; color: var(--muted); }
    .chip i { color: var(--accent); font-size: .68rem; }
    /* Chip de conector, coloreado por estándar */
    .cchip { display: inline-flex; align-items: center; font-size: .72rem; font-weight: 700; padding: 4px 10px; border-radius: 999px; white-space: nowrap;
             color: var(--cc); background: color-mix(in srgb, var(--cc) 16%, transparent); border: 1px solid color-mix(in srgb, var(--cc) 42%, transparent); }
    /* Chip de velocidad, coloreado por tipo de carga */
    .chip.spd { color: var(--sc); font-weight: 700; background: color-mix(in srgb, var(--sc) 12%, var(--panel-2)); border-color: color-mix(in srgb, var(--sc) 40%, var(--border)); }
    .chip.spd i { color: var(--sc); }
    /* Badges de fuente de datos (agregación) */
    .sbadges { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 9px; }
    .sbadge { display: inline-flex; align-items: center; gap: 5px; font-size: .62rem; font-weight: 800; letter-spacing: .4px; text-transform: uppercase;
              padding: 3px 8px; border-radius: 7px; color: var(--sb); background: color-mix(in srgb, var(--sb) 14%, transparent); border: 1px solid color-mix(in srgb, var(--sb) 36%, transparent); }
    .sbadge i { font-size: .58rem; opacity: .85; }
    /* Banda de "carga rápida" en el detalle */
    .speedband { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border-radius: 14px; margin: 4px 0 12px;
                 color: #fff; background: linear-gradient(135deg, var(--sc), color-mix(in srgb, var(--sc) 55%, #0b0e14)); box-shadow: 0 8px 22px color-mix(in srgb, var(--sc) 32%, transparent); }
    .speedband .bi { font-size: 1.35rem; width: 40px; height: 40px; border-radius: 12px; display: grid; place-items: center; background: rgba(255,255,255,.18); flex: none; }
    .speedband .bt { font-weight: 800; font-size: 1.02rem; line-height: 1.1; }
    .speedband .bs { font-size: .76rem; opacity: .9; }

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
    .kpi.hi { border-color: color-mix(in srgb, var(--accent) 45%, var(--border)); background: color-mix(in srgb, var(--accent) 10%, var(--panel)); }
    /* Selector de conectores del conductor (multi) */
    .connpick { margin: 4px 0 10px; }
    .connpick label { font-size: .82rem; font-weight: 700; }
    .connpick .pick-hint { margin: 2px 0 8px; color: var(--muted); font-size: .78rem; }
    .connpick .chips { display: flex; gap: 8px; flex-wrap: wrap; }
    .pchip { display: inline-flex; align-items: center; gap: 6px; font-size: .8rem; font-weight: 700; padding: 7px 12px; border-radius: 999px; cursor: pointer;
             color: var(--muted); background: var(--panel-2); border: 1px solid var(--border); transition: all .15s ease; }
    .pchip i { font-size: .72rem; opacity: .7; }
    .pchip.on { color: var(--cc); background: color-mix(in srgb, var(--cc) 16%, transparent); border-color: color-mix(in srgb, var(--cc) 55%, transparent); }
    .pchip.on i { opacity: 1; color: var(--cc); }
    /* Reparto por velocidad de compatibles */
    .spbreak { display: flex; gap: 8px; margin: 0 0 12px; }
    .spb { flex: 1; text-align: center; font-size: .74rem; color: var(--muted); padding: 8px 4px; border-radius: 12px;
           background: color-mix(in srgb, var(--sc) 12%, var(--panel)); border: 1px solid color-mix(in srgb, var(--sc) 30%, var(--border)); }
    .spb b { display: block; font-size: 1.15rem; color: var(--sc); }
    .triprow { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
    .toggle { display: inline-flex; align-items: center; gap: 6px; font-size: .82rem; color: var(--muted); cursor: pointer; }
    .trow.incompat { opacity: .5; }
    /* Opciones de ruta alternativas */
    .routeopts { display: flex; flex-direction: column; gap: 8px; margin: 0 0 12px; }
    .ropt { width: 100%; text-align: left; display: flex; flex-direction: column; gap: 4px; cursor: pointer;
            padding: 12px 14px; border-radius: 14px; border: 1px solid var(--border); background: var(--panel); color: var(--fg); transition: all .15s ease; }
    .ropt.on { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, var(--panel)); box-shadow: var(--glow); }
    .ropt .rhead { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
    .ropt .rtitle { font-weight: 800; font-size: .95rem; }
    .ropt .rmeta { color: var(--muted); font-size: .82rem; white-space: nowrap; }
    .ropt .rvia { color: var(--muted); font-size: .8rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .ropt .rvia i { color: var(--accent); font-size: .72rem; margin-right: 4px; }
    .ropt .rtags { display: flex; gap: 6px; margin-top: 2px; flex-wrap: wrap; }
    .ropt .rt { font-size: .68rem; font-weight: 700; padding: 2px 7px; border-radius: 999px; background: var(--panel-2); color: var(--muted); display: inline-flex; align-items: center; gap: 4px; }
    .ropt .rt.ok { color: #16a34a; background: color-mix(in srgb, #22c55e 15%, transparent); }
    .ropt .rt.bad { color: #ef4444; background: color-mix(in srgb, #ef4444 14%, transparent); }
    /* Banner de alcance */
    .reachbanner { display: flex; align-items: flex-start; gap: 10px; padding: 12px 14px; border-radius: 14px; margin: 0 0 12px; font-size: .86rem; border: 1px solid var(--border); }
    .reachbanner i { font-size: 1.15rem; margin-top: 1px; flex: none; }
    .reachbanner.ok { background: color-mix(in srgb, #22c55e 10%, var(--panel)); border-color: color-mix(in srgb, #22c55e 35%, var(--border)); }
    .reachbanner.ok i { color: #22c55e; }
    .reachbanner.bad { background: color-mix(in srgb, #ef4444 9%, var(--panel)); border-color: color-mix(in srgb, #ef4444 32%, var(--border)); }
    .reachbanner.bad i { color: #ef4444; }
    .okbadge { width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; flex: none;
               color: #fff; background: #22c55e; font-size: .7rem; }
    /* Aviso sobre el mapa (acércate / cargando) */
    .maphint { position: absolute; top: 64px; left: 50%; transform: translateX(-50%); z-index: 20; white-space: nowrap;
               display: flex; align-items: center; gap: 8px; font-size: .82rem; font-weight: 600; color: var(--fg);
               background: var(--glass); backdrop-filter: blur(12px); border: 1px solid var(--border); border-radius: 999px; padding: 8px 14px; box-shadow: var(--shadow); }
    .maphint i { color: var(--accent); }
    /* Controles sobre el mapa cuando hay una ruta (volver / quitar) */
    .mapctl { position: absolute; top: 64px; left: 12px; z-index: 20; display: flex; gap: 8px; }
    .mapctl button { width: 40px; height: 40px; border-radius: 12px; border: 1px solid var(--border); background: var(--glass); backdrop-filter: blur(12px); color: var(--fg); cursor: pointer; font-size: 1rem; box-shadow: var(--shadow); }

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
    .adminbox { margin-top: 6px; padding: 14px; border-radius: 14px; border: 1px dashed color-mix(in srgb, var(--accent) 40%, var(--border)); background: color-mix(in srgb, var(--accent) 6%, var(--panel)); }
    .adminbox > label { display: block; margin-bottom: 6px; }

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
    .dstate { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 34px 20px; text-align: center; color: var(--muted); }
    .dstate i { font-size: 1.6rem; color: var(--accent); }
    .dstate p { margin: 0; }
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
            <input [(ngModel)]="query" (ngModelChange)="onFiltersChange()" placeholder="Filtrar lo visible…" />
            <button [class.on]="!!userPos()" (click)="locate()" title="Mi ubicación"><i class="fa-solid fa-location-crosshairs"></i></button>
          </div>
          <div class="mapctl" *ngIf="tripInfo()">
            <button (click)="setTab('trip')" title="Volver al viaje"><i class="fa-solid fa-arrow-left"></i></button>
            <button (click)="clearTripAndStay()" title="Quitar ruta"><i class="fa-solid fa-xmark"></i></button>
          </div>
          <div class="maphint" *ngIf="mapZoomLow() && !tripInfo()"><i class="fa-solid fa-magnifying-glass-plus"></i> Acércate para ver las estaciones del área</div>
          <div class="maphint load" *ngIf="!mapZoomLow() && mapLoading()"><i class="fa-solid fa-spinner fa-spin"></i> Cargando estaciones…</div>
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
                <span class="hchip"><i class="fa-solid fa-layer-group"></i> {{ meta()?.bySource?.length ?? 0 }} fuentes</span>
                <span class="hchip" (click)="locate()"><i class="fa-solid fa-location-crosshairs"></i> {{ userPos() ? 'Ubicado' : 'Ubicarme' }}</span>
              </div>
            </div>
            <div class="prompt" *ngIf="!userPos()">
              <div class="big">📍</div><h2>¿Dónde estás?</h2>
              <p class="muted">Comparte tu ubicación para ver las electrolineras más cercanas primero.</p>
              <p-button label="Usar mi ubicación" icon="fa-solid fa-location-crosshairs" (onClick)="locate()" [loading]="locating()" styleClass="mt" />
            </div>
            <div class="cards">
              <div class="scard" *ngFor="let s of filtered()" (click)="openDetail(s)" [style.--c]="speedColor(s.speed)">
                <span class="ic"><i class="fa-solid fa-bolt"></i><span class="livedot" *ngIf="s.communityStatus === 'active'"></span></span>
                <div class="grow">
                  <div class="nm">{{ s.name }}</div>
                  <div class="meta">{{ s.operator || 'Operador' }} · {{ s.city }}</div>
                  <div class="chips">
                    <span class="chip spd" *ngIf="s.speed" [style.--sc]="speedColor(s.speed)"><i class="fa-solid fa-gauge-high"></i> {{ s.speed }}</span>
                    <span class="cchip" *ngFor="let ct of connList(s.connectors)" [style.--cc]="connColor(ct)">{{ ct }}</span>
                  </div>
                  <div class="sbadges" *ngIf="s.sources?.length">
                    <span class="sbadge" *ngFor="let src of s.sources" [style.--sb]="sourceColor(src)">{{ sourceShort(src) }}</span>
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

            <div class="connpick">
              <label>¿Qué conectores puedes usar?</label>
              <p class="pick-hint">Marca todos los que tengas, incluidos los de adaptador.</p>
              <div class="chips">
                <button type="button" class="pchip" *ngFor="let ct of CONNECTOR_TYPES"
                        [class.on]="tripConnectors().includes(ct)"
                        [style.--cc]="connColor(ct)" (click)="toggleConnector(ct)">
                  <i class="fa-solid fa-plug"></i> {{ ct }}
                </button>
              </div>
            </div>

            <div style="display:flex;gap:8px">
              <p-button label="Planear ruta" icon="fa-solid fa-route" (onClick)="plan()" [loading]="planning()" [disabled]="!tripDest.trim()" styleClass="grow-btn" />
              <p-button *ngIf="tripInfo()" label="Limpiar" [outlined]="true" (onClick)="clearTrip()" />
            </div>
            <p class="muted" *ngIf="tripMsg()" style="margin:10px 0">{{ tripMsg() }}</p>

            <div *ngIf="tripInfo() as t">
              <div class="kpis">
                <div class="kpi"><div class="v">{{ t.distanceKm }}</div><div class="l">km</div></div>
                <div class="kpi"><div class="v">{{ fmtDur(t.durationMin) }}</div><div class="l">duración</div></div>
                <div class="kpi" [class.hi]="tripConnectors().length">
                  <div class="v">{{ tripConnectors().length ? tripCompatible().length : tripStations().length }}</div>
                  <div class="l">{{ tripConnectors().length ? 'compatibles' : 'en ruta' }}</div>
                </div>
              </div>

              <!-- Opciones de ruta (estilo Waze/Maps) -->
              <h3 class="sec" *ngIf="routeOptions().length" style="margin:2px 0 8px">
                {{ routeOptions().length > 1 ? routeOptions().length + ' rutas — elige una' : 'Tu ruta' }}
              </h3>
              <div class="routeopts" *ngIf="routeOptions().length">
                <button class="ropt" *ngFor="let o of routeOptions(); let i = index" [class.on]="activeIdx() === i" (click)="selectRoute(i)">
                  <div class="rhead"><span class="rtitle">Ruta {{ i + 1 }}</span><span class="rmeta">{{ o.distanceKm }} km · {{ fmtDur(o.durationMin) }}</span></div>
                  <div class="rvia" *ngIf="o.via"><i class="fa-solid fa-road"></i> {{ o.via }}</div>
                  <div class="rtags">
                    <span class="rt" [class.ok]="o.reachable" [class.bad]="!o.reachable">
                      <i class="fa-solid" [class.fa-circle-check]="o.reachable" [class.fa-circle-exclamation]="!o.reachable"></i>
                      {{ o.reachable ? 'Llegas' : (o.reachableWithAdapter ? 'Con adaptador' : 'No llegas') }}
                    </span>
                    <span class="rt" *ngIf="tripConnectors().length"><i class="fa-solid fa-plug"></i> {{ o.compatible }} compat.</span>
                    <span class="rt" *ngIf="tripAutonomy && o.stops.size"><i class="fa-solid fa-bolt"></i> {{ o.stops.size }} parada(s)</span>
                  </div>
                </button>
              </div>

              <!-- Estado de alcance de la ruta activa -->
              <div class="reachbanner" *ngIf="tripAutonomy && activeRoute() as ar" [class.ok]="ar.reachable" [class.bad]="!ar.reachable">
                <i class="fa-solid" [class.fa-circle-check]="ar.reachable" [class.fa-battery-quarter]="!ar.reachable"></i>
                <div *ngIf="ar.reachable">Llegas al destino{{ tripConnectors().length ? ' encadenando cargadores compatibles' : '' }} ({{ tripStopsCount() }} parada(s)).</div>
                <div *ngIf="!ar.reachable">
                  Con {{ tripAutonomy }} km de autonomía{{ tripConnectors().length ? ' y tus conectores' : '' }} llegas ~{{ roundKm(ar.reachKm) }} de {{ ar.distanceKm }} km.
                  <span *ngIf="ar.reachableWithAdapter"><b>Con un adaptador</b> sí completarías la ruta.</span>
                  <span *ngIf="!ar.reachableWithAdapter">Faltan cargadores en el tramo final.</span>
                </div>
              </div>

              <!-- Reparto por velocidad de las estaciones compatibles -->
              <div class="spbreak" *ngIf="tripConnectors().length && tripCompatible().length">
                <span class="spb" [style.--sc]="speedColor('Rápida')"><b>{{ tripBySpeed().fast }}</b> rápida</span>
                <span class="spb" [style.--sc]="speedColor('Semi-rápida')"><b>{{ tripBySpeed().semi }}</b> semi</span>
                <span class="spb" [style.--sc]="speedColor('Lenta')"><b>{{ tripBySpeed().slow }}</b> lenta</span>
              </div>
              <p class="muted" *ngIf="tripConnectors().length && !tripCompatible().length" style="margin:2px 0 10px">
                <i class="fa-solid fa-triangle-exclamation" style="color:#f59e0b"></i>
                Ninguna estación de la ruta tiene tus conectores. Considera un adaptador o revisa otra ruta.
              </p>

              <div class="prow" *ngIf="tripAutonomy" style="margin-bottom:14px">
                <span class="lbl">Autonomía</span>
                <div class="pbar" style="flex:1"><i [style.width.%]="autonomyPct(t.distanceKm)" [style.background]="autonomyPct(t.distanceKm) >= 100 ? '#ef4444' : 'var(--accent)'"></i></div>
                <span class="muted" style="font-size:.8rem;white-space:nowrap">{{ tripStopsCount() }} parada(s)</span>
              </div>

              <div class="triprow">
                <p-button label="Ver ruta en el mapa" icon="fa-solid fa-map-location-dot" [text]="true" (onClick)="setTab('map')" />
                <label class="toggle" *ngIf="tripConnectors().length">
                  <input type="checkbox" [ngModel]="onlyCompatible()" (ngModelChange)="onlyCompatible.set($event)" /> Solo compatibles
                </label>
              </div>

              <h3 class="sec" style="margin-top:8px">Estaciones en la ruta</h3>
              <div class="trow" *ngFor="let s of tripListShown()" (click)="openDetail(s)"
                   [class.stop]="isStop(s)" [class.incompat]="tripConnectors().length && !isCompatible(s)">
                <span class="dot" [style.background]="speedColor(s.speed)"></span>
                <div class="grow">
                  <div class="nm">{{ s.name }}</div>
                  <div class="ds">{{ s.city }} · km {{ routeKm(s) }}<span *ngIf="s.speed"> · {{ s.speed }}</span></div>
                </div>
                <span class="okbadge" *ngIf="tripConnectors().length && isCompatible(s)" title="Compatible"><i class="fa-solid fa-check"></i></span>
                <span class="stopbadge" *ngIf="isStop(s)"><i class="fa-solid fa-bolt"></i> parada</span>
              </div>
              <p class="muted" *ngIf="!tripListShown().length" style="padding:8px 0">
                {{ tripConnectors().length && tripStations().length ? 'Ninguna estación compatible en la ruta.' : 'No hay estaciones cerca de esta ruta con los datos actuales.' }}
              </p>
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
            <h3 class="sec">Velocidad de carga (color del pin)</h3>
            <div class="legend">
              <span><i class="d" style="background:#f97316"></i> Rápida (DC)</span>
              <span><i class="d" style="background:#14b8a6"></i> Semi-rápida</span>
              <span><i class="d" style="background:#3b82f6"></i> Lenta (AC)</span>
              <span><i class="d" style="background:#9aa3b2"></i> Sin dato</span>
            </div>
            <h3 class="sec">Estado (reportado por la comunidad)</h3>
            <div class="legend">
              <span><i class="d" style="box-shadow:0 0 0 2px #22c55e inset;background:transparent;border:1px solid #22c55e"></i> Activa (anillo verde)</span>
              <span><i class="d" style="box-shadow:0 0 0 2px #ef4444 inset;background:transparent;border:1px solid #ef4444"></i> Inactiva (borde rojo)</span>
            </div>
            <p class="muted" style="font-size:.86rem">El estado en vivo no está en datos abiertos; lo construimos entre todos. Cuando uses una estación, reporta si está activa/ocupada y comenta.</p>
            <div class="note" style="margin-top:12px">
              <b>Agregación de fuentes.</b> Consolidamos varias fuentes de electrolineras de Colombia (OpenStreetMap, EPM, ESSA y —opcional— Open Charge Map) y unificamos las estaciones que están en el mismo punto para no repetir pines. Cada pin muestra las fuentes que lo respaldan.
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
            <select class="sel" [(ngModel)]="cityFilter" (ngModelChange)="onFiltersChange()">
              <option value="">Todas</option><option *ngFor="let c of cities()" [value]="c">{{ c }}</option>
            </select></div>
          <div><label>Tipo de conector</label>
            <select class="sel" [(ngModel)]="connectorFilter" (ngModelChange)="onFiltersChange()">
              <option value="">Todos</option><option value="CCS2">CCS2</option><option value="CHAdeMO">CHAdeMO</option><option value="Tipo 2">Tipo 2</option><option value="GB/T">GB/T</option>
            </select></div>
          <div><label>Velocidad</label>
            <select class="sel" [(ngModel)]="speedFilter" (ngModelChange)="onFiltersChange()">
              <option value="">Todas</option><option *ngFor="let s of speeds()" [value]="s">{{ s }}</option>
            </select></div>
          <p-button label="Limpiar filtros" [outlined]="true" icon="fa-solid fa-eraser" (onClick)="clearFilters()" />
          <p class="muted" style="font-size:.82rem">Tema claro/oscuro automático según tu dispositivo.</p>

          <div class="adminbox" *ngIf="isAdmin()">
            <label><i class="fa-solid fa-user-shield" style="color:var(--accent)"></i> Administración</label>
            <p class="muted" style="font-size:.8rem;margin:0 0 8px">Vacía la caché de las fuentes y vuelve a consultarlas ahora.</p>
            <p-button label="Limpiar caché" [outlined]="true" icon="fa-solid fa-broom" severity="danger"
                      [loading]="clearingCache()" (onClick)="clearCache()" />
            <p class="muted" *ngIf="cacheMsg()" style="font-size:.82rem;margin-top:8px">{{ cacheMsg() }}</p>
          </div>
        </div>
      </aside>

      <!-- Detalle (bottom sheet con tabs) -->
      <p-dialog [(visible)]="detailVisible" [modal]="true" [position]="'bottom'" [dismissableMask]="true"
                [style]="{ width: '100%', maxWidth: '640px' }" [header]="' '">
        <div class="dstate" *ngIf="!detail() && !detailError()">
          <i class="fa-solid fa-spinner fa-spin"></i> Cargando estación…
        </div>
        <div class="dstate" *ngIf="detailError()">
          <i class="fa-solid fa-triangle-exclamation" style="color:#ef4444"></i>
          <p>No se pudo cargar el detalle. Revisa tu conexión.</p>
          <p-button label="Reintentar" icon="fa-solid fa-rotate-right" (onClick)="retryDetail()" />
        </div>
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
                <div class="speedband" *ngIf="d.speed" [style.--sc]="speedColor(d.speed)">
                  <span class="bi"><i class="fa-solid fa-bolt"></i></span>
                  <div><div class="bt">Carga {{ d.speed.toLowerCase() }}</div><div class="bs">{{ speedDesc(d.speed) }}</div></div>
                </div>
                <div class="chips" *ngIf="connList(d.connectors).length" style="margin:2px 0 12px">
                  <span class="cchip" *ngFor="let ct of connList(d.connectors)" [style.--cc]="connColor(ct)">{{ ct }}</span>
                </div>
                <div class="kv">
                  <span class="k" *ngIf="d.hours"><i class="fa-solid fa-clock"></i> {{ d.hours }}</span>
                  <a class="k" *ngIf="d.website" [href]="d.website" target="_blank" rel="noopener"><i class="fa-solid fa-up-right-from-square"></i> Sitio</a>
                </div>
                <div class="d-meta" *ngIf="d.address" style="margin-bottom:8px"><i class="fa-solid fa-location-dot"></i> {{ d.address }}</div>
                <div class="sbadges" *ngIf="d.sources?.length" style="margin-bottom:12px">
                  <span class="sbadge" *ngFor="let src of d.sources" [style.--sb]="sourceColor(src)"><i class="fa-solid fa-database"></i> {{ sourceLabel(src) }}</span>
                </div>
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
  private zone = inject(NgZone);
  @ViewChild('mapEl') mapEl!: ElementRef<HTMLDivElement>;

  readonly isTest = signal(false);
  readonly isAdmin = signal(false);
  readonly clearingCache = signal(false);
  readonly cacheMsg = signal('');
  readonly tab = signal<Tab>('near');
  readonly drawer = signal(false);
  readonly stations = signal<Station[]>([]);      // cercanas al usuario (lista "Inicio")
  readonly mapStations = signal<Station[]>([]);    // cargadas según el área visible del mapa
  readonly mapZoomLow = signal(false);             // true → alejado: pedir acercarse
  readonly mapLoading = signal(false);
  readonly filtered = signal<Station[]>([]);
  readonly loaded = signal(false);
  readonly meta = signal<any>(null);
  query = ''; cityFilter = ''; connectorFilter = ''; speedFilter = '';
  private allLoaded(): Station[] { return [...this.mapStations(), ...this.stations()]; }
  readonly cities = computed(() => [...new Set(this.allLoaded().map((s) => s.city).filter(Boolean))].sort());
  readonly speeds = computed(() => [...new Set(this.allLoaded().map((s) => s.speed).filter(Boolean))].sort());
  readonly activeCount = computed(() => this.stations().filter((s) => s.communityStatus === 'active').length);

  readonly detail = signal<StationFull | null>(null);
  readonly detailError = signal(false);
  private detailStation: Station | null = null;
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
  readonly routeOptions = signal<RouteOpt[]>([]);
  readonly activeIdx = signal(0);
  private tripBounds?: L.LatLngBounds;

  // Conectores que puede usar el conductor (varios, por adaptadores). Persistido.
  readonly CONNECTOR_TYPES = ['CCS2', 'CHAdeMO', 'Tipo 2', 'Tipo 1', 'GB/T', 'Tesla'];
  readonly tripConnectors = signal<string[]>(this.loadConnectors());
  readonly onlyCompatible = signal(false);
  private loadConnectors(): string[] {
    try { const v = localStorage.getItem('elec.myConnectors'); return v ? JSON.parse(v) : []; } catch { return []; }
  }
  toggleConnector(t: string): void {
    const cur = this.tripConnectors();
    const next = cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t];
    this.tripConnectors.set(next);
    try { localStorage.setItem('elec.myConnectors', JSON.stringify(next)); } catch { }
  }
  /** ¿La estación tiene ALGUNO de los conectores elegidos? (sin elegir → todas). */
  isCompatible(s: Station): boolean {
    const sel = this.tripConnectors();
    if (!sel.length) return true;
    return sel.some((t) => this.matchConnector(s.connectors, t));
  }
  /** Estaciones de la ruta compatibles con los conectores elegidos. */
  readonly tripCompatible = computed(() => this.tripStations().filter((s) => this.isCompatible(s)));
  /** Reparto por velocidad de las compatibles: [rápida, semi, lenta]. */
  readonly tripBySpeed = computed(() => {
    const c = { fast: 0, semi: 0, slow: 0 };
    for (const s of this.tripCompatible()) {
      if (s.speed === 'Rápida') c.fast++;
      else if (s.speed === 'Semi-rápida') c.semi++;
      else c.slow++;
    }
    return c;
  });
  /** Lista mostrada en la ruta: todas o solo compatibles según el interruptor. */
  readonly tripListShown = computed(() =>
    this.onlyCompatible() ? this.tripCompatible() : this.tripStations());

  private map?: L.Map;
  private markers = L.layerGroup();
  private routeLayer = L.layerGroup();
  private userMarker?: L.Marker;

  ngOnInit(): void {
    this.api.health().subscribe({ next: (h) => this.isTest.set(h.env === 'test'), error: () => {} });
    this.api.meta().subscribe({ next: (m) => this.meta.set(m), error: () => {} });
    this.api.me().subscribe({ next: (u) => this.isAdmin.set(!!u.admin), error: () => {} });
    // Ya NO se cargan todas las estaciones al inicio: el mapa pide por área
    // visible y la lista "Inicio" pide alrededor del usuario al ubicarse.
  }

  private tiles?: any; // capa base MapLibre GL (vectorial)
  private isDark(): boolean { return typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)').matches : false; }

  // Capa base VECTORIAL (MapLibre + CARTO). Mapa limpio (positron/dark-matter) y
  // las VÍAS recoloreadas al verde temático de la app; el resto queda neutro.
  private addThemedBase(): void {
    if (!this.map) return;
    const dark = this.isDark();
    const key = (window as any).__CARTO_KEY || '';
    const style = dark
      ? 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'
      : 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';
    // Tono SUTIL estilo Waze: verdoso grisáceo, poco saturado (no compite con
    // los parques/zonas verdes ni satura el mapa).
    const road = dark ? '#5f8f7c' : '#a3c3b4';     // relleno de la vía
    const roadCase = dark ? '#436e5d' : '#6f9585'; // contorno de la vía
    if (this.tiles) { try { this.map.removeLayer(this.tiles); } catch { } this.tiles = undefined; }
    // El plugin añade `maplibreGL` al Leaflet en runtime (window.L); el namespace
    // `import * as L` puede no exponerlo, así que se toma del global.
    const LL: any = (window as any).L || (L as any);
    const gl = LL.maplibreGL({
      style,
      attribution: '© OpenStreetMap © CARTO',
      // Añade la API key de CARTO (si está) a TODAS las peticiones a su CDN.
      transformRequest: (url: string) =>
        key && url.includes('cartocdn.com')
          ? { url: url + (url.includes('?') ? '&' : '?') + 'key=' + key }
          : { url },
    }).addTo(this.map);
    this.tiles = gl;
    // Solo las VÍAS PRINCIPALES (autopista/troncal/primaria/secundaria) se pintan
    // del color de la app; las calles menores/residenciales quedan neutras, para
    // un mapa limpio estilo Waze (sin saturar todo de color).
    const major = /_(mot|trunk|pri|sec)(_|$)/;
    const applyRoads = () => {
      const m = gl.getMaplibreMap();
      for (const lyr of (m.getStyle()?.layers || [])) {
        if (lyr.type !== 'line' || lyr['source-layer'] !== 'transportation' || !major.test(lyr.id)) continue;
        const c = /_case/.test(lyr.id) ? roadCase : road;
        try { m.setPaintProperty(lyr.id, 'line-color', c); } catch { }
      }
    };
    const m = gl.getMaplibreMap();
    if (m.isStyleLoaded?.()) applyRoads(); else m.on('load', applyRoads);
  }

  // Umbral de zoom para pedir estaciones (más bajo = área más grande).
  private static readonly MIN_ZOOM = 9;
  private moveTimer: any;

  ngAfterViewInit(): void {
    this.map = L.map(this.mapEl.nativeElement, { zoomControl: false, attributionControl: true }).setView([4.65, -74.1], 6);
    L.control.zoom({ position: 'bottomright' }).addTo(this.map);
    this.addThemedBase();
    window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', () => this.addThemedBase());
    this.markers.addTo(this.map);
    this.routeLayer.addTo(this.map);
    // Carga por ÁREA VISIBLE: al mover/zoom se piden las estaciones del recuadro.
    this.map.on('moveend', () => { clearTimeout(this.moveTimer); this.moveTimer = setTimeout(() => this.zone.run(() => this.loadViewport()), 350); });
    this.updateZoomHint();
    this.locate();
  }

  /** Pide al backend solo las estaciones del recuadro visible (si hay zoom). */
  private loadViewport(): void {
    if (!this.map) return;
    if (this.map.getZoom() < AppComponent.MIN_ZOOM) {
      this.mapZoomLow.set(true); this.mapStations.set([]); this.renderMarkers(); return;
    }
    this.mapZoomLow.set(false); this.mapLoading.set(true);
    const b = this.map.getBounds();
    const bbox: [number, number, number, number] = [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()];
    this.api.stations(bbox, 2000).subscribe({
      next: (s) => { this.mapStations.set(s); this.mapLoading.set(false); this.renderMarkers(); },
      error: () => this.mapLoading.set(false),
    });
  }
  private updateZoomHint(): void { if (this.map) this.mapZoomLow.set(this.map.getZoom() < AppComponent.MIN_ZOOM); }

  /** Carga las estaciones alrededor del usuario para la lista "Inicio". */
  private loadNear(pos: [number, number]): void {
    const d = 0.45; // ~50 km
    const bbox: [number, number, number, number] = [pos[0] - d, pos[1] - d, pos[0] + d, pos[1] + d];
    this.api.stations(bbox, 1500).subscribe({
      next: (s) => { this.stations.set(s); this.loaded.set(true); this.applyFilters(); },
      error: () => this.loaded.set(true),
    });
  }

  setTab(t: Tab): void {
    this.tab.set(t);
    if (t === 'map') setTimeout(() => {
      if (!this.map) return;
      // Si hay una ruta activa, encuadra a la RUTA; si no, carga por área visible.
      if (this.tripBounds && this.tripBounds.isValid()) this.focusRoute();
      else { this.map.invalidateSize(); this.updateZoomHint(); this.loadViewport(); }
    }, 90);
  }
  /** Encuadra el mapa a la ruta de forma robusta (el contenedor recién visible
   *  puede tener tamaño 0 → fitBounds daría zoom de "todo el planeta"). */
  private focusRoute(): void {
    if (!this.map || !this.tripBounds || !this.tripBounds.isValid()) return;
    const fit = () => {
      if (!this.map || !this.tripBounds) return;
      this.map.invalidateSize(true);
      this.map.fitBounds(this.tripBounds, { padding: [30, 30], maxZoom: 13 });
    };
    fit();
    // Segundo pase tras asentar el tamaño; si aún quedó alejado, forzamos vista.
    setTimeout(() => {
      fit();
      if (this.map && this.map.getZoom() < 5) this.map.setView(this.tripBounds!.getCenter(), 7);
    }, 240);
  }
  /** Quita la ruta y deja el mapa en modo normal (carga por área visible). */
  clearTripAndStay(): void {
    this.clearTrip();
    if (this.map) { this.map.invalidateSize(); this.updateZoomHint(); this.loadViewport(); }
  }
  clearFilters(): void { this.cityFilter = ''; this.connectorFilter = ''; this.speedFilter = ''; this.query = ''; this.onFiltersChange(); this.drawer.set(false); }
  clearCache(): void {
    if (this.clearingCache()) return;
    this.clearingCache.set(true); this.cacheMsg.set('');
    this.api.clearCache().subscribe({
      next: (r) => { this.clearingCache.set(false); this.cacheMsg.set('Caché limpiada (' + r.cleared + ' entradas). Re-sincronizando fuentes en segundo plano…'); },
      error: (e) => { this.clearingCache.set(false); this.cacheMsg.set(e?.status === 403 ? 'Solo administradores pueden limpiar la caché.' : 'No se pudo limpiar la caché.'); },
    });
  }
  tint(s: string | null): string { const c = this.statusColor(s); return `linear-gradient(135deg, ${c}26, ${c}0d)`; }

  // ── Ubicación ──
  locate(): void {
    if (!navigator.geolocation) return;
    this.locating.set(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => this.zone.run(() => {
        this.locating.set(false);
        const p: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        this.userPos.set(p);
        if (this.map) {
          const icon = L.divIcon({ className: '', html: '<div class="me"></div>', iconSize: [18, 18], iconAnchor: [9, 9] });
          if (this.userMarker) this.userMarker.setLatLng(p); else this.userMarker = L.marker(p, { icon, zIndexOffset: 1000 }).addTo(this.map);
          // Centrar en el usuario dispara 'moveend' → carga las estaciones del área.
          this.map.setView(p, 13);
        }
        this.loadNear(p);      // lista "Inicio": estaciones cercanas
      }),
      () => this.zone.run(() => this.locating.set(false)),
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
    if (type === 'Tipo 1') return u.includes('TIPO 1') || u.includes('TYPE 1') || u.includes('J1772');
    if (type === 'GB/T') return u.includes('GBT') || u.includes('GB/T') || u.includes('GB T');
    if (type === 'Tesla') return u.includes('TESLA');
    return true;
  }
  /** Predicado común de los filtros del cajón + búsqueda de texto. */
  private matchFilters(s: Station): boolean {
    const q = this.query.trim().toLowerCase();
    if (this.cityFilter && s.city !== this.cityFilter) return false;
    if (this.speedFilter && s.speed !== this.speedFilter) return false;
    if (this.connectorFilter && !this.matchConnector(s.connectors, this.connectorFilter)) return false;
    if (!q) return true;
    return (s.name + ' ' + s.operator + ' ' + s.city + ' ' + s.address + ' ' + s.connectors).toLowerCase().includes(q);
  }
  // Filtros que afectan a AMBAS vistas (lista "Inicio" + marcadores del mapa).
  onFiltersChange(): void { this.applyFilters(); this.renderMarkers(); }
  applyFilters(): void {
    const u = this.userPos();
    const list = this.stations().filter((s) => this.matchFilters(s));
    if (u) list.sort((a, b) => this.distanceKm(u, [a.lat, a.lon]) - this.distanceKm(u, [b.lat, b.lon]));
    this.filtered.set(list);
  }
  private renderMarkers(): void {
    if (!this.map) return;
    this.markers.clearLayers();
    for (const s of this.mapStations()) {
      if (s.lat == null || s.lon == null || !this.matchFilters(s)) continue;
      // El pin se colorea por VELOCIDAD de carga (mapa informativo de un vistazo);
      // el ESTADO reportado se codifica como anillo: verde vivo=activa, rojo=inactiva.
      const color = this.speedColor(s.speed);
      const st = s.communityStatus === 'active' ? ' live' : s.communityStatus === 'inactive' ? ' off' : '';
      const icon = L.divIcon({ className: '', html: `<div class="pin${st}" style="background:${color};color:${color}"><i class="fa-solid fa-bolt"></i></div>`, iconSize: [30, 30], iconAnchor: [15, 30] });
      // El click de Leaflet corre FUERA de la zona de Angular; sin zone.run el
      // diálogo no reacciona (no dispara detección de cambios).
      L.marker([s.lat, s.lon], { icon }).addTo(this.markers).on('click', () => this.zone.run(() => this.openDetail(s)));
    }
  }

  // ── Detalle ──
  openDetail(s: Station): void {
    this.detail.set(null); this.detailError.set(false); this.comments.set([]); this.reports.set([]); this.newComment = '';
    this.detailStation = s;
    this.detailVisible = true;
    this.api.station(s.id).subscribe({ next: (d) => this.detail.set(d), error: () => this.detailError.set(true) });
    this.api.comments(s.id).subscribe({ next: (c) => this.comments.set(c), error: () => {} });
    this.api.reports(s.id).subscribe({ next: (r) => this.reports.set(r), error: () => {} });
  }
  retryDetail(): void { if (this.detailStation) this.openDetail(this.detailStation); }
  private refreshDetail(): void {
    const d = this.detail(); if (!d) return;
    this.api.station(d.id).subscribe({ next: (x) => this.detail.set(x), error: () => {} });
    this.api.reports(d.id).subscribe({ next: (r) => this.reports.set(r), error: () => {} });
    // Refresca solo lo cargado (área visible + cercanas), no todo el catálogo.
    this.loadViewport();
    const u = this.userPos(); if (u) this.loadNear(u);
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
  roundKm(x: number): number { return Math.round(x); }
  isStop(s: Station): boolean { return this.tripStops().has(s.id); }
  routeKm(s: Station): number { return Math.round(this.routePos.get(s.id) ?? 0); }
  tripStopsCount(): number { return this.tripStops().size; }
  autonomyPct(distanceKm: number): number { const a = this.tripAutonomy; return a && a > 0 ? Math.min(100, Math.round((distanceKm / a) * 100)) : 0; }
  private tripOD?: { o: [number, number]; d: [number, number] };
  clearTrip(): void {
    this.routeLayer.clearLayers(); this.tripInfo.set(null); this.tripStations.set([]);
    this.tripStops.set(new Set()); this.tripMsg.set(''); this.routeOptions.set([]); this.tripBounds = undefined;
  }

  plan(): void {
    if (!this.tripDest.trim()) return;
    this.planning.set(true); this.tripMsg.set(''); this.routeOptions.set([]);
    this.resolveOrigin().then((origin) => {
      if (!origin) { this.planning.set(false); this.tripMsg.set('No pude ubicar el origen. Escríbelo o usa «mi ubicación».'); return; }
      this.api.geocode(this.tripDest).subscribe({
        next: (places) => {
          if (!places.length) { this.planning.set(false); this.tripMsg.set('No encontré ese destino en Colombia.'); return; }
          const dest: [number, number] = [places[0].lat, places[0].lon];
          this.tripOD = { o: origin, d: dest };
          this.api.routes(origin, dest).subscribe({
            next: (rs) => {
              if (!rs || !rs.length) { this.planning.set(false); this.tripMsg.set('No pude calcular la ruta (intenta de nuevo).'); return; }
              // Un solo fetch de estaciones que cubra TODAS las alternativas.
              let minLat = 90, minLon = 180, maxLat = -90, maxLon = -180;
              for (const r of rs) for (const c of r.coordinates) {
                minLat = Math.min(minLat, c[0]); maxLat = Math.max(maxLat, c[0]);
                minLon = Math.min(minLon, c[1]); maxLon = Math.max(maxLon, c[1]);
              }
              const bbox: [number, number, number, number] = [minLat - 0.1, minLon - 0.1, maxLat + 0.1, maxLon + 0.1];
              this.api.stations(bbox, 6000).subscribe({
                next: (pool) => this.finishPlan(rs, pool),
                error: () => this.finishPlan(rs, this.stations()),
              });
            },
            error: () => { this.planning.set(false); this.tripMsg.set('No pude calcular la ruta (intenta de nuevo).'); },
          });
        },
        error: () => { this.planning.set(false); this.tripMsg.set('No pude buscar el destino.'); },
      });
    });
  }
  private finishPlan(rs: { distanceKm: number; durationMin: number; coordinates: [number, number][] }[], pool: Station[]): void {
    const opts = rs.map((r) => this.computeRouteOption(r, pool));
    // Mejor opción: primero que llegues; luego más compatibles; luego más corta.
    let best = 0;
    for (let i = 1; i < opts.length; i++) {
      const sa = (opts[i].reachable ? 1e6 : 0) + opts[i].compatible * 1000 - opts[i].distanceKm;
      const sb = (opts[best].reachable ? 1e6 : 0) + opts[best].compatible * 1000 - opts[best].distanceKm;
      if (sa > sb) best = i;
    }
    this.routeOptions.set(opts);
    this.planning.set(false);
    this.selectRoute(best);
  }
  selectRoute(i: number): void {
    const opts = this.routeOptions();
    if (i < 0 || i >= opts.length) return;
    this.activeIdx.set(i);
    const opt = opts[i];
    this.tripInfo.set({ distanceKm: opt.distanceKm, durationMin: opt.durationMin });
    this.tripStations.set(opt.stations);
    this.tripStops.set(opt.stops);
    this.routePos = opt.routePos;
    this.drawActive();
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

  /** Analiza una ruta: estaciones cercanas, compatibles, paradas y alcance. */
  private computeRouteOption(r: { distanceKm: number; durationMin: number; coordinates: [number, number][] }, pool: Station[]): RouteOpt {
    const coords = r.coordinates;
    const cum: number[] = [0];
    for (let i = 1; i < coords.length; i++) cum[i] = cum[i - 1] + this.distanceKm(coords[i - 1], coords[i]);
    const total = cum[cum.length - 1] || r.distanceKm;
    const THRESH = 8, step = Math.max(1, Math.floor(coords.length / 400));
    const near: { s: Station; pos: number }[] = [];
    const rp = new Map<number, number>();
    for (const s of pool) {
      if (s.lat == null || s.lon == null) continue;
      let best = Infinity, bestIdx = 0;
      for (let i = 0; i < coords.length; i += step) { const d = this.distanceKm([s.lat, s.lon], coords[i]); if (d < best) { best = d; bestIdx = i; } }
      if (best <= THRESH) { near.push({ s, pos: cum[bestIdx] }); rp.set(s.id, cum[bestIdx]); }
    }
    near.sort((a, b) => a.pos - b.pos);
    const compat = near.filter((n) => this.isCompatible(n.s));
    const A = this.tripAutonomy;
    const withCompat = this.reachOf(compat, A, total);
    const withAny = this.reachOf(near, A, total);
    const noRange = !A || A <= 0;
    return {
      distanceKm: r.distanceKm, durationMin: r.durationMin, via: (r as any).via || '', coordinates: coords,
      stations: near.map((n) => n.s), routePos: rp, stops: withCompat.stops,
      compatible: compat.length, total: near.length, reachKm: withCompat.reach,
      reachable: noRange || withCompat.reach >= total - 0.5,
      reachableWithAdapter: withAny.reach >= total - 0.5,
    };
  }
  /** Cuánto avanzas encadenando cargas (paradas) sin quedarte sin autonomía. */
  private reachOf(list: { s: Station; pos: number }[], A: number | null, total: number): { reach: number; stops: Set<number> } {
    const stops = new Set<number>();
    if (!A || A <= 0) return { reach: total, stops };
    let reach = A, i = 0;
    while (reach < total && i < list.length) {
      let far: { s: Station; pos: number } | null = null;
      while (i < list.length && list[i].pos <= reach) { far = list[i]; i++; }
      if (!far) break;                 // hueco: no hay cargador al alcance
      stops.add(far.s.id); reach = far.pos + A;
    }
    return { reach: Math.min(reach, total), stops };
  }
  // Paleta para los TRAMOS entre paradas de carga (se cicla).
  private static readonly LEG_COLORS = ['#22c55e', '#3b82f6', '#8b5cf6', '#14b8a6', '#f59e0b', '#ec4899'];
  /** Corta las coordenadas entre dos distancias acumuladas (tramo conectado). */
  private sliceByDist(coords: [number, number][], cum: number[], a: number, b: number): [number, number][] {
    let s = 0, e = coords.length - 1;
    for (let i = 0; i < cum.length; i++) { if (cum[i] <= a) s = i; else break; }
    for (let i = cum.length - 1; i >= 0; i--) { if (cum[i] >= b) e = i; else break; }
    return coords.slice(s, Math.max(e + 1, s + 2));
  }
  /** Dibuja la ruta activa: un color por TRAMO (hasta cada parada) y rojo lo que
   *  no alcanzas. Marca origen/destino, paradas de carga y el límite de autonomía. */
  private drawActive(): void {
    const opt = this.routeOptions()[this.activeIdx()];
    if (!opt || !this.map) return;
    this.routeLayer.clearLayers();
    const coords = opt.coordinates;
    const cum: number[] = [0];
    for (let i = 1; i < coords.length; i++) cum[i] = cum[i - 1] + this.distanceKm(coords[i - 1], coords[i]);
    const total = cum[cum.length - 1];
    const hasRange = !!(this.tripAutonomy && this.tripAutonomy > 0);
    const reach = hasRange ? Math.min(opt.reachKm, total) : total;

    // Posiciones de las paradas de carga (dentro del alcance), ordenadas.
    const stopPos = [...opt.stops].map((id) => opt.routePos.get(id) ?? 0)
      .filter((p) => p > 0.5 && p < reach - 0.5).sort((a, b) => a - b);
    const bounds = [0, ...stopPos, reach];

    // Un color por tramo entre paradas.
    for (let i = 0; i < bounds.length - 1; i++) {
      const seg = this.sliceByDist(coords, cum, bounds[i], bounds[i + 1]);
      if (seg.length > 1) L.polyline(seg as L.LatLngExpression[], { color: AppComponent.LEG_COLORS[i % AppComponent.LEG_COLORS.length], weight: 5, opacity: 0.9 }).addTo(this.routeLayer);
    }
    // Tramo que NO alcanzas → rojo punteado.
    if (reach < total - 0.5) {
      const tail = this.sliceByDist(coords, cum, reach, total);
      if (tail.length > 1) L.polyline(tail as L.LatLngExpression[], { color: '#ef4444', weight: 5, opacity: 0.85, dashArray: '8 8' }).addTo(this.routeLayer);
    }

    const mk = (cls: string) => L.divIcon({ className: '', html: `<div class="od ${cls}"></div>`, iconSize: [16, 16], iconAnchor: [8, 8] });
    if (this.tripOD) { L.marker(this.tripOD.o, { icon: mk('o') }).addTo(this.routeLayer); L.marker(this.tripOD.d, { icon: mk('d') }).addTo(this.routeLayer); }
    // Marcadores de parada de carga.
    for (const p of stopPos) {
      let idx = 0; for (let k = 0; k < cum.length; k++) { if (cum[k] <= p) idx = k; else break; }
      const icon = L.divIcon({ className: '', html: '<div class="stopmk"><i class="fa-solid fa-bolt"></i></div>', iconSize: [24, 24], iconAnchor: [12, 12] });
      L.marker(coords[idx], { icon, zIndexOffset: 400 }).addTo(this.routeLayer);
    }
    // Límite de autonomía (si no llegas).
    if (reach < total - 0.5) {
      let split = coords.length - 1; for (let k = 0; k < cum.length; k++) { if (cum[k] >= reach) { split = k; break; } }
      const icon = L.divIcon({ className: '', html: '<div class="reachmk"><i class="fa-solid fa-battery-quarter"></i></div>', iconSize: [26, 26], iconAnchor: [13, 13] });
      L.marker(coords[split], { icon, zIndexOffset: 500 }).addTo(this.routeLayer);
    }
    this.tripBounds = L.latLngBounds(coords as L.LatLngExpression[]).pad(0.15);
    if (this.tab() === 'map') this.focusRoute();
  }
  activeRoute(): RouteOpt | null { return this.routeOptions()[this.activeIdx()] ?? null; }

  // ── Estado / colores / textos ──
  statusColor(s: string | null): string { return s === 'active' ? '#22c55e' : s === 'inactive' ? '#ef4444' : '#9aa3b2'; }
  statusLabel(s: string | null): string { return s === 'active' ? 'Activa' : s === 'inactive' ? 'Inactiva' : 'Sin reportes'; }
  statusSeverity(s: string | null): 'success' | 'danger' | 'secondary' { return s === 'active' ? 'success' : s === 'inactive' ? 'danger' : 'secondary'; }
  chargerColor(s: string): string { return s === 'free' ? '#22c55e' : s === 'busy' ? '#f59e0b' : s === 'broken' ? '#ef4444' : '#9aa3b2'; }
  chargerLabel(s: string): string { return s === 'free' ? 'Libre' : s === 'busy' ? 'Ocupado' : s === 'broken' ? 'Dañado' : s; }
  anyColor(s: string): string { return s === 'active' || s === 'free' ? '#22c55e' : s === 'inactive' || s === 'broken' ? '#ef4444' : s === 'busy' ? '#f59e0b' : '#9aa3b2'; }
  anyLabel(s: string): string { const m: Record<string, string> = { active: 'activa', inactive: 'inactiva', free: 'libre', busy: 'ocupado', broken: 'dañado' }; return m[s] || s; }
  sourceLabel(s: string): string {
    return s === 'datos_gov_epm' ? 'datos.gov.co (EPM)' : s === 'openstreetmap' ? 'OpenStreetMap'
      : s === 'openchargemap' ? 'Open Charge Map' : s === 'essa' ? 'ESSA (Santander)'
      : s === 'tomtom' ? 'TomTom' : s;
  }
  sourceDesc(s: string): string {
    return s === 'datos_gov_epm' ? 'Datos abiertos del gobierno · Antioquia'
      : s === 'openstreetmap' ? 'Comunidad OSM · cobertura nacional'
      : s === 'openchargemap' ? 'Comunidad · cobertura nacional'
      : s === 'essa' ? 'Ecoestaciones ESSA · Santander'
      : s === 'tomtom' ? 'TomTom · POI de mapas · cobertura nacional' : 'Fuente de datos';
  }
  sourceShort(s: string): string {
    return s === 'datos_gov_epm' ? 'EPM' : s === 'openstreetmap' ? 'OSM'
      : s === 'openchargemap' ? 'OCM' : s === 'essa' ? 'ESSA' : s === 'tomtom' ? 'TomTom' : s;
  }
  sourceColor(s: string): string {
    return s === 'essa' ? '#f59e0b' : s === 'datos_gov_epm' ? '#eab308'
      : s === 'openstreetmap' ? '#7c3aed' : s === 'openchargemap' ? '#06b6d4'
      : s === 'tomtom' ? '#df1b12' : '#94a3b8';
  }

  // ── Conectores y velocidad (chips coloreados) ──
  connList(connectors: string): string[] {
    if (!connectors) return [];
    const seen = new Set<string>(); const out: string[] = [];
    for (const raw of connectors.split(/[,/;]| y /)) {
      const t = this.normConn(raw.trim());
      if (t.length >= 2 && !seen.has(t)) { seen.add(t); out.push(t); }
    }
    return out.slice(0, 4);
  }
  private normConn(s: string): string {
    const u = s.toUpperCase();
    if (u.includes('CCS') || u.includes('COMBO')) return 'CCS2';
    if (u.includes('CHADEMO')) return 'CHAdeMO';
    if (u.includes('MENNEKES') || u.includes('TIPO 2') || u.includes('TYPE 2') || u.includes('EUROPEO')) return 'Tipo 2';
    if (u.includes('GBT') || u.includes('GB/T') || u.includes('GB T')) return 'GB/T';
    if (u.includes('TIPO 1') || u.includes('TYPE 1') || u.includes('J1772')) return 'Tipo 1';
    if (u.includes('TESLA')) return 'Tesla';
    if (u.includes('SCHUKO')) return 'Schuko';
    return s.length > 12 ? s.slice(0, 12) : s;
  }
  connColor(t: string): string {
    return t === 'CCS2' ? '#f97316' : t === 'CHAdeMO' ? '#8b5cf6' : t === 'Tipo 2' ? '#14b8a6'
      : t === 'Tipo 1' ? '#0ea5e9' : t === 'GB/T' ? '#ef4444' : t === 'Tesla' ? '#e11d48' : '#94a3b8';
  }
  speedColor(s: string | null): string {
    return s === 'Rápida' ? '#f97316' : s === 'Semi-rápida' ? '#14b8a6' : s === 'Lenta' ? '#3b82f6' : '#9aa3b2';
  }
  speedDesc(s: string | null): string {
    return s === 'Rápida' ? 'Corriente directa · ideal para viajes'
      : s === 'Semi-rápida' ? 'Corriente alterna · recarga en un par de horas'
      : s === 'Lenta' ? 'Corriente alterna · recarga nocturna' : 'Velocidad sin dato';
  }
  fmtWhen(s: string): string { if (!s) return ''; const d = new Date(s.replace(' ', 'T')); return isNaN(d.getTime()) ? s : d.toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }); }
}
