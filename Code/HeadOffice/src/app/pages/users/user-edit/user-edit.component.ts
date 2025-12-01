import { Component, OnInit, ViewEncapsulation } from '@angular/core';
import { FormBuilder, FormGroup, FormControl, Validators } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { Location } from '@angular/common';
import { HotToastService } from '@ngxpert/hot-toast';
import { ClientCompanyService, ClientCompany, InfinityPaginationResponse } from '@app/core/services/client-company.service';
import { UsersService, User } from '@app/pages/users/services/users.service';
import { finalize, catchError, of, forkJoin } from 'rxjs';

@Component({
  selector: 'app-user-edit',
  templateUrl: './user-edit.component.html',
  styleUrls: ['./user-edit.component.scss'],
  encapsulation: ViewEncapsulation.None,
  standalone: false,
})
export class UserEditComponent implements OnInit {
  userForm: FormGroup;
  isSubmitting = false;
  showPassword: boolean = false;
  userId: string;
  currentUser: User | null = null;
  userType: 'akzente' | 'client' | null = null;
  isLoading = true;
  selectedTab: number = 0; // Add this property

  // Gender options
  salutationOptions = [
    { code: 'male', name: 'Herr' },
    { code: 'female', name: 'Frau' },
    { code: 'other', name: 'Divers' },
  ];

  // Client Companies for assignment/favorites
  allClientCompanies: ClientCompany[] = [];
  isLoadingCompanies = false;
  userCompanies: number[] = []; // IDs of companies assigned to this user

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private route: ActivatedRoute,
    private location: Location,
    private usersService: UsersService,
    private clientCompanyService: ClientCompanyService,
    private toast: HotToastService,
  ) {}

  ngOnInit(): void {
    this.initializeForm();

    // Get user ID from route parameter
    this.route.params.subscribe((params) => {
      this.userId = params['id'];
      if (this.userId) {
        this.loadUserData();
      } else {
        this.toast.error('Benutzer-ID nicht gefunden');
        // Preserve filter state when navigating back
        const queryParams = this.route.snapshot.queryParams;
        this.router.navigate(['/users'], { queryParams });
      }
    });
  }

  /**
   * Initialize the reactive form
   */
  private initializeForm(): void {
    this.userForm = this.fb.group({
      salutation: ['', Validators.required],
      firstName: ['', [Validators.required, Validators.minLength(2)]],
      lastName: ['', [Validators.required, Validators.minLength(2)]],
      phone: ['', [Validators.minLength(8), Validators.maxLength(20)]],
      email: ['', [Validators.required, Validators.email]],
      password: [''], // Password is optional for edit

      // Dynamic company assignments/favorites
      companies: this.fb.group({}),
    });
  }

  /**
   * Load user data and related information
   */
  private loadUserData(): void {
    this.isLoading = true;

    console.log('🔄 Loading user data for ID:', this.userId);

    // Load user data and client companies in parallel
    forkJoin({
      user: this.usersService.getUserById(this.userId),
      companies: this.clientCompanyService.getClientCompanies(1, 100),
    })
      .pipe(
        finalize(() => {
          this.isLoading = false;
        }),
        catchError((error) => {
          console.error('❌ Error loading user data:', error);

          this.toast.error('Fehler beim Laden der Benutzerdaten', {
            position: 'bottom-right',
            duration: 4000,
          });

          return of({
            user: null,
            companies: { data: [], hasNextPage: false } as InfinityPaginationResponse<ClientCompany>,
          });
        }),
      )
      .subscribe({
        next: ({ user, companies }) => {
          if (user) {
            this.currentUser = user;
            this.determineUserType(user);
            this.populateForm(user);

            this.allClientCompanies = companies.data;
            this.loadUserCompanies(user);
            this.setupDynamicForm();

            console.log('✅ User data loaded:', {
              id: user.id,
              type: this.userType,
              companiesCount: this.allClientCompanies.length,
            });
          } else {
            this.toast.error('Benutzer nicht gefunden');
            // Preserve filter state when navigating back
            const queryParams = this.route.snapshot.queryParams;
            this.router.navigate(['/users'], { queryParams });
          }
        },
      });
  }

  /**
   * Determine user type and set selected tab
   */
  private determineUserType(user: User): void {
    if (user.type?.name) {
      const typeName = user.type.name.toLowerCase();
      if (typeName === 'akzente') {
        this.userType = 'akzente';
        this.selectedTab = 0; // Set to Akzente tab
      } else if (typeName === 'client') {
        this.userType = 'client';
        this.selectedTab = 1; // Set to Client tab
      }
    }

    console.log('User type determined:', this.userType, 'Selected tab:', this.selectedTab);
  }

  /**
   * Handle tab change (optional - you might want to disable this for edit mode)
   */
  onTabChange(event: any): void {
    // In edit mode, you might want to prevent tab switching
    // since the user type is already determined
    console.log('Tab change attempted, but user type is fixed:', this.userType);
  }

  /**
   * Populate form with user data
   */
  private populateForm(user: User): void {
    this.userForm.patchValue({
      salutation: user.gender || '',
      firstName: user.firstName || '',
      lastName: user.lastName || '',
      phone: user.phone || '',
      email: user.email || '',
      // Don't populate password for security
    });
  }

  /**
   * Load user's assigned companies based on user type
   */
  private loadUserCompanies(user: User): void {
    this.userCompanies = [];

    if (this.userType === 'client' && user.clientCompanies) {
      // Load client assignments from the user data
      this.userCompanies = user.clientCompanies.map((company) => company.id);
      console.log('Client companies loaded from user data:', this.userCompanies);
    } else if (this.userType === 'akzente' && user.clientCompanies) {
      // Load favorite companies from the user data
      this.userCompanies = user.clientCompanies.map((company) => company.id);
      console.log('Favorite companies loaded from user data:', this.userCompanies);
    }

    console.log('User companies loaded:', this.userCompanies);
  }

  /**
   * Setup form controls dynamically based on loaded companies
   */
  private setupDynamicForm(): void {
    const companiesGroup = this.userForm.get('companies') as FormGroup;

    // Clear existing controls
    Object.keys(companiesGroup.controls).forEach((key) => {
      companiesGroup.removeControl(key);
    });

    // Add controls for each company and set initial values
    this.allClientCompanies.forEach((company) => {
      const controlName = this.getControlName(company.name);
      const isAssigned = this.userCompanies.includes(company.id);
      companiesGroup.addControl(controlName, new FormControl(isAssigned));
    });

    console.log('🎯 Dynamic form setup completed with user assignments');
  }

  /**
   * Convert company name to a valid form control name
   */
  getControlName(companyName: string): string {
    return companyName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .replace(/\s+/g, '');
  }

  /**
   * Get company by control name
   */
  getCompanyByControlName(controlName: string): ClientCompany | undefined {
    return this.allClientCompanies.find((company) => this.getControlName(company.name) === controlName);
  }

  /**
   * Toggle company selection
   */
  toggleCompanySelection(controlName: string): void {
    const companyControl = this.userForm.get(`companies.${controlName}`);
    if (companyControl) {
      companyControl.setValue(!companyControl.value);
    }
  }

  /**
   * Check if company is selected
   */
  isCompanySelected(controlName: string): boolean {
    return this.userForm.get(`companies.${controlName}`)?.value || false;
  }

  /**
   * Get fallback image for companies without logos
   */
  getFallbackImage(companyName: string): string {
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
   * TrackBy function for client companies
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
   * Get the companies section title based on user type
   */
  getCompaniesTitle(): string {
    return this.userType === 'akzente' ? 'Favoritisierte Kunden' : 'Zuordnung Kunden';
  }

  /**
   * Get the companies label based on user type
   */
  getCompaniesLabel(): string {
    return this.userType === 'akzente' ? 'favorisiertes Kundenunternehmen' : 'Kundenunternehmen';
  }

  /**
   * Check if form is valid for submission
   */
  isFormValidForSubmission(): boolean {
    const formValues = this.userForm.value;

    // Check if basic form is valid
    if (!this.userForm.valid) {
      return false;
    }

    // Check if at least one field has changed
    if (this.currentUser) {
      const hasChanges =
        formValues.firstName !== this.currentUser.firstName ||
        formValues.lastName !== this.currentUser.lastName ||
        formValues.email !== this.currentUser.email ||
        formValues.phone !== this.currentUser.phone ||
        formValues.gender !== this.currentUser.gender ||
        (formValues.password && formValues.password.trim()) ||
        this.hasCompanyChanges();

      if (!hasChanges) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check if company assignments have changed
   */
  private hasCompanyChanges(): boolean {
    const selectedCompanyIds = this.getSelectedCompanyIds();

    // Compare with current user's companies
    const currentCompanyIds = this.userCompanies.sort();
    const newCompanyIds = selectedCompanyIds.sort();

    return JSON.stringify(currentCompanyIds) !== JSON.stringify(newCompanyIds);
  }

  /**
   * Get selected company IDs
   */
  private getSelectedCompanyIds(): number[] {
    const selectedIds: number[] = [];
    const companies = this.userForm.get('companies')?.value || {};

    Object.keys(companies).forEach((controlName) => {
      if (companies[controlName]) {
        const company = this.getCompanyByControlName(controlName);
        if (company) {
          selectedIds.push(company.id);
        }
      }
    });

    return selectedIds;
  }

  generateRandomPassword(length = 10): string {
    const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%';
    let pwd = '';
    for (let i = 0; i < length; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pwd;
  }

  /** Generate and email new password for this user */
  generateNewPassword(): void {
    if (!this.currentUser) return;
    const newPassword = this.generateRandomPassword(10);
    this.toast.info('Neues Passwort wird generiert und versendet...', {
      position: 'bottom-right',
      duration: 3000,
    });
    this.usersService.updateUser(this.currentUser.id, { password: newPassword }).subscribe({
      next: () => {
        this.toast.success('Ein neues Passwort wurde generiert und per E-Mail gesendet.');
      },
      error: () => {
        this.toast.error('Fehler beim Versenden des neuen Passworts.');
      },
    });
  }

  /**
   * Submit form and update user
   */
  onSubmit(): void {
    if (!this.isFormValidForSubmission() || this.isSubmitting) {
      return;
    }

    this.isSubmitting = true;
    const formValues = this.userForm.value;

    // Create update payload - only include changed fields
    const updatePayload: any = {
      firstName: formValues.firstName,
      lastName: formValues.lastName,
      phone: formValues.phone,
      gender: formValues.salutation, // Fix: use salutation instead of gender
    };

    // Only include email if it has changed
    if (formValues.email !== this.currentUser?.email) {
      updatePayload.email = formValues.email;
    }

    // Only include password if it was provided
    if (formValues.password && formValues.password.trim()) {
      updatePayload.password = formValues.password;
    }

    // Include company assignments based on user type
    const selectedCompanyIds = this.getSelectedCompanyIds();
    if (this.hasCompanyChanges()) {
      if (this.userType === 'akzente') {
        updatePayload.clientCompanies = selectedCompanyIds.map((id) => ({ id }));
      } else if (this.userType === 'client') {
        updatePayload.clientCompanies = selectedCompanyIds.map((id) => ({ id }));
      }
    }

    console.log('🚀 Submitting user update payload:', updatePayload);

    const loadingToast = this.toast.loading('Benutzer wird aktualisiert...');

    this.usersService.updateUser(this.userId, updatePayload).subscribe({
      next: (response) => {
        this.isSubmitting = false;
        loadingToast.close();
        this.toast.success('Benutzer wurde erfolgreich aktualisiert');

        // Update the user companies list for future comparisons
        this.userCompanies = selectedCompanyIds;

        // Preserve filter state when navigating back
        setTimeout(() => {
          const queryParams = this.route.snapshot.queryParams;
          this.router.navigate(['/users'], { queryParams });
        }, 1000);
      },
      error: (error) => {
        this.isSubmitting = false;
        loadingToast.close();
        const errorMessage = this.getErrorMessage(error);
        this.toast.error(errorMessage);
      },
    });
  }

  /**
   * Update company assignments based on user type
   */
  private updateCompanyAssignments(selectedCompanyIds: number[]): void {
    if (this.userType === 'client') {
      // TODO: Update client assignments
      // this.clientAssignmentService.updateClientAssignments(userId, selectedCompanyIds)
      console.log('Update client assignments:', selectedCompanyIds);
    } else if (this.userType === 'akzente') {
      // TODO: Update favorite companies
      // this.favoriteClientCompaniesService.updateFavorites(userId, selectedCompanyIds)
      console.log('Update favorite companies:', selectedCompanyIds);
    }
  }

  /**
   * Extract user-friendly error message from error response
   */
  private getErrorMessage(error: any): string {
    if (error?.status === 422 && error?.error?.errors) {
      const errors = error.error.errors;

      if (errors.email === 'emailAlreadyExists') {
        return 'Diese E-Mail-Adresse wird bereits von einem anderen Benutzer verwendet.';
      }

      // Handle other validation errors
      const errorMessages: string[] = [];
      for (const field in errors) {
        if (errors.hasOwnProperty(field)) {
          switch (errors[field]) {
            case 'emailAlreadyExists':
              errorMessages.push('Diese E-Mail-Adresse wird bereits verwendet.');
              break;
            case 'isEmail':
              errorMessages.push('Bitte geben Sie eine gültige E-Mail-Adresse ein.');
              break;
            case 'minLength':
              errorMessages.push('Das Passwort muss mindestens 6 Zeichen lang sein.');
              break;
            default:
              errorMessages.push(`${field}: ${errors[field]}`);
          }
        }
      }

      return errorMessages.join(' ');
    }

    // Default error handling
    if (error?.error?.message) {
      return error.error.message;
    }

    if (error?.message) {
      return error.message;
    }

    return 'Ein Fehler ist beim Aktualisieren des Benutzers aufgetreten. Bitte versuchen Sie es erneut.';
  }

  /**
   * Cancel and navigate back
   */
  cancel(): void {
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
    const control = this.userForm.get(fieldName);

    if (control?.errors && control.touched) {
      if (control.errors['required']) {
        return 'Dieses Feld ist erforderlich';
      }
      if (control.errors['email']) {
        return 'Bitte geben Sie eine gültige E-Mail-Adresse ein';
      }
      if (control.errors['minlength']) {
        return `Mindestens ${control.errors['minlength'].requiredLength} Zeichen erforderlich`;
      }
    }

    return '';
  }
}
