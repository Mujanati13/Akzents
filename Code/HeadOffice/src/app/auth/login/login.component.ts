import { Component, ViewEncapsulation } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { AuthenticationService } from '../services/authentication.service';
import { AuthStateService, AuthState } from '../services/auth-state.service';
import { filter, take, switchMap } from 'rxjs/operators';

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

  constructor(
    private readonly _router: Router,
    private readonly _route: ActivatedRoute,
    private readonly _authService: AuthenticationService,
    private readonly _authStateService: AuthStateService, // Add this dependency
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
        // After login completes successfully, wait for auth state to be AUTHENTICATED
        switchMap(() =>
          this._authStateService.authState$.pipe(
            filter((state) => state === AuthState.AUTHENTICATED),
            take(1),
          ),
        ),
      )
      .subscribe({
        next: () => {
          this.isLoading = false;
          console.log('Login successful, redirecting to', this.returnUrl);
          this._router.navigateByUrl(this.returnUrl);
        },
        error: (err) => {
          this.isLoading = false;
          this.loginError = 'Invalid credentials. Please try again.';
          console.error('Login failed:', err);
        },
      });
  }

  toggleShowPassword() {
    this.showPassword = !this.showPassword;
  }
}
