import { AfterViewInit, Component, ElementRef, OnInit, ViewChild, computed, inject, signal } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { TagModule } from 'primeng/tag';
import * as L from 'leaflet';
import { Comment, Charger, ElectrolinerasService, Report, Station, StationFull } from './electrolineras.service';

type View = 'map' | 'list';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [NgFor, NgIf, FormsModule, ButtonModule, DialogModule, TagModule],
  styles: [`
    :host { display: block; }
    .bar { position: sticky; top: 0; z-index: 500; display: flex; align-items: center; gap: 10px; padding: 12px 14px;
           background: color-mix(in srgb, var(--bg) 88%, transparent); backdrop-filter: blur(10px); border-bottom: 1px solid var(--border); flex-wrap: wrap; }
    .brand { display: flex; align-items: center; gap: 8px; font-weight: 800; font-size: 1.15rem; }
    .brand i { color: var(--accent); }
    .env { font-size: .66rem; font-weight: 800; letter-spacing: .5px; padding: 3px 8px; border-radius: 6px; background: #f59e0b; color: #1a1200; text-transform: uppercase; }
    .spacer { flex: 1; } .muted { color: var(--muted); }
    .seg { display: inline-flex; background: var(--panel-2); border-radius: 10px; padding: 3px; gap: 3px; }
    .seg button { border: none; background: transparent; color: var(--muted); padding: 8px 12px; border-radius: 8px; cursor: pointer; }
    .seg button.on { background: var(--panel); color: var(--fg); box-shadow: var(--shadow); }
    .filters { display: flex; gap: 8px; padding: 10px 14px; flex-wrap: wrap; align-items: center; }
    .inp, .sel { padding: 9px 11px; border-radius: 10px; border: 1px solid var(--border); background: var(--panel); color: var(--fg); }
    .search { flex: 1; min-width: 180px; }

    .map { width: 100%; height: calc(100vh - 118px); min-height: 320px; }
    .list { padding: 8px 14px 80px; display: flex; flex-direction: column; gap: 8px; }
    .srow { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border: 1px solid var(--border); border-radius: 14px; background: var(--panel); cursor: pointer; }
    .srow:hover { border-color: var(--accent); }
    .srow .dot { width: 12px; height: 12px; border-radius: 50%; flex: none; }
    .srow .grow { flex: 1; min-width: 0; } .srow .grow .nm { font-weight: 700; }
    .srow .grow .ds { color: var(--muted); font-size: .84rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    .count { padding: 6px 14px 0; color: var(--muted); font-size: .85rem; }

    /* Detalle */
    .d-head { display: flex; align-items: flex-start; gap: 10px; }
    .d-head .grow { flex: 1; } .d-head h2 { margin: 0; font-size: 1.2rem; }
    .d-meta { color: var(--muted); font-size: .88rem; margin-top: 2px; }
    .kv { display: flex; gap: 8px; flex-wrap: wrap; margin: 12px 0; }
    .kv .k { display: inline-flex; align-items: center; gap: 6px; padding: 5px 10px; border-radius: 999px; background: var(--panel-2); font-size: .82rem; }
    .sec { margin-top: 16px; } .sec h3 { margin: 0 0 8px; font-size: .95rem; }
    .report-btns { display: flex; gap: 8px; flex-wrap: wrap; }
    .charger { display: flex; align-items: center; gap: 10px; padding: 10px 0; border-top: 1px solid var(--border); flex-wrap: wrap; }
    .charger .grow { flex: 1; min-width: 120px; } .charger .nm { font-weight: 600; }
    .charger .cbtns { display: flex; gap: 6px; }
    .cmt { padding: 9px 0; border-top: 1px solid var(--border); }
    .cmt .who { font-weight: 600; font-size: .85rem; } .cmt .who small { color: var(--muted); font-weight: 400; margin-left: 6px; }
    .cmt .bd { margin-top: 2px; }
    .cmt-form { display: flex; gap: 8px; margin-top: 10px; }
    .cmt-form textarea { flex: 1; min-height: 44px; padding: 10px; border-radius: 10px; border: 1px solid var(--border); background: var(--panel-2); color: var(--fg); font-family: inherit; resize: vertical; }
    .act { display: flex; align-items: center; gap: 6px; padding: 6px 0; border-top: 1px solid var(--border); font-size: .84rem; }
    .banner { background: color-mix(in srgb, #f59e0b 14%, var(--panel)); border: 1px solid color-mix(in srgb, #f59e0b 40%, var(--border)); border-radius: 12px; padding: 10px 12px; margin: 10px 14px; font-size: .86rem; }

    /* Planeador de viajes */
    .trip { margin: 8px 14px; padding: 12px; border: 1px solid var(--border); border-radius: 14px; background: var(--panel); box-shadow: var(--shadow); }
    .trip-form { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
    .trip-form .tf { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 180px; }
    .trip-form .tf .inp { flex: 1; }
    .trip-kpis { display: flex; gap: 16px; flex-wrap: wrap; margin: 12px 0 8px; font-size: .9rem; }
    .trip-kpis b { font-size: 1.05rem; }
    .trip-list { max-height: 40vh; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; }
    .trow { display: flex; align-items: center; gap: 10px; padding: 9px 10px; border: 1px solid var(--border); border-radius: 10px; cursor: pointer; }
    .trow:hover { border-color: var(--accent); }
    .trow.stop { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, var(--panel)); }
    .trow .dot { width: 10px; height: 10px; border-radius: 50%; flex: none; }
    .trow .grow { flex: 1; min-width: 0; } .trow .nm { font-weight: 600; }
    .trow .ds { color: var(--muted); font-size: .82rem; }
    .stopbadge { font-size: .72rem; font-weight: 700; color: #08130c; background: var(--accent); padding: 2px 8px; border-radius: 999px; white-space: nowrap; }
  `],
  template: `
    <div class="bar">
      <div class="brand"><i class="fa-solid fa-charging-station"></i> Electrolineras <span class="env" *ngIf="isTest()">test</span></div>
      <span class="spacer"></span>
      <span class="muted" style="font-size:.85rem">{{ filtered().length }} estaciones</span>
      <p-button [label]="tripOpen() ? 'Cerrar viaje' : 'Planear viaje'" icon="fa-solid fa-route" size="small"
                [outlined]="!tripOpen()" (onClick)="toggleTrip()" />
      <p-button [label]="locating() ? 'Ubicando…' : 'Cerca de mí'" icon="fa-solid fa-location-crosshairs"
                size="small" [text]="true" (onClick)="locate()" [loading]="locating()" />
      <div class="seg">
        <button [class.on]="view() === 'map'" (click)="setView('map')" title="Mapa"><i class="fa-solid fa-map-location-dot"></i></button>
        <button [class.on]="view() === 'list'" (click)="setView('list')" title="Lista"><i class="fa-solid fa-list"></i></button>
      </div>
    </div>

    <!-- Planeador de viajes -->
    <div class="trip" *ngIf="tripOpen()">
      <div class="trip-form">
        <div class="tf"><i class="fa-solid fa-location-dot" style="color:#3b82f6"></i>
          <input class="inp" [(ngModel)]="tripOrigin" placeholder="Origen (o «mi ubicación»)" /></div>
        <div class="tf"><i class="fa-solid fa-flag-checkered" style="color:var(--accent)"></i>
          <input class="inp" [(ngModel)]="tripDest" placeholder="Destino: ciudad o dirección" (keyup.enter)="plan()" /></div>
        <div class="tf"><i class="fa-solid fa-battery-three-quarters muted"></i>
          <input class="inp" type="number" [(ngModel)]="tripAutonomy" placeholder="Autonomía km" style="width:120px" /></div>
        <p-button label="Planear" icon="fa-solid fa-route" (onClick)="plan()" [loading]="planning()" [disabled]="!tripDest.trim()" />
        <p-button *ngIf="tripInfo()" label="Limpiar" [text]="true" size="small" (onClick)="clearTrip()" />
      </div>
      <div class="muted" *ngIf="tripMsg()" style="padding:0 2px 6px;font-size:.85rem">{{ tripMsg() }}</div>
      <div class="trip-res" *ngIf="tripInfo() as t">
        <div class="trip-kpis">
          <span><i class="fa-solid fa-road"></i> <b>{{ t.distanceKm }}</b> km</span>
          <span><i class="fa-solid fa-clock"></i> <b>{{ fmtDur(t.durationMin) }}</b></span>
          <span><i class="fa-solid fa-charging-station"></i> <b>{{ tripStations().length }}</b> en ruta</span>
          <span *ngIf="tripStopsCount()"><i class="fa-solid fa-bolt" style="color:var(--accent)"></i> <b>{{ tripStopsCount() }}</b> paradas</span>
        </div>
        <div class="trip-list">
          <div class="trow" *ngFor="let s of tripStations()" (click)="openDetail(s)" [class.stop]="isStop(s)">
            <span class="dot" [style.background]="statusColor(s.communityStatus)"></span>
            <div class="grow"><div class="nm">{{ s.name }}</div><div class="ds">{{ s.city }} · km {{ routeKm(s) }}</div></div>
            <span class="stopbadge" *ngIf="isStop(s)"><i class="fa-solid fa-bolt"></i> parada</span>
            <p-tag [value]="statusLabel(s.communityStatus)" [severity]="statusSeverity(s.communityStatus)" />
          </div>
          <p class="muted" *ngIf="!tripStations().length" style="padding:10px">No hay estaciones cerca de esta ruta con los datos actuales. (Con Open Charge Map habrá cobertura nacional.)</p>
        </div>
      </div>
    </div>

    <div class="filters">
      <input class="inp search" type="text" [(ngModel)]="query" (ngModelChange)="applyFilters()" placeholder="Buscar por nombre, ciudad, dirección…" />
      <select class="sel" [(ngModel)]="cityFilter" (ngModelChange)="applyFilters()">
        <option value="">Todas las ciudades</option>
        <option *ngFor="let c of cities()" [value]="c">{{ c }}</option>
      </select>
      <select class="sel" [(ngModel)]="connectorFilter" (ngModelChange)="applyFilters()">
        <option value="">Todo conector</option>
        <option value="CCS2">CCS2</option>
        <option value="CHAdeMO">CHAdeMO</option>
        <option value="Tipo 2">Tipo 2</option>
        <option value="GB/T">GB/T</option>
      </select>
      <select class="sel" [(ngModel)]="speedFilter" (ngModelChange)="applyFilters()">
        <option value="">Toda velocidad</option>
        <option *ngFor="let s of speeds()" [value]="s">{{ s }}</option>
      </select>
    </div>

    <div class="banner" *ngIf="showBanner()">
      <b>Estado en tiempo real:</b> las estaciones vienen de datos abiertos del gobierno; el estado (activa/ocupada) lo reporta la comunidad. ¡Reporta lo que veas!
      <a class="muted" style="cursor:pointer;margin-left:6px" (click)="showBanner.set(false)">✕</a>
    </div>

    <!-- Mapa (siempre montado; se oculta en modo lista) -->
    <div #mapEl class="map" [style.display]="view() === 'map' ? 'block' : 'none'"></div>

    <!-- Lista -->
    <div class="list" *ngIf="view() === 'list'">
      <div class="srow" *ngFor="let s of filtered()" (click)="openDetail(s)">
        <span class="dot" [style.background]="statusColor(s.communityStatus)"></span>
        <div class="grow">
          <div class="nm">{{ s.name }}</div>
          <div class="ds">{{ s.city }}<span *ngIf="s.connectors"> · {{ s.connectors }}</span></div>
        </div>
        <span class="muted" *ngIf="dist(s) as d" style="font-size:.82rem;white-space:nowrap">{{ d }}</span>
        <p-tag [value]="statusLabel(s.communityStatus)" [severity]="statusSeverity(s.communityStatus)" />
        <i class="fa-solid fa-chevron-right muted" style="font-size:.8rem"></i>
      </div>
      <p class="muted" *ngIf="loaded() && !filtered().length" style="text-align:center;padding:24px">No hay estaciones que coincidan.</p>
    </div>

    <!-- Detalle -->
    <p-dialog [(visible)]="detailVisible" [modal]="true" [position]="'bottom'" [dismissableMask]="true"
              [style]="{ width: '100%', maxWidth: '620px' }" [header]="' '">
      <div *ngIf="detail() as d">
        <div class="d-head">
          <span class="dot" [style.background]="statusColor(d.communityStatus)" style="width:16px;height:16px;border-radius:50%;margin-top:6px"></span>
          <div class="grow">
            <h2>{{ d.name }}</h2>
            <div class="d-meta">{{ d.operator }}<span *ngIf="d.city"> · {{ d.city }}</span><span *ngIf="dist(d) as km"> · a {{ km }}</span></div>
            <div class="d-meta" *ngIf="d.address">{{ d.address }}</div>
          </div>
          <p-tag [value]="statusLabel(d.communityStatus)" [severity]="statusSeverity(d.communityStatus)" />
        </div>

        <div class="kv">
          <span class="k" *ngIf="d.speed"><i class="fa-solid fa-gauge-high"></i> {{ d.speed }}</span>
          <span class="k" *ngIf="d.connectors"><i class="fa-solid fa-plug"></i> {{ d.connectors }}</span>
          <span class="k" *ngIf="d.hours"><i class="fa-solid fa-clock"></i> {{ d.hours }}</span>
          <a class="k" *ngIf="d.website" [href]="d.website" target="_blank" rel="noopener"><i class="fa-solid fa-up-right-from-square"></i> Sitio</a>
        </div>

        <!-- Reporte de estación -->
        <div class="sec">
          <h3>¿Está funcionando la estación?</h3>
          <div class="report-btns">
            <p-button label="Activa" icon="fa-solid fa-circle-check" severity="success" [outlined]="d.communityStatus !== 'active'" size="small" (onClick)="reportStation('active')" />
            <p-button label="Inactiva / caída" icon="fa-solid fa-circle-xmark" severity="danger" [outlined]="d.communityStatus !== 'inactive'" size="small" (onClick)="reportStation('inactive')" />
          </div>
        </div>

        <!-- Cargadores -->
        <div class="sec" *ngIf="d.chargers?.length">
          <h3>Cargadores ({{ d.chargers.length }}) — reporta el estado de cada uno</h3>
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
        </div>

        <!-- Actividad reciente -->
        <div class="sec" *ngIf="reports().length">
          <h3>Actividad reciente</h3>
          <div class="act" *ngFor="let r of reports()">
            <span [style.color]="anyColor(r.status)">●</span>
            <span>{{ r.by }} reportó <b>{{ anyLabel(r.status) }}</b><span *ngIf="r.charger"> en {{ r.charger }}</span></span>
            <span class="spacer"></span><span class="muted">{{ fmtWhen(r.at) }}</span>
          </div>
        </div>

        <!-- Comentarios -->
        <div class="sec">
          <h3>Comentarios ({{ comments().length }})</h3>
          <div class="cmt-form">
            <textarea [(ngModel)]="newComment" placeholder="Deja un comentario sobre esta estación…"></textarea>
            <p-button icon="fa-solid fa-paper-plane" (onClick)="sendComment()" [disabled]="!newComment.trim()" />
          </div>
          <div class="cmt" *ngFor="let k of comments()">
            <div class="who">{{ k.by }} <small>{{ fmtWhen(k.at) }}</small></div>
            <div class="bd">{{ k.body }}</div>
          </div>
          <p class="muted" *ngIf="!comments().length" style="margin-top:8px">Sé el primero en comentar.</p>
        </div>
      </div>
    </p-dialog>
  `,
})
export class AppComponent implements OnInit, AfterViewInit {
  private api = inject(ElectrolinerasService);
  @ViewChild('mapEl') mapEl!: ElementRef<HTMLDivElement>;

  readonly isTest = signal(false);
  readonly view = signal<View>('map');
  readonly stations = signal<Station[]>([]);
  readonly filtered = signal<Station[]>([]);
  readonly loaded = signal(false);
  readonly showBanner = signal(true);
  query = '';
  cityFilter = '';
  connectorFilter = '';
  speedFilter = '';
  readonly speeds = computed(() => [...new Set(this.stations().map((s) => s.speed).filter(Boolean))].sort());

  // ── Planeador de viajes ──
  readonly tripOpen = signal(false);
  tripOrigin = ''; tripDest = ''; tripAutonomy: number | null = null;
  readonly planning = signal(false);
  readonly tripMsg = signal('');
  readonly tripInfo = signal<{ distanceKm: number; durationMin: number } | null>(null);
  readonly tripStations = signal<Station[]>([]);
  readonly tripStops = signal<Set<number>>(new Set());
  private routePos = new Map<number, number>();
  private routeLayer = L.layerGroup();

  readonly detail = signal<StationFull | null>(null);
  detailVisible = false;
  readonly comments = signal<Comment[]>([]);
  readonly reports = signal<Report[]>([]);
  newComment = '';

  private map?: L.Map;
  private markers = L.layerGroup();
  private userMarker?: L.Marker;
  readonly userPos = signal<[number, number] | null>(null);
  readonly locating = signal(false);

  readonly cities = computed(() => [...new Set(this.stations().map((s) => s.city).filter(Boolean))].sort());

  ngOnInit(): void {
    this.api.health().subscribe({ next: (h) => this.isTest.set(h.env === 'test'), error: () => {} });
    this.api.stations().subscribe({
      next: (s) => { this.stations.set(s); this.applyFilters(); this.loaded.set(true); this.renderMarkers(); },
      error: () => this.loaded.set(true),
    });
  }

  ngAfterViewInit(): void {
    this.map = L.map(this.mapEl.nativeElement, { zoomControl: true, attributionControl: true })
      .setView([4.65, -74.1], 6);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '© OpenStreetMap',
    }).addTo(this.map);
    this.markers.addTo(this.map);
    this.renderMarkers();
    // Pide la ubicación al entrar (si el usuario la concede).
    this.locate();
  }

  // ── Ubicación del dispositivo ──
  locate(): void {
    if (!navigator.geolocation) return;
    this.locating.set(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this.locating.set(false);
        const p: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        this.userPos.set(p);
        if (this.map) {
          this.map.setView(p, 12);
          const icon = L.divIcon({ className: '', html: '<div class="me"></div>', iconSize: [18, 18], iconAnchor: [9, 9] });
          if (this.userMarker) this.userMarker.setLatLng(p);
          else this.userMarker = L.marker(p, { icon, zIndexOffset: 1000 }).addTo(this.map);
        }
        this.applyFilters(); // reordena por cercanía
      },
      () => { this.locating.set(false); },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }

  private distanceKm(a: [number, number], b: [number, number]): number {
    const R = 6371, toRad = (x: number) => (x * Math.PI) / 180;
    const dLat = toRad(b[0] - a[0]), dLon = toRad(b[1] - a[1]);
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  }
  /** Distancia legible desde el usuario a una estación (o '' si no hay ubicación). */
  dist(s: { lat: number; lon: number }): string {
    const u = this.userPos();
    if (!u || s.lat == null || s.lon == null) return '';
    const km = this.distanceKm(u, [s.lat, s.lon]);
    return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
  }

  private matchConnector(connectors: string, type: string): boolean {
    const u = (connectors || '').toUpperCase();
    if (type === 'CCS2') return u.includes('CCS') || u.includes('COMBO');
    if (type === 'CHAdeMO') return u.includes('CHADEMO');
    if (type === 'Tipo 2') return u.includes('MENNEKES') || u.includes('TIPO 2') || u.includes('TYPE 2') || u.includes('EUROPEO');
    if (type === 'GB/T') return u.includes('GBT') || u.includes('GB/T') || u.includes('GB T');
    return true;
  }

  // ── Planeador de viajes ──
  toggleTrip(): void { this.tripOpen.set(!this.tripOpen()); }
  fmtDur(min: number): string { const h = Math.floor(min / 60), m = Math.round(min % 60); return h ? `${h}h ${m}m` : `${m} min`; }
  isStop(s: Station): boolean { return this.tripStops().has(s.id); }
  routeKm(s: Station): number { return Math.round(this.routePos.get(s.id) ?? 0); }
  tripStopsCount(): number { return this.tripStops().size; }

  clearTrip(): void {
    this.routeLayer.clearLayers();
    this.tripInfo.set(null); this.tripStations.set([]); this.tripStops.set(new Set()); this.tripMsg.set('');
  }

  plan(): void {
    if (!this.tripDest.trim()) return;
    this.planning.set(true); this.tripMsg.set('');
    this.resolveOrigin().then((origin) => {
      if (!origin) { this.planning.set(false); this.tripMsg.set('No pude ubicar el origen. Escríbelo o usa «Cerca de mí».'); return; }
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
        navigator.geolocation.getCurrentPosition(
          (p) => { const pt: [number, number] = [p.coords.latitude, p.coords.longitude]; this.userPos.set(pt); res(pt); },
          () => res(null), { timeout: 8000 });
      });
    }
    return new Promise((res) => {
      this.api.geocode(this.tripOrigin).subscribe({
        next: (pl) => res(pl.length ? [pl[0].lat, pl[0].lon] : null),
        error: () => res(null),
      });
    });
  }

  private drawRoute(origin: [number, number], dest: [number, number], r: { distanceKm: number; durationMin: number; coordinates: [number, number][] }): void {
    if (!r || !r.coordinates || !r.coordinates.length) { this.tripMsg.set('Ruta no disponible.'); return; }
    this.tripInfo.set({ distanceKm: r.distanceKm, durationMin: r.durationMin });
    this.setView('map');
    this.routeLayer.clearLayers();
    if (this.map && !this.map.hasLayer(this.routeLayer)) this.routeLayer.addTo(this.map);
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
    const THRESH = 8; // corredor de 8 km
    const step = Math.max(1, Math.floor(coords.length / 400));
    const near: { s: Station; pos: number }[] = [];
    this.routePos.clear();
    for (const s of this.stations()) {
      if (s.lat == null || s.lon == null) continue;
      let best = Infinity, bestIdx = 0;
      for (let i = 0; i < coords.length; i += step) {
        const d = this.distanceKm([s.lat, s.lon], coords[i]);
        if (d < best) { best = d; bestIdx = i; }
      }
      if (best <= THRESH) { near.push({ s, pos: cum[bestIdx] }); this.routePos.set(s.id, cum[bestIdx]); }
    }
    near.sort((a, b) => a.pos - b.pos);
    this.tripStations.set(near.map((n) => n.s));
    // paradas sugeridas según autonomía (greedy)
    const stops = new Set<number>();
    const a = this.tripAutonomy;
    if (a && a > 0 && near.length) {
      const range = a * 0.9;
      let lastPos = 0, candidate: { s: Station; pos: number } | null = null;
      for (const n of near) {
        if (n.pos - lastPos <= range) { candidate = n; }
        else { if (candidate) { stops.add(candidate.s.id); lastPos = candidate.pos; } candidate = n; }
      }
    }
    this.tripStops.set(stops);
  }

  setView(v: View): void {
    this.view.set(v);
    if (v === 'map') setTimeout(() => { this.map?.invalidateSize(); this.fitToMarkers(); }, 60);
  }

  applyFilters(): void {
    const q = this.query.trim().toLowerCase();
    const city = this.cityFilter;
    const u = this.userPos();
    const conn = this.connectorFilter;
    const speed = this.speedFilter;
    const list = this.stations().filter((s) => {
      if (city && s.city !== city) return false;
      if (speed && s.speed !== speed) return false;
      if (conn && !this.matchConnector(s.connectors, conn)) return false;
      if (!q) return true;
      return (s.name + ' ' + s.city + ' ' + s.address + ' ' + s.connectors).toLowerCase().includes(q);
    });
    if (u) {
      list.sort((a, b) => this.distanceKm(u, [a.lat, a.lon]) - this.distanceKm(u, [b.lat, b.lon]));
    }
    this.filtered.set(list);
    this.renderMarkers();
  }

  private renderMarkers(): void {
    if (!this.map) return;
    this.markers.clearLayers();
    for (const s of this.filtered()) {
      if (s.lat == null || s.lon == null) continue;
      const color = this.statusColor(s.communityStatus);
      const icon = L.divIcon({
        className: '', html: `<div class="pin" style="background:${color}"><i class="fa-solid fa-bolt"></i></div>`,
        iconSize: [30, 30], iconAnchor: [15, 30], popupAnchor: [0, -28],
      });
      L.marker([s.lat, s.lon], { icon }).addTo(this.markers)
        .on('click', () => this.openDetail(s));
    }
    this.fitToMarkers();
  }

  private fitToMarkers(): void {
    const pts = this.filtered().filter((s) => s.lat != null && s.lon != null).map((s) => [s.lat, s.lon] as [number, number]);
    if (this.map && pts.length) {
      try { this.map.fitBounds(L.latLngBounds(pts).pad(0.2), { maxZoom: 13 }); } catch { }
    }
  }

  openDetail(s: Station): void {
    this.detail.set(null); this.comments.set([]); this.reports.set([]); this.newComment = '';
    this.detailVisible = true;
    this.api.station(s.id).subscribe({ next: (d) => this.detail.set(d), error: () => {} });
    this.api.comments(s.id).subscribe({ next: (c) => this.comments.set(c), error: () => {} });
    this.api.reports(s.id).subscribe({ next: (r) => this.reports.set(r), error: () => {} });
  }

  private refreshDetail(): void {
    const d = this.detail();
    if (!d) return;
    this.api.station(d.id).subscribe({ next: (x) => this.detail.set(x), error: () => {} });
    this.api.reports(d.id).subscribe({ next: (r) => this.reports.set(r), error: () => {} });
    // refrescar el listado/mapa para reflejar el color del estado
    this.api.stations().subscribe({ next: (s) => { this.stations.set(s); this.applyFilters(); }, error: () => {} });
  }

  reportStation(status: string): void {
    const d = this.detail(); if (!d) return;
    this.api.report(d.id, null, status).subscribe({ next: () => this.refreshDetail(), error: () => {} });
  }
  reportCharger(c: Charger, status: string): void {
    const d = this.detail(); if (!d) return;
    this.api.report(d.id, c.id, status).subscribe({ next: () => this.refreshDetail(), error: () => {} });
  }
  sendComment(): void {
    const d = this.detail(); if (!d || !this.newComment.trim()) return;
    this.api.addComment(d.id, this.newComment).subscribe({
      next: () => { this.newComment = ''; this.api.comments(d.id).subscribe((c) => this.comments.set(c)); },
      error: () => {},
    });
  }

  // ── Estado / colores ──
  statusColor(s: string | null): string { return s === 'active' ? '#22c55e' : s === 'inactive' ? '#ef4444' : '#9aa3b2'; }
  statusLabel(s: string | null): string { return s === 'active' ? 'Activa' : s === 'inactive' ? 'Inactiva' : 'Sin reportes'; }
  statusSeverity(s: string | null): 'success' | 'danger' | 'secondary' { return s === 'active' ? 'success' : s === 'inactive' ? 'danger' : 'secondary'; }
  chargerColor(s: string): string { return s === 'free' ? '#22c55e' : s === 'busy' ? '#f59e0b' : s === 'broken' ? '#ef4444' : '#9aa3b2'; }
  chargerLabel(s: string): string { return s === 'free' ? 'Libre' : s === 'busy' ? 'Ocupado' : s === 'broken' ? 'Dañado' : s; }
  anyColor(s: string): string { return this.statusColor(s === 'active' ? 'active' : s === 'inactive' ? 'inactive' : null) !== '#9aa3b2' ? this.statusColor(s) : this.chargerColor(s); }
  anyLabel(s: string): string {
    const m: Record<string, string> = { active: 'activa', inactive: 'inactiva', free: 'libre', busy: 'ocupado', broken: 'dañado' };
    return m[s] || s;
  }
  fmtWhen(s: string): string {
    if (!s) return '';
    const d = new Date(s.replace(' ', 'T'));
    return isNaN(d.getTime()) ? s : d.toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
  }
}
