import { Component, OnInit, inject, signal } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { InputTextModule } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { PlatformService, SpiderApp, Grant } from '../core/platform.service';

@Component({
  selector: 'app-admin-panel',
  standalone: true,
  imports: [NgFor, NgIf, FormsModule, RouterLink, ButtonModule, CardModule, InputTextModule, TableModule, TagModule],
  styles: [`
    .wrap { max-width: 980px; margin: 0 auto; padding: 32px 20px; }
    header { display: flex; align-items: center; gap: 12px; margin-bottom: 24px; }
    h1 { font-size: 1.4rem; margin: 0; }
    .spacer { flex: 1; }
    .form { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin: 8px 0 20px; }
    .form input, .form select { padding: 8px 10px; border-radius: 8px; border: 1px solid var(--border, #262a33);
      background: var(--panel, #1a1d24); color: var(--fg, #e6e8ee); }
    .muted { color: var(--muted, #9aa3b2); }
    .msg { margin: 8px 0; }
  `],
  template: `
    <div class="wrap">
      <header>
        <a routerLink="/"><p-button icon="pi pi-arrow-left" [text]="true" /></a>
        <h1>Gestión de accesos</h1>
        <span class="spacer"></span>
        <span class="muted">Concede acceso a las apps por correo de Google</span>
      </header>

      <p-card header="Conceder acceso">
        <div class="form">
          <input type="email" placeholder="correo@gmail.com" [(ngModel)]="email" />
          <select [(ngModel)]="app">
            <option value="" disabled>App…</option>
            <option *ngFor="let a of apps()" [value]="a.slug">{{ a.name }} ({{ a.slug }})</option>
          </select>
          <select [(ngModel)]="role">
            <option value="USER">USER</option>
            <option value="ADMIN">ADMIN</option>
          </select>
          <p-button label="Conceder" icon="pi pi-check" (onClick)="doGrant()" [disabled]="!email || !app" />
        </div>
        <div class="msg muted" *ngIf="msg()">{{ msg() }}</div>
      </p-card>

      <h3>Accesos concedidos</h3>
      <p-table [value]="grants()" [rows]="20" [paginator]="grants().length > 20" styleClass="p-datatable-sm">
        <ng-template pTemplate="header">
          <tr><th>Correo</th><th>App</th><th>Rol</th><th></th></tr>
        </ng-template>
        <ng-template pTemplate="body" let-g>
          <tr>
            <td>{{ g.email }}</td>
            <td>{{ g.app }}</td>
            <td><p-tag [value]="g.role" [severity]="g.role === 'ADMIN' ? 'warn' : 'info'" /></td>
            <td style="text-align:right">
              <p-button icon="pi pi-trash" severity="danger" [text]="true" size="small"
                        (onClick)="doRevoke(g)" />
            </td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage">
          <tr><td colspan="4" class="muted">Sin accesos concedidos todavía.</td></tr>
        </ng-template>
      </p-table>
    </div>
  `,
})
export class AdminPanelComponent implements OnInit {
  private platform = inject(PlatformService);

  email = '';
  app = '';
  role = 'USER';
  readonly apps = signal<SpiderApp[]>([]);
  readonly grants = signal<Grant[]>([]);
  readonly msg = signal('');

  ngOnInit(): void {
    this.reloadApps();
    this.reloadGrants();
  }

  private reloadApps(): void {
    this.platform.allApps().subscribe({ next: (a) => this.apps.set(a), error: () => {} });
  }

  private reloadGrants(): void {
    this.platform.grants().subscribe({ next: (g) => this.grants.set(g), error: () => {} });
  }

  doGrant(): void {
    this.platform.grant(this.email, this.app, this.role).subscribe({
      next: () => { this.msg.set(`Acceso concedido a ${this.email} → ${this.app}`); this.email = ''; this.reloadGrants(); },
      error: () => this.msg.set('No se pudo conceder (¿eres admin?).'),
    });
  }

  doRevoke(g: Grant): void {
    this.platform.revoke(g.email, g.app).subscribe({
      next: () => this.reloadGrants(),
      error: () => this.msg.set('No se pudo revocar.'),
    });
  }
}
