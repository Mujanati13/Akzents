import { Component, TemplateRef, ViewChild, ViewEncapsulation, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { AuthenticationService } from '../services/authentication.service';
import { AuthStateService, AuthState } from '../services/auth-state.service';
import { ApiService } from '@app/core/services/api.service';
import { filter, take, switchMap, catchError } from 'rxjs/operators';
import { FormBuilder, FormGroup, Validators, AbstractControl } from '@angular/forms';
import { HotToastService } from '@ngneat/hot-toast';
import { of } from 'rxjs';

// Updated interfaces for the API response
interface Country {
  id: number;
  name?: string; // Make name optional since it's missing from API
  flag: string | null;
  createdAt: string;
  updatedAt: string;
}

interface JobType {
  id: number;
  name: string;
  createdAt: string;
  updatedAt: string;
}

interface City {
  id: number;
  name: string;
  country?: any;
}

interface MerchandiserRegisterData {
  countries: Country[];
  jobTypes: JobType[];
}

// Add interface for registration request
interface RegisterRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
  zipCode?: string;
  cityId?: number; // Changed from city to cityId
  countryId?: number;
  jobTypeIds: number[]; // Array of selected job type IDs
}

// Add interface for registration response (if any)
interface RegisterResponse {
  message?: string;
}

@UntilDestroy()
@Component({
  selector: 'app-register',
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.scss'],
  encapsulation: ViewEncapsulation.None,
  standalone: false,
})
export class RegisterComponent implements OnInit {
  // Form setup
  userForm: FormGroup;
  @ViewChild('emailVerificationToast', { static: true })
  emailVerificationToast!: TemplateRef<any>;

  // Stepper properties
  activeStep: number = 1;

  // Form fields
  email = '';
  password = '';
  confirmPassword = '';
  showPassword = false;
  loginError = '';
  firstName = '';
  lastName = '';
  phone = '';
  zipCode = '';
  city = '';

  // Preferences/settings
  remember = true;

  // UI states
  isLoading = false;
  isLoadingCities = false;
  returnUrl: string;
  isRegistering = false;
  stepErrors: { [key: number]: string } = {};

  // Data from API
  countries: Country[] = [];
  jobTypes: JobType[] = [];
  cities: City[] = [];

  // Dropdown options
  countryOptions: { id: number; name: string }[] = [];
  cityOptions: { id: number; name: string }[] = [];

  // Form fields
  selectedCountryId: number | null = null;
  selectedCityId: number | null = null;

  constructor(
    private readonly _router: Router,
    private readonly _route: ActivatedRoute,
    private readonly _authService: AuthenticationService,
    private readonly _authStateService: AuthStateService,
    private readonly _formBuilder: FormBuilder,
    private readonly toast: HotToastService,
    private readonly apiService: ApiService,
  ) {
    this.returnUrl = this._route.snapshot.queryParams['returnUrl'] || '/dashboard';
    this.initForm();
  }

  ngOnInit() {
    this.loadRegistrationData();
  }

  private loadRegistrationData() {
    this.isLoading = true;

    this.apiService
      .get<MerchandiserRegisterData>('/merchandiser/register')
      .pipe(
        untilDestroyed(this),
        catchError((error) => {
          console.error('Failed to load registration data:', error);
          this.isLoading = false;
          // Use fallback data if API fails
          this.setFallbackData();
          return of(null);
        }),
      )
      .subscribe({
        next: (data) => {
          if (data) {
            this.countries = data.countries;
            this.jobTypes = data.jobTypes;

            // Add country names since they're missing from API
            this.setFallbackData(); // This will add the missing names
          } else {
            this.setFallbackData();
          }
          this.isLoading = false;
        },
      });
  }

  private loadCities(countryId: number) {
    if (!countryId) return;

    this.isLoadingCities = true;
    this.cities = [];
    this.cityOptions = [];

    // Disable city dropdown while loading
    this.userForm.get('city')?.disable();

    // Updated API endpoint to match your backend route
    this.apiService
      .get<City[]>(`/cities/country/${countryId}`)
      .pipe(
        untilDestroyed(this),
        catchError((error) => {
          console.error('Failed to load cities:', error);
          this.isLoadingCities = false;
          // Re-enable city dropdown even on error
          this.userForm.get('city')?.enable();
          return of([]);
        }),
      )
      .subscribe({
        next: (cities) => {
          this.cities = cities || [];
          this.cityOptions = this.cities.map((city) => ({
            id: city.id,
            name: city.name,
          }));
          this.isLoadingCities = false;
          // Re-enable city dropdown after loading
          this.userForm.get('city')?.enable();
        },
      });
  }

  private populateDropdownOptions() {
    // Transform countries for dropdown - updated for new structure
    this.countryOptions = this.countries.map((country) => ({
      id: country.id,
      name: country.name, // Direct access to name string
    }));
  }

  private updateCustomersFormGroup() {
    // Dynamically create the customers form group based on jobTypes
    const customersGroup = this._formBuilder.group({});

    this.jobTypes.forEach((jobType) => {
      // Create a control name based on the job type name (convert to camelCase)
      const controlName = this.toCamelCase(jobType.name);
      customersGroup.addControl(controlName, this._formBuilder.control(false));
    });

    // Replace the existing customers form group
    this.userForm.setControl('customers', customersGroup);
  }

  // Made public so it can be used in template
  toCamelCase(str: string): string {
    return str.toLowerCase().replace(/[^a-zA-Z0-9]+(.)/g, (match, chr) => chr.toUpperCase());
  }

  private setFallbackData() {
    // Create a mapping of country IDs to names (you'll need to adjust these based on your actual country IDs)
    const countryNames: { [key: number]: string } = {
      1: 'Deutschland',
      2: 'Österreich',
      3: 'Schweiz',
      4: 'Luxemburg',
    };

    // If API data exists but lacks names, add them
    if (this.countries.length > 0) {
      this.countries = this.countries.map((country) => ({
        ...country,
        name: countryNames[country.id] || `Land ${country.id}`,
      }));
    } else {
      // Complete fallback data
      this.countries = [
        { id: 1, name: 'Deutschland', flag: null, createdAt: '', updatedAt: '' },
        { id: 2, name: 'Österreich', flag: null, createdAt: '', updatedAt: '' },
        { id: 3, name: 'Schweiz', flag: null, createdAt: '', updatedAt: '' },
        { id: 4, name: 'Luxemburg', flag: null, createdAt: '', updatedAt: '' },
      ];
    }

    // Keep existing jobTypes fallback
    if (this.jobTypes.length === 0) {
      this.jobTypes = [
        { id: 1, name: 'Visual Merchandiser', createdAt: '', updatedAt: '' },
        { id: 2, name: 'Sales adviser', createdAt: '', updatedAt: '' },
        { id: 3, name: 'Dekorateur', createdAt: '', updatedAt: '' },
        { id: 4, name: 'Folierung', createdAt: '', updatedAt: '' },
      ];
    }

    this.populateDropdownOptions();
    this.updateCustomersFormGroup();
  }

  // Helper method to get job type by control name
  getJobTypeByControlName(controlName: string): JobType | undefined {
    return this.jobTypes.find((jobType) => this.toCamelCase(jobType.name) === controlName);
  }

  private initForm() {
    // Create the main form with password confirmation validator
    this.userForm = this._formBuilder.group(
      {
        // Step 1: Personal information
        firstName: ['', Validators.required],
        lastName: ['', Validators.required],
        email: ['', [Validators.required, Validators.email]],
        phone: [''],
        zipCode: [''],
        country: ['', Validators.required], // Make country required
        city: [{ value: '', disabled: true }, Validators.required], // Initialize city as disabled but required

        // Step 2: Customer qualification checkboxes (will be updated dynamically)
        customers: this._formBuilder.group({}),

        // Step 3: Password and confirmations
        password: ['', [Validators.required, Validators.minLength(6)]],
        confirmPassword: ['', Validators.required],
      },
      {
        validators: this.passwordMatchValidator,
      },
    );

    // Subscribe to country changes to load cities
    this.userForm.get('country')?.valueChanges.subscribe((countryId) => {
      if (countryId && countryId !== this.selectedCountryId) {
        this.selectedCountryId = countryId;
        this.loadCities(countryId);
        // Reset city selection when country changes
        this.userForm.get('city')?.setValue('');
        this.selectedCityId = null;

        // Enable city dropdown when country is selected
        this.userForm.get('city')?.enable();
      } else if (!countryId) {
        // Disable city dropdown when no country is selected
        this.userForm.get('city')?.disable();
        this.selectedCountryId = null;
      }
    });

    // Subscribe to city changes
    this.userForm.get('city')?.valueChanges.subscribe((cityId) => {
      this.selectedCityId = cityId;
    });

    // Subscribe to form value changes to update the component properties
    this.userForm.get('firstName')?.valueChanges.subscribe((value) => (this.firstName = value));
    this.userForm.get('lastName')?.valueChanges.subscribe((value) => (this.lastName = value));
    this.userForm.get('email')?.valueChanges.subscribe((value) => (this.email = value));
    this.userForm.get('password')?.valueChanges.subscribe((value) => (this.password = value));
    this.userForm.get('confirmPassword')?.valueChanges.subscribe((value) => (this.confirmPassword = value));
  }

  // Custom validator for password confirmation
  private passwordMatchValidator(control: AbstractControl): { [key: string]: boolean } | null {
    const password = control.get('password');
    const confirmPassword = control.get('confirmPassword');

    if (!password || !confirmPassword) {
      return null;
    }

    return password.value === confirmPassword.value ? null : { passwordMismatch: true };
  }

  toggleCustomerSelection(controlName: string) {
    // Get the form control group
    const customersGroup = this.userForm.get('customers') as FormGroup;
    // Get the specific control
    const control = customersGroup.get(controlName);

    if (control) {
      // Toggle the value
      control.setValue(!control.value);
    }
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

  register() {
    // Clear previous errors
    this.loginError = '';

    // Validate the entire form
    if (!this.userForm.valid) {
      this.markFormGroupTouched(this.userForm);

      // Check for password mismatch specifically
      if (this.userForm.hasError('passwordMismatch')) {
        this.loginError = 'Passwörter stimmen nicht überein.';
      } else {
        this.loginError = 'Bitte füllen Sie alle erforderlichen Felder korrekt aus.';
      }
      return;
    }

    // Validate step 3 specifically
    if (!this.validateStep(3)) {
      return;
    }

    // Set loading state
    this.isRegistering = true;

    // Get form values and prepare registration data
    const formValues = this.userForm.value;

    // Get selected job type IDs
    const customersGroup = formValues.customers;
    const selectedJobTypeIds: number[] = [];

    Object.keys(customersGroup).forEach((controlName) => {
      if (customersGroup[controlName] === true) {
        const jobType = this.getJobTypeByControlName(controlName);
        if (jobType) {
          selectedJobTypeIds.push(jobType.id);
        }
      }
    });

    const registrationData: RegisterRequest = {
      email: formValues.email.toLowerCase().trim(),
      password: formValues.password,
      firstName: formValues.firstName.trim(),
      lastName: formValues.lastName.trim(),
      phone: formValues.phone?.trim() || undefined,
      zipCode: formValues.zipCode?.trim() || undefined,
      cityId: formValues.city || undefined,
      countryId: formValues.country || undefined,
      jobTypeIds: selectedJobTypeIds,
    };

    console.log('Sending registration data:', registrationData);

    // Call the API using your ApiService
    this.apiService
      .post<RegisterResponse>('/auth/email/register', registrationData, {}, true, false)
      .pipe(
        untilDestroyed(this),
        catchError((error) => {
          console.error('Registration error:', error);
          this.isRegistering = false;

          // Extract error message from different possible locations
          const errorMessage = error?.message || error?.data?.message || error?.data?.error || '';
          const errorMessageLower = errorMessage.toLowerCase();

          // Check for email-related errors in the message
          if (errorMessageLower.includes('email already exists') || 
              errorMessageLower.includes('email bereits vorhanden') ||
              errorMessageLower.includes('email existiert bereits') ||
              errorMessageLower.includes('email is already registered')) {
            const emailErrorMsg = 'Diese E-Mail-Adresse ist bereits registriert. Bitte verwenden Sie eine andere E-Mail-Adresse oder melden Sie sich an.';
            this.loginError = emailErrorMsg;
            this.toast.error(emailErrorMsg, {
              position: 'bottom-right',
              duration: 5000,
            });
          } else if (errorMessageLower.includes('invalid email') || 
                     errorMessageLower.includes('ungültige e-mail') ||
                     errorMessageLower.includes('email format')) {
            const emailFormatErrorMsg = 'Die eingegebene E-Mail-Adresse ist ungültig. Bitte überprüfen Sie die E-Mail-Adresse und versuchen Sie es erneut.';
            this.loginError = emailFormatErrorMsg;
            this.toast.error(emailFormatErrorMsg, {
              position: 'bottom-right',
              duration: 5000,
            });
          } else if (error.status === 422) {
            // Validation errors from backend
            if (error.data?.errors?.email) {
              const emailErrorMsg = Array.isArray(error.data.errors.email) 
                ? error.data.errors.email[0] 
                : error.data.errors.email;
              this.loginError = emailErrorMsg.includes('already') || emailErrorMsg.includes('bereits') || emailErrorMsg.includes('existiert')
                ? 'Diese E-Mail-Adresse ist bereits registriert. Bitte verwenden Sie eine andere E-Mail-Adresse oder melden Sie sich an.'
                : emailErrorMsg;
              this.toast.error(this.loginError, {
                position: 'bottom-right',
                duration: 5000,
              });
            } else if (error.data?.errors?.password) {
              this.loginError = 'Das Passwort entspricht nicht den Anforderungen.';
              this.toast.error(this.loginError, {
                position: 'bottom-right',
                duration: 5000,
              });
            } else if (error.data?.errors?.jobTypeIds) {
              this.loginError = 'Ungültige Qualifikationsauswahl.';
              this.toast.error(this.loginError, {
                position: 'bottom-right',
                duration: 5000,
              });
            } else {
              this.loginError = 'Ungültige Eingabedaten. Bitte überprüfen Sie Ihre Angaben.';
              this.toast.error(this.loginError, {
                position: 'bottom-right',
                duration: 5000,
              });
            }
          } else if (error.status === 409) {
            const conflictErrorMsg = 'Ein Benutzer mit dieser E-Mail-Adresse existiert bereits. Bitte verwenden Sie eine andere E-Mail-Adresse oder melden Sie sich an.';
            this.loginError = conflictErrorMsg;
            this.toast.error(conflictErrorMsg, {
              position: 'bottom-right',
              duration: 5000,
            });
          } else {
            const genericErrorMsg = 'Registrierung fehlgeschlagen. Bitte versuchen Sie es später erneut.';
            this.loginError = genericErrorMsg;
            this.toast.error(genericErrorMsg, {
              position: 'bottom-right',
              duration: 5000,
            });
          }

          return of(null);
        }),
      )
      .subscribe({
        next: (response) => {
          if (response !== null) {
            console.log('Registration successful:', response);
            this.isRegistering = false;
            this.showEmailVerificationToast();
          }
        },
      });
  }

  // Show the email verification toast and redirect to login
  private showEmailVerificationToast() {
    this.toast.show(this.emailVerificationToast, {
      position: 'bottom-right',
      autoClose: true,
      duration: 4000,
      dismissible: true,
      className: 'bg-white rounded-lg shadow-lg border border-gray-200',
      style: {
        padding: '12px 16px',
      },
    });

    // Navigate to login after a short delay
    setTimeout(() => {
      this._router.navigateByUrl('/login');
    }, 1000);
  }

  // Method to navigate between steps with validation
  goToStep(nextStep: number) {
    if (nextStep > this.activeStep) {
      // Validate current step before proceeding
      if (this.validateStep(this.activeStep)) {
        this.activeStep = nextStep;
      }
    } else {
      // Allow going back without validation
      this.activeStep = nextStep;
    }
  }

  // Validate each step - single implementation
  validateStep(step: number): boolean {
    this.stepErrors[step] = '';

    switch (step) {
      case 1:
        const personalFields = ['firstName', 'lastName', 'email', 'country', 'city'];
        const invalidPersonalFields = personalFields.filter((field) => {
          const control = this.userForm.get(field);
          return control && (control.invalid || (control.disabled && !control.value));
        });

        if (invalidPersonalFields.length > 0) {
          this.stepErrors[1] = 'Bitte füllen Sie alle erforderlichen Felder aus.';
          this.markFormGroupTouched(this.userForm);
          return false;
        }
        return true;

      case 2:
        // Check if at least one job type is selected
        const customersGroup = this.userForm.get('customers') as FormGroup;
        const hasSelection = Object.keys(customersGroup.controls).some((key) => customersGroup.get(key)?.value === true);

        if (!hasSelection) {
          this.stepErrors[2] = 'Bitte wählen Sie mindestens eine Qualifikation aus.';
          return false;
        }
        return true;

      case 3:
        if (this.userForm.invalid) {
          this.stepErrors[3] = 'Bitte korrigieren Sie die Eingabefehler.';
          this.markFormGroupTouched(this.userForm);
          return false;
        }
        return true;

      default:
        return true;
    }
  }

  // Utility to mark all form controls as touched to show validation errors
  private markFormGroupTouched(formGroup: FormGroup) {
    Object.keys(formGroup.controls).forEach((key) => {
      const control = formGroup.get(key);
      if (control instanceof FormGroup) {
        this.markFormGroupTouched(control);
      } else {
        control?.markAsTouched();
      }
    });
  }

  toggleShowPassword() {
    this.showPassword = !this.showPassword;
  }
}
