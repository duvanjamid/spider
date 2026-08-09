import { Component, OnInit, inject, signal } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { AppRegistryService, SpiderApp } from '../core/app-registry.service';
import { AuthService } from '../core/auth.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [NgFor, NgIf],
  styles: [`
    .wrap { max-width: 960px; margin: 0 auto; padding: 40px 20px; }
    header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 32px; }
    h1 { font-size: 1.6rem; margin: 0; }
    .muted { color: var(--muted); }
    .btn { background: var(--accent); color: #fff; border: 0; border-radius: 8px; padding: 10px 16px; cursor: pointer; font-size: .95rem; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 16px; }
    .card { background: var(--panel); border: 1px solid var(--border); border-radius: 12px; padding: 18px; transition: border-color .15s; }
    .card:hover { border-color: var(--accent); }
    .card h3 { margin: 0 0 6px; font-size: 1.05rem; }
    .card p { margin: 0; color: var(--muted); font-size: .9rem; }
  `],
  template: `
    <div class="wrap">
      <header>
        <div>
          <h1>🕷️ Spider</h1>
          <span class="muted">Plataforma de apps</span>
        </div>
        <button class="btn" *ngIf="!auth.user()" (click)="auth.loginWithGoogle()">
          Entrar con Google
        </button>
        <span class="muted" *ngIf="auth.user() as u">{{ u.email }}</span>
      </header>

      <div class="grid">
        <a class="card" *ngFor="let app of apps()" [href]="'/' + app.slug + '/'">
          <h3>{{ app.name }}</h3>
          <p>{{ app.description }}</p>
        </a>
      </div>

      <p class="muted" *ngIf="apps().length === 0">Cargando apps…</p>
    </div>
  `,
})
export class HomeComponent implements OnInit {
  private registry = inject(AppRegistryService);
  readonly auth = inject(AuthService);
  readonly apps = signal<SpiderApp[]>([]);

  ngOnInit(): void {
    this.auth.refresh();
    this.registry.list().subscribe({
      next: (apps) => this.apps.set(apps),
      error: () => this.apps.set([]),
    });
  }
}
