import { Component, ViewEncapsulation } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { AuthenticationService } from '../services/authentication.service';
import { AuthStateService, AuthState } from '../services/auth-state.service';
import { filter, take, switchMap, catchError } from 'rxjs/operators';
import { of } from 'rxjs';
import { ApiService } from '../../core/services/api.service'; // Add this import if you have an ApiService

@UntilDestroy()
@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
  encapsulation: ViewEncapsulation.None,
  standalone: false,
})
export class LoginComponent {
  email = '';
  password = '';
  remember = true;
  isLoading = false;
  showPassword = false;
  loginError = '';
  returnUrl: string;
  isUnconfirmedAccount = false; // New property to track unconfirmed accounts
  isResendingConfirmation = false; // New property for resend loading state

  constructor(
    private readonly _router: Router,
    private readonly _route: ActivatedRoute,
    private readonly _authService: AuthenticationService,
    private readonly _authStateService: AuthStateService,
    private readonly apiService: ApiService, // Add this if you have an ApiService
  ) {
    this.returnUrl = this._route.snapshot.queryParams['returnUrl'] || '/dashboard';
  }

  login() {
    // Clear previous error message
    this.loginError = '';
    this.isLoading = true;

    this._authService
      .login({
        username: this.email,
        password: this.password,
        remember: this.remember,
      })
      .pipe(
        untilDestroyed(this),
        switchMap(() =>
          this._authStateService.authState$.pipe(
            filter((state) => state === AuthState.AUTHENTICATED),
            take(1),
          ),
        ),
        catchError((error) => {
          this.isLoading = false;
          this.handleLoginError(error);
          return of(null);
        }),
      )
      .subscribe({
        next: (result) => {
          if (result !== null) {
            this.isLoading = false;
            console.log('Login successful, redirecting to', this.returnUrl);
            this._router.navigateByUrl(this.returnUrl);
          }
        },
        error: (err) => {
          this.isLoading = false;
          this.handleLoginError(err);
        },
      });
  }

  private handleLoginError(error: any) {
    // Reset unconfirmed account flag
    this.isUnconfirmedAccount = false;

    // Check if it's a 422 status with unconfirmed profile
    if (error.status === 422) {
      // Try multiple possible error structures
      let errorData = null;

      if (error.error) {
        errorData = error.error;
      } else if (error.data) {
        errorData = error.data;
      } else {
        errorData = error;
      }

      if (errorData?.errors?.status === 'unconfirmedProfile') {
        this.isUnconfirmedAccount = true;
        this.loginError = 'Ihr Konto wurde noch nicht bestätigt. Bitte überprüfen Sie Ihre E-Mails und klicken Sie auf den Bestätigungslink.';
        return;
      }

      // Handle other 422 validation errors
      if (errorData?.errors?.email) {
        this.loginError = 'Ungültige E-Mail-Adresse.';
      } else if (errorData?.errors?.password) {
        this.loginError = 'Ungültiges Passwort.';
      } else {
        this.loginError = 'Ungültige Anmeldedaten. Bitte überprüfen Sie Ihre Eingaben.';
      }
    } else if (error.status === 401) {
      this.loginError = 'Ungültige Anmeldedaten. Bitte versuchen Sie es erneut.';
    } else if (error.status === 429) {
      this.loginError = 'Zu viele Anmeldeversuche. Bitte warten Sie einen Moment und versuchen Sie es erneut.';
    } else if (error.status === 0 || error.status >= 500) {
      this.loginError = 'Verbindungsfehler. Bitte überprüfen Sie Ihre Internetverbindung und versuchen Sie es erneut.';
    } else {
      this.loginError = 'Anmeldung fehlgeschlagen. Bitte versuchen Sie es später erneut.';
    }
  }

  // New method to resend confirmation email
  resendConfirmationEmail() {
    if (!this.email) {
      this.loginError = 'Bitte geben Sie Ihre E-Mail-Adresse ein.';
      return;
    }

    this.isResendingConfirmation = true;

    this.apiService
      .post('/auth/email/confirm/resend', { email: this.email })
      .pipe(
        untilDestroyed(this),
        catchError((error) => {
          console.error('Resend confirmation failed:', error);
          this.isResendingConfirmation = false;
          this.loginError = 'Fehler beim Versenden der Bestätigungsmail. Bitte versuchen Sie es später erneut.';
          return of(null);
        }),
      )
      .subscribe({
        next: (response) => {
          if (response !== null) {
            this.isResendingConfirmation = false;
            this.loginError = 'Bestätigungsmail wurde erneut gesendet. Bitte überprüfen Sie Ihre E-Mails.';
          }
        },
      });
  }

  toggleShowPassword() {
    this.showPassword = !this.showPassword;
  }
}
