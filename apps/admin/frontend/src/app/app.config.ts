import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { providePrimeNG } from 'primeng/config';
import Aura from '@primeng/themes/aura';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(withFetch()),
    // PrimeNG (tema Aura) · estándar de UI del proyecto.
    provideAnimationsAsync(),
    // Tema claro/oscuro automático según el dispositivo (prefers-color-scheme).
    providePrimeNG({ theme: { preset: Aura, options: { darkModeSelector: 'system' } } }),
  ],
};
