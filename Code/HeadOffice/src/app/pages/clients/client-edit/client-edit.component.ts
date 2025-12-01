import { Component, OnInit, ViewEncapsulation } from '@angular/core';
import { FormBuilder, FormGroup, FormControl, Validators } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { HotToastService } from '@ngxpert/hot-toast';
import { ClientCompanyService, CreateClientCompanyFormData, ClientCompany } from '@app/core/services/client-company.service';
import { UsersService, User } from '@app/pages/users/services/users.service';
import { ImageItem } from '@app/shared/components/multi-image-upload/multi-image-upload.component';
import { finalize, forkJoin, catchError, of } from 'rxjs';

@Component({
  selector: 'app-client-edit',
  templateUrl: './client-edit.component.html',
  styleUrls: ['./client-edit.component.scss'],
  encapsulation: ViewEncapsulation.None,
  standalone: false,
})
export class ClientEditComponent implements OnInit {
  clientForm: FormGroup;
  managerControl = new FormControl('');
  selectedImages: ImageItem[] = [];
  isSubmitting = false;
  isLoading = true;
  logoPreview: string | null = null;
  fileName: string = '';
  selectedLogoFile: File | null = null;
  clientId: number | null = null;
  currentClientCompany: ClientCompany | null = null;

  // For autocomplete - now populated from API
  filteredContacts: string[] = [];
  contactValue: string[] = [];
  allContacts: string[] = [];
  clientUsers: User[] = []; // Store full user objects

  selectedManagers: string[] = [];
  filteredManagers: string[] = [];
  allManagers: string[] = [];
  akzenteUsers: User[] = []; // Store full user objects

  // Store user IDs for relationships
  selectedContactUserIds: number[] = [];
  selectedManagerUserIds: number[] = [];

  private logoChanged = false; // Track if logo was changed

  private formatUserName(user: User | any): string {
    const firstName = (user?.firstName ?? '').toString().trim();
    const lastName = (user?.lastName ?? '').toString().trim();
    const fullName = `${firstName} ${lastName}`.trim();
    if (fullName) {
      return fullName;
    }
    const email = (user?.email ?? '').toString().trim();
    if (email) {
      return email;
    }
    const id = user?.id ?? user?.user?.id ?? '';
    return id ? `User #${id}` : 'Unbekannter Benutzer';
  }

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private route: ActivatedRoute,
    private clientCompanyService: ClientCompanyService,
    private toast: HotToastService,
  ) {}

  ngOnInit(): void {
    this.initializeForm();
    this.loadData();
  }

  private initializeForm(): void {
    this.clientForm = this.fb.group({
      name: ['', Validators.required],
      image: [''],
      contacts: [[]],
      managers: [[]],
    });
  }

  private loadData(): void {
    // Get client ID from route parameters - for route structure like 'clients/:id/edit'
    const allParamKeys = this.route.snapshot.paramMap.keys;
    console.log('🔍 All route param keys:', allParamKeys);

    // Try different ways to extract the ID
    let extractedId: string | null = null;

    // Method 1: Try 'id' parameter
    extractedId = this.route.snapshot.paramMap.get('id');
    console.log('Method 1 - id param:', extractedId);

    // Method 2: Try 'clientId' parameter
    if (!extractedId) {
      extractedId = this.route.snapshot.paramMap.get('clientId');
      console.log('Method 2 - clientId param:', extractedId);
    }

    // Method 3: Try direct params object
    if (!extractedId) {
      extractedId = this.route.snapshot.params['id'];
      console.log('Method 3 - params.id:', extractedId);
    }

    // Method 4: Try first parameter key (if only one parameter exists)
    if (!extractedId && allParamKeys.length === 1) {
      const firstKey = allParamKeys[0];
      extractedId = this.route.snapshot.paramMap.get(firstKey);
      console.log(`Method 4 - first param key '${firstKey}':`, extractedId);
    }

    console.log('🔍 Route debugging:', {
      url: this.router.url,
      paramMap: allParamKeys,
      extractedId: extractedId,
      allParams: this.route.snapshot.params,
    });

    this.clientId = extractedId ? Number(extractedId) : null;

    console.log('📋 Final extracted client ID:', this.clientId);

    if (!this.clientId || isNaN(this.clientId)) {
      console.error('❌ Invalid client ID extracted from route');
      this.toast.error('Ungültige Kunden-ID', {
        position: 'bottom-right',
        duration: 3000,
      });
      const queryParams = this.route.snapshot.queryParams;
      this.router.navigate(['/clients/list'], { queryParams });
      return;
    }

    this.isLoading = true;

    // Use the new endpoint that includes relationships
    this.clientCompanyService
      .getClientCompanyWithRelationships(this.clientId)
      .pipe(
        finalize(() => {
          this.isLoading = false;
        }),
      )
      .subscribe({
        next: (result) => {
          console.log('✅ Client company with relationships loaded:', result);

          this.currentClientCompany = result.clientCompany;
          this.prefillClientData(result.clientCompany);
          this.processUsersAndRelationships(result);
        },
        error: (error) => {
          console.error('❌ Error loading client company:', error);

          this.toast.error('Fehler beim Laden der Kundendaten', {
            position: 'bottom-right',
            duration: 5000,
          });

          const queryParams = this.route.snapshot.queryParams;
          this.router.navigate(['/clients/list'], { queryParams });
        },
      });
  }

  private processUsersAndRelationships(result: any): void {
    // Process all users (normalize to arrays from paginated objects)
    const clientUsersData = result?.allUsers?.clientUsers?.data ?? [];
    const akzenteUsersData = result?.allUsers?.akzenteUsers?.data ?? [];

    this.clientUsers = clientUsersData;
    this.akzenteUsers = akzenteUsersData;

    // Create contact and manager options
    this.allContacts = this.clientUsers.map((user) => this.formatUserName(user));
    this.allManagers = this.akzenteUsers.map((user) => this.formatUserName(user));

    // Pre-populate existing relationships
    this.populateExistingRelationships(result.clientAssignments, result.clientCompanyAssignedAkzente);

    console.log('✅ Users and relationships processed:', {
      clientUsers: this.clientUsers.length,
      akzenteUsers: this.akzenteUsers.length,
      selectedContacts: this.contactValue,
      selectedManagers: this.selectedManagers,
    });
  }

  private populateExistingRelationships(clientAssignments: any[], clientCompanyAssignedAkzente: any[]): void {
    // Normalize inputs to arrays
    const assignments = Array.isArray(clientAssignments) ? clientAssignments : clientAssignments ? Object.values(clientAssignments) : [];
    const favorites = Array.isArray(clientCompanyAssignedAkzente) ? clientCompanyAssignedAkzente : clientCompanyAssignedAkzente ? Object.values(clientCompanyAssignedAkzente) : [];

    // Populate existing contact assignments
    this.selectedContactUserIds = assignments.map((assignment: any) => assignment.client.user.id);
    this.contactValue = assignments.map((assignment: any) => this.formatUserName(assignment?.client?.user));

    // Populate existing manager favorites
    this.selectedManagerUserIds = favorites.map((favorite: any) => favorite.akzente.user.id);
    this.selectedManagers = favorites.map((favorite: any) => this.formatUserName(favorite?.akzente?.user));

    // Update form with the arrays
    this.clientForm.patchValue({
      contacts: this.contactValue,
      managers: this.selectedManagers,
    });
  }

  private prefillClientData(clientCompany: ClientCompany): void {
    this.clientForm.patchValue({
      name: clientCompany.name,
    });

    // Handle logo preview
    if (clientCompany.logo) {
      this.logoPreview = clientCompany.logo.path;
      this.fileName = 'Aktuelles Logo';
      console.log('📷 Current logo set:', this.logoPreview);
    }
  }

  /**
   * Handle image selection
   */
  onImageSelected(file: File): void {
    console.log('📷 Image selected:', file.name);

    this.selectedLogoFile = file;
    this.logoPreview = URL.createObjectURL(file);
    this.fileName = file.name;
    this.logoChanged = true; // Mark logo as changed

    // Update form
    this.clientForm.patchValue({
      image: file,
    });

    // Show success toast for file selection
    this.toast.success(`Logo "${file.name}" ausgewählt`, {
      position: 'bottom-right',
      duration: 2000,
    });
  }

  /**
   * Handle image removal
   */
  onImageRemoved(): void {
    console.log('🗑️ Image removed');

    this.selectedLogoFile = null;
    this.logoPreview = null;
    this.fileName = '';
    this.logoChanged = true; // Mark logo as changed (removed)

    this.clientForm.patchValue({
      image: '',
    });

    // Show info toast for file removal
    this.toast.info('Logo entfernt', {
      position: 'bottom-right',
      duration: 2000,
    });
  }

  /**
   * Handle contact selection changes
   */
  onContactsChanged(): void {
    // Update the selected user IDs based on contact names
    this.selectedContactUserIds = this.contactValue
      .map((contactName) => {
        const user = this.clientUsers.find((user) => this.formatUserName(user) === contactName);
        return user ? user.id : null;
      })
      .filter((id) => id !== null);

    this.clientForm.patchValue({
      contacts: this.contactValue,
    });

    console.log('📝 Contacts changed:', {
      contactNames: this.contactValue,
      contactIds: this.selectedContactUserIds,
    });
  }

  /**
   * Handle manager selection changes
   */
  onManagersChanged(): void {
    // Update the selected user IDs based on manager names
    this.selectedManagerUserIds = this.selectedManagers
      .map((managerName) => {
        const user = this.akzenteUsers.find((user) => this.formatUserName(user) === managerName);
        return user ? user.id : null;
      })
      .filter((id) => id !== null);

    this.clientForm.patchValue({
      managers: this.selectedManagers,
    });

    console.log('📝 Managers changed:', {
      managerNames: this.selectedManagers,
      managerIds: this.selectedManagerUserIds,
    });
  }

  /**
   * Submit form and update client company with relationships
   */
  onSubmit(): void {
    if (this.clientForm.invalid || this.isSubmitting || !this.clientId) {
      console.log('❌ Form invalid, already submitting, or no client ID');

      if (this.clientForm.invalid) {
        this.toast.error('Bitte füllen Sie alle erforderlichen Felder aus', {
          position: 'bottom-right',
          duration: 3000,
        });
      }
      return;
    }

    this.isSubmitting = true;

    console.log('🚀 Starting client company update with relationships...');

    // Prepare FormData
    const formData = new FormData();
    formData.append('name', this.clientForm.get('name')?.value);

    // Only append logo if it was changed
    if (this.logoChanged && this.selectedLogoFile) {
      formData.append('logo', this.selectedLogoFile);
    }

    // Add relationship data
    formData.append('contactIds', JSON.stringify(this.selectedContactUserIds));
    formData.append('managerIds', JSON.stringify(this.selectedManagerUserIds));

    // Update with relationships
    this.clientCompanyService
      .updateClientCompanyWithRelationships(this.clientId, formData)
      .pipe(
        finalize(() => {
          this.isSubmitting = false;
        }),
      )
      .subscribe({
        next: (response) => {
          console.log('✅ Client company updated successfully:', response);

          this.toast.success('Kunde wurde erfolgreich aktualisiert!', {
            position: 'bottom-right',
            duration: 4000,
            icon: '✅',
          });

          setTimeout(() => {
            const queryParams = this.route.snapshot.queryParams;
            this.router.navigate(['/clients/list'], { queryParams });
          }, 1000);
        },
        error: (error) => {
          console.error('❌ Error updating client company:', error);

          const errorMessage = this.getErrorMessage(error);
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
  private getErrorMessage(error: any): string {
    if (error?.error?.message) {
      return error.error.message;
    }

    if (error?.message) {
      return error.message;
    }

    if (error?.status === 400) {
      return 'Ungültige Eingabedaten. Bitte überprüfen Sie Ihre Eingaben.';
    }

    if (error?.status === 404) {
      return 'Kunde nicht gefunden.';
    }

    if (error?.status === 413) {
      return 'Die Logo-Datei ist zu groß. Bitte wählen Sie eine kleinere Datei.';
    }

    if (error?.status === 415) {
      return 'Ungültiges Dateiformat. Nur Bilddateien sind für das Logo erlaubt.';
    }

    if (error?.status === 500) {
      return 'Serverfehler. Bitte versuchen Sie es später erneut.';
    }

    return 'Ein unbekannter Fehler ist aufgetreten beim Aktualisieren des Kunden.';
  }

  /**
   * Cancel and navigate back
   */
  cancel(): void {
    // Show info toast for cancellation
    this.toast.info('Vorgang abgebrochen', {
      position: 'bottom-right',
      duration: 2000,
    });

    // Preserve filter state when navigating back
    const queryParams = this.route.snapshot.queryParams;
    this.router.navigate(['/clients/list'], { queryParams });
  }

  // Autocomplete methods
  searchContacts(event: any) {
    const query = event.query.toLowerCase();
    this.filteredContacts = this.allContacts.filter((contact) => contact.toLowerCase().includes(query));
  }

  addCustomContact() {
    // Navigate to contact add page with client parameter
    this.router.navigate(['users/contact/add', this.clientId]);
  }

  // Manager methods
  searchManagers(event: any) {
    const query = event.query.toLowerCase();
    this.filteredManagers = this.allManagers.filter((manager) => manager.toLowerCase().includes(query));
  }

  addCustomManager() {
    const managerName = this.managerControl.value?.trim();
    if (managerName && !this.selectedManagers.includes(managerName)) {
      this.selectedManagers.push(managerName);

      // Add to allManagers for future suggestions if it's not already there
      if (!this.allManagers.includes(managerName)) {
        this.allManagers.push(managerName);
      }

      this.clientForm.patchValue({
        managers: this.selectedManagers,
      });
      this.managerControl.setValue('');

      // Show success toast for adding manager
      this.toast.success(`Projektleiter "${managerName}" hinzugefügt`, {
        position: 'bottom-right',
        duration: 2000,
      });
    }
  }

  removeManager(manager: string): void {
    this.selectedManagers = this.selectedManagers.filter((m) => m !== manager);
    this.clientForm.patchValue({
      managers: this.selectedManagers,
    });

    // Show info toast for removing manager
    this.toast.info(`Projektleiter "${manager}" entfernt`, {
      position: 'bottom-right',
      duration: 2000,
    });
  }
}
