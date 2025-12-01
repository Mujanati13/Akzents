import { Component, ViewEncapsulation, Output, EventEmitter, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { AbstractControl, FormBuilder, FormGroup, ValidationErrors, ValidatorFn, Validators, FormArray } from '@angular/forms';
import { HotToastService } from '@ngneat/hot-toast';
import { ImageItem } from '@app/shared/components/multi-image-upload/multi-image-upload.component';
import { Store } from '@ngrx/store';
import * as AuthSelectors from '@app/@core/store/auth/auth.selectors';
import * as AppDataSelectors from '@app/@core/store/app-data/app-data.selectors';
import {
  ProfileService,
  ProfileUpdateRequest,
  ProfileUpdateResponse,
  ProfileInitialData,
  MerchandiserLanguage,
  MerchandiserReference,
  MerchandiserEducation,
  MerchandiserSpecialization,
  MerchandiserFile,
  FileUploadResponse,
} from '../services/profile.service';
import { MerchandiserFileType } from '@app/auth/enums';
import { of, forkJoin, throwError } from 'rxjs';
import { switchMap, catchError, tap } from 'rxjs/operators';

export const passwordMatchValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const password = control.get('password');
  const confirmPassword = control.get('confirmPassword');

  if (password && confirmPassword && password.value !== confirmPassword.value) {
    confirmPassword.setErrors({ passwordMismatch: true });
    return { passwordMismatch: true };
  }

  return null;
};

@UntilDestroy()
@Component({
  selector: 'app-profile',
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.scss'],
  encapsulation: ViewEncapsulation.None,
  standalone: false,
})
export class ProfileComponent implements OnInit {
  @Output() sidebarToggle = new EventEmitter<void>();
  userName = 'User';

  // Form setup
  userForm: FormGroup;
  activeStep: number = 1;

  // UI states
  isLoading = false;
  returnUrl: string;
  isRegistering = false;
  stepErrors: { [key: number]: string } = {};
  isSidebarActive = false;
  successModalVisible = false;

  // Dropdown options - loaded from backend
  genderOptions: any[] = [];
  countryOptions: any[] = [];
  cityOptions: any[] = []; // Add this
  allCities: any[] = []; // Store all cities for filtering
  languageOptions: any[] = [];
  languageLevelOptions: any[] = [];
  jobTypeOptions: any[] = [];
  specializationOptions: any[] = [];

  // Cache for grouped specializations to prevent recalculation
  private _groupedSpecializations: Array<{ jobTypeName: string; specializations: any[] }> | null = null;

  // Cache for specialization selection states
  private _specializationSelectionStates: Map<number, boolean> = new Map();

  // Current selections
  selectedCountryId: number | null = null;
  selectedCityId: number | null = null;
  isLoadingCities = false;

  // File arrays
  portraitImages: ImageItem[] = [];
  fullBodyImages: ImageItem[] = [];
  cvFiles: ImageItem[] = [];
  additionalFiles: ImageItem[] = [];

  constructor(
    private readonly _router: Router,
    private readonly _route: ActivatedRoute,
    private readonly _formBuilder: FormBuilder,
    private readonly toast: HotToastService,
    private store: Store,
    private profileService: ProfileService,
  ) {
    this.returnUrl = this._route.snapshot.queryParams['returnUrl'] || '/dashboard';
    this.initForm();
  }

  ngOnInit(): void {
    // Get user name from store
    this.store
      .select(AppDataSelectors.selectUserDisplayName)
      .pipe(untilDestroyed(this))
      .subscribe((name) => {
        if (name !== 'User') {
          this.userName = name;
        } else {
          this.store
            .select(AuthSelectors.selectUserDisplayName)
            .pipe(untilDestroyed(this))
            .subscribe((authName) => {
              this.userName = authName;
            });
        }
      });

    // Load profile and initial data in one call
    this.loadProfileWithInitialData();
  }

  private initForm() {
    this.userForm = this._formBuilder.group(
      {
        // Step 1: Personal information
        gender: [null],
        firstName: ['', Validators.required],
        lastName: ['', Validators.required],
        birthDate: [null],
        email: ['', [Validators.required, Validators.email]],
        phoneNumber: [''],
        website: ['', [Validators.pattern(/^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/)]],
        postalCode: [''],
        city: [null], // For city selection
        country: [null], // For UI selection only
        nationality: [''],

        // Languages
        languages: this._formBuilder.array([]),

        // Step 2: Job Types and Specializations
        jobTypes: this._formBuilder.array([]),
        specializations: this._formBuilder.array([]),

        // References and Education
        references: this._formBuilder.array([this.createReferenceFormGroup()]),
        education: this._formBuilder.array([this.createEducationFormGroup()]),

        // Step 3: Password
        password: ['', [Validators.minLength(8)]],
        confirmPassword: [''],
      },
      { validators: passwordMatchValidator },
    );

    // Initialize arrays
    this.initializeLanguagesArray();

    // Subscribe to country changes to filter cities
    this.userForm.get('country')?.valueChanges.subscribe((countryId) => {
      this.onCountryChange(countryId);
    });
  }

  /**
   * Handle country selection change
   */
  private onCountryChange(countryId: number | null) {
    this.selectedCountryId = countryId;

    if (countryId) {
      // Filter cities for the selected country
      this.cityOptions = this.allCities.filter((city) => city.country?.id === countryId || city.countryId === countryId);

      // Enable city dropdown
      this.userForm.get('city')?.enable();

      // Clear current city selection if it doesn't belong to the new country
      const currentCityId = this.userForm.get('city')?.value;
      if (currentCityId) {
        const cityStillValid = this.cityOptions.some((city) => city.id === currentCityId);
        if (!cityStillValid) {
          this.userForm.get('city')?.setValue(null);
          this.selectedCityId = null;
        }
      }
    } else {
      // Disable and clear city when no country is selected
      this.cityOptions = [];
      this.userForm.get('city')?.setValue(null);
      this.userForm.get('city')?.disable();
      this.selectedCityId = null;
    }
  }

  private initializeLanguagesArray() {
    const languagesArray = this.userForm.get('languages') as FormArray;
    // Add 3 language slots
    for (let i = 0; i < 3; i++) {
      languagesArray.push(this.createLanguageFormGroup());
    }
  }

  getGroupedSpecializations(): Array<{ jobTypeName: string; specializations: any[] }> {
    if (!this.specializationOptions || this.specializationOptions.length === 0) {
      return [];
    }

    // Check cache first
    if (this._groupedSpecializations) {
      return this._groupedSpecializations;
    }

    // Group specializations by job type
    const grouped = new Map<number, { jobTypeName: string; specializations: any[] }>();

    this.specializationOptions.forEach((spec) => {
      const jobTypeId = spec.jobType?.id;
      const jobTypeName = spec.jobType?.name;

      if (jobTypeId && jobTypeName) {
        if (!grouped.has(jobTypeId)) {
          grouped.set(jobTypeId, {
            jobTypeName: jobTypeName,
            specializations: [],
          });
        }
        grouped.get(jobTypeId)!.specializations.push(spec);
      }
    });

    const result = Array.from(grouped.values());
    this._groupedSpecializations = result; // Cache the result
    return result;
  }

  private updateSpecializationSelectionCache(): void {
    const specializationsArray = this.userForm.get('specializations') as FormArray;
    this._specializationSelectionStates.clear();

    specializationsArray.controls.forEach((control) => {
      const id = control.get('id')?.value;
      const selected = control.get('selected')?.value;
      if (id !== null && id !== undefined) {
        this._specializationSelectionStates.set(id, !!selected);
      }
    });
  }

  isSpecializationSelected(specializationId: number): boolean {
    // Use cached state if available
    if (this._specializationSelectionStates.has(specializationId)) {
      return this._specializationSelectionStates.get(specializationId) || false;
    }

    // Fallback to direct form check
    const specializationsArray = this.userForm.get('specializations') as FormArray;
    return specializationsArray.controls.some((control) => control.get('id')?.value === specializationId && control.get('selected')?.value === true);
  }

  toggleSpecializationSelection(specializationId: number): void {
    const specializationsArray = this.userForm.get('specializations') as FormArray;

    // Find the specialization control
    const specializationControl = specializationsArray.controls.find((control) => control.get('id')?.value === specializationId);

    if (specializationControl) {
      const selectedControl = specializationControl.get('selected');
      if (selectedControl) {
        selectedControl.setValue(!selectedControl.value);
      }
    }

    // Update cache for specialization selection state
    const currentState = this._specializationSelectionStates.get(specializationId) || false;
    this._specializationSelectionStates.set(specializationId, !currentState);
  }

  /**
   * Initialize job types form array with data from backend
   */
  private initializeJobTypesArray() {
    const jobTypesArray = this.userForm.get('jobTypes') as FormArray;

    // Clear existing controls
    while (jobTypesArray.length !== 0) {
      jobTypesArray.removeAt(0);
    }

    // Add all available job types
    this.jobTypeOptions.forEach((jobType) => {
      jobTypesArray.push(this.createJobTypeFormGroup(jobType));
    });
  }

  /**
   * Initialize specializations form array with data from backend
   */
  private initializeSpecializationsArray() {
    const specializationsArray = this.userForm.get('specializations') as FormArray;

    // Clear existing controls
    while (specializationsArray.length !== 0) {
      specializationsArray.removeAt(0);
    }

    // Add all available specializations
    this.specializationOptions.forEach((specialization) => {
      specializationsArray.push(this.createSpecializationFormGroup(specialization));
    });

    // Update selection cache after initializing
    this.updateSpecializationSelectionCache();
  }

  private createLanguageFormGroup(): FormGroup {
    return this._formBuilder.group({
      languageId: [null],
      levelId: [null],
    });
  }

  get languages() {
    return this.userForm.get('languages') as FormArray;
  }

  get jobTypes() {
    return this.userForm.get('jobTypes') as FormArray;
  }

  get specializations() {
    return this.userForm.get('specializations') as FormArray;
  }

  get references() {
    return this.userForm.get('references') as FormArray;
  }

  get education() {
    return this.userForm.get('education') as FormArray;
  }

  private createReferenceFormGroup(): FormGroup {
    return this._formBuilder.group({
      company: [''],
      activity: [''],
      industry: [''],
      fromDate: [null],
      toDate: [null],
    });
  }

  private createEducationFormGroup(): FormGroup {
    return this._formBuilder.group({
      institution: [''],
      qualification: [''],
      graduationDate: [null],
    });
  }

  private createJobTypeFormGroup(jobType: any): FormGroup {
    return this._formBuilder.group({
      id: [jobType.id],
      name: [jobType.name],
      selected: [false],
    });
  }

  private createSpecializationFormGroup(specialization: any): FormGroup {
    return this._formBuilder.group({
      id: [specialization.id],
      name: [specialization.name],
      category: [specialization.category],
      selected: [false],
    });
  }

  /**
   * Load profile and initial data in one API call
   */
  private loadProfileWithInitialData() {
    this.isLoading = true;

    this.profileService
      .getProfileWithInitialData()
      .pipe(
        catchError((error) => {
          console.error('Failed to load profile and initial data:', error);
          this.toast.error('Fehler beim Laden der Daten', {
            position: 'bottom-right',
            duration: 3000,
          });
          return of({
            countries: [],
            cities: [],
            languages: [],
            languageLevels: [],
            jobTypes: [],
            specializations: [],
            industryTypes: [],
            genderOptions: [],
          } as ProfileInitialData);
        }),
        untilDestroyed(this),
      )
      .subscribe((data: ProfileInitialData) => {
        // Set dropdown options
        this.languageOptions = data.languages || [];
        this.countryOptions = data.countries || [];
        this.allCities = data.cities || []; // Store all cities
        this.cityOptions = []; // Will be filtered by country selection
        this.jobTypeOptions = data.jobTypes || [];
        this.languageLevelOptions = data.languageLevels || [];
        this.genderOptions = data.genderOptions || [];
        this.specializationOptions = data.specializations || [];
        // Clear cache when new data is loaded
        this._groupedSpecializations = null;

        // Initialize job types form array
        this.initializeJobTypesArray();

        // Initialize specializations form array
        this.initializeSpecializationsArray();

        // Populate form with profile data if available
        if (data.profile) {
          this.populateForm(data.profile);
        }

        this.isLoading = false;
      });
  }

  /**
   * Toggle job type selection
   */
  toggleJobTypeSelection(index: number) {
    const jobTypeControl = this.jobTypes.at(index);
    const selectedControl = jobTypeControl.get('selected');
    if (selectedControl) {
      selectedControl.setValue(!selectedControl.value);
    }
  }

  // File handling methods (updated names to match German template)
  onPortraitImageChanged(images: ImageItem[]): void {
    this.portraitImages = images;

    // Upload new files immediately
    const newFile = images.find((img) => img.file && !img.fileId);
    if (newFile && newFile.file) {
      this.uploadSingleFile(newFile.file, MerchandiserFileType.PORTRAIT);
    }
  }

  onFullBodyImageChanged(images: ImageItem[]): void {
    this.fullBodyImages = images;

    // Upload new files immediately
    const newFile = images.find((img) => img.file && !img.fileId);
    if (newFile && newFile.file) {
      this.uploadSingleFile(newFile.file, MerchandiserFileType.FULL_BODY_SHOT);
    }
  }

  /**
   * Handle Gesamtaufnahme (full body) image changes
   */
  onGesamtaufnahmeImageChanged(images: ImageItem[]): void {
    this.fullBodyImages = images;

    // Upload new files immediately
    const newFile = images.find((img) => img.file && !img.fileId);
    if (newFile && newFile.file) {
      this.uploadSingleFile(newFile.file, MerchandiserFileType.FULL_BODY_SHOT);
    }
  }

  onCvChanged(files: ImageItem[]): void {
    this.cvFiles = files;

    // Upload new files immediately
    const newFile = files.find((file) => file.file && !file.fileId);
    if (newFile && newFile.file) {
      this.uploadSingleFile(newFile.file, MerchandiserFileType.RESUME);
    }
  }

  /**
   * Handle Lebenslauf (CV) file changes
   */
  onLebenslaufChanged(files: ImageItem[]): void {
    this.cvFiles = files;

    // Upload new files immediately
    const newFile = files.find((file) => file.file && !file.fileId);
    if (newFile && newFile.file) {
      this.uploadSingleFile(newFile.file, MerchandiserFileType.RESUME);
    }
  }

  onAdditionalFilesChanged(files: ImageItem[]): void {
    this.additionalFiles = files;

    // Upload new files immediately
    const newFiles = files.filter((file) => file.file && !file.fileId);
    newFiles.forEach((file) => {
      if (file.file) {
        this.uploadSingleFile(file.file, MerchandiserFileType.ADDITIONAL_ATTACHMENTS);
      }
    });
  }

  /**
   * Handle Weitere Anhang (additional files) changes
   */
  onWeitereAnhangChanged(files: ImageItem[]): void {
    this.additionalFiles = files;

    // Upload new files immediately
    const newFiles = files.filter((file) => file.file && !file.fileId);
    newFiles.forEach((file) => {
      if (file.file) {
        this.uploadSingleFile(file.file, MerchandiserFileType.ADDITIONAL_ATTACHMENTS);
      }
    });
  }

  // Navigation methods
  toggleSidebar(): void {
    this.isSidebarActive = !this.isSidebarActive;
    this.sidebarToggle.emit();
  }

  /**
   * Navigate to step and save current step data
   */
  goToStep(nextStep: number) {
    // If going to a previous step, just navigate without validation
    if (nextStep < this.activeStep) {
      this.activeStep = nextStep;
      return;
    }

    // If moving forward, validate and save current step
    if (nextStep > this.activeStep) {
      if (!this.validateStep(this.activeStep)) {
        return;
      }

      // Save current step data before proceeding (except for step 3 which handles files)
      if (this.activeStep < 3) {
        this.saveCurrentStepData()
          .then(() => {
            this.activeStep = nextStep;
          })
          .catch((error) => {
            console.error('Failed to save step data:', error);
            this.toast.error('Fehler beim Speichern der Daten', {
              position: 'bottom-right',
              duration: 3000,
            });
          });
      } else {
        this.activeStep = nextStep;
      }
    } else {
      this.activeStep = nextStep;
    }
  }

  /**
   * Validate the current step of the form
   */
  private validateStep(step: number): boolean {
    switch (step) {
      case 1:
        // Validate personal info and languages
        const personalFields = ['firstName', 'lastName', 'email'];
        let valid = true;
        personalFields.forEach((field) => {
          const control = this.userForm.get(field);
          if (control) {
            control.markAsTouched();
            if (control.invalid) {
              valid = false;
            }
          }
        });

        return valid;
      case 2:
        // Validate job types, specializations, references, education if needed
        // For now, just return true (customize as needed)
        return true;
      case 3:
        // Validate password fields if filled
        const password = this.userForm.get('password');
        const confirmPassword = this.userForm.get('confirmPassword');
        if (password && password.value) {
          password.markAsTouched();
          confirmPassword?.markAsTouched();
          if (this.userForm.hasError('passwordMismatch')) {
            return false;
          }
          if (password.invalid || confirmPassword?.invalid) {
            return false;
          }
        }
        return true;
      default:
        return true;
    }
  }

  /**
   * Save current step data to backend
   */
  private async saveCurrentStepData(): Promise<void> {
    // Only validate the current step, not the entire form
    if (!this.validateStep(this.activeStep)) {
      throw new Error('Current step validation failed');
    }

    const stepData = this.prepareStepData(this.activeStep);

    return new Promise((resolve, reject) => {
      this.profileService
        .updateProfile(stepData)
        .pipe(
          catchError((error) => {
            console.error('Step save error:', error);
            reject(error);
            return throwError(() => error);
          }),
          untilDestroyed(this),
        )
        .subscribe({
          next: (response: ProfileUpdateResponse) => {
            if (response?.success) {
              this.toast.success('Daten erfolgreich gespeichert', {
                position: 'bottom-right',
                duration: 2000,
              });
              resolve();
            } else {
              reject(new Error('Save failed'));
            }
          },
          error: (error) => {
            reject(error);
          },
        });
    });
  }

  /**
   * Prepare data for current step only
   */
  private prepareStepData(step: number): ProfileUpdateRequest {
    const formValues = this.userForm.value;

    switch (step) {
      case 1:
        // Step 1: Only personal information
        return {
          firstName: formValues.firstName,
          lastName: formValues.lastName,
          gender: formValues.gender?.id || formValues.gender, // Extract id from gender object
          birthDate: formValues.birthDate ? new Date(formValues.birthDate).toISOString().split('T')[0] : undefined,
          email: formValues.email,
          phoneNumber: formValues.phoneNumber,
          website: formValues.website,
          postalCode: formValues.postalCode,
          city: formValues.city,
          countryId: formValues.country, // Send countryId for API compatibility
          cityId: formValues.city, // Send cityId (this is what gets stored)
          nationality: formValues.nationality,
        };

      case 2:
        // Step 2: Only qualifications (specializations, languages, references, education)
        // Note: jobTypes are auto-derived from specializations in the backend
        return {
          firstName: formValues.firstName, // Required for API
          lastName: formValues.lastName, // Required for API
          email: formValues.email, // Required for API
          // jobTypes: this.prepareJobTypesData(), // REMOVED: Auto-derived from specializations
          specializations: this.prepareSpecializationsData(),
          languages: this.prepareLanguagesData(),
          references: this.prepareReferencesData(),
          education: this.prepareEducationData(),
        };

      case 3:
        const step3Data: ProfileUpdateRequest = {
          firstName: formValues.firstName, // Required for API
          lastName: formValues.lastName, // Required for API
          email: formValues.email, // Required for API
        };

        if (formValues.password && formValues.password.trim()) {
          step3Data.password = formValues.password;
          step3Data.confirmPassword = formValues.confirmPassword;
        }

        return step3Data;

      default:
        return {
          firstName: formValues.firstName,
          lastName: formValues.lastName,
          email: formValues.email,
        };
    }
  }

  /**
   * Prepare data for step 3 (password and any remaining updates)
   */
  private prepareStep3Data(): ProfileUpdateRequest {
    const formValues = this.userForm.value;

    const data: ProfileUpdateRequest = {
      firstName: formValues.firstName,
      lastName: formValues.lastName,
      email: formValues.email,
    };

    // Add password if provided
    if (formValues.password && formValues.password.trim() !== '') {
      data.password = formValues.password;
      data.confirmPassword = formValues.confirmPassword;
    }

    return data;
  }

  /**
   * Prepare languages data for API submission
   */
  private prepareLanguagesData(): MerchandiserLanguage[] {
    const languagesArray = this.userForm.get('languages') as FormArray;
    return languagesArray.controls
      .map((control) => control.value)
      .filter((lang) => lang.languageId && lang.levelId)
      .map((lang) => ({
        languageId: lang.languageId,
        levelId: lang.levelId,
      }));
  }

  /**
   * Prepare job types data for API submission
   */
  private prepareJobTypesData(): number[] {
    const jobTypesArray = this.userForm.get('jobTypes') as FormArray;
    const selectedJobTypes: number[] = [];

    jobTypesArray.controls.forEach((control, index) => {
      if (control.value.selected && this.jobTypeOptions[index]) {
        selectedJobTypes.push(this.jobTypeOptions[index].id);
      }
    });

    return selectedJobTypes;
  }

  /**
   * Prepare specializations data for API submission
   */
  private prepareSpecializationsData(): MerchandiserSpecialization[] {
    const specializationsArray = this.userForm.get('specializations') as FormArray;
    const selectedSpecializations: MerchandiserSpecialization[] = [];

    specializationsArray.controls.forEach((control, index) => {
      if (control.value.selected && this.specializationOptions[index]) {
        selectedSpecializations.push({
          specializationTypeId: this.specializationOptions[index].id,
        });
      }
    });

    return selectedSpecializations;
  }

  /**
   * Prepare references data for API submission
   */
  private prepareReferencesData(): MerchandiserReference[] {
    const referencesArray = this.userForm.get('references') as FormArray;
    return referencesArray.controls
      .map((control) => control.value)
      .filter((ref) => ref.company && ref.activity && ref.industry)
      .map((ref) => ({
        company: ref.company,
        activity: ref.activity,
        industry: ref.industry,
        fromDate: ref.fromDate ? new Date(ref.fromDate).toISOString().split('T')[0] : undefined,
        toDate: ref.toDate ? new Date(ref.toDate).toISOString().split('T')[0] : undefined,
      }));
  }

  /**
   * Prepare education data for API submission
   */
  private prepareEducationData(): MerchandiserEducation[] {
    const educationArray = this.userForm.get('education') as FormArray;

    const educationData = educationArray.controls
      .map((control) => {
        return control.value;
      })
      .filter((edu) => {
        const isValid = edu.institution && edu.qualification;
        return isValid;
      })
      .map((edu) => ({
        institution: edu.institution,
        qualification: edu.qualification,
        graduationDate: edu.graduationDate ? (edu.graduationDate instanceof Date ? edu.graduationDate.toISOString().split('T')[0] : edu.graduationDate) : undefined,
      }));

    return educationData;
  }

  /**
   * Save profile with files (Step 3 completion)
   */
  saveProfile() {
    if (!this.userForm.valid) {
      this.markFormGroupTouched(this.userForm);
      this.toast.error('Bitte füllen Sie alle erforderlichen Felder aus', {
        position: 'bottom-right',
        duration: 3000,
      });
      return;
    }

    // Check if at least one file is uploaded (either new or existing)
    const hasAnyFiles = this.portraitImages.length > 0 || this.fullBodyImages.length > 0 || this.cvFiles.length > 0 || this.additionalFiles.length > 0;

    if (!hasAnyFiles) {
      this.toast.error('Bitte laden Sie mindestens eine Datei hoch', {
        position: 'bottom-right',
        duration: 3000,
      });
      return;
    }

    this.isRegistering = true;

    // Check if there are any new files to upload
    const hasNewFiles = this.hasNewFilesToUpload();

    if (hasNewFiles) {
      console.log('Step 3: Uploading remaining new files');

      this.uploadAllFiles()
        .pipe(
          switchMap((uploadResult: FileUploadResponse | null) => {
            // Since we're doing batch upload, we get a single response
            if (uploadResult?.success) {
              console.log('Files uploaded successfully via batch upload');
              return of({ success: true, message: 'Files uploaded successfully' });
            } else if (uploadResult === null) {
              // No files to upload
              return of({ success: true, message: 'No files to upload' });
            } else {
              return of({ success: false, message: 'File upload failed' });
            }
          }),
          catchError((error) => {
            console.error('File upload error:', error);
            this.isRegistering = false;
            this.toast.error(error?.message || 'Fehler beim Hochladen der Dateien', { position: 'bottom-right', duration: 5000 });
            return of(null);
          }),
          untilDestroyed(this),
        )
        .subscribe((response: { success: boolean; message?: string }) => {
          this.isRegistering = false;
          if (response?.success) {
            // Refetch profile data to sync uploaded files
            this.loadProfileWithInitialData();

            this.successModalVisible = true;
            this.toast.success('Dateien erfolgreich hochgeladen', {
              position: 'bottom-right',
              duration: 3000,
            });
          }
        });
    } else {
      // No new files to upload, just show success
      this.isRegistering = false;
      this.successModalVisible = true;
      this.toast.success('Profil ist bereits vollständig', {
        position: 'bottom-right',
        duration: 3000,
      });
    }
  }

  /**
   * Check if there are new files that need to be uploaded
   */
  private hasNewFilesToUpload(): boolean {
    const hasNewPortrait = this.portraitImages.some((img) => img.file && !img.fileId);
    const hasNewFullBody = this.fullBodyImages.some((img) => img.file && !img.fileId);
    const hasNewCV = this.cvFiles.some((file) => file.file && !file.fileId);
    const hasNewAdditional = this.additionalFiles.some((file) => file.file && !file.fileId);

    return hasNewPortrait || hasNewFullBody || hasNewCV || hasNewAdditional;
  }

  /**
   * Upload all new files in a single batch request (only files that don't have fileId)
   */
  private uploadAllFiles() {
    const filesToUpload: Array<{ file: File; fileType: MerchandiserFileType }> = [];

    // Only upload files that don't have fileId (new files)
    if (this.portraitImages.length > 0 && this.portraitImages[0].file && !this.portraitImages[0].fileId) {
      filesToUpload.push({
        file: this.portraitImages[0].file,
        fileType: MerchandiserFileType.PORTRAIT,
      });
    }

    if (this.fullBodyImages.length > 0 && this.fullBodyImages[0].file && !this.fullBodyImages[0].fileId) {
      filesToUpload.push({
        file: this.fullBodyImages[0].file,
        fileType: MerchandiserFileType.FULL_BODY_SHOT,
      });
    }

    if (this.cvFiles.length > 0 && this.cvFiles[0].file && !this.cvFiles[0].fileId) {
      filesToUpload.push({
        file: this.cvFiles[0].file,
        fileType: MerchandiserFileType.RESUME,
      });
    }

    this.additionalFiles.forEach((fileItem, index) => {
      if (fileItem.file && !fileItem.fileId) {
        filesToUpload.push({
          file: fileItem.file,
          fileType: MerchandiserFileType.ADDITIONAL_ATTACHMENTS,
        });
      }
    });

    if (filesToUpload.length === 0) {
      console.log('No new files to upload');
      return of(null);
    }

    console.log(`Uploading ${filesToUpload.length} new files in a single batch request`);

    // Use the new batch upload method
    return this.profileService.uploadAllFiles(filesToUpload).pipe(
      tap((response) => {
        console.log('✅ All new files uploaded successfully:', response);
        this.toast.success('Alle neuen Dateien erfolgreich hochgeladen!', {
          position: 'bottom-right',
          duration: 3000,
        });
      }),
      catchError((error) => {
        console.error('❌ Batch file upload failed:', error);
        this.toast.error(`Fehler beim Hochladen der Dateien: ${error?.message || 'Unbekannter Fehler'}`, { position: 'bottom-right', duration: 5000 });
        return of(null);
      }),
    );
  }

  /**
   * Upload individual file immediately when selected
   */
  private uploadSingleFile(file: File, fileType: MerchandiserFileType): void {
    this.isLoading = true;

    this.profileService.uploadFile(file, fileType).subscribe({
      next: (response: FileUploadResponse) => {
        console.log('File uploaded successfully:', response);
        this.toast.success('Datei erfolgreich hochgeladen');

        // Refetch profile data to sync the new file
        this.loadProfileWithInitialData();
      },
      error: (error) => {
        console.error('Error uploading file:', error);
        this.toast.error('Fehler beim Hochladen der Datei');
        this.isLoading = false;
      },
    });
  }

  /**
   * Populate form with existing profile data
   */
  private populateForm(profile: any) {
    if (!profile) return;

    // Set the selected country and city IDs first
    this.selectedCountryId = profile.countryId;
    this.selectedCityId = profile.cityId;

    // Filter cities based on the country
    if (this.selectedCountryId) {
      this.cityOptions = this.allCities.filter((city) => city.country?.id === this.selectedCountryId || city.countryId === this.selectedCountryId);
    }

    // Find the gender option object that matches the profile gender string
    const genderOption = this.genderOptions.find((option) => option.id === profile.gender);

    // Parse birthDate string to Date object
    let birthDate = null;
    if (profile.birthDate) {
      birthDate = new Date(profile.birthDate);
      // Ensure the date is valid
      if (isNaN(birthDate.getTime())) {
        birthDate = null;
      }
    }

    this.userForm.patchValue({
      gender: genderOption || null, // Set the full gender object, not just the string
      firstName: profile.firstName,
      lastName: profile.lastName,
      birthDate: birthDate, // Set as Date object
      email: profile.email,
      phoneNumber: profile.phoneNumber,
      website: profile.website,
      postalCode: profile.postalCode,
      city: profile.cityId, // Set city for dropdown
      country: profile.countryId, // Set country for dropdown
      nationality: profile.nationality,
    });

    // Enable city dropdown if country is selected
    if (this.selectedCountryId) {
      this.userForm.get('city')?.enable();
    } else {
      this.userForm.get('city')?.disable();
    }

    // Populate languages array
    if (profile.languages && profile.languages.length > 0) {
      const languagesArray = this.userForm.get('languages') as FormArray;
      languagesArray.clear();

      profile.languages.forEach((lang: any) => {
        const langGroup = this.createLanguageFormGroup();
        langGroup.patchValue({
          languageId: lang.languageId,
          levelId: lang.levelId,
        });
        languagesArray.push(langGroup);
      });
    }

    // Populate job types - mark as selected if they exist in profile
    if (profile.jobTypes && profile.jobTypes.length > 0) {
      const jobTypesArray = this.userForm.get('jobTypes') as FormArray;
      const profileJobTypeIds = profile.jobTypes.map((jt: any) => jt.id);

      jobTypesArray.controls.forEach((control) => {
        const jobTypeId = control.get('id')?.value;
        if (profileJobTypeIds.includes(jobTypeId)) {
          control.get('selected')?.setValue(true);
        }
      });
    }

    // Populate specializations - mark as selected if they exist in profile
    if (profile.specializations && profile.specializations.length > 0) {
      const specializationsArray = this.userForm.get('specializations') as FormArray;
      const profileSpecializationIds = profile.specializations.map((spec: any) => spec.specialization.id);

      specializationsArray.controls.forEach((control) => {
        const specializationId = control.get('id')?.value;
        if (profileSpecializationIds.includes(specializationId)) {
          control.get('selected')?.setValue(true);
        }
      });

      // Update the cache after setting selected values
      this.updateSpecializationSelectionCache();
    }

    // Populate references
    if (profile.references && profile.references.length > 0) {
      const referencesArray = this.userForm.get('references') as FormArray;
      referencesArray.clear();

      profile.references.forEach((ref: any) => {
        const refGroup = this.createReferenceFormGroup();
        refGroup.patchValue({
          company: ref.company,
          activity: ref.activity,
          industry: ref.industry,
          fromDate: ref.fromDate ? new Date(ref.fromDate) : null,
          toDate: ref.toDate ? new Date(ref.toDate) : null,
        });
        referencesArray.push(refGroup);
      });
    }

    // Populate education
    if (profile.education && profile.education.length > 0) {
      const educationArray = this.userForm.get('education') as FormArray;
      educationArray.clear();

      profile.education.forEach((edu: any) => {
        const eduGroup = this.createEducationFormGroup();

        let graduationDate = null;
        if (edu.graduationDate) {
          graduationDate = new Date(edu.graduationDate);
        }

        eduGroup.patchValue({
          institution: edu.institution,
          qualification: edu.qualification,
          graduationDate: graduationDate,
        });

        educationArray.push(eduGroup);
      });
    }

    // Populate files - convert existing uploaded files to ImageItem format
    if (profile.files && profile.files.length > 0) {
      this.populateUploadedFiles(profile.files);
    }
  }

  /**
   * Populate uploaded files from profile data into ImageItem arrays
   */
  private populateUploadedFiles(files: any[]) {
    // Reset all file arrays
    this.portraitImages = [];
    this.fullBodyImages = [];
    this.cvFiles = [];
    this.additionalFiles = [];

    let additionalFileIndex = 0;

    files.forEach((fileData: any, index: number) => {
      const fileName = this.extractFileNameFromPath(fileData.file.path);
      const isImage = this.isImageFile(fileName);

      const imageItem: ImageItem = {
        id: fileData.id,
        fileName: fileName,
        preview: isImage ? fileData.file.path : undefined, // Only set preview for images
        label: fileName,
        isImage: isImage,
        fileId: fileData.id, // Add fileId for deletion functionality
        // Note: We don't have the actual File object for existing files
        // The file upload component should handle this case
      };

      // Distribute files to appropriate arrays based on type
      switch (fileData.type) {
        case 'portrait':
          this.portraitImages.push(imageItem);
          break;
        case 'full_body_shot':
          this.fullBodyImages.push(imageItem);
          break;
        case 'resume':
          this.cvFiles.push(imageItem);
          break;
        case 'additional_attachments':
          this.additionalFiles.push(imageItem);
          additionalFileIndex++;
          break;
        default:
          console.warn('Unknown file type:', fileData.type);
          break;
      }
    });

    console.log('Populated files:', {
      portrait: this.portraitImages.length,
      fullBody: this.fullBodyImages.length,
      cv: this.cvFiles.length,
      additional: this.additionalFiles.length,
    });
  }

  /**
   * Extract filename from file path URL
   */
  private extractFileNameFromPath(filePath: string): string {
    if (!filePath) return 'Unknown file';

    // Extract filename from URL path
    const urlParts = filePath.split('/');
    const fileName = urlParts[urlParts.length - 1];

    // If it has an extension, return as is, otherwise add a generic extension
    if (fileName.includes('.')) {
      return fileName;
    }

    return `${fileName}.file`;
  }

  /**
   * Check if file is an image based on file extension
   */
  private isImageFile(fileName: string): boolean {
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'];
    const fileExtension = fileName.toLowerCase().substring(fileName.lastIndexOf('.'));
    return imageExtensions.includes(fileExtension);
  }

  private markFormGroupTouched(formGroup: FormGroup) {
    Object.values(formGroup.controls).forEach((control) => {
      control.markAsTouched();
      if (control instanceof FormGroup) {
        this.markFormGroupTouched(control);
      }
    });
  }

  closeModal(): void {
    this.successModalVisible = false;
  }

  goToDashboard(): void {
    this.successModalVisible = false;
    this._router.navigate(['/dashboard']);
  }

  // Additional methods
  addReference() {
    this.references.push(this.createReferenceFormGroup());
  }

  removeReference(index: number) {
    if (index > 0) {
      this.references.removeAt(index);
    }
  }

  addEducation() {
    this.education.push(this.createEducationFormGroup());
  }

  removeEducation(index: number) {
    if (index > 0) {
      this.education.removeAt(index);
    }
  }

  onBirthDateSelected(date: Date) {
    this.userForm.patchValue({ birthDate: date });
  }

  onFromDateSelected(index: number, date: Date) {
    this.references.at(index).patchValue({ fromDate: date });
  }

  onToDateSelected(index: number, date: Date) {
    this.references.at(index).patchValue({ toDate: date });
  }

  ongraduationDateSelected(index: number, date: Date) {
    this.education.at(index).patchValue({ graduationDate: date });
  }

  getFromDate(index: number): Date | null {
    return this.references.at(index).get('fromDate')?.value || null;
  }

  getToDate(index: number): Date | null {
    return this.references.at(index).get('toDate')?.value || null;
  }

  getgraduationDate(index: number): Date | null {
    const value = this.education.at(index).get('graduationDate')?.value || null;
    return value;
  }

  /**
   * Handle file deletion from upload component
   */
  onFileDeleted(event: { fileId: number; index: number }, fileType: string): void {
    this.isLoading = true;

    this.profileService.deleteFile(event.fileId).subscribe({
      next: (response) => {
        console.log('File deleted successfully:', response);
        this.toast.success('Datei erfolgreich gelöscht');

        // Remove file from appropriate array and clear the upload component row
        this.removeFileFromArray(fileType, event.index);

        // Refetch profile data to sync with backend
        this.loadProfileWithInitialData();
      },
      error: (error) => {
        console.error('Error deleting file:', error);
        this.toast.error('Fehler beim Löschen der Datei');
        this.isLoading = false;
      },
    });
  }

  /**
   * Remove file from appropriate array based on file type
   */
  private removeFileFromArray(fileType: string, index: number): void {
    switch (fileType) {
      case 'portrait':
        this.portraitImages = [];
        break;
      case 'full_body_shot':
        this.fullBodyImages = [];
        break;
      case 'resume':
        this.cvFiles = [];
        break;
      case 'additional_attachments':
        // For additional files, remove specific index
        this.additionalFiles = this.additionalFiles.filter((_, i) => i !== index);
        break;
    }
  }
}
