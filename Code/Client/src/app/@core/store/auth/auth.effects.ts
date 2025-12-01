import { Injectable } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { of } from 'rxjs';
import { map, mergeMap, catchError, tap, switchMap, withLatestFrom } from 'rxjs/operators';
import { Router } from '@angular/router';
import { Store } from '@ngrx/store';
import * as AuthActions from './auth.actions';
import * as AppDataActions from '../app-data/app-data.actions';
import { AuthenticationService } from '@app/auth/services/authentication.service';
import { TokenStorageService } from '@app/auth/services/token-storage.service';
import { selectRefreshToken } from './auth.selectors';
import { ROLE } from '@app/auth/enums/roles.enum';

@Injectable()
export class AuthEffects {
  constructor(
    private actions$: Actions,
    private authService: AuthenticationService,
    private tokenService: TokenStorageService,
    private router: Router,
    private store: Store,
  ) {}

  login$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AuthActions.login),
      mergeMap(({ email, password, rememberMe }) =>
        this.authService
          .login({
            username: email,
            password: password,
            remember: rememberMe,
          })
          .pipe(
            map((credentials) => {
              // Use the tokens but store user in state
              this.tokenService.setAccessToken(credentials.token);
              this.tokenService.setRefreshToken(credentials.refreshToken || '');
              this.tokenService.setTokenExpires(credentials.expiresIn || 0);

              // Create user state object
              const user = {
                id: credentials.id,
                email: credentials.email || credentials.username,
                firstName: credentials.firstName || '',
                lastName: credentials.lastName || '',
                role: credentials.roles[0] || ROLE.GUEST,
              };

              // Also load initial data to ensure we have complete user profile
              this.store.dispatch(AppDataActions.loadInitialData());

              return AuthActions.loginSuccess({
                user,
                accessToken: credentials.token,
                refreshToken: credentials.refreshToken || '',
                tokenExpires: credentials.expiresIn || 0,
              });
            }),
            catchError((error) =>
              of(
                AuthActions.loginFailure({
                  error: error.message || 'Login failed',
                }),
              ),
            ),
          ),
      ),
    ),
  );

  loginSuccess$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(AuthActions.loginSuccess),
        tap(({ user }) => {
          // Navigate to dashboard or saved return URL
          const returnUrl = localStorage.getItem('returnUrl') || '/dashboard';
          localStorage.removeItem('returnUrl');
          this.router.navigateByUrl(returnUrl);
        }),
      ),
    { dispatch: false },
  );

  logout$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AuthActions.logout),
      mergeMap(() =>
        this.authService.logout().pipe(
          map(() => {
            // Clear stored tokens
            this.tokenService.clearTokens();
            return AuthActions.logoutSuccess();
          }),
          catchError((error) => {
            // Still clear tokens on error
            this.tokenService.clearTokens();
            return of(AuthActions.logoutSuccess());
          }),
        ),
      ),
    ),
  );

  logoutSuccess$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(AuthActions.logoutSuccess),
        tap(() => {
          // Navigate to login page
          this.router.navigate(['/login']);
        }),
      ),
    { dispatch: false },
  );

  refreshToken$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AuthActions.refreshToken),
      withLatestFrom(this.store.select(selectRefreshToken)),
      switchMap(([_, refreshToken]) => {
        if (!refreshToken) {
          return of(AuthActions.refreshTokenFailure({ error: 'No refresh token available' }));
        }

        return this.authService.refreshToken().pipe(
          map((response) => {
            // Update stored tokens
            this.tokenService.setAccessToken(response.token);
            this.tokenService.setRefreshToken(response.refreshToken);
            this.tokenService.setTokenExpires(response.tokenExpires || 0);

            return AuthActions.refreshTokenSuccess({
              accessToken: response.token,
              refreshToken: response.refreshToken,
              tokenExpires: response.tokenExpires || 0,
            });
          }),
          catchError((error) =>
            of(
              AuthActions.refreshTokenFailure({
                error: error.message || 'Token refresh failed',
              }),
            ),
          ),
        );
      }),
    ),
  );
}
