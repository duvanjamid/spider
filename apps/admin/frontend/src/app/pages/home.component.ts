import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { NgFor, NgIf, NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TagModule } from 'primeng/tag';
import { AuthService } from '../core/auth.service';
import { PlatformService, SpiderApp } from '../core/platform.service';

type View = 'cards' | 'list';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [NgFor, NgIf, NgTemplateOutlet, FormsModule, RouterLink, ButtonModule, InputTextModule, TagModule],
  styles: [`
    .shell { max-width: 1120px; margin: 0 auto; padding: 0 16px 64px; }

    /* App bar */
    .bar { position: sticky; top: 0; z-index: 20; display: flex; align-items: center; gap: 12px;
           padding: 14px 4px; background: color-mix(in srgb, var(--bg) 86%, transparent);
           backdrop-filter: blur(10px); border-bottom: 1px solid var(--border); }
    .brand { display: flex; align-items: center; gap: 10px; font-weight: 800; font-size: 1.15rem; }
    .brand .blogo { width: 26px; height: 26px; color: var(--accent); }
    .spacer { flex: 1; }
    .env { font-size: .66rem; font-weight: 800; letter-spacing: .5px; padding: 3px 8px; border-radius: 6px;
           background: #f59e0b; color: #1a1200; text-transform: uppercase; }
    .userchip { display: flex; align-items: center; gap: 10px; }
    .uava { width: 30px; height: 30px; border-radius: 50%; overflow: hidden; flex: none; display: grid; place-items: center;
            background: var(--panel-2); color: var(--accent); font-weight: 800; font-size: .9rem; }
    .uava img { width: 100%; height: 100%; object-fit: cover; }
    .userchip .mail { color: var(--muted); font-size: .9rem; max-width: 190px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .hamb { display: none; }
    .drawer { position: fixed; inset: 0 0 0 auto; width: min(82vw, 320px); background: var(--panel);
              border-left: 1px solid var(--border); box-shadow: var(--shadow); z-index: 40; padding: 20px;
              display: flex; flex-direction: column; gap: 14px; transform: translateX(100%); transition: transform .22s ease; }
    .drawer.open { transform: translateX(0); }
    .scrim { position: fixed; inset: 0; background: rgba(0,0,0,.4); z-index: 35; }
    .drawer .mail { color: var(--muted); font-size: .9rem; word-break: break-all; }
    @media (max-width: 680px) { .userchip.desktop { display: none; } .hamb { display: inline-flex; } }
    @media (min-width: 681px) { .drawer, .scrim { display: none; } }

    /* Hero */
    .hero-head { padding: 30px 4px 10px; }
    .hero-head h2 { margin: 0; font-size: 1.7rem; letter-spacing: -.5px; }
    .hero-head p { margin: 6px 0 0; color: var(--muted); }

    /* Landing (no auth) */
    .land { text-align: center; padding: 60px 0 28px; }
    .hlogo { width: 68px; height: 68px; color: var(--accent); }
    .land h2 { font-size: 2rem; margin: 12px 0 8px; }
    .muted { color: var(--muted); }
    .login-box { max-width: 420px; margin: 26px auto 0; display: flex; flex-direction: column; gap: 12px;
                 background: var(--panel); border: 1px solid var(--border); border-radius: 16px; padding: 22px; box-shadow: var(--shadow); }
    .row { display: flex; gap: 8px; } .row input { flex: 1; }
    .sep { display: flex; align-items: center; gap: 10px; color: var(--muted); font-size: .82rem; }
    .sep::before, .sep::after { content: ''; flex: 1; height: 1px; background: var(--border); }

    /* Toolbar */
    .toolbar { display: flex; align-items: center; gap: 10px; margin: 18px 4px 14px; flex-wrap: wrap; }
    .search { position: relative; flex: 1; min-width: 200px; }
    .search i { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--muted); }
    .search input { width: 100%; padding: 10px 12px 10px 34px; border-radius: 12px; border: 1px solid var(--border);
                    background: var(--panel); color: var(--fg); }
    .seg { display: inline-flex; background: var(--panel-2); border-radius: 10px; padding: 3px; gap: 3px; }
    .seg button { border: none; background: transparent; color: var(--muted); padding: 8px 12px; border-radius: 8px; cursor: pointer; }
    .seg button.on { background: var(--panel); color: var(--fg); box-shadow: var(--shadow); }

    .sec-title { display: flex; align-items: center; gap: 8px; margin: 22px 4px 12px; color: var(--muted);
                 font-size: .78rem; font-weight: 700; letter-spacing: .6px; text-transform: uppercase; }
    .sec-title i { color: #f5b301; }

    /* Cards */
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 16px; }
    .card { position: relative; border: 1px solid var(--border); border-radius: 18px; overflow: hidden; background: var(--panel);
            box-shadow: var(--shadow); transition: transform .16s ease, box-shadow .16s ease; cursor: pointer; }
    .card:hover { transform: translateY(-4px); box-shadow: 0 12px 34px rgba(20,26,40,.18); }
    .card .top { height: 88px; display: flex; align-items: center; justify-content: center; position: relative; }
    .card .top .badge { width: 56px; height: 56px; border-radius: 16px; display: grid; place-items: center;
            font-size: 1.7rem; background: var(--panel); box-shadow: 0 2px 12px rgba(0,0,0,.16); }
    .card .body { padding: 14px 16px 16px; }
    .card .body .name { font-weight: 700; font-size: 1.05rem; }
    .card .body .desc { color: var(--muted); font-size: .85rem; margin-top: 4px; min-height: 38px;
            display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .card .body .go { display: inline-flex; align-items: center; gap: 6px; margin-top: 12px; font-weight: 600; font-size: .9rem; }
    .star { position: absolute; top: 10px; right: 10px; z-index: 2; width: 34px; height: 34px; border-radius: 10px; border: none;
            background: color-mix(in srgb, var(--panel) 70%, transparent); color: var(--muted); cursor: pointer; backdrop-filter: blur(4px); }
    .star.on { color: #f5b301; }

    /* List */
    .list { display: flex; flex-direction: column; gap: 8px; }
    .lrow { display: flex; align-items: center; gap: 14px; padding: 12px 14px; border: 1px solid var(--border);
            border-radius: 14px; background: var(--panel); cursor: pointer; transition: border-color .12s; }
    .lrow:hover { border-color: var(--accent); }
    .lrow .ic { width: 42px; height: 42px; border-radius: 12px; display: grid; place-items: center; font-size: 1.2rem; flex: none; }
    .lrow .grow { flex: 1; min-width: 0; } .lrow .grow .name { font-weight: 700; }
    .lrow .grow .desc { color: var(--muted); font-size: .84rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .lrow .lstar { color: var(--muted); background: none; border: none; cursor: pointer; font-size: 1rem; }
    .lrow .lstar.on { color: #f5b301; }
    .empty { color: var(--muted); text-align: center; padding: 40px 0; }
  `],
  template: `
    <div class="shell">
      <!-- App bar -->
      <div class="bar">
        <div class="brand">
          <svg class="blogo" viewBox="0 0 32 32" aria-hidden="true">
            <g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M11 12 L4 7 M11 16 L3 16 M11 20 L4 25" /><path d="M21 12 L28 7 M21 16 L29 16 M21 20 L28 25" />
            </g>
            <ellipse cx="16" cy="16" rx="6" ry="7" fill="currentColor" />
            <circle cx="13.6" cy="14" r="1.3" fill="var(--panel)" /><circle cx="18.4" cy="14" r="1.3" fill="var(--panel)" />
          </svg>
          Spider <span class="env" *ngIf="isTest()">test</span>
        </div>
        <span class="spacer"></span>
        <div class="userchip desktop" *ngIf="auth.user() as u">
          <span class="uava" *ngIf="u.picture; else uini"><img [src]="u.picture" alt="" referrerpolicy="no-referrer" /></span>
          <ng-template #uini><span class="uava ini">{{ (u.name || u.email).charAt(0).toUpperCase() }}</span></ng-template>
          <span class="mail">{{ u.name || u.email }}</span>
          <a *ngIf="u.admin" routerLink="/admin"><p-button label="Panel admin" icon="fa-solid fa-gauge-high" [outlined]="true" size="small" /></a>
          <p-button label="Salir" icon="fa-solid fa-arrow-right-from-bracket" [text]="true" size="small" (onClick)="auth.logout()" />
        </div>
        <p-button class="hamb" *ngIf="auth.user()" icon="fa-solid fa-bars" [text]="true" (onClick)="menuOpen.set(true)" aria-label="Menú" />
      </div>

      <!-- Drawer móvil -->
      <div class="scrim" *ngIf="menuOpen()" (click)="menuOpen.set(false)"></div>
      <div class="drawer" [class.open]="menuOpen()" *ngIf="auth.user() as u">
        <div class="brand">🕷️ Spider</div>
        <div class="mail">{{ u.email }}</div>
        <p-tag *ngIf="u.admin" value="admin" severity="warn" />
        <a *ngIf="u.admin" routerLink="/admin" (click)="menuOpen.set(false)"><p-button label="Panel de administración" icon="fa-solid fa-gauge-high" [outlined]="true" /></a>
        <span class="spacer"></span>
        <p-button label="Cerrar sesión" icon="fa-solid fa-arrow-right-from-bracket" severity="secondary" (onClick)="auth.logout(); menuOpen.set(false)" />
      </div>

      <!-- LANDING -->
      <div class="land" *ngIf="auth.ready() && !auth.user()">
        <svg class="hlogo" viewBox="0 0 32 32" aria-hidden="true">
          <g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M11 12 L4 7 M11 16 L3 16 M11 20 L4 25" /><path d="M21 12 L28 7 M21 16 L29 16 M21 20 L28 25" />
          </g>
          <ellipse cx="16" cy="16" rx="6" ry="7" fill="currentColor" />
          <circle cx="13.6" cy="14" r="1.3" fill="var(--bg)" /><circle cx="18.4" cy="14" r="1.3" fill="var(--bg)" />
        </svg>
        <h2>Tu suite de aplicaciones</h2>
        <p class="muted">Inicia sesión para ver las aplicaciones que tienes habilitadas.</p>
        <div class="login-box">
          <p-button label="Entrar con Google" icon="fa-brands fa-google" (onClick)="auth.loginWithGoogle()" />
          <!-- Dev-login: solo visible cuando el backend lo habilita (AUTH_DEV_LOGIN=true, p.ej. local). -->
          <ng-container *ngIf="devLogin()">
            <div class="sep">o, para desarrollo</div>
            <div class="row">
              <input pInputText type="email" placeholder="tu-correo@gmail.com" [(ngModel)]="email" (keyup.enter)="doDevLogin()" />
              <p-button label="Entrar" (onClick)="doDevLogin()" [disabled]="!email" />
            </div>
            <small class="muted" *ngIf="error()">{{ error() }}</small>
          </ng-container>
        </div>
      </div>

      <!-- LAUNCHER -->
      <div *ngIf="auth.user()">
        <div class="hero-head">
          <h2>Hola 👋</h2>
          <p>Estas son tus aplicaciones. Marca ⭐ las que uses más para tenerlas de primeras.</p>
        </div>

        <div class="toolbar" *ngIf="apps().length">
          <div class="search"><i class="fa-solid fa-magnifying-glass"></i>
            <input type="text" placeholder="Buscar aplicación…" [(ngModel)]="query" /></div>
          <div class="seg">
            <button [class.on]="view() === 'cards'" (click)="setView('cards')" title="Tarjetas"><i class="fa-solid fa-table-cells-large"></i></button>
            <button [class.on]="view() === 'list'" (click)="setView('list')" title="Lista"><i class="fa-solid fa-list"></i></button>
          </div>
        </div>

        <!-- Favoritas -->
        <ng-container *ngIf="favApps().length">
          <div class="sec-title"><i class="fa-solid fa-star"></i> Favoritas</div>
          <ng-container [ngTemplateOutlet]="view() === 'cards' ? cardsTpl : listTpl"
                        [ngTemplateOutletContext]="{ $implicit: favApps() }"></ng-container>
        </ng-container>

        <!-- Todas -->
        <div class="sec-title" *ngIf="favApps().length"><i class="fa-solid fa-th-large"></i> Aplicaciones</div>
        <ng-container [ngTemplateOutlet]="view() === 'cards' ? cardsTpl : listTpl"
                      [ngTemplateOutletContext]="{ $implicit: otherApps() }"></ng-container>

        <p class="empty" *ngIf="loaded() && !apps().length">Aún no tienes apps habilitadas. Pide acceso a un administrador.</p>
        <p class="empty" *ngIf="loaded() && apps().length && !shown().length">Ninguna app coincide con “{{ query }}”.</p>
      </div>
    </div>

    <!-- Plantilla: tarjetas -->
    <ng-template #cardsTpl let-list>
      <div class="grid">
        <div class="card" *ngFor="let app of list" (click)="open(app)">
          <button class="star" [class.on]="isFav(app.slug)" (click)="toggleFav(app.slug, $event)" [title]="isFav(app.slug) ? 'Quitar de favoritas' : 'Marcar favorita'">
            <i [class]="isFav(app.slug) ? 'fa-solid fa-star' : 'fa-regular fa-star'"></i>
          </button>
          <div class="top" [style.background]="tint(app.color)">
            <div class="badge" [style.color]="app.color"><i [class]="app.icon"></i></div>
          </div>
          <div class="body">
            <div class="name">{{ app.name }}</div>
            <div class="desc">{{ app.description || 'Aplicación de la suite Spider.' }}</div>
            <div class="go" [style.color]="app.color">Abrir <i class="fa-solid fa-arrow-right" style="font-size:.8rem"></i></div>
          </div>
        </div>
      </div>
    </ng-template>

    <!-- Plantilla: lista -->
    <ng-template #listTpl let-list>
      <div class="list">
        <div class="lrow" *ngFor="let app of list" (click)="open(app)">
          <span class="ic" [style.background]="tint(app.color)" [style.color]="app.color"><i [class]="app.icon"></i></span>
          <div class="grow">
            <div class="name">{{ app.name }}</div>
            <div class="desc">{{ app.description || 'Aplicación de la suite Spider.' }}</div>
          </div>
          <button class="lstar" [class.on]="isFav(app.slug)" (click)="toggleFav(app.slug, $event)">
            <i [class]="isFav(app.slug) ? 'fa-solid fa-star' : 'fa-regular fa-star'"></i></button>
          <i class="fa-solid fa-arrow-right muted" style="font-size:.85rem"></i>
        </div>
      </div>
    </ng-template>
  `,
})
export class HomeComponent implements OnInit {
  readonly auth = inject(AuthService);
  private platform = inject(PlatformService);

  email = '';
  query = '';
  readonly apps = signal<SpiderApp[]>([]);
  readonly loaded = signal(false);
  readonly error = signal('');
  readonly isTest = signal(false);
  readonly devLogin = signal(false);
  readonly menuOpen = signal(false);
  readonly favs = signal<string[]>([]);
  readonly view = signal<View>('cards');
  private loadedFor: string | null = null;

  readonly shown = computed(() => {
    const q = this.query.trim().toLowerCase();
    return this.apps()
      .filter((a) => !q || (a.name + ' ' + a.description).toLowerCase().includes(q))
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
  });
  readonly favApps = computed(() => this.shown().filter((a) => this.favs().includes(a.slug)));
  readonly otherApps = computed(() => this.shown().filter((a) => !this.favs().includes(a.slug)));

  constructor() {
    effect(() => {
      const u = this.auth.user();
      if (u && this.loadedFor !== u.email) {
        this.loadedFor = u.email;
        this.loadFavs();
        this.loadApps();
      } else if (!u) {
        this.loadedFor = null;
        this.apps.set([]);
        this.loaded.set(false);
      }
    }, { allowSignalWrites: true });
  }

  ngOnInit(): void {
    this.auth.refresh();
    this.platform.health().subscribe({
      next: (h) => { this.isTest.set(h.env === 'test'); this.devLogin.set(!!h.devLogin); },
      error: () => {},
    });
    const v = localStorage.getItem('spider_view');
    if (v === 'list' || v === 'cards') this.view.set(v);
  }

  setView(v: View): void { this.view.set(v); localStorage.setItem('spider_view', v); }
  open(app: SpiderApp): void { window.location.href = `/${app.slug}/`; }
  tint(color: string): string { return `linear-gradient(135deg, ${color}26, ${color}0d)`; }

  private favKey(): string { return 'spider_favs_' + (this.auth.user()?.email || 'anon'); }
  private loadFavs(): void {
    try { this.favs.set(JSON.parse(localStorage.getItem(this.favKey()) || '[]')); } catch { this.favs.set([]); }
  }
  isFav(slug: string): boolean { return this.favs().includes(slug); }
  toggleFav(slug: string, ev?: Event): void {
    ev?.stopPropagation();
    const s = new Set(this.favs());
    s.has(slug) ? s.delete(slug) : s.add(slug);
    const arr = [...s];
    this.favs.set(arr);
    localStorage.setItem(this.favKey(), JSON.stringify(arr));
  }

  doDevLogin(): void {
    this.error.set('');
    if (!this.email) return;
    this.auth.devLogin(this.email).subscribe({ error: () => this.error.set('No se pudo entrar (¿dev-login deshabilitado?).') });
  }

  private loadApps(): void {
    this.platform.myApps().subscribe({
      next: (a) => { this.apps.set(a); this.loaded.set(true); },
      error: () => { this.apps.set([]); this.loaded.set(true); },
    });
  }
}
