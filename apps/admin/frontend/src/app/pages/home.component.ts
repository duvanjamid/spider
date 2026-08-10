import { Component, OnInit, effect, inject, signal } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TagModule } from 'primeng/tag';
import { AuthService } from '../core/auth.service';
import { PlatformService, SpiderApp } from '../core/platform.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [NgFor, NgIf, FormsModule, RouterLink, ButtonModule, InputTextModule, TagModule],
  styles: [`
    .shell { max-width: 1080px; margin: 0 auto; padding: 0 16px 56px; }

    /* App bar */
    .bar { position: sticky; top: 0; z-index: 20; display: flex; align-items: center; gap: 12px;
           padding: 14px 4px; background: color-mix(in srgb, var(--bg) 86%, transparent);
           backdrop-filter: blur(10px); border-bottom: 1px solid var(--border); }
    .brand { display: flex; align-items: center; gap: 10px; font-weight: 700; font-size: 1.15rem; }
    .brand .blogo { width: 26px; height: 26px; color: var(--accent); }
    .hlogo { width: 68px; height: 68px; color: var(--accent); }
    .spacer { flex: 1; }
    .env { font-size: .68rem; font-weight: 800; letter-spacing: .5px; padding: 3px 8px; border-radius: 6px;
           background: #f59e0b; color: #1a1200; text-transform: uppercase; }
    .userchip { display: flex; align-items: center; gap: 10px; }
    .userchip .mail { color: var(--muted); font-size: .9rem; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .hamb { display: none; }
    /* Drawer móvil */
    .drawer { position: fixed; inset: 0 0 0 auto; width: min(82vw, 320px); background: var(--panel);
              border-left: 1px solid var(--border); box-shadow: var(--shadow); z-index: 40;
              padding: 20px; display: flex; flex-direction: column; gap: 14px; transform: translateX(100%);
              transition: transform .22s ease; }
    .drawer.open { transform: translateX(0); }
    .scrim { position: fixed; inset: 0; background: rgba(0,0,0,.4); z-index: 35; }
    .drawer .mail { color: var(--muted); font-size: .9rem; word-break: break-all; }

    @media (max-width: 680px) {
      .userchip.desktop { display: none; }
      .hamb { display: inline-flex; }
    }
    @media (min-width: 681px) { .drawer, .scrim { display: none; } }

    /* Hero landing */
    .hero { text-align: center; padding: 64px 0 28px; }
    .hero .big { font-size: 2.6rem; }
    .hero h2 { font-size: 2rem; margin: 12px 0 8px; }
    .muted { color: var(--muted); }
    .login-box { max-width: 420px; margin: 26px auto 0; display: flex; flex-direction: column; gap: 12px;
                 background: var(--panel); border: 1px solid var(--border); border-radius: 16px; padding: 22px; box-shadow: var(--shadow); }
    .row { display: flex; gap: 8px; } .row input { flex: 1; }
    .sep { display: flex; align-items: center; gap: 10px; color: var(--muted); font-size: .82rem; }
    .sep::before, .sep::after { content: ''; flex: 1; height: 1px; background: var(--border); }

    /* Launcher */
    .head { display: flex; align-items: baseline; justify-content: space-between; margin: 26px 4px 14px; }
    .head h3 { margin: 0; font-size: 1.15rem; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px; }
    .grid a { text-decoration: none; color: inherit; }
    .card { border: 1px solid var(--border); border-radius: 18px; overflow: hidden; background: var(--panel);
            box-shadow: var(--shadow); transition: transform .16s ease, box-shadow .16s ease; height: 100%; }
    .card:hover { transform: translateY(-4px); box-shadow: 0 10px 34px rgba(20,26,40,.16); }
    .card .top { height: 92px; display: flex; align-items: center; justify-content: center; position: relative; }
    .card .top .badge { width: 58px; height: 58px; border-radius: 16px; display: grid; place-items: center;
            font-size: 1.9rem; background: var(--panel); box-shadow: 0 2px 10px rgba(0,0,0,.14); }
    .card .body { padding: 14px 16px 18px; }
    .card .body .name { font-weight: 700; font-size: 1.05rem; }
    .card .body .desc { color: var(--muted); font-size: .86rem; margin-top: 4px; min-height: 34px; }
    .card .body .go { display: inline-flex; align-items: center; gap: 6px; margin-top: 12px; font-weight: 600; font-size: .9rem; }
    .empty { color: var(--muted); text-align: center; padding: 40px 0; }
  `],
  template: `
    <div class="shell">
      <!-- App bar -->
      <div class="bar">
        <div class="brand">
          <svg class="blogo" viewBox="0 0 32 32" aria-hidden="true">
            <g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M11 12 L4 7 M11 16 L3 16 M11 20 L4 25" />
              <path d="M21 12 L28 7 M21 16 L29 16 M21 20 L28 25" />
            </g>
            <ellipse cx="16" cy="16" rx="6" ry="7" fill="currentColor" />
            <circle cx="13.6" cy="14" r="1.3" fill="var(--panel)" /><circle cx="18.4" cy="14" r="1.3" fill="var(--panel)" />
          </svg>
          Spider <span class="env" *ngIf="isTest()">test</span>
        </div>
        <span class="spacer"></span>
        <div class="userchip desktop" *ngIf="auth.user() as u">
          <span class="mail">{{ u.email }}</span>
          <p-tag *ngIf="u.admin" value="admin" severity="warn" />
          <a *ngIf="u.admin" routerLink="/accesos"><p-button label="Accesos" icon="pi pi-users" [outlined]="true" size="small" /></a>
          <p-button label="Salir" icon="pi pi-sign-out" [text]="true" size="small" (onClick)="auth.logout()" />
        </div>
        <p-button class="hamb" *ngIf="auth.user()" icon="pi pi-bars" [text]="true" (onClick)="menuOpen.set(true)" aria-label="Menú" />
      </div>

      <!-- Drawer móvil -->
      <div class="scrim" *ngIf="menuOpen()" (click)="menuOpen.set(false)"></div>
      <div class="drawer" [class.open]="menuOpen()" *ngIf="auth.user() as u">
        <div class="brand">
          <svg class="blogo" viewBox="0 0 32 32" aria-hidden="true">
            <g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M11 12 L4 7 M11 16 L3 16 M11 20 L4 25" />
              <path d="M21 12 L28 7 M21 16 L29 16 M21 20 L28 25" />
            </g>
            <ellipse cx="16" cy="16" rx="6" ry="7" fill="currentColor" />
            <circle cx="13.6" cy="14" r="1.3" fill="var(--panel)" /><circle cx="18.4" cy="14" r="1.3" fill="var(--panel)" />
          </svg>
          Spider
        </div>
        <div class="mail">{{ u.email }}</div>
        <p-tag *ngIf="u.admin" value="admin" severity="warn" />
        <a *ngIf="u.admin" routerLink="/accesos" (click)="menuOpen.set(false)"><p-button label="Gestionar accesos" icon="pi pi-users" [outlined]="true" /></a>
        <span class="spacer"></span>
        <p-button label="Cerrar sesión" icon="pi pi-sign-out" severity="secondary" (onClick)="auth.logout(); menuOpen.set(false)" />
      </div>

      <!-- LANDING (no autenticado) -->
      <div class="hero" *ngIf="auth.ready() && !auth.user()">
        <svg class="hlogo" viewBox="0 0 32 32" aria-hidden="true">
          <g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M11 12 L4 7 M11 16 L3 16 M11 20 L4 25" />
            <path d="M21 12 L28 7 M21 16 L29 16 M21 20 L28 25" />
          </g>
          <ellipse cx="16" cy="16" rx="6" ry="7" fill="currentColor" />
          <circle cx="13.6" cy="14" r="1.3" fill="var(--bg)" /><circle cx="18.4" cy="14" r="1.3" fill="var(--bg)" />
        </svg>
        <h2>Un solo lugar para todas tus apps</h2>
        <p class="muted">Inicia sesión para ver las aplicaciones que tienes habilitadas.</p>
        <div class="login-box">
          <p-button label="Entrar con Google" icon="pi pi-google" (onClick)="auth.loginWithGoogle()" />
          <div class="sep">o, mientras configuramos Google</div>
          <div class="row">
            <input pInputText type="email" placeholder="tu-correo@gmail.com" [(ngModel)]="email" (keyup.enter)="doDevLogin()" />
            <p-button label="Entrar" (onClick)="doDevLogin()" [disabled]="!email" />
          </div>
          <small class="muted" *ngIf="error()">{{ error() }}</small>
        </div>
      </div>

      <!-- LAUNCHER (autenticado) -->
      <div *ngIf="auth.user()">
        <div class="head"><h3>Tus apps</h3><span class="muted">{{ apps().length }} disponible(s)</span></div>
        <div class="grid" *ngIf="apps().length">
          <a *ngFor="let app of apps()" [href]="'/' + app.slug + '/'">
            <div class="card">
              <div class="top" [style.background]="tint(app.color)">
                <div class="badge" [style.color]="app.color"><i [class]="app.icon"></i></div>
              </div>
              <div class="body">
                <div class="name">{{ app.name }}</div>
                <div class="desc">{{ app.description }}</div>
                <div class="go" [style.color]="app.color">Abrir <i class="pi pi-arrow-right" style="font-size:.8rem"></i></div>
              </div>
            </div>
          </a>
        </div>
        <p class="empty" *ngIf="loaded() && !apps().length">
          Aún no tienes apps habilitadas. Pide acceso a un administrador.
        </p>
      </div>
    </div>
  `,
})
export class HomeComponent implements OnInit {
  readonly auth = inject(AuthService);
  private platform = inject(PlatformService);

  email = '';
  readonly apps = signal<SpiderApp[]>([]);
  readonly loaded = signal(false);
  readonly error = signal('');
  readonly isTest = signal(false);
  readonly menuOpen = signal(false);
  private loadedFor: string | null = null;

  constructor() {
    effect(() => {
      const u = this.auth.user();
      if (u && this.loadedFor !== u.email) {
        this.loadedFor = u.email;
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
    this.platform.health().subscribe({ next: (h) => this.isTest.set(h.env === 'test'), error: () => {} });
  }

  /** Fondo tenue con el color base de la app para la cabecera de la card. */
  tint(color: string): string {
    return `linear-gradient(135deg, ${color}26, ${color}0d)`;
  }

  doDevLogin(): void {
    this.error.set('');
    if (!this.email) return;
    this.auth.devLogin(this.email).subscribe({
      error: () => this.error.set('No se pudo entrar (¿dev-login deshabilitado?).'),
    });
  }

  private loadApps(): void {
    this.platform.myApps().subscribe({
      next: (a) => { this.apps.set(a); this.loaded.set(true); },
      error: () => { this.apps.set([]); this.loaded.set(true); },
    });
  }
}
