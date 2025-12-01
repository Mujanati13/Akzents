import { Component, OnInit, ViewEncapsulation, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
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
  selector: 'app-staff-detail',
  standalone: true,
  imports: [CommonModule, RouterModule, ImportsModule, AppIconComponent, FavoriteToggleComponent, FormsModule],
  templateUrl: './staff-detail.component.html',
  styleUrls: ['./staff-detail.component.scss'],
  encapsulation: ViewEncapsulation.None,
})
export class StaffDetailComponent implements OnInit {
  staffId: string;
  staffMember: any = null;
  merchandiser: Merchandiser | null = null;
  loading: boolean = true;
  error: boolean = false;
  errorMessage: string = '';

  // Feedback properties
  feedbackDialogVisible = false;
  rating: number = 0;
  reviewText: string = '';
  submittingFeedback = false;
  feedbacks: Feedback[] = [];
  loadingFeedbacks = false;
  feedbackStats: FeedbackStats | null = null;
  userHasReviewed = false;

  // Accordion active value - set all panels open by default
  activeAccordionValue: string[] = ['0', '1', '2', '3', '4', '5', '6'];

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

  get queryParams(): Record<string, any> {
    return { ...this.route.snapshot.queryParams };
  }

  navigateBackToStaffList(): void {
    // Get query parameters to preserve state (viewMode, search params, etc.)
    const queryParams = { ...this.route.snapshot.queryParams };
    this.router.navigate(['/staff'], { queryParams });
  }

  goToEdit(newTab: boolean = false): void {
    // Preserve query parameters when navigating to edit
    const queryParams = { ...this.route.snapshot.queryParams };

    if (newTab) {
      const urlTree = this.router.createUrlTree(['/staff', this.staffId, 'edit'], { queryParams });
      const url = window.location.origin + urlTree.toString();
      window.open(url, '_blank');
    } else {
      this.router.navigate(['/staff', this.staffId, 'edit'], { queryParams });
    }
  }

  onEditContextMenu(event: MouseEvent): boolean {
    event.preventDefault();
    this.goToEdit(true);
    return false;
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

  showFeedbackDialog(): void {
    this.feedbackDialogVisible = true;
    this.rating = 0;
    this.reviewText = '';
  }

  submitFeedback(): void {
    // Validation
    if (!this.rating || this.rating < 1 || this.rating > 5) {
      this._toast.error('Bitte wählen Sie eine Bewertung von 1-5 Sternen', {
        position: 'bottom-right',
        duration: 4000,
      });
      return;
    }

    if (!this.reviewText.trim()) {
      this._toast.error('Bitte geben Sie eine Bewertung ein', {
        position: 'bottom-right',
        duration: 4000,
      });
      return;
    }

    const reviewData: CreateReviewDto = {
      merchandiserId: parseInt(this.staffId),
      rating: this.rating,
      review: this.reviewText.trim(),
    };

    console.log('📝 Submitting review:', reviewData);
    this.submittingFeedback = true;

    this.feedbackService
      .createReview(reviewData)
      .pipe(
        catchError((error) => {
          console.error('❌ Error submitting review:', error);

          // Handle specific 409 Conflict error for duplicate reviews
          if (error.status === 409) {
            this._toast.error('Sie haben bereits eine Bewertung für diesen Merchandiser abgegeben', {
              position: 'bottom-right',
              duration: 5000,
            });

            // Close the dialog since they can't submit another review
            this.feedbackDialogVisible = false;

            // Mark that user has already reviewed (you can add this property)
            this.userHasReviewed = true;
          } else {
            // Handle other errors
            this._toast.error('Fehler beim Senden der Bewertung', {
              position: 'bottom-right',
              duration: 4000,
            });
          }

          return of(null);
        }),
        finalize(() => {
          this.submittingFeedback = false;
        }),
      )
      .subscribe({
        next: (response: CreateReviewResponse | null) => {
          if (response) {
            console.log('✅ Review submitted successfully:', response);

            // Update the local feedbacks with the new response data
            this.updateFeedbacksFromResponse(response);

            // Close dialog and show success
            this.feedbackDialogVisible = false;

            this._toast.success('Bewertung erfolgreich gesendet', {
              position: 'bottom-right',
              duration: 2000,
            });

            // Reset form
            this.rating = 0;
            this.reviewText = '';

            // Mark that user has reviewed
            this.userHasReviewed = true;
          }
        },
      });
  }

  private updateFeedbacksFromResponse(response: CreateReviewResponse): void {
    // Update feedback stats
    this.feedbackStats = {
      averageRating: response.averageRating,
      totalReviews: response.reviewCount,
    };

    // Update feedbacks array with the latest reviews from API
    this.feedbacks = response.reviews.map((review) => ({
      id: review.id,
      rating: review.rating,
      review: review.review,
      createdAt: review.createdAt,
      reviewer: {
        firstName: review.akzente.user.firstName,
        lastName: review.akzente.user.lastName,
      },
    }));

    // Update staff member's average rating
    if (this.staffMember) {
      this.staffMember.averageRating = response.averageRating;
      this.staffMember.totalReviews = response.reviewCount;
    }

    // Update merchandiser data if available
    if (this.merchandiser) {
      (this.merchandiser as any).reviewStats = {
        averageRating: response.averageRating,
        reviewCount: response.reviewCount,
      };
      (this.merchandiser as any).reviews = response.reviews;
    }
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

    console.log('🔍 Loading merchandiser details for ID:', this.staffId);

    this.merchandiserService
      .getMerchandiserById(parseInt(this.staffId))
      .pipe(
        catchError((error) => {
          console.error('❌ Error loading merchandiser details:', error);
          this.error = true;
          this.errorMessage = 'Fehler beim Laden der Personal-Details';
          return of(null);
        }),
        finalize(() => {
          this.loading = false;
        }),
      )
      .subscribe({
        next: (merchandiser) => {
          if (merchandiser) {
            console.log('✅ Merchandiser details loaded:', merchandiser);
            console.log('🔍 Projects data:', merchandiser.projects);
            this.merchandiser = merchandiser;
            this.staffMember = this.mapMerchandiserToStaff(merchandiser);

            // Load feedbacks after merchandiser data is available
            this.loadFeedbacks();

            // If we have reviewStats from API, update feedbackStats
            if ((merchandiser as any).reviewStats) {
              this.feedbackStats = {
                averageRating: (merchandiser as any).reviewStats.averageRating,
                totalReviews: (merchandiser as any).reviewStats.reviewCount,
              };
            }
          }
        },
      });
  }

  private mapMerchandiserToStaff(merchandiser: Merchandiser): any {
    return {
      id: merchandiser.id.toString(),
      firstName: merchandiser.user?.firstName || '',
      lastName: merchandiser.user?.lastName || '',
      email: merchandiser.user?.email || '',
      phone: merchandiser.user?.phone || '',
      address: merchandiser.street || '',
      postalCode: merchandiser.zipCode || '',
      city: merchandiser.city?.name || '',
      country: merchandiser.city?.country?.name?.de || merchandiser.nationality || '',
      website: merchandiser.website || '',
      distance: this.calculateDistance(merchandiser.city?.coordinates),
      qualifications:
        merchandiser.jobTypes?.map((job) => ({
          id: job.id,
          name: job.name,
          comment: job.comment,
        })) || [],
      specializations:
        merchandiser.specializations?.map((spec) => ({
          id: spec.id,
          specialization: {
            id: spec.specialization.id,
            name: spec.specialization.name,
            jobType: spec.specialization.jobType,
          },
        })) || [],
      dateOfBirth: this.formatDate(merchandiser.birthday),
      status: merchandiser.status?.name || '',
      isFavorite: merchandiser.isFavorite || false,
      location: this.extractLocation(merchandiser.city?.coordinates),
      image: this.getPortraitImage(merchandiser.files) || 'https://st2.depositphotos.com/1010683/7109/i/450/depositphotos_71090693-stock-photo-caucasian-handsome-man-in-grey.jpg',
      fullBodyImage: this.getFullBodyImage(merchandiser.files),
      languages:
        merchandiser.languages?.map((lang) => ({
          name: lang.language.name,
          level: this.translateLanguageLevel(lang.level),
        })) || [],
      contractuals: merchandiser.contractuals || [],
      references:
        merchandiser.references?.map((ref) => ({
          company: ref.company,
          activity: ref.activity,
          branche: ref.branche,
          startDate: this.formatDate(ref.startDate),
          endDate: this.formatDate(ref.endDate),
        })) || [],
      education:
        merchandiser.education?.map((edu) => ({
          company: edu.company,
          activity: edu.activity,
          graduationDate: this.formatDate(edu.graduationDate),
        })) || [],
      files: {
        portrait: this.getFileByType(merchandiser.files, 'portrait'),
        fullBodyShot: this.getFileByType(merchandiser.files, 'full_body_shot'),
        resume: this.getFileByType(merchandiser.files, 'resume'),
        additionalAttachments: this.getFilesByType(merchandiser.files, 'additional_attachments'),
      },
      joinDate: this.formatDate(merchandiser.createdAt),
      taxId: 'DE123456789',
      taxNumber: '123/207/50234',
      // Use the reviewStats from API if available, otherwise default to 0
      averageRating: (merchandiser as any).reviewStats?.averageRating || 0,
      totalReviews: (merchandiser as any).reviewStats?.reviewCount || 0,
      // Add projects data
      projects: merchandiser.projects || { past: [], current: [] },
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

  getSpecializationsForJobType(jobTypeName: string): any[] {
    return this.staffMember.specializations?.filter((spec: any) => spec.specialization.jobType.name === jobTypeName) || [];
  }

  formatProjectYear(dateString: string): string {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.getFullYear().toString();
  }
}
