import {
  Component, ElementRef, OnInit, AfterViewInit, ViewChild, inject, signal, computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as L from 'leaflet';
import { AlertasService, Alert, Category, Me } from './alertas.service';

type Sheet = 'none' | 'report' | 'detail' | 'profile';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
  <div class="app" [class.dark]="dark()">
    <!-- ░░ MAPA (canvas a pantalla completa, estilo Waze) ░░ -->
    <div class="map" #map></div>

    <!-- barra superior flotante -->
    <header class="top">
      <button class="chip me" (click)="openProfile()">
        <span class="ava" [style.--c]="levelColor()"><i class="fa-solid fa-user-shield"></i></span>
        <span class="who">
          <b>{{ me()?.pseudonym || 'Invitado' }}</b>
          <small>{{ levelLabel() }}</small>
        </span>
      </button>
      <div class="grow"></div>
      <span class="chip env" *ngIf="env() === 'test'"><i class="fa-solid fa-flask"></i> test</span>
      <button class="chip icon" (click)="locate(true)" title="Mi ubicación"><i class="fa-solid fa-location-crosshairs"></i></button>
    </header>

    <!-- banner de proximidad (peligro cerca) -->
    <div class="proximity" *ngIf="nearestDanger() as d" (click)="openDetail(d.id)">
      <span class="pdot" [style.background]="d.color"><i class="fa-solid" [ngClass]="d.icon"></i></span>
      <div class="ptxt">
        <b>{{ d.label }}</b>
        <small>a {{ fmtKm(d.distanceKm) }} · toca para ver</small>
      </div>
      <i class="fa-solid fa-chevron-right"></i>
    </div>

    <!-- FAB reportar (Waze: botón naranja grande) -->
    <button class="fab" (click)="openReport()" *ngIf="sheet() === 'none'">
      <i class="fa-solid fa-plus"></i>
      <span>Reportar</span>
    </button>

    <!-- contador flotante -->
    <div class="live" *ngIf="sheet() === 'none'">
      <span class="ldot"></span>{{ alerts().length }} activas cerca
    </div>

    <!-- ░░ HOJA: NUEVO REPORTE ░░ -->
    <div class="scrim" *ngIf="sheet() === 'report'" (click)="closeSheet()"></div>
    <section class="sheet" *ngIf="sheet() === 'report'">
      <div class="grip"></div>
      <h2>¿Qué está pasando?</h2>
      <p class="hint">Reportas en tu ubicación actual. El radio de alerta lo define el tipo.</p>
      <div class="cats">
        <button *ngFor="let c of categories()" class="cat" [class.on]="picked()?.slug === c.slug"
                [style.--c]="c.color" (click)="picked.set(c)">
          <span class="cico"><i class="fa-solid" [ngClass]="c.icon"></i></span>
          <b>{{ c.label }}</b>
          <small>{{ c.radiusKm }} km</small>
        </button>
      </div>

      <div class="rform" *ngIf="picked() as c">
        <label class="photo">
          <input type="file" accept="image/*" (change)="onPhoto($event)" hidden>
          <ng-container *ngIf="!photo()">
            <i class="fa-solid fa-camera"></i><span>Añadir foto (opcional)</span>
          </ng-container>
          <img *ngIf="photo()" [src]="photo()" alt="foto">
        </label>
        <textarea [(ngModel)]="desc" rows="2" maxlength="240"
                  placeholder="Describe brevemente (opcional)…"></textarea>
        <button class="send" [style.--c]="c.color" [disabled]="sending()" (click)="submit()">
          <i class="fa-solid" [ngClass]="sending() ? 'fa-spinner fa-spin' : c.icon"></i>
          {{ sending() ? 'Enviando…' : 'Publicar alerta' }}
        </button>
        <p class="err" *ngIf="error()">{{ error() }}</p>
      </div>
    </section>

    <!-- ░░ HOJA: DETALLE DE ALERTA ░░ -->
    <div class="scrim" *ngIf="sheet() === 'detail'" (click)="closeSheet()"></div>
    <section class="sheet detail" *ngIf="sheet() === 'detail' && selected() as a">
      <div class="grip"></div>
      <div class="dhead" [style.--c]="a.color">
        <span class="dico" [class.pulse]="a.status === 'crisis'"><i class="fa-solid" [ngClass]="a.icon"></i></span>
        <div class="dmeta">
          <h2>{{ a.label }}</h2>
          <small>por <b>{{ a.by }}</b> · {{ timeAgo(a.createdAt) }}
            <ng-container *ngIf="a.distanceKm != null"> · a {{ fmtKm(a.distanceKm) }}</ng-container>
          </small>
        </div>
        <span class="badge" [ngClass]="a.status">{{ statusLabel(a.status) }}</span>
      </div>

      <img class="dphoto" *ngIf="a.photo" [src]="a.photo" alt="foto del reporte">
      <p class="ddesc" *ngIf="a.description">{{ a.description }}</p>

      <div class="tallies">
        <span class="t ok"><i class="fa-solid fa-check"></i> {{ a.confirms }}</span>
        <span class="t no"><i class="fa-solid fa-xmark"></i> {{ a.denies }}</span>
        <span class="t" *ngIf="a.safeCount"><i class="fa-solid fa-shield-heart"></i> {{ a.safeCount }} a salvo</span>
        <span class="t radius"><i class="fa-solid fa-circle-notch"></i> {{ a.radiusKm }} km</span>
      </div>

      <!-- Waze: ¿sigue ahí? -->
      <div class="actions" *ngIf="!isMine(a)">
        <p class="q">¿Sigue ahí?</p>
        <div class="vote">
          <button class="v yes" [class.on]="a.myVote === 'confirm'" [disabled]="voting()" (click)="vote(a, 'confirm')">
            <i class="fa-solid fa-thumbs-up"></i> Sí, confirmo
          </button>
          <button class="v not" [class.on]="a.myVote === 'deny'" [disabled]="voting()" (click)="vote(a, 'deny')">
            <i class="fa-solid fa-thumbs-down"></i> Ya no
          </button>
        </div>
        <p class="geo" *ngIf="voteHint()"><i class="fa-solid fa-circle-info"></i> {{ voteHint() }}</p>
        <button class="safe" [class.done]="a.iAmSafe" (click)="markSafe(a)">
          <i class="fa-solid fa-shield-heart"></i> {{ a.iAmSafe ? 'Marcaste que estás a salvo' : 'Estoy a salvo' }}
        </button>
      </div>

      <div class="actions" *ngIf="isMine(a)">
        <p class="q mine"><i class="fa-solid fa-user-pen"></i> Este es tu reporte</p>
        <button class="resolve" (click)="resolve(a)"><i class="fa-solid fa-flag-checkered"></i> Marcar como resuelto</button>
      </div>
    </section>

    <!-- ░░ HOJA: PERFIL / REPUTACIÓN ░░ -->
    <div class="scrim" *ngIf="sheet() === 'profile'" (click)="closeSheet()"></div>
    <section class="sheet profile" *ngIf="sheet() === 'profile' && me() as m">
      <div class="grip"></div>
      <div class="phead">
        <span class="pava" [style.--c]="levelColor()"><i class="fa-solid fa-user-shield"></i></span>
        <div>
          <h2>{{ m.pseudonym }}</h2>
          <span class="lvl" [style.--c]="levelColor()">{{ levelLabel() }} · {{ m.score }} pts</span>
        </div>
      </div>
      <p class="anon"><i class="fa-solid fa-user-secret"></i> Tu identidad es anónima ante la comunidad: solo ven tu seudónimo.</p>
      <div class="stats">
        <div class="st"><b>{{ m.reports }}</b><small>reportes</small></div>
        <div class="st"><b>{{ m.confirmed }}</b><small>confirmados</small></div>
        <div class="st"><b>{{ m.denied }}</b><small>desmentidos</small></div>
      </div>
      <h3>Mis reportes</h3>
      <div class="mine-list" *ngIf="myAlerts().length; else nomine">
        <button class="mrow" *ngFor="let a of myAlerts()" (click)="openDetail(a.id)">
          <span class="mico" [style.background]="a.color"><i class="fa-solid" [ngClass]="a.icon"></i></span>
          <div class="mtxt"><b>{{ a.label }}</b><small>{{ timeAgo(a.createdAt) }}</small></div>
          <span class="badge" [ngClass]="a.status">{{ statusLabel(a.status) }}</span>
        </button>
      </div>
      <ng-template #nomine><p class="empty">Aún no has publicado reportes.</p></ng-template>
    </section>
  </div>
  `,
  styles: [`
    :host { --brand:#ef4444; --bg:#eef1f5; --panel:#fff; --ink:#0f172a; --sub:#64748b; --border:#e2e8f0;
      --shadow:0 10px 40px rgba(15,23,42,.18); font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
    .app.dark { --bg:#0b1220; --panel:#111a2b; --ink:#e8eefc; --sub:#93a4c4; --border:#1e2b45;
      --shadow:0 10px 40px rgba(0,0,0,.5); }
    * { box-sizing: border-box; }
    .app { position: fixed; inset: 0; overflow: hidden; background: var(--bg); color: var(--ink); }

    /* Mapa: z-index:0 confina los z-index internos de Leaflet (hasta 1000). */
    .map { position: absolute; inset: 0; z-index: 0; }
    :host ::ng-deep .leaflet-container { background: var(--bg); font-family: inherit; }
    /* Mapa limpio de OpenStreetMap, SIN teñir el conjunto. */

    .chip { display: inline-flex; align-items: center; gap: 8px; height: 42px; padding: 0 12px; border: none;
      border-radius: 999px; background: var(--panel); color: var(--ink); box-shadow: var(--shadow); cursor: pointer;
      font-size: .86rem; backdrop-filter: blur(8px); }
    .chip.icon { width: 42px; padding: 0; justify-content: center; font-size: 1rem; }
    .chip.env { background: #f59e0b; color: #1a1205; font-weight: 700; }

    .top { position: absolute; top: calc(env(safe-area-inset-top) + 12px); left: 12px; right: 12px; z-index: 20;
      display: flex; align-items: center; gap: 8px; }
    .top .grow { flex: 1; }
    .chip.me .ava { width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; color: #fff;
      background: var(--c, #64748b); font-size: .8rem; }
    .chip.me .who { display: flex; flex-direction: column; line-height: 1.05; text-align: left; }
    .chip.me .who small { color: var(--sub); font-size: .68rem; }

    .proximity { position: absolute; top: calc(env(safe-area-inset-top) + 64px); left: 12px; right: 12px; z-index: 19;
      display: flex; align-items: center; gap: 12px; padding: 10px 14px; border-radius: 16px; cursor: pointer;
      background: var(--panel); box-shadow: var(--shadow); border-left: 4px solid #ef4444; animation: drop .4s ease; }
    @keyframes drop { from { transform: translateY(-12px); opacity: 0; } }
    .proximity .pdot { width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; color: #fff; flex: 0 0 auto; }
    .proximity .ptxt { flex: 1; display: flex; flex-direction: column; line-height: 1.15; }
    .proximity .ptxt small { color: var(--sub); }
    .proximity > i { color: var(--sub); }

    .fab { position: absolute; right: 16px; bottom: calc(env(safe-area-inset-bottom) + 22px); z-index: 25;
      display: inline-flex; align-items: center; gap: 9px; height: 58px; padding: 0 22px 0 20px; border: none;
      border-radius: 999px; background: linear-gradient(135deg, #f97316, #ef4444); color: #fff; font-weight: 800;
      font-size: 1.02rem; box-shadow: 0 12px 30px rgba(239,68,68,.5); cursor: pointer; transition: transform .15s; }
    .fab:active { transform: scale(.95); }
    .fab i { font-size: 1.1rem; }

    .live { position: absolute; left: 16px; bottom: calc(env(safe-area-inset-bottom) + 30px); z-index: 24;
      display: inline-flex; align-items: center; gap: 8px; height: 38px; padding: 0 14px; border-radius: 999px;
      background: var(--panel); color: var(--sub); box-shadow: var(--shadow); font-size: .8rem; font-weight: 600; }
    .ldot { width: 9px; height: 9px; border-radius: 50%; background: #22c55e; box-shadow: 0 0 0 0 rgba(34,197,94,.6);
      animation: ping 1.8s infinite; }
    @keyframes ping { 70% { box-shadow: 0 0 0 8px rgba(34,197,94,0); } 100% { box-shadow: 0 0 0 0 rgba(34,197,94,0); } }

    .scrim { position: absolute; inset: 0; z-index: 40; background: rgba(2,6,23,.5); backdrop-filter: blur(2px); animation: fade .2s; }
    @keyframes fade { from { opacity: 0; } }
    .sheet { position: absolute; left: 0; right: 0; bottom: 0; z-index: 41; background: var(--panel); color: var(--ink);
      border-radius: 22px 22px 0 0; box-shadow: var(--shadow); padding: 10px 18px calc(env(safe-area-inset-bottom) + 20px);
      max-height: 88vh; overflow-y: auto; animation: up .28s cubic-bezier(.22,1,.36,1); }
    @keyframes up { from { transform: translateY(100%); } }
    .grip { width: 42px; height: 5px; border-radius: 3px; background: var(--border); margin: 4px auto 12px; }
    .sheet h2 { margin: 2px 0 4px; font-size: 1.24rem; }
    .hint { color: var(--sub); font-size: .85rem; margin: 0 0 14px; }

    .cats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
    @media (max-width: 380px) { .cats { grid-template-columns: repeat(3, 1fr); } }
    .cat { display: flex; flex-direction: column; align-items: center; gap: 5px; padding: 12px 6px; border-radius: 16px;
      border: 2px solid var(--border); background: transparent; color: var(--ink); cursor: pointer; transition: .15s; }
    .cat b { font-size: .72rem; text-align: center; line-height: 1.1; }
    .cat small { color: var(--sub); font-size: .64rem; }
    .cat .cico { width: 44px; height: 44px; border-radius: 14px; display: grid; place-items: center; color: #fff;
      background: var(--c); font-size: 1.15rem; box-shadow: 0 6px 16px color-mix(in srgb, var(--c) 45%, transparent); }
    .cat.on { border-color: var(--c); background: color-mix(in srgb, var(--c) 12%, transparent); transform: translateY(-2px); }

    .rform { margin-top: 16px; display: flex; flex-direction: column; gap: 12px; }
    .photo { display: flex; align-items: center; justify-content: center; gap: 10px; min-height: 92px; border-radius: 16px;
      border: 2px dashed var(--border); color: var(--sub); cursor: pointer; overflow: hidden; }
    .photo img { width: 100%; height: 160px; object-fit: cover; }
    textarea { width: 100%; border: 1px solid var(--border); border-radius: 14px; padding: 12px; background: var(--bg);
      color: var(--ink); font: inherit; resize: none; }
    .send { display: inline-flex; align-items: center; justify-content: center; gap: 10px; height: 54px; border: none;
      border-radius: 16px; background: var(--c); color: #fff; font-weight: 800; font-size: 1rem; cursor: pointer; }
    .send:disabled { opacity: .7; }
    .err { color: #ef4444; font-size: .85rem; margin: 2px 0 0; text-align: center; }

    .detail .dhead { display: flex; align-items: center; gap: 12px; }
    .dico { width: 52px; height: 52px; border-radius: 16px; display: grid; place-items: center; color: #fff; flex: 0 0 auto;
      background: var(--c); font-size: 1.35rem; }
    .dico.pulse { animation: pl 1.3s infinite; }
    @keyframes pl { 0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--c) 70%, transparent); }
      100% { box-shadow: 0 0 0 16px transparent; } }
    .dmeta { flex: 1; } .dmeta h2 { margin: 0; } .dmeta small { color: var(--sub); }
    .badge { font-size: .68rem; font-weight: 800; padding: 4px 9px; border-radius: 999px; text-transform: uppercase;
      letter-spacing: .3px; background: var(--border); color: var(--sub); }
    .badge.oficial { background: #dbeafe; color: #1d4ed8; }
    .badge.crisis { background: #fee2e2; color: #b91c1c; }
    .badge.falsa { background: #f3f4f6; color: #6b7280; text-decoration: line-through; }
    .badge.resuelta { background: #dcfce7; color: #15803d; }
    .app.dark .badge.oficial { background: #1e3a8a; color: #bfdbfe; }
    .app.dark .badge.crisis { background: #7f1d1d; color: #fecaca; }
    .app.dark .badge.resuelta { background: #14532d; color: #bbf7d0; }

    .dphoto { width: 100%; max-height: 220px; object-fit: cover; border-radius: 16px; margin: 14px 0 0; }
    .ddesc { margin: 14px 0 0; line-height: 1.4; }
    .tallies { display: flex; flex-wrap: wrap; gap: 8px; margin: 16px 0; }
    .t { display: inline-flex; align-items: center; gap: 6px; padding: 6px 11px; border-radius: 999px; font-weight: 700;
      font-size: .82rem; background: var(--bg); color: var(--sub); }
    .t.ok { color: #16a34a; } .t.no { color: #dc2626; } .t.radius { color: var(--sub); }

    .actions { border-top: 1px solid var(--border); padding-top: 14px; }
    .q { margin: 0 0 10px; font-weight: 700; }
    .q.mine { color: var(--sub); font-weight: 600; }
    .vote { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .v { display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 50px; border-radius: 14px;
      border: 2px solid var(--border); background: transparent; color: var(--ink); font-weight: 700; cursor: pointer; }
    .v.yes.on { border-color: #16a34a; background: color-mix(in srgb, #16a34a 15%, transparent); color: #16a34a; }
    .v.not.on { border-color: #dc2626; background: color-mix(in srgb, #dc2626 15%, transparent); color: #dc2626; }
    .v:disabled { opacity: .6; }
    .geo { color: var(--sub); font-size: .78rem; margin: 10px 0 0; display: flex; gap: 6px; align-items: flex-start; }
    .safe, .resolve { width: 100%; margin-top: 12px; height: 48px; border-radius: 14px; border: none; cursor: pointer;
      font-weight: 800; display: inline-flex; align-items: center; justify-content: center; gap: 8px; }
    .safe { background: color-mix(in srgb, #0ea5e9 16%, transparent); color: #0284c7; }
    .safe.done { background: #dcfce7; color: #15803d; }
    .resolve { background: #22c55e; color: #05300f; }

    .profile .phead { display: flex; align-items: center; gap: 14px; }
    .pava { width: 56px; height: 56px; border-radius: 50%; display: grid; place-items: center; color: #fff;
      background: var(--c, #64748b); font-size: 1.4rem; }
    .lvl { font-size: .82rem; font-weight: 800; color: var(--c, #64748b); }
    .anon { display: flex; gap: 8px; align-items: flex-start; font-size: .82rem; color: var(--sub); margin: 14px 0;
      background: var(--bg); padding: 12px; border-radius: 14px; }
    .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 8px; }
    .st { background: var(--bg); border-radius: 14px; padding: 14px; text-align: center; }
    .st b { display: block; font-size: 1.5rem; } .st small { color: var(--sub); }
    .profile h3 { margin: 18px 0 10px; font-size: 1rem; }
    .mrow { width: 100%; display: flex; align-items: center; gap: 12px; padding: 10px; border-radius: 14px; border: none;
      background: var(--bg); color: var(--ink); cursor: pointer; margin-bottom: 8px; }
    .mico { width: 40px; height: 40px; border-radius: 12px; display: grid; place-items: center; color: #fff; flex: 0 0 auto; }
    .mtxt { flex: 1; display: flex; flex-direction: column; text-align: left; }
    .mtxt small { color: var(--sub); }
    .empty { color: var(--sub); text-align: center; padding: 20px; }

    /* ░ Marcadores estilo Waze ░ (definidos globales para los divIcon de Leaflet) */
    :host ::ng-deep .wz { position: relative; width: 38px; height: 46px; }
    :host ::ng-deep .wz .bubble { position: absolute; top: 0; left: 0; width: 38px; height: 38px; border-radius: 50% 50% 50% 8px;
      transform: rotate(45deg); background: var(--c); box-shadow: 0 6px 14px rgba(0,0,0,.35); border: 2.5px solid #fff; }
    :host ::ng-deep .wz .bubble i { transform: rotate(-45deg); }
    :host ::ng-deep .wz .glyph { position: absolute; top: 0; left: 0; width: 38px; height: 38px; display: grid;
      place-items: center; color: #fff; font-size: 1rem; }
    :host ::ng-deep .wz.crisis::before { content: ''; position: absolute; top: -6px; left: -6px; width: 50px; height: 50px;
      border-radius: 50%; background: var(--c); opacity: .35; animation: wzpulse 1.4s infinite; }
    @keyframes wzpulse { 0% { transform: scale(.6); opacity: .5; } 100% { transform: scale(1.5); opacity: 0; } }
    :host ::ng-deep .wz.official .bubble { border-color: #38bdf8; box-shadow: 0 0 0 3px rgba(56,189,248,.5), 0 6px 14px rgba(0,0,0,.35); }
    :host ::ng-deep .me-dot { width: 20px; height: 20px; border-radius: 50%; background: #2563eb; border: 3px solid #fff;
      box-shadow: 0 0 0 4px rgba(37,99,235,.3), 0 2px 8px rgba(0,0,0,.4); }
  `],
})
export class AppComponent implements OnInit, AfterViewInit {
  @ViewChild('map', { static: true }) mapEl!: ElementRef<HTMLDivElement>;
  private api = inject(AlertasService);

  readonly alerts = signal<Alert[]>([]);
  readonly categories = signal<Category[]>([]);
  readonly me = signal<Me | null>(null);
  readonly myAlerts = signal<Alert[]>([]);
  readonly selected = signal<Alert | null>(null);
  readonly sheet = signal<Sheet>('none');
  readonly picked = signal<Category | null>(null);
  readonly photo = signal<string | null>(null);
  readonly sending = signal(false);
  readonly voting = signal(false);
  readonly error = signal('');
  readonly voteHint = signal('');
  readonly env = signal<'test' | 'production'>('production');
  readonly dark = signal(this.prefersDark());
  desc = '';

  private map!: L.Map;
  private tiles!: L.TileLayer;
  private userPos: [number, number] | null = null;
  private meMarker: L.Marker | null = null;
  private layer = L.layerGroup();
  private circle: L.Circle | null = null;

  readonly nearestDanger = computed(() => {
    const inside = this.alerts()
      .filter(a => a.distanceKm != null && a.severity >= 2 && a.distanceKm <= a.radiusKm && a.status !== 'falsa')
      .sort((x, y) => (x.distanceKm! - y.distanceKm!));
    return inside[0] || null;
  });

  ngOnInit(): void {
    this.api.health().subscribe({ next: r => this.env.set(r.env === 'test' ? 'test' : 'production'), error: () => {} });
    this.api.categories().subscribe(c => this.categories.set(c));
    this.api.me().subscribe(m => this.me.set(m));
    window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', e => {
      this.dark.set(e.matches); this.tiles?.setUrl(this.tileUrl());
    });
  }

  ngAfterViewInit(): void {
    this.map = L.map(this.mapEl.nativeElement, { zoomControl: false, attributionControl: false })
      .setView([4.65, -74.1], 12);
    this.tiles = L.tileLayer(this.tileUrl(), {
      maxZoom: 19, subdomains: 'abc', attribution: '© OpenStreetMap',
    }).addTo(this.map);
    this.layer.addTo(this.map);
    L.control.zoom({ position: 'bottomright' }).addTo(this.map);
    this.locate(true);
    // Refresca al mover el mapa (debounced).
    let t: any;
    this.map.on('moveend', () => { clearTimeout(t); t = setTimeout(() => this.refresh(), 500); });
  }

  // ─── datos ───
  private refresh(): void {
    const c = this.map.getCenter();
    this.api.nearby(c.lat, c.lng, 80).subscribe(list => { this.alerts.set(list); this.render(); });
  }

  private render(): void {
    this.layer.clearLayers();
    for (const a of this.alerts()) {
      const cls = `wz ${a.status === 'crisis' ? 'crisis' : ''} ${a.official ? 'official' : ''}`;
      const icon = L.divIcon({
        className: '',
        html: `<div class="${cls}" style="--c:${a.color}">
                 <div class="bubble"></div>
                 <div class="glyph"><i class="fa-solid ${a.icon}"></i></div>
               </div>`,
        iconSize: [38, 46], iconAnchor: [19, 44], popupAnchor: [0, -42],
      });
      L.marker([a.lat, a.lon], { icon }).addTo(this.layer).on('click', () => this.openDetail(a.id));
    }
  }

  // ─── ubicación ───
  locate(center = false): void {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(p => {
      const pt: [number, number] = [p.coords.latitude, p.coords.longitude];
      this.userPos = pt;
      const icon = L.divIcon({ className: '', html: '<div class="me-dot"></div>', iconSize: [20, 20], iconAnchor: [10, 10] });
      if (this.meMarker) this.meMarker.setLatLng(pt);
      else this.meMarker = L.marker(pt, { icon, zIndexOffset: 1000 }).addTo(this.map);
      if (center) this.map.setView(pt, 14);
      this.refresh();
    }, () => { if (center) this.refresh(); }, { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 });
  }

  // ─── hojas ───
  openReport(): void { this.error.set(''); this.picked.set(null); this.photo.set(null); this.desc = ''; this.sheet.set('report'); }
  openProfile(): void {
    this.api.me().subscribe(m => this.me.set(m));
    this.api.myAlerts().subscribe(a => this.myAlerts.set(a));
    this.sheet.set('profile');
  }
  openDetail(id: number): void {
    this.voteHint.set('');
    this.api.alert(id).subscribe(a => { this.selected.set(a); this.sheet.set('detail'); this.focus(a); });
  }
  closeSheet(): void { this.sheet.set('none'); if (this.circle) { this.circle.remove(); this.circle = null; } }

  private focus(a: Alert): void {
    if (this.circle) this.circle.remove();
    this.circle = L.circle([a.lat, a.lon], { radius: a.radiusKm * 1000, color: a.color, weight: 1.5,
      fillColor: a.color, fillOpacity: 0.12 }).addTo(this.map);
    this.map.setView([a.lat, a.lon], Math.max(this.map.getZoom(), 13), { animate: true });
  }

  // ─── acciones ───
  onPhoto(ev: Event): void {
    const f = (ev.target as HTMLInputElement).files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => this.photo.set(r.result as string);
    r.readAsDataURL(f);
  }

  submit(): void {
    const c = this.picked();
    if (!c) return;
    this.error.set('');
    const go = (lat: number, lon: number) => {
      this.sending.set(true);
      this.api.create({ category: c.slug, description: this.desc || undefined, photo: this.photo() || undefined, lat, lon })
        .subscribe({
          next: a => { this.sending.set(false); this.closeSheet(); this.refresh(); this.openDetail(a.id); },
          error: e => { this.sending.set(false); this.error.set(e?.error?.error || 'No se pudo publicar'); },
        });
    };
    if (this.userPos) { go(this.userPos[0], this.userPos[1]); return; }
    if (!navigator.geolocation) { this.error.set('Activa la ubicación para reportar'); return; }
    navigator.geolocation.getCurrentPosition(
      p => { this.userPos = [p.coords.latitude, p.coords.longitude]; go(p.coords.latitude, p.coords.longitude); },
      () => this.error.set('Necesitamos tu ubicación para el reporte'),
      { enableHighAccuracy: true, timeout: 8000 });
  }

  vote(a: Alert, v: 'confirm' | 'deny'): void {
    this.voteHint.set('');
    const cast = (lat: number, lon: number) => {
      this.voting.set(true);
      this.api.vote(a.id, v, lat, lon).subscribe({
        next: r => { this.voting.set(false); this.selected.set(r); this.refresh(); },
        error: e => { this.voting.set(false); this.voteHint.set(e?.error?.error || 'No se pudo registrar tu voto'); },
      });
    };
    if (this.userPos) { cast(this.userPos[0], this.userPos[1]); return; }
    if (!navigator.geolocation) { this.voteHint.set('Activa la ubicación para validar'); return; }
    navigator.geolocation.getCurrentPosition(
      p => { this.userPos = [p.coords.latitude, p.coords.longitude]; cast(p.coords.latitude, p.coords.longitude); },
      () => this.voteHint.set('Necesitamos tu ubicación para validar'),
      { enableHighAccuracy: true, timeout: 8000 });
  }

  markSafe(a: Alert): void {
    const send = (lat: number | null, lon: number | null) =>
      this.api.safe(a.id, lat as number, lon as number).subscribe(r => this.selected.set(r));
    if (this.userPos) send(this.userPos[0], this.userPos[1]);
    else send(null, null);
  }

  resolve(a: Alert): void {
    this.api.resolve(a.id).subscribe(r => { this.selected.set(r); this.refresh(); });
  }

  isMine(a: Alert): boolean {
    return !!this.me() && this.myAlerts().some(m => m.id === a.id);
  }

  // ─── helpers de presentación ───
  private tileUrl(): string {
    // OpenStreetMap estándar (SIN API key). CARTO empezó a exigir key y devolvía
    // teselas "API KEY REQUIRED". El tinte rojo temático se aplica por CSS.
    return 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
  }
  private prefersDark(): boolean {
    return typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  levelColor(): string {
    switch (this.me()?.level) {
      case 'veterano': return '#8b5cf6';
      case 'confiable': return '#22c55e';
      case 'penalizado': return '#ef4444';
      default: return '#64748b';
    }
  }
  levelLabel(): string {
    const l = this.me()?.level;
    return l ? l.charAt(0).toUpperCase() + l.slice(1) : 'Nuevo';
  }
  statusLabel(s: string): string {
    return { activa: 'Activa', oficial: 'Oficial', crisis: 'Crisis', falsa: 'Falsa', resuelta: 'Resuelta' }[s] || s;
  }
  fmtKm(km?: number): string {
    if (km == null) return '';
    return km < 1 ? Math.round(km * 1000) + ' m' : km.toFixed(1) + ' km';
  }
  timeAgo(iso: string): string {
    const s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 60) return 'hace un momento';
    if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
    if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
    return `hace ${Math.floor(s / 86400)} d`;
  }
}
