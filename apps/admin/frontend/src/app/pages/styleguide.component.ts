import { Component, signal } from '@angular/core';
import { NgFor, NgClass } from '@angular/common';
import { RouterLink } from '@angular/router';

/**
 * Página de estilos (styleguide) del sistema de diseño Spider.
 * Muestra tokens y el set completo de componentes con el estilo "soft product UI"
 * (salvia mate, superficies claras, bordes sutiles, elevación suave).
 * Ruta: /estilos
 */
@Component({
  selector: 'app-styleguide',
  standalone: true,
  imports: [NgFor, NgClass, RouterLink],
  template: `
  <div class="sg">
    <!-- Header -->
    <header class="sg-top">
      <div>
        <span class="t-eyebrow">Sistema de diseño</span>
        <h1 class="t-display">Spider · Styleguide</h1>
        <p class="lead">Superficies claras, salvia mate, bordes sutiles y elevación suave. Todo el set de componentes en un solo lugar.</p>
      </div>
      <a routerLink="/" class="btn ghost"><i class="pi pi-arrow-left"></i> Volver</a>
    </header>

    <div class="grid">
      <!-- Color tokens -->
      <section class="card">
        <h2 class="t-h2">Color tokens</h2>
        <div class="swatches">
          <div class="sw" *ngFor="let c of colors">
            <span class="chip-color" [style.background]="c.value" [class.ring]="c.ring"></span>
            <b>{{ c.name }}</b><code>{{ c.value }}</code>
          </div>
        </div>
      </section>

      <!-- Typography -->
      <section class="card">
        <h2 class="t-h2">Escala tipográfica</h2>
        <ul class="type">
          <li><span class="t-display">Display</span><code>2.6rem · 800</code></li>
          <li><span class="t-h1">Heading 1</span><code>1.6rem · 800</code></li>
          <li><span class="t-h2">Heading 2</span><code>1.25rem · 700</code></li>
          <li><span class="t-h3">Heading 3</span><code>1.05rem · 700</code></li>
          <li><span class="t-body">Body — texto de párrafo</span><code>.95rem · 450</code></li>
          <li><span class="t-caption">Caption / ayuda</span><code>.8rem</code></li>
        </ul>
      </section>

      <!-- Spacing -->
      <section class="card">
        <h2 class="t-h2">Espaciado</h2>
        <div class="spacing">
          <div class="sp" *ngFor="let s of spacing">
            <span class="bar" [style.width.px]="s.px"></span><code>{{ s.name }} · {{ s.px }}px</code>
          </div>
        </div>
      </section>

      <!-- Radius -->
      <section class="card">
        <h2 class="t-h2">Radios</h2>
        <div class="radii">
          <div class="rad" *ngFor="let r of radii">
            <span class="box" [style.borderRadius]="r.value"></span><code>{{ r.name }}</code>
          </div>
        </div>
      </section>

      <!-- Elevation -->
      <section class="card">
        <h2 class="t-h2">Elevación</h2>
        <div class="elevs">
          <div class="ele" *ngFor="let e of elevations">
            <span class="tile" [style.boxShadow]="e.value"></span><code>{{ e.name }}</code>
          </div>
        </div>
      </section>

      <!-- Buttons -->
      <section class="card">
        <h2 class="t-h2">Botones</h2>
        <div class="row">
          <button class="btn">Primario</button>
          <button class="btn strong">Primario fuerte</button>
          <button class="btn soft">Suave</button>
          <button class="btn ghost">Ghost</button>
          <button class="btn" disabled>Deshabilitado</button>
        </div>
        <div class="row">
          <button class="btn sm">Pequeño</button>
          <button class="btn"><i class="pi pi-check"></i> Con icono</button>
          <button class="btn danger">Peligro</button>
        </div>
      </section>

      <!-- Inputs -->
      <section class="card">
        <h2 class="t-h2">Inputs</h2>
        <div class="field"><i class="pi pi-search"></i><input placeholder="Buscar…"></div>
        <div class="field"><i class="pi pi-envelope"></i><input placeholder="correo@dominio.com"></div>
        <div class="field disabled"><i class="pi pi-lock"></i><input placeholder="Deshabilitado" disabled></div>
        <label class="check"><input type="checkbox" checked> Recordarme</label>
      </section>

      <!-- Chips -->
      <section class="card">
        <h2 class="t-h2">Chips</h2>
        <div class="row">
          <button class="chip" *ngFor="let c of chips; let i = index"
                  [class.on]="chipSel() === i" (click)="chipSel.set(i)">
            <i class="pi" [ngClass]="chipSel() === i ? 'pi-check' : 'pi-filter'"></i> {{ c }}
          </button>
          <span class="chip" style="opacity:.5"><i class="pi pi-ban"></i> Deshabilitado</span>
        </div>
      </section>

      <!-- Tabs -->
      <section class="card">
        <h2 class="t-h2">Tabs</h2>
        <div class="seg">
          <button *ngFor="let t of tabs; let i = index" [class.on]="tab() === i" (click)="tab.set(i)">{{ t }}</button>
        </div>
        <div class="uline">
          <button *ngFor="let t of tabs; let i = index" [class.on]="tab2() === i" (click)="tab2.set(i)">{{ t }}</button>
        </div>
      </section>

      <!-- Alerts -->
      <section class="card">
        <h2 class="t-h2">Alertas</h2>
        <div class="alert ok"><i class="pi pi-check-circle"></i> Guardado correctamente.</div>
        <div class="alert warn"><i class="pi pi-exclamation-triangle"></i> Revisa los campos marcados.</div>
        <div class="alert err"><i class="pi pi-times-circle"></i> No se pudo completar la acción.</div>
        <div class="alert info"><i class="pi pi-info-circle"></i> Sugerencia para el usuario.</div>
      </section>

      <!-- Cards -->
      <section class="card">
        <h2 class="t-h2">Tarjetas</h2>
        <article class="mini">
          <div class="mini-body">
            <h3 class="t-h3">Título de tarjeta</h3>
            <p class="t-caption">Lorem ipsum dolor sit amet, consectetur adipiscing elit para mostrar el contenido.</p>
            <button class="chip on"><i class="pi pi-image"></i> Acción</button>
          </div>
          <div class="mini-img"><i class="pi pi-image"></i></div>
        </article>
      </section>
    </div>

    <footer class="sg-foot t-caption">Spider · sistema de diseño — soft product UI</footer>
  </div>
  `,
  styles: [`
    :host { display: block; }
    .sg { max-width: 1080px; margin: 0 auto; padding: var(--s6) var(--s4) var(--s7); }
    .sg-top { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--s4); margin-bottom: var(--s6); }
    .sg-top h1 { margin: 6px 0 8px; }
    .lead { color: var(--muted); max-width: 60ch; margin: 0; }
    .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--s4); }
    @media (max-width: 760px) { .grid { grid-template-columns: 1fr; } .sg-top { flex-direction: column; } }

    .card {
      background: var(--panel); border: 1px solid var(--border); border-radius: var(--r-lg);
      padding: var(--s5); box-shadow: var(--e2);
    }
    .card > h2 { margin: 0 0 var(--s4); }
    .row { display: flex; flex-wrap: wrap; gap: var(--s2); align-items: center; margin-bottom: var(--s2); }

    /* Color tokens */
    .swatches { display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--s3); }
    .sw { display: flex; align-items: center; gap: var(--s3); }
    .sw b { font-size: .86rem; } .sw code { margin-left: auto; }
    .chip-color { width: 40px; height: 40px; border-radius: var(--r); border: 1px solid var(--border); box-shadow: var(--e1); flex: none; }
    .chip-color.ring { background: transparent !important; box-shadow: var(--focus); }
    code { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: .74rem; color: var(--muted); }

    /* Typography */
    .type { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--s3); }
    .type li { display: flex; align-items: baseline; justify-content: space-between; gap: var(--s3); border-bottom: 1px dashed var(--border); padding-bottom: var(--s2); }

    /* Spacing */
    .spacing { display: flex; flex-direction: column; gap: var(--s2); }
    .sp { display: flex; align-items: center; gap: var(--s3); }
    .sp .bar { height: 12px; border-radius: var(--r-pill); background: var(--accent); }

    /* Radius */
    .radii { display: flex; gap: var(--s4); flex-wrap: wrap; }
    .rad { display: flex; flex-direction: column; align-items: center; gap: 6px; }
    .rad .box { width: 56px; height: 56px; background: var(--accent-soft); border: 1.5px solid var(--accent); }

    /* Elevation */
    .elevs { display: flex; gap: var(--s4); flex-wrap: wrap; }
    .ele { display: flex; flex-direction: column; align-items: center; gap: 6px; }
    .ele .tile { width: 60px; height: 46px; border-radius: var(--r); background: var(--panel); border: 1px solid var(--border); }

    /* Buttons */
    .btn {
      display: inline-flex; align-items: center; gap: 8px; height: 40px; padding: 0 16px;
      border-radius: var(--r-pill); border: 1px solid transparent; cursor: pointer; font: inherit; font-weight: 600;
      background: var(--accent); color: var(--accent-contrast); box-shadow: var(--e1); transition: transform .06s ease, filter .15s ease, box-shadow .15s ease;
    }
    .btn:hover { filter: brightness(1.03); box-shadow: var(--e2); }
    .btn:active { transform: translateY(1px); }
    .btn.strong { background: var(--accent-strong); color: #fff; }
    .btn.soft { background: var(--accent-soft); color: var(--accent-strong); }
    .btn.ghost { background: transparent; color: var(--fg); border-color: var(--border); box-shadow: none; }
    .btn.danger { background: var(--error); color: #2a0f0d; }
    .btn.sm { height: 32px; padding: 0 12px; font-size: .85rem; }
    .btn[disabled] { opacity: .5; cursor: not-allowed; box-shadow: none; }

    /* Inputs */
    .field {
      display: flex; align-items: center; gap: 10px; height: 44px; padding: 0 14px; margin-bottom: var(--s2);
      background: var(--panel); border: 1px solid var(--border); border-radius: var(--r-pill); box-shadow: var(--e1);
    }
    .field:focus-within { box-shadow: var(--focus); border-color: var(--accent); }
    .field i { color: var(--muted); }
    .field input { flex: 1; border: none; outline: none; background: none; color: var(--fg); font: inherit; }
    .field.disabled { opacity: .55; }
    .check { display: inline-flex; align-items: center; gap: 8px; font-size: .9rem; color: var(--muted); }
    .check input { accent-color: var(--accent); }

    /* Chips */
    .chip {
      display: inline-flex; align-items: center; gap: 7px; height: 34px; padding: 0 14px; cursor: pointer; font: inherit;
      border-radius: var(--r-pill); border: 1px solid var(--border); background: var(--panel); color: var(--fg); font-size: .85rem;
    }
    .chip i { color: var(--muted); font-size: .8rem; }
    .chip.on { background: var(--accent-soft); border-color: var(--accent); color: var(--accent-strong); }
    .chip.on i { color: var(--accent-strong); }

    /* Tabs */
    .seg { display: inline-flex; background: var(--panel-2); border: 1px solid var(--border); border-radius: var(--r-pill); padding: 4px; gap: 4px; margin-bottom: var(--s4); }
    .seg button { border: none; background: none; cursor: pointer; font: inherit; font-weight: 600; color: var(--muted); padding: 7px 16px; border-radius: var(--r-pill); }
    .seg button.on { background: var(--panel); color: var(--fg); box-shadow: var(--e1); }
    .uline { display: flex; gap: var(--s4); border-bottom: 1px solid var(--border); }
    .uline button { border: none; background: none; cursor: pointer; font: inherit; font-weight: 600; color: var(--muted); padding: 10px 2px; position: relative; }
    .uline button.on { color: var(--accent-strong); }
    .uline button.on::after { content: ''; position: absolute; left: 0; right: 0; bottom: -1px; height: 2.5px; border-radius: 3px; background: var(--accent); }

    /* Alerts */
    .alert { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border-radius: var(--r); margin-bottom: var(--s2); font-size: .9rem; font-weight: 500; }
    .alert i { font-size: 1rem; }
    .alert.ok { background: var(--success-soft); color: var(--accent-strong); }
    .alert.warn { background: var(--warning-soft); color: #8a6d16; }
    .alert.err { background: var(--error-soft); color: #9a3b34; }
    .alert.info { background: var(--info-soft); color: #3d5878; }

    /* Card sample */
    .mini { display: flex; gap: var(--s4); background: var(--panel); border: 1px solid var(--border); border-radius: var(--r-lg); padding: var(--s4); box-shadow: var(--e3); }
    .mini-body { flex: 1; display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
    .mini-img { width: 76px; height: 76px; border-radius: var(--r); background: var(--panel-2); display: grid; place-items: center; color: var(--muted); font-size: 1.4rem; flex: none; }

    .sg-foot { text-align: center; margin-top: var(--s6); }
  `],
})
export class StyleguideComponent {
  chipSel = signal(1);
  tab = signal(0);
  tab2 = signal(0);
  chips = ['Todos', 'Activos', 'Archivados'];
  tabs = ['Resumen', 'Facturación', 'Equipo'];
  colors = [
    { name: 'Primary', value: '#7fae95' },
    { name: 'Primary strong', value: '#5f9179' },
    { name: 'Surface', value: '#ffffff' },
    { name: 'Panel 2', value: '#eef0ec' },
    { name: 'Border', value: '#e5e7e1' },
    { name: 'Focus ring', value: '', ring: true },
    { name: 'Success', value: '#7fae8f' },
    { name: 'Warning', value: '#d9bf6f' },
    { name: 'Error', value: '#d5928c' },
    { name: 'Info', value: '#8aa1bd' },
  ];
  spacing = [
    { name: 's1', px: 4 }, { name: 's2', px: 8 }, { name: 's3', px: 12 },
    { name: 's4', px: 16 }, { name: 's5', px: 24 }, { name: 's6', px: 32 }, { name: 's7', px: 48 },
  ];
  radii = [
    { name: 'xs', value: '8px' }, { name: 'sm', value: '10px' }, { name: 'r', value: '14px' },
    { name: 'lg', value: '18px' }, { name: 'xl', value: '24px' }, { name: 'pill', value: '999px' },
  ];
  elevations = [
    { name: 'e1', value: 'var(--e1)' }, { name: 'e2', value: 'var(--e2)' }, { name: 'e3', value: 'var(--e3)' },
    { name: 'e4', value: 'var(--e4)' }, { name: 'e5', value: 'var(--e5)' },
  ];
}
