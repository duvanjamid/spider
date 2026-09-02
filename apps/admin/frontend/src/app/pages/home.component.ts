import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { NgFor, NgIf, NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { AuthService } from '../core/auth.service';
import { PlatformService, SpiderApp } from '../core/platform.service';

type View = 'cards' | 'list';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [NgFor, NgIf, NgTemplateOutlet, FormsModule, RouterLink, ButtonModule, TagModule],
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

    /* Landing (no auth) — pantalla de login */
    .muted { color: var(--muted); }
    .login-wrap { min-height: 82vh; display: grid; place-items: center; padding: 32px 16px; }
    .login-card { position: relative; width: 100%; max-width: 400px; text-align: center; overflow: hidden;
                  background: var(--panel); border: 1px solid var(--border); border-radius: 24px;
                  padding: 40px 30px 34px; box-shadow: 0 20px 60px rgba(20,26,40,.16); }
    .login-card::before { content: ''; position: absolute; inset: 0 0 auto 0; height: 120px;
                  background: radial-gradient(120% 100% at 50% 0%, color-mix(in srgb, var(--accent) 22%, transparent), transparent 70%); }
    .login-logo { position: relative; width: 76px; height: 76px; margin: 0 auto 18px; border-radius: 22px;
                  display: grid; place-items: center; color: #fff;
                  background: linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 55%, #9b6cff));
                  box-shadow: 0 10px 26px color-mix(in srgb, var(--accent) 40%, transparent); }
    .login-logo svg { width: 42px; height: 42px; }
    .login-card h2 { position: relative; margin: 0; font-size: 1.5rem; letter-spacing: -.4px; }
    .login-card .sub { position: relative; margin: 8px 0 26px; color: var(--muted); font-size: .95rem; line-height: 1.45; }
    .gbtn { position: relative; width: 100%; display: inline-flex; align-items: center; justify-content: center; gap: 12px;
            padding: 13px 18px; border-radius: 14px; border: 1px solid var(--border); background: var(--panel-2);
            color: var(--fg); font: inherit; font-weight: 700; font-size: 1rem; cursor: pointer; transition: transform .12s, box-shadow .12s, border-color .12s; }
    .gbtn:hover { transform: translateY(-1px); border-color: color-mix(in srgb, var(--accent) 50%, var(--border)); box-shadow: 0 8px 20px rgba(20,26,40,.12); }
    .gbtn:active { transform: translateY(0); }
    .gbtn .gicon { width: 20px; height: 20px; flex: none; }
    .login-note { position: relative; margin: 20px 0 0; color: var(--muted); font-size: .8rem; }
    .login-err { position: relative; margin: 0 0 18px; padding: 10px 12px; border-radius: 12px; font-size: .86rem;
                 background: color-mix(in srgb, #ef4444 12%, transparent); color: #ef4444;
                 border: 1px solid color-mix(in srgb, #ef4444 30%, transparent); }
    .login-env { position: absolute; top: 14px; right: 14px; font-size: .62rem; font-weight: 800; letter-spacing: .5px;
                 padding: 3px 8px; border-radius: 6px; background: #f59e0b; color: #1a1200; text-transform: uppercase; }

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

    /* Cards · tiles FLAT de color sólido. 3 por fila en móvil. */
    .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
    @media (min-width: 620px) { .grid { grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 16px; } }
    .tile {
      position: relative; border: none; cursor: pointer; color: #fff; font: inherit;
      background: var(--c); border-radius: 18px; padding: 16px 8px 14px;
      display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; text-align: center;
      aspect-ratio: 1 / 1; overflow: hidden;
      transition: transform .1s ease, filter .15s ease;
    }
    .tile::after { content: ''; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(255,255,255,.12), transparent 42%); pointer-events: none; }
    .tile:hover { filter: brightness(1.05); }
    .tile:active { transform: scale(.96); }
    .tile .ico { width: 48px; height: 48px; display: grid; place-items: center; border-radius: 14px;
            background: rgba(255,255,255,.22); font-size: 1.4rem; }
    .tile .nm { font-weight: 700; font-size: .82rem; line-height: 1.15; letter-spacing: -.01em;
            display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; word-break: break-word; }
    .tile .fav { position: absolute; top: 7px; right: 8px; z-index: 2; border: none; background: none; cursor: pointer;
            color: rgba(255,255,255,.75); font-size: .82rem; padding: 4px; line-height: 1; }
    .tile .fav.on { color: #fff; }

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

      <!-- LANDING · login -->
      <div class="login-wrap" *ngIf="auth.ready() && !auth.user()">
        <div class="login-card">
          <span class="login-env" *ngIf="isTest()">test</span>
          <div class="login-logo">
            <svg viewBox="0 0 32 32" aria-hidden="true">
              <g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <path d="M11 12 L4 7 M11 16 L3 16 M11 20 L4 25" /><path d="M21 12 L28 7 M21 16 L29 16 M21 20 L28 25" />
              </g>
              <ellipse cx="16" cy="16" rx="6" ry="7" fill="currentColor" />
              <circle cx="13.6" cy="14" r="1.3" fill="#fff" /><circle cx="18.4" cy="14" r="1.3" fill="#fff" />
            </svg>
          </div>
          <h2>Bienvenido a Spider</h2>
          <p class="sub">Tu suite de aplicaciones en un solo lugar.<br>Inicia sesión para continuar.</p>

          <div class="login-err" *ngIf="loginError()">{{ loginError() }}</div>

          <button class="gbtn" (click)="auth.loginWithGoogle()">
            <svg class="gicon" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"/>
              <path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"/>
              <path fill="#FBBC05" d="M11.69 28.18c-.44-1.32-.69-2.73-.69-4.18s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z"/>
              <path fill="#EA4335" d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"/>
            </svg>
            Continuar con Google
          </button>

          <p class="login-note">Solo con tu cuenta de Google.</p>
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

    <!-- Plantilla: tarjetas (tiles flat de color sólido) -->
    <ng-template #cardsTpl let-list>
      <div class="grid">
        <button class="tile" *ngFor="let app of list" (click)="open(app)" [style.--c]="app.color">
          <span class="fav" [class.on]="isFav(app.slug)" (click)="toggleFav(app.slug, $event)"
                [title]="isFav(app.slug) ? 'Quitar de favoritas' : 'Marcar favorita'">
            <i [class]="isFav(app.slug) ? 'fa-solid fa-star' : 'fa-regular fa-star'"></i>
          </span>
          <span class="ico"><i [class]="app.icon"></i></span>
          <span class="nm">{{ app.name }}</span>
        </button>
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

  query = '';
  readonly apps = signal<SpiderApp[]>([]);
  readonly loaded = signal(false);
  readonly loginError = signal('');
  readonly isTest = signal(false);
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
      next: (h) => this.isTest.set(h.env === 'test'),
      error: () => {},
    });
    // Si el login con Google falló, el backend redirige con ?auth_error=…
    const params = new URLSearchParams(window.location.search);
    const err = params.get('auth_error');
    if (err) {
      this.loginError.set(err);
      history.replaceState(null, '', window.location.pathname);
    }
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


  private loadApps(): void {
    this.platform.myApps().subscribe({
      next: (a) => { this.apps.set(a); this.loaded.set(true); },
      error: () => { this.apps.set([]); this.loaded.set(true); },
    });
  }
}
