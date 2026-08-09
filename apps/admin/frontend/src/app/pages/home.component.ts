import { Component, OnInit, effect, inject, signal } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { InputTextModule } from 'primeng/inputtext';
import { TagModule } from 'primeng/tag';
import { AuthService } from '../core/auth.service';
import { PlatformService, SpiderApp } from '../core/platform.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [NgFor, NgIf, FormsModule, RouterLink, ButtonModule, CardModule, InputTextModule, TagModule],
  styles: [`
    .wrap { max-width: 980px; margin: 0 auto; padding: 40px 20px; }
    header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 28px; gap: 16px; flex-wrap: wrap; }
    .brand { display: flex; align-items: baseline; gap: 10px; }
    .brand h1 { font-size: 1.6rem; margin: 0; }
    .muted { color: var(--muted, #9aa3b2); }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px; }
    .grid a { text-decoration: none; }
    .hero { text-align: center; padding: 56px 0 24px; }
    .hero h2 { font-size: 2rem; margin: 0 0 8px; }
    .login-box { max-width: 420px; margin: 24px auto 0; display: flex; flex-direction: column; gap: 12px; }
    .row { display: flex; gap: 8px; }
    .row input { flex: 1; }
    .spacer { flex: 1; }
    .userbox { display: flex; align-items: center; gap: 12px; }
  `],
  template: `
    <div class="wrap">
      <header>
        <div class="brand">
          <h1>🕷️ Spider</h1>
          <span class="muted">Plataforma de apps</span>
        </div>
        <div class="userbox" *ngIf="auth.user() as u">
          <span class="muted">{{ u.email }}</span>
          <p-tag *ngIf="u.admin" value="admin" severity="warn" />
          <a *ngIf="u.admin" routerLink="/accesos"><p-button label="Accesos" icon="pi pi-users" [outlined]="true" size="small" /></a>
          <p-button label="Salir" icon="pi pi-sign-out" [text]="true" size="small" (onClick)="auth.logout()" />
        </div>
      </header>

      <!-- ─────────── LANDING (no autenticado) ─────────── -->
      <div class="hero" *ngIf="auth.ready() && !auth.user()">
        <h2>Un solo lugar para todas tus apps</h2>
        <p class="muted">Inicia sesión para ver las aplicaciones que tienes habilitadas.</p>

        <div class="login-box">
          <p-button label="Entrar con Google" icon="pi pi-google" (onClick)="auth.loginWithGoogle()" />
          <span class="muted">— o, mientras configuramos Google —</span>
          <div class="row">
            <input pInputText type="email" placeholder="tu-correo@gmail.com" [(ngModel)]="email" />
            <p-button label="Entrar" (onClick)="doDevLogin()" [disabled]="!email" />
          </div>
          <small class="muted" *ngIf="error()">{{ error() }}</small>
        </div>
      </div>

      <!-- ─────────── LAUNCHER (autenticado) ─────────── -->
      <div *ngIf="auth.user()">
        <h3>Tus apps</h3>
        <div class="grid" *ngIf="apps().length">
          <a *ngFor="let app of apps()" [href]="'/' + app.slug + '/'">
            <p-card [header]="app.name" [subheader]="app.description">
              <ng-template pTemplate="footer">
                <p-button label="Abrir" icon="pi pi-arrow-right" [text]="true" />
              </ng-template>
            </p-card>
          </a>
        </div>
        <p class="muted" *ngIf="loaded() && !apps().length">
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
  private loadedFor: string | null = null;

  constructor() {
    // Cuando hay usuario (login inicial por cookie o dev-login), carga sus apps.
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
  }

  doDevLogin(): void {
    this.error.set('');
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
