import { Component, OnInit, ViewEncapsulation } from '@angular/core';
import { FormBuilder, FormGroup, FormControl, Validators } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { HotToastService } from '@ngxpert/hot-toast';
import { ClientCompanyService, ClientCompany, InfinityPaginationResponse } from '@app/core/services/client-company.service';
import { ClientService, CreateClientDto, CreateAkzenteDto } from '@app/core/services/client.service';
import { finalize, catchError, of } from 'rxjs';

@Component({
  selector: 'app-user-add',
  templateUrl: './user-add.component.html',
  styleUrls: ['./user-add.component.scss'],
  encapsulation: ViewEncapsulation.None,
  standalone: false,
})
export class UserAddComponent implements OnInit {
  userForm: FormGroup;
  isSubmitting = false;
  showPassword: boolean = false;
  selectedTab: number = 0; // Track which tab is selected

  // Gender options
  genderOptions = [
    { code: 'male', name: 'Herr' },
    { code: 'female', name: 'Frau' },
    { code: 'other', name: 'Divers' },
  ];

  // Client Companies for assignment/favorites
  allClientCompanies: ClientCompany[] = [];
  isLoadingCompanies = false;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private route: ActivatedRoute,
    private clientCompanyService: ClientCompanyService,
    private clientService: ClientService,
    private toast: HotToastService,
  ) {}

  ngOnInit(): void {
    this.initializeForm();
    this.loadClientCompanies();
  }

  /**
   * Initialize the reactive form
   */
  private initializeForm(): void {
    this.userForm = this.fb.group({
      // Main form fields
      gender: ['', Validators.required],
      firstName: ['', [Validators.required, Validators.minLength(2)]],
      lastName: ['', [Validators.required, Validators.minLength(2)]],
      phone: ['', [Validators.minLength(8), Validators.maxLength(20)]],
      email: ['', [Validators.required, Validators.email]],
      isSales: [false], // Default to false for Akzente users

      // Dynamic customer assignments/favorites - will be created after loading companies
      customers: this.fb.group({}),
    });
  }

  /**
   * Load all client companies for assignment/favorites
   */
  private loadClientCompanies(): void {
    this.isLoadingCompanies = true;

    console.log('🔄 Loading client companies...');

    this.clientCompanyService
      .getClientCompanies(1, 100)
      .pipe(
        finalize(() => {
          this.isLoadingCompanies = false;
        }),
        catchError((error) => {
          console.error('❌ Error loading client companies:', error);

          this.toast.error('Fehler beim Laden der Kundenunternehmen', {
            position: 'bottom-right',
            duration: 4000,
          });

          return of({ data: [], hasNextPage: false } as InfinityPaginationResponse<ClientCompany>);
        }),
      )
      .subscribe({
        next: (response: InfinityPaginationResponse<ClientCompany>) => {
          console.log('✅ Client companies loaded:', response);
          this.allClientCompanies = response.data;
          this.setupDynamicForm();
        },
      });
  }

  /**
   * Setup form controls dynamically based on loaded companies
   */
  private setupDynamicForm(): void {
    const customersGroup = this.userForm.get('customers') as FormGroup;

    // Clear existing controls
    Object.keys(customersGroup.controls).forEach((key) => {
      customersGroup.removeControl(key);
    });

    // Add controls for each company
    this.allClientCompanies.forEach((company) => {
      const controlName = this.getControlName(company.name);
      customersGroup.addControl(controlName, new FormControl(false));
    });

    console.log(
      '🎯 Dynamic form setup completed with companies:',
      this.allClientCompanies.map((c) => c.name),
    );
  }

  /**
   * Handle tab change - more explicit approach
   */
  onTabChange(event: any): void {
    console.log('Tab change event received:', event);

    // Handle different event structures from PrimeNG
    if (typeof event === 'number') {
      this.selectedTab = event;
    } else if (event && event.index !== undefined) {
      this.selectedTab = event.index;
    } else if (event && event.originalEvent) {
      // Sometimes PrimeNG passes nested events
      this.selectedTab = event.index || 0;
    }

    console.log('Tab changed to:', this.selectedTab === 0 ? 'Akzente' : 'Kunde');
    console.log('Current selectedTab value:', this.selectedTab);
  }

  /**
   * Manually set tab - for direct click handlers
   */
  setTab(tabIndex: number): void {
    this.selectedTab = tabIndex;
    console.log('Tab manually set to:', this.selectedTab === 0 ? 'Akzente' : 'Kunde');
  }

  /**
   * Convert company name to a valid form control name
   * Made public for template access
   */
  getControlName(companyName: string): string {
    return companyName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '') // Remove special characters
      .replace(/\s+/g, ''); // Remove spaces
  }

  /**
   * Get company by control name
   */
  getCompanyByControlName(controlName: string): ClientCompany | undefined {
    return this.allClientCompanies.find((company) => this.getControlName(company.name) === controlName);
  }

  /**
   * Toggle customer selection
   */
  toggleCustomerSelection(controlName: string): void {
    const customerControl = this.userForm.get(`customers.${controlName}`);
    if (customerControl) {
      customerControl.setValue(!customerControl.value);
    }
  }

  /**
   * Check if customer is selected
   */
  isCustomerSelected(controlName: string): boolean {
    return this.userForm.get(`customers.${controlName}`)?.value || false;
  }

  /**
   * Get fallback image for companies without logos
   */
  getFallbackImage(companyName: string): string {
    // You can customize this based on company names or use a default image
    const fallbacks: { [key: string]: string } = {
      luxottica: 'images/projects/p-1.png',
      woom: 'images/projects/p-2.png',
      hugendubel: 'images/projects/p-3.png',
      reebok: 'images/projects/p-4.png',
    };

    const key = companyName.toLowerCase();
    return fallbacks[key] || 'images/default-company-logo.png';
  }

  /**
   * TrackBy function for client companies to improve performance
   * Made public for template access
   */
  trackByCompanyId(index: number, company: ClientCompany): number {
    return company.id;
  }

  /**
   * Toggle password visibility
   */
  toggleShowPassword(): void {
    this.showPassword = !this.showPassword;
  }

  /**
   * Check if form is valid for submission
   */
  isFormValidForSubmission(): boolean {
    const formValid = this.userForm.valid;
    // Remove the requirement for selected companies - make it optional
    return formValid;
  }

  /**
   * Check if at least one company is selected
   */
  private hasSelectedCompanies(): boolean {
    const customers = this.userForm.get('customers')?.value || {};
    return Object.values(customers).some((value) => value === true);
  }

  /**
   * Get form errors for debugging
   */
  private getFormErrors(): any {
    const errors: any = {};
    Object.keys(this.userForm.controls).forEach((key) => {
      const control = this.userForm.get(key);
      if (control?.errors) {
        errors[key] = control.errors;
      }
    });
    return errors;
  }

  /**
   * Get the current user type based on selected tab
   */
  private getUserType(): 'akzente' | 'client' {
    return this.selectedTab === 0 ? 'akzente' : 'client';
  }

  /**
   * Get the appropriate endpoint name based on user type
   */
  private getEndpointType(): string {
    return this.getUserType() === 'akzente' ? 'Akzente Benutzer' : 'Client';
  }

  /**
   * Get the appropriate companies label based on user type
   */
  getCompaniesLabel(): string {
    return this.getUserType() === 'akzente' ? 'favorisiertes Kundenunternehmen' : 'Kundenunternehmen';
  }

  /**
   * Submit form and create user (Akzente or Client)
   */
  onSubmit(): void {
    console.log('Submit button clicked');
    console.log('Selected tab:', this.selectedTab);
    console.log('User type:', this.getUserType());
    console.log('Form valid:', this.userForm.valid);
    console.log('Form value:', this.userForm.value);
    console.log('Form errors:', this.getFormErrors());

    if (!this.isFormValidForSubmission() || this.isSubmitting) {
      console.log('❌ Form invalid or already submitting');

      this.userForm.markAllAsTouched();

      if (!this.userForm.valid) {
        this.toast.error('Bitte füllen Sie alle erforderlichen Felder korrekt aus', {
          position: 'bottom-right',
          duration: 3000,
        });
      }
      // Remove the error message for companies since it's now optional
      return;
    }

    this.isSubmitting = true;

    const userType = this.getUserType();
    console.log(`🚀 Starting ${userType} creation...`);

    const formValues = this.userForm.value;

    // Get selected client companies from dynamic checkboxes (can be empty array now)
    const selectedCompanyIds: number[] = [];
    const customers = formValues.customers;

    Object.keys(customers).forEach((controlName) => {
      if (customers[controlName]) {
        const company = this.getCompanyByControlName(controlName);
        if (company) {
          selectedCompanyIds.push(company.id);
        }
      }
    });

    console.log('Form data:', {
      userType,
      firstName: formValues.firstName,
      lastName: formValues.lastName,
      email: formValues.email,
      phone: formValues.phone,
      gender: formValues.gender,
      selectedCompanies: selectedCompanyIds,
    });

    // Show loading toast
    const loadingToast = this.toast.loading(`Erstelle ${this.getEndpointType()}...`, {
      position: 'bottom-right',
      duration: 2000,
    });

    // Call the appropriate service method based on user type
    if (userType === 'akzente') {
      this.createAkzenteUser(formValues, selectedCompanyIds, loadingToast);
    } else {
      this.createClientUser(formValues, selectedCompanyIds, loadingToast);
    }
  }

  /**
   * Create Akzente user
   */
  private createAkzenteUser(formValues: any, selectedCompanyIds: number[], loadingToast: any): void {
    const createAkzenteData: CreateAkzenteDto = {
      email: formValues.email,
      password: this.generateRandomPassword(),
      firstName: formValues.firstName,
      lastName: formValues.lastName,
      gender: formValues.gender,
      phone: formValues.phone,
      isSales: formValues.isSales || false, // Include isSales field
      clientCompanies: selectedCompanyIds.map((id) => ({ id })),
    };

    console.log('📤 Sending Akzente creation request:', createAkzenteData);

    this.clientService
      .createAkzente(createAkzenteData)
      .pipe(
        finalize(() => {
          this.isSubmitting = false;
          loadingToast.close();
        }),
      )
      .subscribe({
        next: () => {
          console.log('✅ Akzente user created successfully');

          this.toast.success('Akzente Benutzer wurde erfolgreich erstellt!', {
            position: 'bottom-right',
            duration: 5000,
            icon: '✅',
          });

          setTimeout(() => {
            // Preserve filter state when navigating back
            const queryParams = this.route.snapshot.queryParams;
            this.router.navigate(['/users'], { queryParams });
          }, 1000);
        },
        error: (error) => {
          console.error('❌ Error creating Akzente user:', error);

          const errorMessage = this.getErrorMessage(error, 'akzente');
          this.toast.error(errorMessage, {
            position: 'bottom-right',
            duration: 5000,
            icon: '❌',
          });
        },
      });
  }

  /**
   * Create Client user
   */
  private createClientUser(formValues: any, selectedCompanyIds: number[], loadingToast: any): void {
    const createClientData: CreateClientDto = {
      email: formValues.email,
      password: this.generateRandomPassword(),
      firstName: formValues.firstName,
      lastName: formValues.lastName,
      gender: formValues.gender,
      phone: formValues.phone,
      clientCompanies: selectedCompanyIds.map((id) => ({ id })),
    };

    console.log('📤 Sending client creation request:', createClientData);

    this.clientService
      .createClient(createClientData)
      .pipe(
        finalize(() => {
          this.isSubmitting = false;
          loadingToast.close();
        }),
      )
      .subscribe({
        next: () => {
          console.log('✅ Client created successfully');

          this.toast.success('Client wurde erfolgreich erstellt! Eine Bestätigungs-E-Mail wurde versendet.', {
            position: 'bottom-right',
            duration: 5000,
            icon: '✅',
          });

          setTimeout(() => {
            // Preserve filter state when navigating back
            const queryParams = this.route.snapshot.queryParams;
            this.router.navigate(['/users'], { queryParams });
          }, 1000);
        },
        error: (error) => {
          console.error('❌ Error creating client:', error);

          const errorMessage = this.getErrorMessage(error, 'client');
          this.toast.error(errorMessage, {
            position: 'bottom-right',
            duration: 5000,
            icon: '❌',
          });
        },
      });
  }

  /**
   * Extract user-friendly error message from error response
   */
  private getErrorMessage(error: any, userType: 'akzente' | 'client'): string {
    if (error?.data?.errors) {
      const errors = error.data.errors;

      if (errors.email) {
        return 'Diese E-Mail-Adresse wird bereits verwendet.';
      }

      if (errors.clientCompanies) {
        return 'Einige der ausgewählten Kundenunternehmen wurden nicht gefunden.';
      }

      if (errors.user === 'unauthorizedUserType') {
        return userType === 'client'
          ? 'Sie haben keine Berechtigung, Clients zu erstellen. Nur Akzente-Benutzer können Clients anlegen.'
          : 'Sie haben keine Berechtigung, Akzente-Benutzer zu erstellen.';
      }

      if (errors.user === 'unauthorizedUserRole') {
        return 'Sie haben keine Berechtigung, Akzente-Benutzer zu erstellen. Nur Administratoren können Akzente-Benutzer anlegen.';
      }

      const firstError = Object.values(errors)[0];
      return typeof firstError === 'string' ? firstError : 'Validierungsfehler in den Eingabedaten.';
    }

    if (error?.data?.message) {
      return error.data.message;
    }

    if (error?.message) {
      return error.message;
    }

    if (error?.status === 401) {
      return userType === 'client' ? 'Unauthorized: Sie müssen als Akzente-Benutzer angemeldet sein.' : 'Unauthorized: Sie müssen als Administrator angemeldet sein.';
    }

    if (error?.status === 422) {
      return 'Ungültige Eingabedaten. Bitte überprüfen Sie Ihre Eingaben.';
    }

    if (error?.status === 500) {
      return 'Serverfehler. Bitte versuchen Sie es später erneut.';
    }

    const entityName = userType === 'client' ? 'Clients' : 'Akzente-Benutzers';
    return `Ein unbekannter Fehler ist aufgetreten beim Erstellen des ${entityName}.`;
  }

  /**
   * Cancel and navigate back
   */
  cancel(): void {
    this.toast.info('Vorgang abgebrochen', {
      position: 'bottom-right',
      duration: 2000,
    });

    // Preserve filter state when navigating back
    const queryParams = this.route.snapshot.queryParams;
    this.router.navigate(['/users'], { queryParams });
  }

  /**
   * Check if form field has error
   */
  hasFieldError(fieldName: string): boolean {
    const field = this.userForm.get(fieldName);
    return !!(field && field.invalid && (field.dirty || field.touched));
  }

  /**
   * Get field error message
   */
  getFieldError(fieldName: string): string {
    const field = this.userForm.get(fieldName);
    if (!field || !field.errors) return '';

    if (field.errors['required']) return `${fieldName} ist erforderlich`;
    if (field.errors['email']) return 'Ungültige E-Mail-Adresse';
    if (field.errors['minlength']) return `Mindestens ${field.errors['minlength'].requiredLength} Zeichen erforderlich`;
    if (field.errors['pattern']) return 'Ungültiges Format';

    return 'Ungültige Eingabe';
  }

  // 1. Utility method for random password
  generateRandomPassword(length = 10): string {
    const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%';
    let pwd = '';
    for (let i = 0; i < length; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pwd;
  }
}
