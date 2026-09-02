import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { providePrimeNG } from 'primeng/config';
import Aura from '@primeng/themes/aura';
import { definePreset } from '@primeng/themes';
import { routes } from './app.routes';

// Preset Aura con el PRIMARIO en salvia mate (mismo lenguaje visual que el
// sistema de diseño en styles.scss). Así los componentes PrimeNG combinan.
const SpiderAura = definePreset(Aura, {
  semantic: {
    primary: {
      50: '#f0f5f2', 100: '#dce9e2', 200: '#bcd5c7', 300: '#93bca7', 400: '#7fae95',
      500: '#5f9179', 600: '#4c7a64', 700: '#3e6252', 800: '#344f43', 900: '#2c4139', 950: '#16241e',
    },
  },
});

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(withFetch()),
    provideAnimationsAsync(),
    providePrimeNG({ theme: { preset: SpiderAura, options: { darkModeSelector: 'system' } } }),
  ],
};
