import { ApplicationConfig, enableProdMode, importProvidersFrom, provideZoneChangeDetection, inject, provideAppInitializer, isDevMode } from '@angular/core';
import { PreloadAllModules, provideRouter, Router, RouteReuseStrategy, withEnabledBlockingInitialNavigation, withInMemoryScrolling, withPreloading, withRouterConfig } from '@angular/router';

import { routes } from './app.routes';
import { TranslateModule } from '@ngx-translate/core';
import { environment } from '@env/environment';
import { ShellModule } from './shell/shell.module';
import { HTTP_INTERCEPTORS, provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { ApiPrefixInterceptor, ErrorHandlerInterceptor } from '@core/interceptors';
import { RouteReusableStrategy } from '@core/helpers';
import { provideServiceWorker } from '@angular/service-worker';
import { provideHotToastConfig } from '@ngneat/hot-toast';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
// import { SocketIoModule } from '@core/socket-io';
import { providePrimeNG } from 'primeng/config';
import { MyPreset } from './mytheme';
import { AuthInterceptor } from './auth/interceptors/auth.interceptor';
import { firstValueFrom } from 'rxjs';
import { InitializerService } from './core/services/initializer.service';
import { provideStore, Store } from '@ngrx/store';
import { provideEffects } from '@ngrx/effects';
import { provideStoreDevtools } from '@ngrx/store-devtools';
import { reducers, metaReducers } from './@core/store/app.state';
import { AuthEffects } from './@core/store/auth/auth.effects';
import { AppDataEffects } from './@core/store/app-data/app-data.effects';
import { CredentialsService, ROLE, TokenStorageService } from './auth';
import { Credentials } from './@core/entities';
import { AuthStateService, AuthState } from './auth/services/auth-state.service';

if (environment.production) {
  enableProdMode();
}

export const appConfig: ApplicationConfig = {
  providers: [
    // provideZoneChangeDetection is required for Angular's zone.js
    provideZoneChangeDetection({ eventCoalescing: true }),

    // App initializer using the new Angular 19 approach
    provideAppInitializer(() => {
      const initService = inject(InitializerService);
      const router = inject(Router);
      const tokenService = inject(TokenStorageService);
      const credentialsService = inject(CredentialsService);
      const store = inject(Store);
      const authStateService = inject(AuthStateService);

      // Set auth state to checking immediately
      authStateService.setAuthState(AuthState.CHECKING);

      // Only try to load initial data if we have a token
      if (tokenService.getAccessToken()) {
        return firstValueFrom(initService.loadInitialAppData())
          .then((data) => {
            if (data && data.user) {
              // Create credentials from initial data and store in memory
              const roleMapping = {
                admin: ROLE.ADMIN,
                user: ROLE.USER,
                member: ROLE.MEMBER,
                guest: ROLE.GUEST,
              };
              const roleName = data.user.role?.name || 'guest';
              const mappedRole = roleMapping[roleName.toLowerCase()] || ROLE.GUEST;

              const credentials = new Credentials({
                id: data.user.id,
                username: data.user.email,
                token: tokenService.getAccessToken() || '',
                refreshToken: tokenService.getRefreshToken() || '',
                expiresIn: tokenService.getTokenExpires() || 0,
                roles: [mappedRole],
                email: data.user.email,
                firstName: data.user.firstName,
                lastName: data.user.lastName,
              });

              credentialsService.setCredentials(credentials);
              // Set auth state to authenticated on successful token validation
              authStateService.setAuthState(AuthState.AUTHENTICATED);
              return data;
            }
            // No user data returned despite having a token
            authStateService.setAuthState(AuthState.NOT_AUTHENTICATED);
            return null;
          })
          .catch((err) => {
            console.error('App initialization failed:', err);

            // Clear tokens on error
            tokenService.clearTokens();
            credentialsService.setCredentials();

            // Set auth state to not authenticated on error
            authStateService.setAuthState(AuthState.NOT_AUTHENTICATED);

            // Don't navigate here - we'll handle navigation after initialization
            return {};
          });
      } else {
        // No token found, set auth state accordingly
        authStateService.setAuthState(AuthState.NOT_AUTHENTICATED);
        return Promise.resolve({});
      }
    }),

    // import providers from other modules (e.g. TranslateModule, ShellModule, socketModule), which follow the older pattern to import modules
    importProvidersFrom(
      TranslateModule.forRoot(),
      ShellModule,
      // SocketIoModule.forRoot({
      //   rootUrl: null, // TODO: provide your own socket.io server URL
      //   options: {
      //     transports: ['websocket'],
      //   },
      // }),
    ),

    provideAnimationsAsync(),
    providePrimeNG({
      theme: {
        preset: MyPreset,
        options: {
          darkModeSelector: false || 'none',
          cssLayer: {
            name: 'primeng',
            order: 'theme, base, primeng',
          },
        },
      },
    }),

    // provideServiceWorker is required for Angular's service workers
    provideServiceWorker('ngsw-worker.js', {
      enabled: environment.production,
      scope: '/',
      registrationStrategy: 'registerWhenStable:30000',
    }),
    // provideRouter is required for Angular's router with additional configuration
    provideRouter(
      routes,
      withRouterConfig({
        onSameUrlNavigation: 'reload',
        paramsInheritanceStrategy: 'always',
      }),
      withEnabledBlockingInitialNavigation(),
      withInMemoryScrolling({
        scrollPositionRestoration: 'enabled',
        anchorScrolling: 'enabled',
      }),
      withPreloading(PreloadAllModules),
    ),

    // provideHotToastConfig is required for HotToastModule by ngneat
    provideHotToastConfig({
      reverseOrder: true,
      dismissible: true,
      autoClose: true,
      position: 'top-right',
    }),
    // provideHttpClient is required for Angular's HttpClient with additional configuration, which includes interceptors from DI (dependency injection) , means to use class based interceptors
    provideHttpClient(withInterceptorsFromDi()),
    {
      provide: HTTP_INTERCEPTORS,
      useClass: ApiPrefixInterceptor,
      multi: true,
    },
    {
      provide: HTTP_INTERCEPTORS,
      useClass: ErrorHandlerInterceptor,
      multi: true,
    },
    { provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true },
    {
      provide: RouteReuseStrategy,
      useClass: RouteReusableStrategy,
    },

    // Add NgRx Store providers
    provideStore(reducers, { metaReducers }),
    provideEffects([AuthEffects, AppDataEffects]),
    provideStoreDevtools({
      maxAge: 25,
      logOnly: !isDevMode(),
      autoPause: true,
      trace: false,
      traceLimit: 75,
    }),
  ],
};
