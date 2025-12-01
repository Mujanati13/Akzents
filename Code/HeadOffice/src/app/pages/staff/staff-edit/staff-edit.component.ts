import { Component, OnInit, ViewEncapsulation, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ImportsModule } from '@app/shared/imports';
import { AppIconComponent } from '../../../shared/app-icon.component';
import { FavoriteToggleComponent } from '../../../shared/components/favorite-toggle/favorite-toggle.component';
import { FormsModule } from '@angular/forms';
import { MerchandiserService, Merchandiser, Review } from '@app/core/services/merchandiser.service';
import { FeedbackService, CreateReviewDto, CreateReviewResponse } from '@app/core/services/feedback.service';
import { InitializerService } from '@app/core/services/initializer.service';
import { HotToastService } from '@ngxpert/hot-toast';
import { catchError, of, finalize } from 'rxjs';

// Update the Feedback interface to match the API structure
interface Feedback {
  id: number;
  rating: number;
  review: string;
  createdAt: string;
  reviewer: {
    firstName: string;
    lastName: string;
  };
}

interface FeedbackStats {
  averageRating: number;
  totalReviews: number;
}

@Component({
  selector: 'app-staff-edit',
  standalone: true,
  imports: [CommonModule, ImportsModule, AppIconComponent, FavoriteToggleComponent, FormsModule],
  templateUrl: './staff-edit.component.html',
  styleUrls: ['./staff-edit.component.scss'],
  encapsulation: ViewEncapsulation.None,
})
export class StaffEditComponent implements OnInit {
  staffId: string;
  staffMember: any = null;
  merchandiser: Merchandiser | null = null;
  loading: boolean = true;
  error: boolean = false;
  errorMessage: string = '';

  // Feedback properties
  rating: number = 0;
  reviewText: string = '';
  submittingFeedback = false;
  feedbacks: Feedback[] = [];
  loadingFeedbacks = false;
  feedbackStats: FeedbackStats | null = null;
  userHasReviewed = false;
  statuses: { id: number; name: string }[] = [];
  languageLevels: { id: number; name: string; code: string }[] = [];
  availableJobTypes: { id: number; name: string }[] = [];
  availableLanguages: { id: number; name: string }[] = [];

  // Form states
  showAddEducationForm: boolean = false;
  newEducation: { qualification: string; institution: string; graduationDate: string } = { qualification: '', institution: '', graduationDate: '' };
  showAddReferenceForm: boolean = false;
  newReference: { company: string; activity: string; industry: string; fromDate: string; toDate: string } = { company: '', activity: '', industry: '', fromDate: '', toDate: '' };

  // Save button states
  savingContractual: boolean = false;
  savingQualification: boolean = false;
  savingReferences: boolean = false;
  savingLanguages: boolean = false;
  savingFiles: boolean = false;

  // Accordion active value - start with all panels open by default
  activeAccordionValue: string[] = ['0', '1', '2', '3', '4'];
  savingHeader: boolean = false;

  // File deletion tracking
  filesToDelete: number[] = [];

  private readonly _toast = inject(HotToastService);

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private merchandiserService: MerchandiserService,
    private feedbackService: FeedbackService,
    private initializerService: InitializerService, // Add this injection
  ) {}

  ngOnInit(): void {
    this.staffId = this.route.snapshot.paramMap.get('id') || '';
    if (this.staffId) {
      this.loadStaffDetails();
    } else {
      this.error = true;
      this.errorMessage = 'Keine gültige Personal-ID gefunden';
      this.loading = false;
    }
  }

  navigateBackToStaffList(): void {
    // Get query parameters to preserve state (viewMode, search params, etc.)
    const queryParams = { ...this.route.snapshot.queryParams };
    this.router.navigate(['/staff'], { queryParams });
  }

  onFavoriteChanged(newStatus: boolean, staff: any): void {
    console.log('🔄 Toggling favorite status:', { id: staff.id, newStatus });

    const previousStatus = staff.isFavorite;
    staff.isFavorite = newStatus;

    this.merchandiserService
      .toggleFavoriteStatus(parseInt(this.staffId))
      .pipe(
        catchError((error) => {
          console.error('❌ Error toggling favorite status:', error);
          staff.isFavorite = previousStatus;
          this._toast.error('Fehler beim Aktualisieren der Favoriten', {
            position: 'bottom-right',
            duration: 4000,
          });
          return of(null);
        }),
      )
      .subscribe({
        next: (result) => {
          if (result) {
            console.log('✅ Favorite status updated:', result);
            staff.isFavorite = result.isFavorite;
            this._toast.success(result.message, {
              position: 'bottom-right',
              duration: 2000,
            });
          }
        },
      });
  }

  loadFeedbacks(): void {
    if (!this.staffId) return;

    this.loadingFeedbacks = true;

    console.log('📊 Loading feedbacks for merchandiser:', this.staffId);

    // The reviews are already loaded with the merchandiser data, so we can use them directly
    if (this.merchandiser && this.merchandiser.reviews) {
      // Map the API reviews to your feedback interface
      this.feedbacks = this.merchandiser.reviews.map((review) => ({
        id: review.id,
        rating: review.rating,
        review: review.review,
        createdAt: review.createdAt,
        reviewer: {
          firstName: review.akzente.user.firstName,
          lastName: review.akzente.user.lastName,
        },
      }));

      // Check if current user has already reviewed this merchandiser
      this.checkIfUserHasReviewed();

      this.updateFeedbackStats();
      this.loadingFeedbacks = false;
    } else {
      // If no reviews in merchandiser data, set empty state
      this.feedbacks = [];
      this.feedbackStats = null;
      this.userHasReviewed = false;
      this.loadingFeedbacks = false;
    }
  }

  private checkIfUserHasReviewed(): void {
    // Get the current user from the initializer service
    const currentUser = this.initializerService.getCurrentUser();

    if (!currentUser) {
      console.log('🔍 No current user found');
      this.userHasReviewed = false;
      return;
    }

    console.log('🔍 Checking reviews for current user:', currentUser.id);

    // Check if any review in the merchandiser's reviews is from the current user
    this.userHasReviewed =
      this.merchandiser?.reviews?.some((review) => {
        const reviewerUserId = review.akzente?.user?.id;
        const hasReviewed = reviewerUserId === currentUser.id;

        if (hasReviewed) {
          console.log('✅ Found existing review by current user:', {
            reviewId: review.id,
            reviewerUserId,
            currentUserId: currentUser.id,
          });
        }

        return hasReviewed;
      }) || false;

    console.log('🔍 User has reviewed this merchandiser:', this.userHasReviewed);
  }

  updateFeedbackStats(): void {
    if (this.feedbacks.length === 0) {
      this.feedbackStats = null;
      return;
    }

    const totalRating = this.feedbacks.reduce((sum, feedback) => sum + feedback.rating, 0);
    const averageRating = totalRating / this.feedbacks.length;

    this.feedbackStats = {
      averageRating: averageRating,
      totalReviews: this.feedbacks.length,
    };

    // Update staff member's average rating if available
    if (this.staffMember) {
      this.staffMember.averageRating = averageRating;
      this.staffMember.totalReviews = this.feedbacks.length;
    }
  }

  formatFeedbackDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('de-DE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  getReviewerInitials(reviewer: any): string {
    if (!reviewer) return 'NA';
    const firstName = reviewer.firstName || '';
    const lastName = reviewer.lastName || '';
    return (firstName.charAt(0) + lastName.charAt(0)).toUpperCase();
  }

  loadStaffDetails(): void {
    this.loading = true;
    this.error = false;
    this.errorMessage = '';

    this.merchandiserService
      .getEditMerchandiserById(parseInt(this.staffId))
      .pipe(
        catchError((error) => {
          this.error = true;
          this.errorMessage = 'Fehler beim Laden der Personal-Details';
          return of(null);
        }),
        finalize(() => {
          this.loading = false;
        }),
      )
      .subscribe({
        next: (merchandiser: any) => {
          if (merchandiser) {
            this.merchandiser = merchandiser;
            // Set basic data first for immediate display
            this.statuses = merchandiser.statuses || [];
            this.languageLevels = merchandiser.languageLevels || [];
            this.availableJobTypes = merchandiser.availableJobTypes || [];
            this.availableLanguages = merchandiser.languages || [];
            
            // Map merchandiser to staff member (this is the heavy operation)
            this.staffMember = this.mapMerchandiserToStaff(merchandiser);
            
            // Load feedbacks asynchronously after main data is displayed
            setTimeout(() => {
              this.loadFeedbacks();
              if ((merchandiser as any).reviewStats) {
                this.feedbackStats = {
                  averageRating: (merchandiser as any).reviewStats.averageRating,
                  totalReviews: (merchandiser as any).reviewStats.reviewCount,
                };
              }
            }, 0);
          }
        },
      });
  }

  onStatusChange(status: string): void {
    this.staffMember.status = status;
    // Status change will be saved when user clicks "Stammdaten speichern"
  }

  private mapMerchandiserToStaff(apiData: any): any {
    const profile = apiData.profile;

    // Helper for language level name
    const getLanguageLevelName = (levelId: number) => {
      const found = apiData.languageLevels?.find((lvl: any) => lvl.id === levelId);
      return found?.name || '';
    };

    return {
      id: profile.id?.toString(),
      firstName: profile.firstName || '',
      lastName: profile.lastName || '',
      email: profile.email || '',
      phone: profile.phoneNumber || '',
      address: profile.street || '',
      postalCode: profile.postalCode || profile.zipCode || '',
      city: profile.cityId || '', // You may want to resolve city name from a lookup if available
      country: profile.nationality || '',
      website: profile.website || '',
      qualifications:
        profile.jobTypes?.map((job: any) => ({
          id: job.id,
          jobTypeId: job.jobTypeId,
          name: job.name,
          comment: job.comment || '',
        })) || [],
      specializations:
        profile.specializations?.map((spec: any) => ({
          name: spec.specialization?.name,
          jobTypeName: spec.specialization?.jobType?.name,
        })) || [],
      dateOfBirth: this.formatDate(profile.birthDate),
      status: profile.status?.name || 'Aktiv',
      isFavorite: profile.isFavorite || false,
      location: undefined, // No coordinates in new response
      image: this.getPortraitImage(profile.files) || 'https://st2.depositphotos.com/1010683/7109/i/450/depositphotos_71090693-stock-photo-caucasian-handsome-man-in-grey.jpg',
      fullBodyImage: this.getFullBodyImage(profile.files),
      languages:
        profile.languages?.map((lang: any) => ({
          id: lang.id,
          languageId: lang.languageId,
          levelId: lang.levelId,
          language: lang.language,
          level: { id: lang.levelId, name: getLanguageLevelName(lang.levelId) },
        })) || [],
      references:
        profile.references?.map((ref: any) => ({
          id: ref.id,
          company: ref.company,
          activity: ref.activity,
          industry: ref.industry,
          fromDate: ref.fromDate,
          toDate: ref.toDate,
        })) || [],
      education:
        profile.education?.map((edu: any) => ({
          id: edu.id,
          institution: edu.institution,
          qualification: edu.qualification,
          graduationDate: edu.graduationDate,
        })) || [],
      files: {
        portrait: this.getFileByType(profile.files, 'portrait'),
        fullBodyShot: this.getFileByType(profile.files, 'full_body_shot'),
        resume: this.getFileByType(profile.files, 'resume'),
        additionalAttachments: this.getFilesByType(profile.files, 'additional_attachments'),
      },
      joinDate: '', // Not present in new response
      taxId: profile.tax_id || '',
      taxNumber: profile.tax_no || '',
      averageRating: profile.reviewStats?.averageRating || 0,
      totalReviews: profile.reviewStats?.reviewCount || 0,
      contractuals:
        profile.contractuals?.map((c: any) => ({
          id: c.contractualId || c.id,
          name: c.name,
        })) || [],
    };
  }

  private getPortraitImage(files: any[]): string | null {
    const portraitFile = files?.find((f) => f.type === 'portrait');
    return portraitFile?.file?.path || null;
  }

  private getFullBodyImage(files: any[]): string | null {
    const fullBodyFile = files?.find((f) => f.type === 'full_body_shot');
    return fullBodyFile?.file?.path || null;
  }

  private getFileByType(files: any[], type: string): any | null {
    return files?.find((f) => f.type === type) || null;
  }

  private getFilesByType(files: any[], type: string): any[] {
    return files?.filter((f) => f.type === type) || [];
  }

  private translateLanguageLevel(level: string): string {
    const translations: { [key: string]: string } = {
      basic: 'Grundkenntnisse',
      intermediate: 'Fließend',
      advanced: 'Fortgeschritten',
      native: 'Muttersprache',
    };
    return translations[level] || level;
  }

  private extractLocation(coordinates: number[]): { lat: number; lng: number } | undefined {
    if (coordinates && coordinates.length >= 2) {
      return {
        lat: coordinates[0],
        lng: coordinates[1],
      };
    }
    return undefined;
  }

  private calculateDistance(coordinates?: number[]): string {
    if (!coordinates || coordinates.length < 2) {
      return '-- km';
    }
    return '-- km';
  }

  private formatDate(dateString: string): string {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('de-DE');
  }

  goBack(): void {
    this.router.navigate(['/staff']);
  }

  toggleContractual(id: number, checked: boolean) {
    if (!this.staffMember.contractuals) this.staffMember.contractuals = [];
    if (checked) {
      // Add if not present
      if (!this.staffMember.contractuals.some((c) => c.id === id)) {
        this.staffMember.contractuals.push({ id, name: this.getContractualName(id) });
      }
    } else {
      // Remove if present
      this.staffMember.contractuals = this.staffMember.contractuals.filter((c) => c.id !== id);
    }
  }

  getContractualName(id: number): string {
    switch (id) {
      case 1:
        return 'Gewerbeschein';
      case 2:
        return 'DSVGO';
      case 3:
        return 'Clearing';
      default:
        return '';
    }
  }
  hasContractual(id: number): boolean {
    return this.staffMember?.contractuals?.some((c) => c.id === id) ?? false;
  }
  getSpecializationsForJobType(jobType: any): any[] {
    return this.staffMember.specializations?.filter((spec: any) => spec.jobTypeName === jobType.name) || [];
  }

  addLanguage(): void {
    if (!this.staffMember.languages) {
      this.staffMember.languages = [];
    }

    // Add a new language with default values
    this.staffMember.languages.push({
      id: null,
      languageId: null,
      levelId: null,
      language: { id: null, name: '' },
      level: { id: null, name: '' },
    });
  }

  removeLanguage(index: number): void {
    if (this.staffMember.languages && this.staffMember.languages.length > index) {
      this.staffMember.languages.splice(index, 1);
    }
  }

  addEducation(): void {
    if (!this.staffMember.education) {
      this.staffMember.education = [];
    }

    // Add a new education entry with default values
    this.staffMember.education.push({
      id: null,
      institution: '',
      qualification: '',
      graduationDate: '',
    });
  }

  removeEducation(index: number): void {
    if (this.staffMember.education && this.staffMember.education.length > index) {
      this.staffMember.education.splice(index, 1);
    }
  }

  confirmAddEducation(): void {
    if (this.newEducation.qualification && this.newEducation.institution) {
      this.staffMember.education.push({
        id: null,
        qualification: this.newEducation.qualification,
        institution: this.newEducation.institution,
        graduationDate: this.newEducation.graduationDate,
      });

      // Reset form
      this.newEducation = { qualification: '', institution: '', graduationDate: '' };
      this.showAddEducationForm = false;
    }
  }

  cancelAddEducation(): void {
    this.newEducation = { qualification: '', institution: '', graduationDate: '' };
    this.showAddEducationForm = false;
  }

  addReference(): void {
    if (!this.staffMember.references) {
      this.staffMember.references = [];
    }

    // Add a new reference with default values
    this.staffMember.references.push({
      id: null,
      company: '',
      activity: '',
      industry: '',
      fromDate: '',
      toDate: '',
    });
  }

  removeReference(index: number): void {
    if (this.staffMember.references && this.staffMember.references.length > index) {
      this.staffMember.references.splice(index, 1);
    }
  }

  confirmAddReference(): void {
    if (this.newReference.company && this.newReference.activity) {
      this.staffMember.references.push({
        id: null,
        company: this.newReference.company,
        activity: this.newReference.activity,
        industry: this.newReference.industry,
        fromDate: this.newReference.fromDate,
        toDate: this.newReference.toDate,
      });

      // Reset form
      this.newReference = { company: '', activity: '', industry: '', fromDate: '', toDate: '' };
      this.showAddReferenceForm = false;
    }
  }

  cancelAddReference(): void {
    this.newReference = { company: '', activity: '', industry: '', fromDate: '', toDate: '' };
    this.showAddReferenceForm = false;
  }

  // File management methods
  uploadFile(fileType: string): void {
    // Trigger file input click
    const fileInput = document.querySelector(`input[type="file"][data-file-type="${fileType}"]`) as HTMLInputElement;
    if (fileInput) {
      fileInput.click();
    }
  }

  onFileSelected(event: any, fileType: string): void {
    const file = event.target.files[0];
    if (file) {
      this.uploadFileToServer(file, fileType);
    }
  }

  uploadFileToServer(file: File, fileType: string): void {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', fileType);
    formData.append('merchandiserId', this.staffId);

    // Show loading state
    this.savingFiles = true;

    // Call your upload service here
    this.merchandiserService.uploadFile(formData).subscribe({
      next: (response) => {
        this.savingFiles = false;
        this._toast.success('Datei erfolgreich hochgeladen!', {
          position: 'bottom-right',
          duration: 4000,
        });
        // Reload staff details to get updated file list
        this.loadStaffDetails();
      },
      error: (error) => {
        this.savingFiles = false;
        this._toast.error('Fehler beim Hochladen der Datei. Bitte versuchen Sie es erneut.', {
          position: 'bottom-right',
          duration: 4000,
        });
      },
    });
  }

  deleteFile(fileType: string, index?: number): void {
    let fileId: number | null = null;

    // Get file ID based on type
    switch (fileType) {
      case 'portrait':
        fileId = this.staffMember.files.portrait?.id;
        break;
      case 'full_body_shot':
        fileId = this.staffMember.files.fullBodyShot?.id;
        break;
      case 'resume':
        fileId = this.staffMember.files.resume?.id;
        break;
      case 'additional_attachments':
        if (index !== undefined && this.staffMember.files.additionalAttachments[index]) {
          fileId = this.staffMember.files.additionalAttachments[index].id;
        }
        break;
    }

    if (!fileId) {
      this._toast.error('Datei nicht gefunden.', {
        position: 'bottom-right',
        duration: 4000,
      });
      return;
    }

    // Show loading state
    this.savingFiles = true;

    // Call your delete service here
    this.merchandiserService.deleteFile(fileId).subscribe({
      next: (response) => {
        this.savingFiles = false;
        this._toast.success('Datei erfolgreich gelöscht!', {
          position: 'bottom-right',
          duration: 4000,
        });

        // Remove file from UI immediately
        switch (fileType) {
          case 'portrait':
            this.staffMember.files.portrait = null;
            break;
          case 'full_body_shot':
            this.staffMember.files.fullBodyShot = null;
            break;
          case 'resume':
            this.staffMember.files.resume = null;
            break;
          case 'additional_attachments':
            if (index !== undefined) {
              this.staffMember.files.additionalAttachments.splice(index, 1);
            }
            break;
        }
      },
      error: (error) => {
        this.savingFiles = false;
        this._toast.error('Fehler beim Löschen der Datei. Bitte versuchen Sie es erneut.', {
          position: 'bottom-right',
          duration: 4000,
        });
      },
    });
  }

  onLanguageChange(language: any, event: any): void {
    // Handle language selection
    const selectedLanguageId = event.value;
    const selectedLanguage = this.getAvailableLanguages().find((lang) => lang.id === selectedLanguageId);

    if (selectedLanguage) {
      language.languageId = selectedLanguageId;
      language.language = selectedLanguage;
    }
  }

  onLevelChange(language: any, event: any): void {
    // Handle level selection
    const selectedLevelId = event.value;
    const selectedLevel = this.languageLevels.find((level) => level.id === selectedLevelId);

    if (selectedLevel) {
      language.levelId = selectedLevelId;
      language.level = selectedLevel;
    }
  }

  getAvailableLanguages(): any[] {
    // Return available languages from API
    return this.availableLanguages;
  }

  getLanguageName(languageId: number): string {
    const language = this.getAvailableLanguages().find((lang) => lang.id === languageId);
    return language ? language.name : '';
  }

  getLevelName(levelId: number): string {
    const level = this.languageLevels.find((level) => level.id === levelId);
    return level ? level.name : '';
  }

  saveContractualData(): void {
    this.savingContractual = true;

    // Prepare data for saving
    const contractualData: any = {
      taxId: this.staffMember.taxId,
      taxNumber: this.staffMember.taxNumber,
      contractuals: this.staffMember.contractuals,
    };

    this.merchandiserService.updateMerchandiser(parseInt(this.staffId), contractualData).subscribe({
      next: (response) => {
        this.savingContractual = false;
        this._toast.success('Vertragsliches erfolgreich gespeichert!', {
          position: 'bottom-right',
          duration: 4000,
        });

        // Update UI with new data
        this.staffMember = this.mapMerchandiserToStaff(response);
      },
      error: (error) => {
        this.savingContractual = false;
        this._toast.error('Fehler beim Speichern der Vertragsdaten. Bitte versuchen Sie es erneut.', {
          position: 'bottom-right',
          duration: 4000,
        });
      },
    });
  }

  saveQualificationData(): void {
    this.savingQualification = true;

    // Prepare data for saving - map back to API structure
    const qualificationData: any = {
      jobTypes: this.staffMember.qualifications?.map((qual: any) => ({
        id: qual.id,
        jobTypeId: qual.jobTypeId,
        name: qual.name,
        comment: qual.comment,
      })),
      specializations: this.staffMember.specializations,
      education: this.staffMember.education?.map((edu: any) => ({
        id: edu.id,
        institution: edu.institution,
        qualification: edu.qualification,
        graduationDate: edu.graduationDate,
      })),
    };

    this.merchandiserService.updateMerchandiser(parseInt(this.staffId), qualificationData).subscribe({
      next: (response) => {
        this.savingQualification = false;
        this._toast.success('Qualifikation erfolgreich gespeichert!', {
          position: 'bottom-right',
          duration: 4000,
        });

        // Update UI with new data
        this.staffMember = this.mapMerchandiserToStaff(response);
      },
      error: (error) => {
        this.savingQualification = false;
        this._toast.error('Fehler beim Speichern der Qualifikation. Bitte versuchen Sie es erneut.', {
          position: 'bottom-right',
          duration: 4000,
        });
      },
    });
  }

  saveReferencesData(): void {
    this.savingReferences = true;

    // Prepare data for saving
    const referencesData: any = {
      references: this.staffMember.references,
    };

    this.merchandiserService.updateMerchandiser(parseInt(this.staffId), referencesData).subscribe({
      next: (response) => {
        this.savingReferences = false;
        this._toast.success('Referenzen erfolgreich gespeichert!', {
          position: 'bottom-right',
          duration: 4000,
        });

        // Update UI with new data
        this.staffMember = this.mapMerchandiserToStaff(response);
      },
      error: (error) => {
        this.savingReferences = false;
        this._toast.error('Fehler beim Speichern der Referenzen. Bitte versuchen Sie es erneut.', {
          position: 'bottom-right',
          duration: 4000,
        });
      },
    });
  }

  saveLanguagesData(): void {
    this.savingLanguages = true;

    // Prepare data for saving
    const languagesData: any = {
      languages: this.staffMember.languages,
    };

    this.merchandiserService.updateMerchandiser(parseInt(this.staffId), languagesData).subscribe({
      next: (response) => {
        this.savingLanguages = false;
        this._toast.success('Sprachen erfolgreich gespeichert!', {
          position: 'bottom-right',
          duration: 4000,
        });

        // Update UI with new data
        this.staffMember = this.mapMerchandiserToStaff(response);
      },
      error: (error) => {
        this.savingLanguages = false;
        this._toast.error('Fehler beim Speichern der Sprachen. Bitte versuchen Sie es erneut.', {
          position: 'bottom-right',
          duration: 4000,
        });
      },
    });
  }

  saveFilesData(): void {
    this.savingFiles = true;

    // Prepare data for saving
    const filesData: any = {
      files: this.staffMember.files,
    };

    this.merchandiserService.updateMerchandiser(parseInt(this.staffId), filesData).subscribe({
      next: (response) => {
        this.savingFiles = false;
        this._toast.success('Dateien erfolgreich gespeichert!', {
          position: 'bottom-right',
          duration: 4000,
        });
      },
      error: (error) => {
        this.savingFiles = false;
        this._toast.error('Fehler beim Speichern der Dateien. Bitte versuchen Sie es erneut.', {
          position: 'bottom-right',
          duration: 4000,
        });
      },
    });
  }

  saveHeaderData(): void {
    this.savingHeader = true;

    // Prepare data for saving (adjust fields as needed)
    const headerData: any = {
      firstName: this.staffMember.firstName,
      lastName: this.staffMember.lastName,
      dateOfBirth: this.staffMember.dateOfBirth,
      phone: this.staffMember.phone,
      email: this.staffMember.email,
      website: this.staffMember.website,
      address: this.staffMember.address,
      postalCode: this.staffMember.postalCode,
      city: { id: this.staffMember.city },
      country: this.staffMember.country, // Change to { id: ... } if needed
      status: this.staffMember.status,
      deliveryAddress: this.staffMember.deliveryAddress,
      deliveryPostalCode: this.staffMember.deliveryPostalCode,
      deliveryCity: this.staffMember.deliveryCity,
      deliveryCountry: this.staffMember.deliveryCountry,
      secondaryResidence: this.staffMember.secondaryResidence,
      secondaryPostalCode: this.staffMember.secondaryPostalCode,
      secondaryCity: this.staffMember.secondaryCity,
      secondaryCountry: this.staffMember.secondaryCountry,
    };

    // Log the data being sent for debugging
    console.log('Saving header data:', headerData);

    this.merchandiserService.updateMerchandiser(parseInt(this.staffId), headerData).subscribe({
      next: (response) => {
        this.savingHeader = false;
        this._toast.success('Stammdaten erfolgreich gespeichert!', {
          position: 'bottom-right',
          duration: 4000,
        });

        // Update UI with new data
        this.staffMember = this.mapMerchandiserToStaff(response);
      },
      error: () => {
        this.savingHeader = false;
        this._toast.error('Fehler beim Speichern der Stammdaten. Bitte versuchen Sie es erneut.', {
          position: 'bottom-right',
          duration: 4000,
        });
      },
    });
  }
}
