import { Component, OnInit, ViewEncapsulation, inject, ViewChild, ElementRef, AfterViewInit, AfterViewChecked } from '@angular/core';
import { ActivatedRoute, Router, ParamMap } from '@angular/router';
import { ImageItem } from '../../../shared/components/multi-image-upload/multi-image-upload.component';
import { ReportService } from '@app/core/services/report.service';
import { HotToastService } from '@ngxpert/hot-toast';
import { catchError, of } from 'rxjs';
import { CdkDragDrop, transferArrayItem } from '@angular/cdk/drag-drop';

interface GalleryItem {
  itemImageSrc: string;
  thumbnailImageSrc: string;
  title: string;
  alt: string;
}

type PrepopulatedKey =
  | 'prepopulatedVorherImages1'
  | 'prepopulatedNachherImages1'
  | 'prepopulatedNachherImages2'
  | 'prepopulatedVorherImages3'
  | 'prepopulatedNachherImages3';

@Component({
  selector: 'app-report-edit',
  standalone: false,
  templateUrl: './report-edit.component.html',
  styleUrls: ['./report-edit.component.scss'],
  encapsulation: ViewEncapsulation.None,
})
export class ReportEditComponent implements OnInit, AfterViewInit, AfterViewChecked {
  @ViewChild('clientScrollContainer') private clientScrollContainer!: ElementRef;
  @ViewChild('merchandiserScrollContainer') private merchandiserScrollContainer!: ElementRef;

  reportId: string;
  clientId: string;
  projectId: string;
  report: any = null;
  loading: boolean = true;
  error: boolean = false;
  saving: boolean = false;
  showConfirmApproveDialog: boolean = false;
  showConfirmStatusDialog: boolean = false;
  pendingStatusChange: string | null = null;
  private shouldScroll = false;
  selectedPhotoIndex: number = 0;
  galleryImages: GalleryItem[] = [];
  yesNoOptions = [
    { label: 'Ja', value: true },
    { label: 'Nein', value: false },
  ];
  templateVersionOptions = [
    { label: 'Version 1.0', value: 'v1.0' },
    { label: 'Version 1.1', value: 'v1.1' },
    { label: 'Version 2.0', value: 'v2.0' },
  ];

  localContactOptions = [
    { label: 'Hans Müller', value: 'hans' },
    { label: 'Anna Schmidt', value: 'anna' },
    { label: 'Thomas Weber', value: 'thomas' },
  ];

  inventoryStatusOptions = [
    { label: 'Ausreichend', value: 'sufficient' },
    { label: 'Nachbestellt', value: 'reordered' },
    { label: 'Knapp', value: 'low' },
  ];
  // Galleria configuration
  position: string = 'bottom';
  responsiveOptions: any[] = [
    {
      breakpoint: '1024px',
      numVisible: 4,
    },
    {
      breakpoint: '768px',
      numVisible: 3,
    },
    {
      breakpoint: '560px',
      numVisible: 2,
    },
  ];

  // Image collection properties
  vorherImages1: ImageItem[] = [];
  nachherImages1: ImageItem[] = [];
  nachherImages2: ImageItem[] = [];
  vorherImages3: ImageItem[] = [];
  nachherImages3: ImageItem[] = [];

  // Prepopulated images for each photo section
  prepopulatedVorherImages1: ImageItem[] = [];
  prepopulatedNachherImages1: ImageItem[] = [];
  prepopulatedNachherImages2: ImageItem[] = [];
  prepopulatedVorherImages3: ImageItem[] = [];
  prepopulatedNachherImages3: ImageItem[] = [];

  // Dynamic form data for questions
  questionAnswers: { [questionId: number]: any } = {};
  questionOptions: { [questionId: number]: string[] } = {};
  filteredQuestionOptions: { [questionId: number]: string[] } = {};

  // Dialog state for export feedback
  csvDialogVisible: boolean = false;
  csvDialogIsError: boolean = false;
  dialogMessage: string = '';

  private returnToProjectQueryParams: Record<string, any> = {};
  private referrer: string = '';

  get viewReportQueryParams(): Record<string, any> {
    return this.cleanNavigationQueryParams({
      ...this.returnToProjectQueryParams,
      reportStatus: this.report?.status?.name || this.returnToProjectQueryParams['reportStatus'],
    });
  }

  private extractQueryParams(paramMap: ParamMap): Record<string, any> {
    const params: Record<string, any> = {};

    paramMap.keys.forEach((key) => {
      const values = paramMap
        .getAll(key)
        .map((value) => value?.trim())
        .filter((value): value is string => !!value && value !== 'null');

      if (values.length > 1) {
        params[key] = values;
      } else if (values.length === 1) {
        params[key] = values[0];
      }
    });

    return params;
  }

  private cleanNavigationQueryParams(params: Record<string, any>): Record<string, any> {
    const cleaned: Record<string, any> = {};

    Object.entries(params).forEach(([key, value]) => {
      if (value === null || value === undefined) {
        return;
      }

      if (Array.isArray(value)) {
        const filtered = value
          .map((entry) => (typeof entry === 'string' ? entry.trim() : entry))
          .filter((entry) => entry !== undefined && entry !== null && entry !== '' && entry !== 'null');

        if (filtered.length > 0) {
          cleaned[key] = filtered;
        }
        return;
      }

      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed !== '' && trimmed !== 'null') {
          cleaned[key] = trimmed;
        }
        return;
      }

      cleaned[key] = value;
    });

    return cleaned;
  }

  navigateBackToProject(): void {
    // Navigate back based on referrer
    switch (this.referrer) {
      case 'favorites':
        this.router.navigate(['/favorites']);
        break;
      case 'notifications':
        this.router.navigate(['/notifications']);
        break;
      case 'dashboard':
        this.router.navigate(['/dashboard']);
        break;
      case 'client-detail':
        // Navigate to client detail (project view)
        if (!this.clientId || !this.projectId) {
          return;
        }
        const clientParams = this.cleanNavigationQueryParams({
          ...this.returnToProjectQueryParams,
          reportStatus: this.report?.status?.name || this.returnToProjectQueryParams['reportStatus'],
        });
        const clientExtras: any = {};
        if (Object.keys(clientParams).length > 0) {
          clientExtras.queryParams = clientParams;
        }
        this.router.navigate(['/clients', this.clientId, 'projects', this.projectId], clientExtras);
        break;
      case 'report-detail':
        // Navigate back to report detail
        if (!this.clientId || !this.projectId || !this.reportId) {
          return;
        }
        const reportParams = this.cleanNavigationQueryParams({
          ...this.returnToProjectQueryParams,
          reportStatus: this.report?.status?.name || this.returnToProjectQueryParams['reportStatus'],
        });
        const reportExtras: any = {};
        if (Object.keys(reportParams).length > 0) {
          reportExtras.queryParams = reportParams;
        }
        this.router.navigate(['/clients', this.clientId, 'projects', this.projectId, 'reports', this.reportId], reportExtras);
        break;
      default:
      case 'project':
        // Default: Navigate to project overview
        if (!this.clientId || !this.projectId) {
          return;
        }
        const params = this.cleanNavigationQueryParams({
          ...this.returnToProjectQueryParams,
          reportStatus: this.report?.status?.name || this.returnToProjectQueryParams['reportStatus'],
        });
        const extras: any = {};
        if (Object.keys(params).length > 0) {
          extras.queryParams = params;
        }
        this.router.navigate(['/clients', this.clientId, 'projects', this.projectId], extras);
        break;
    }
  }

  navigateToViewReport(newTab: boolean = false): void {
    if (!this.clientId || !this.projectId || !this.reportId) {
      return;
    }

    const params = this.cleanNavigationQueryParams({
      ...this.returnToProjectQueryParams,
      reportStatus: this.report?.status?.name || this.returnToProjectQueryParams['reportStatus'],
    });

    if (newTab) {
      const urlTree = this.router.createUrlTree(
        ['/clients', this.clientId, 'projects', this.projectId, 'reports', this.reportId],
        { queryParams: params }
      );
      const url = window.location.origin + urlTree.toString();
      window.open(url, '_blank');
    } else {
      const extras: any = {};
      if (Object.keys(params).length > 0) {
        extras.queryParams = params;
      }
      this.router.navigate(['/clients', this.clientId, 'projects', this.projectId, 'reports', this.reportId], extras);
    }
  }

  onViewReportContextMenu(event: MouseEvent): boolean {
    event.preventDefault();
    this.navigateToViewReport(true);
    return false;
  }

  // Initialize question data when report is loaded
  initializeQuestionData(): void {
    if (!this.report?.project?.questions) return;

    this.report.project.questions.forEach((question) => {
      const questionId = question.id;

      // Initialize options for this question
      this.questionOptions[questionId] = question.options?.map((option) => option.optionText) || [];
      this.filteredQuestionOptions[questionId] = [...this.questionOptions[questionId]];

      // Find existing answer for this question
      const existingAnswer = this.report.answers?.find((answer) => answer.question.id === questionId);

      if (existingAnswer) {
        const answerType = question.answerType.name;

        switch (answerType) {
          case 'text':
            this.questionAnswers[questionId] = existingAnswer.textAnswer || '';
            break;
          case 'boolean':
            this.questionAnswers[questionId] = existingAnswer.textAnswer === 'true';
            break;
          case 'select':
            if (existingAnswer.selectedOption) {
              this.questionAnswers[questionId] = existingAnswer.selectedOption.optionText;
            }
            break;
          case 'multiselect':
            // For multiselect, find all answers for this question
            const multiselectAnswers = this.report.answers?.filter((answer) => answer.question.id === questionId) || [];
            if (multiselectAnswers.length > 0) {
              this.questionAnswers[questionId] = multiselectAnswers.map((answer) => answer.selectedOption?.optionText).filter((text) => text !== null && text !== undefined);
            } else {
              this.questionAnswers[questionId] = [];
            }
            break;
        }
      } else {
        // Set default values
        const answerType = question.answerType.name;
        switch (answerType) {
          case 'text':
            this.questionAnswers[questionId] = '';
            break;
          case 'boolean':
            this.questionAnswers[questionId] = false;
            break;
          case 'select':
            this.questionAnswers[questionId] = null;
            break;
          case 'multiselect':
            this.questionAnswers[questionId] = [];
            break;
        }
      }
    });
  }

  // Filter options for autocomplete
  filterQuestionOptions(event: any, questionId: number): void {
    const query = event.query?.toLowerCase() || '';
    this.filteredQuestionOptions[questionId] = this.questionOptions[questionId].filter((option) => option.toLowerCase().includes(query));
  }

  // Handle question answer changes
  onQuestionAnswerChanged(questionId: number): void {
    const answer = this.questionAnswers[questionId];
    const question = this.report?.project?.questions?.find((q) => q.id === questionId);

    if (question?.answerType?.name === 'multiselect') {
      // Get the actual option objects to display proper text
      const selectedOptions = Array.isArray(answer)
        ? answer
            .map((optionText) => {
              const option = question.options?.find((opt) => opt.optionText === optionText);
              return {
                id: option?.id,
                text: option?.optionText,
              };
            })
            .filter((opt) => opt.id && opt.text)
        : [];

      console.log('📝 Multiselect question changed:', {
        questionId: questionId,
        questionText: question.questionText,
        selectedOptionIds: selectedOptions.map((opt) => opt.id),
        renderedText: selectedOptions.map((opt) => opt.text).join(', '),
        totalSelected: selectedOptions.length,
      });
    } else {
      console.log(`Question ${questionId} answer changed:`, answer);
    }

    // Here you can add logic to save the answer or update the report
  }

  toggleMultiAnswer(questionId: number, option: string): void {
    if (!Array.isArray(this.questionAnswers[questionId])) {
      this.questionAnswers[questionId] = [];
    }

    const answers: string[] = [...this.questionAnswers[questionId]];
    const index = answers.indexOf(option);
    if (index !== -1) {
      answers.splice(index, 1);
    } else {
      answers.push(option);
    }

    this.questionAnswers[questionId] = answers;
    this.onQuestionAnswerChanged(questionId);
  }

  isMultiAnswerSelected(questionId: number, option: string): boolean {
    if (!Array.isArray(this.questionAnswers[questionId])) {
      return false;
    }
    return this.questionAnswers[questionId].includes(option);
  }

  // Check if a single select option is selected (for radio buttons)
  isSingleAnswerSelected(questionId: number, option: string): boolean {
    return this.questionAnswers[questionId] === option;
  }

  // Handle single select option click (radio button behavior)
  selectSingleAnswer(questionId: number, option: string): void {
    // If clicking the same option, deselect it (allow clearing)
    if (this.questionAnswers[questionId] === option) {
      this.questionAnswers[questionId] = null;
    } else {
      this.questionAnswers[questionId] = option;
    }
    this.onQuestionAnswerChanged(questionId);
  }

  // Prepare answers for saving
  prepareAnswersForSave(): any[] {
    const answers: any[] = [];

    Object.keys(this.questionAnswers).forEach((questionIdStr) => {
      const questionId = parseInt(questionIdStr);
      const answer = this.questionAnswers[questionId];
      const question = this.report.project.questions.find((q) => q.id === questionId);

      if (question && answer !== null && answer !== undefined) {
        const answerType = question.answerType.name;

        switch (answerType) {
          case 'text':
            answers.push({
              questionId: questionId,
              textAnswer: answer,
            });
            break;
          case 'boolean':
            answers.push({
              questionId: questionId,
              textAnswer: answer.toString(),
            });
            break;
          case 'select':
            if (answer) {
              const selectedOption = question.options.find((opt) => opt.optionText === answer);
              answers.push({
                questionId: questionId,
                selectedOptionId: selectedOption?.id,
              });
            }
            break;
          case 'multiselect':
            if (Array.isArray(answer) && answer.length > 0) {
              answer.forEach((selectedText) => {
                const selectedOption = question.options.find((opt) => opt.optionText === selectedText);
                if (selectedOption) {
                  answers.push({
                    questionId: questionId,
                    selectedOptionId: selectedOption.id,
                  });
                }
              });
            }
            break;
        }
      }
    });

    return answers;
  }

  private readonly _toast = inject(HotToastService);

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private reportService: ReportService,
  ) {}

  ngOnInit(): void {
    this.clientId = this.route.snapshot.paramMap.get('clientId') || this.route.snapshot.paramMap.get('clientSlug');
    this.projectId = this.route.snapshot.paramMap.get('projectId') || this.route.snapshot.paramMap.get('projectSlug');
    // Extract reportId and sanitize it to remove any query parameters
    const rawReportId = this.route.snapshot.paramMap.get('reportID');
    this.reportId = rawReportId ? rawReportId.split('?')[0].split('/')[0].trim() : null;

    // Get referrer from query params or use browser history
    this.referrer = this.route.snapshot.queryParamMap.get('referrer') || '';
    
    // If no referrer in query params, try to get from browser history
    if (!this.referrer && window.history.length > 1) {
      // We can't directly access previous URL, so we'll default to project overview
      this.referrer = 'project';
    }

    this.returnToProjectQueryParams = this.cleanNavigationQueryParams(this.extractQueryParams(this.route.snapshot.queryParamMap));

    // Check if coming from notification - open Dialog accordion
    const openDialog = this.route.snapshot.queryParamMap.get('openDialog');
    if (openDialog === 'true') {
      // Ensure Dialog panel (value='3') is in activeAccordionValue
      if (!this.activeAccordionValue.includes('3')) {
        this.activeAccordionValue = [...this.activeAccordionValue, '3'];
      }
    }

    this.loadReportDetails();
  }

  ngAfterViewInit(): void {
    // Scroll to bottom after view init - wait for accordion and DOM to be ready
    setTimeout(() => this.scrollToBottom(), 300);
  }

  ngAfterViewChecked(): void {
    // Auto-scroll when shouldScroll flag is set
    if (this.shouldScroll) {
      this.scrollToBottom();
      this.shouldScroll = false;
    }
  }

  private scrollToBottom(): void {
    // Try scrolling multiple times with increasing delays to ensure DOM is fully rendered
    // This handles cases where the element is conditionally rendered with *ngIf
    const tryScroll = (delay: number) => {
      setTimeout(() => {
        if (this.clientScrollContainer?.nativeElement) {
          const element = this.clientScrollContainer.nativeElement;
          element.scrollTop = element.scrollHeight;
        }
        if (this.merchandiserScrollContainer?.nativeElement) {
          const element = this.merchandiserScrollContainer.nativeElement;
          element.scrollTop = element.scrollHeight;
        }
      }, delay);
    };

    // Try scrolling at 0ms, 100ms, 200ms, and 400ms to handle various DOM rendering scenarios
    tryScroll(0);
    tryScroll(100);
    tryScroll(200);
    tryScroll(400);
  }

  loadReportDetails(): void {
    this.loading = true;
    this.error = false;
    this.reportService.getReportById(this.reportId).subscribe({
      next: (data) => {
        this.report = data;

        // Prefill appointment date from report data
        if (this.report.visitDate) {
          this.report.visitDate = new Date(this.report.visitDate);
        }

        // Process conversation messages
        this.processConversationMessages();

        // Initialize question data
        this.initializeQuestionData();

        // Process uploaded advanced photos
        this.processUploadedAdvancedPhotos();

        // Optionally, map/transform data for the UI here
        this.loading = false;
        
        // Scroll to bottom after messages are loaded and DOM is updated
        setTimeout(() => this.scrollToBottom(), 400);
      },
      error: (err) => {
        this.error = true;
        this.loading = false;
      },
    });
  }

  // Process uploaded advanced photos and convert them to ImageItem format
  processUploadedAdvancedPhotos(): void {
    if (!this.report?.uploadedAdvancedPhotos || !this.report?.project?.advancedPhotos) {
      console.log('No uploaded advanced photos or project advanced photos found');
      return;
    }

    console.log('Processing uploaded advanced photos:', this.report.uploadedAdvancedPhotos);
    console.log('Project advanced photos:', this.report.project.advancedPhotos);

    // Group uploaded photos by advancedPhotoId and beforeAfterType
    const groupedPhotos: { [key: string]: any[] } = {};

    this.report.uploadedAdvancedPhotos.forEach((uploadedPhoto) => {
      const key = `${uploadedPhoto.advancedPhoto.id}_${uploadedPhoto.beforeAfterType}`;
      if (!groupedPhotos[key]) {
        groupedPhotos[key] = [];
      }
      groupedPhotos[key].push(uploadedPhoto);
    });

    console.log('Grouped photos:', groupedPhotos);

    // Process each advanced photo section
    this.report.project.advancedPhotos.forEach((advancedPhoto: any, photoIndex: number) => {
      const beforeKey = `${advancedPhoto.id}_before`;
      const afterKey = `${advancedPhoto.id}_after`;

      console.log(`Processing photo ${photoIndex}:`, { beforeKey, afterKey, advancedPhoto });

      // Process before photos (vorher)
      if (advancedPhoto.isBeforeAfter && groupedPhotos[beforeKey]) {
        const sortedBefore = [...groupedPhotos[beforeKey]].sort((a, b) => {
          const orderA = typeof a.order === 'number' ? a.order : 0;
          const orderB = typeof b.order === 'number' ? b.order : 0;
          return orderA - orderB;
        });

        const beforeImages: ImageItem[] = sortedBefore.map((uploadedPhoto, idx): ImageItem => {
          console.log(`📥 Loading BEFORE image ${uploadedPhoto.id}:`, {
            label: uploadedPhoto.label,
            order: uploadedPhoto.order,
            fileName: uploadedPhoto.file.path,
          });
          
          return {
          id: uploadedPhoto.id,
          file: undefined, // No file since it's already uploaded
          preview: uploadedPhoto.file.path, // Use the file path as preview
          fileName: uploadedPhoto.file.path.split('/').pop() || 'image.jpg',
            label: uploadedPhoto.label, // Use label from database
          isImage: true,
          fileId: uploadedPhoto.id, // Use the uploaded photo ID
          beforeAfterType: 'before',
          order: typeof uploadedPhoto.order === 'number' ? uploadedPhoto.order : idx,
          };
        });

        console.log(`Before images for photo ${photoIndex}:`, beforeImages);

        // Assign to the correct array based on photo index
        if (photoIndex === 0) {
          this.prepopulatedVorherImages1 = beforeImages;
        } else if (photoIndex === 2) {
          this.prepopulatedVorherImages3 = beforeImages;
        }
      }

      // Process after photos (nachher)
      const afterImages: ImageItem[] =
        groupedPhotos[afterKey]
          ? [...groupedPhotos[afterKey]]
              .sort((a, b) => {
                const orderA = typeof a.order === 'number' ? a.order : 0;
                const orderB = typeof b.order === 'number' ? b.order : 0;
                return orderA - orderB;
              })
              .map((uploadedPhoto, idx): ImageItem => {
                console.log(`📥 Loading AFTER image ${uploadedPhoto.id}:`, {
                  label: uploadedPhoto.label,
                  order: uploadedPhoto.order,
                  fileName: uploadedPhoto.file.path,
                });
                
                return {
          id: uploadedPhoto.id,
          file: undefined, // No file since it's already uploaded
          preview: uploadedPhoto.file.path, // Use the file path as preview
          fileName: uploadedPhoto.file.path.split('/').pop() || 'image.jpg',
                  label: uploadedPhoto.label, // Use label from database
          isImage: true,
          fileId: uploadedPhoto.id, // Use the uploaded photo ID
          beforeAfterType: 'after',
          order: typeof uploadedPhoto.order === 'number' ? uploadedPhoto.order : idx,
                };
              })
          : [];

      console.log(`After images for photo ${photoIndex}:`, afterImages);

      // Assign to the correct array based on photo index
      if (photoIndex === 0) {
        this.prepopulatedNachherImages1 = afterImages;
      } else if (photoIndex === 1) {
        this.prepopulatedNachherImages2 = afterImages;
      } else if (photoIndex === 2) {
        this.prepopulatedNachherImages3 = afterImages;
      }
    });

    console.log('Final processed uploaded advanced photos:', {
      prepopulatedVorherImages1: this.prepopulatedVorherImages1,
      prepopulatedNachherImages1: this.prepopulatedNachherImages1,
      prepopulatedNachherImages2: this.prepopulatedNachherImages2,
      prepopulatedVorherImages3: this.prepopulatedVorherImages3,
      prepopulatedNachherImages3: this.prepopulatedNachherImages3,
    });
  }

  selectPhoto(index: number): void {
    this.selectedPhotoIndex = index;
  }

  nextPhoto(): void {
    this.selectedPhotoIndex = (this.selectedPhotoIndex + 1) % this.report.photos.length;
  }

  prevPhoto(): void {
    this.selectedPhotoIndex = (this.selectedPhotoIndex - 1 + this.report.photos.length) % this.report.photos.length;
  }

  // Download Excel for this single report
  downloadSingleReportExcel(): void {
    const id = this.reportId;
    if (!id) return;

    this.reportService.exportSingleReportAsExcel(id).subscribe({
      next: (blob: Blob) => {
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        const branchName = this.report?.branch?.name || 'report';
        link.download = `${branchName.replace(/\s+/g, '_')}_${id}_export.xlsx`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);

        // Show success dialog
        this.dialogMessage = 'Excel-Export erfolgreich heruntergeladen';
        this.csvDialogIsError = false;
        this.csvDialogVisible = true;
      },
      error: (error) => {
        if (error?.status === 404 && error?.error?.error === 'REPORT_NOT_FOUND') {
          this.dialogMessage = 'Bericht nicht gefunden.';
        } else {
          this.dialogMessage = 'Excel-Export fehlgeschlagen!';
        }
        this.csvDialogIsError = true;
        this.csvDialogVisible = true;
      },
    });
  }

  onFavoriteChanged(newStatus: boolean, report: any): void {
    const previousStatus = report.isFavorite;
    report.isFavorite = newStatus;

    this.reportService.toggleFavoriteStatus(report.id).subscribe({
      next: (result) => {
        if (result) {
          report.isFavorite = result.isFavorite;
          // Optionally show a toast: result.message
        }
      },
      error: (error) => {
        report.isFavorite = previousStatus; // revert on error
        // Optionally show a toast: 'Fehler beim Aktualisieren der Favoriten'
      },
    });
  }

  // Add this method to handle date selection
  onAppointmentDateSelected(date: Date): void {
    this.report.visitDate = date;
    console.log('Selected appointment date:', date);
  }

  // Handler methods for image changes
  onVorherImages1Changed(images: ImageItem[]): void {
    const normalized = this.normalizeImageList(images, 'before');
    this.syncPrepopulatedOrder(normalized, 'prepopulatedVorherImages1');
    this.vorherImages1 = normalized.filter((img) => !!img.file).map((img) => ({ ...img }));
    this.checkForReplacedImages(normalized, this.prepopulatedVorherImages1);
    
    // Update prepopulated array to include new files so they display immediately
    this.prepopulatedVorherImages1 = normalized.map((img) => ({ ...img }));
    
    console.log('Vorher images 1 changed:', images);
  }

  onNachherImages1Changed(images: ImageItem[]): void {
    const normalized = this.normalizeImageList(images, 'after');
    this.syncPrepopulatedOrder(normalized, 'prepopulatedNachherImages1');
    this.nachherImages1 = normalized.filter((img) => !!img.file).map((img) => ({ ...img }));
    this.checkForReplacedImages(normalized, this.prepopulatedNachherImages1);
    
    // Update prepopulated array to include new files so they display immediately
    this.prepopulatedNachherImages1 = normalized.map((img) => ({ ...img }));
    
    console.log('Nachher images 1 changed:', images);
  }

  onNachherImages2Changed(images: ImageItem[]): void {
    const normalized = this.normalizeImageList(images, 'after');
    this.syncPrepopulatedOrder(normalized, 'prepopulatedNachherImages2');
    this.nachherImages2 = normalized.filter((img) => !!img.file).map((img) => ({ ...img }));
    this.checkForReplacedImages(normalized, this.prepopulatedNachherImages2);
    
    // Update prepopulated array to include new files so they display immediately
    this.prepopulatedNachherImages2 = normalized.map((img) => ({ ...img }));
    
    console.log('Nachher images 2 changed:', images);
  }

  // Dynamic handler for "Nachher only" photos at any index
  onNachherOnlyImagesChanged(images: ImageItem[], photoIndex: number): void {
    const normalized = this.normalizeImageList(images, 'after');
    
    // Determine which prepopulated array and nachherImages array to use based on photoIndex
    let prepopulatedKey: PrepopulatedKey;
    let prepopulatedArray: ImageItem[];
    
    if (photoIndex === 0) {
      prepopulatedKey = 'prepopulatedNachherImages1';
      prepopulatedArray = this.prepopulatedNachherImages1;
      this.syncPrepopulatedOrder(normalized, prepopulatedKey);
      this.nachherImages1 = normalized.filter((img) => !!img.file).map((img) => ({ ...img }));
      this.checkForReplacedImages(normalized, this.prepopulatedNachherImages1);
      
      // Update prepopulated array to include new files so they display immediately
      this.prepopulatedNachherImages1 = normalized.map((img) => ({ ...img }));
    } else if (photoIndex === 1) {
      prepopulatedKey = 'prepopulatedNachherImages2';
      prepopulatedArray = this.prepopulatedNachherImages2;
      this.syncPrepopulatedOrder(normalized, prepopulatedKey);
      this.nachherImages2 = normalized.filter((img) => !!img.file).map((img) => ({ ...img }));
      this.checkForReplacedImages(normalized, this.prepopulatedNachherImages2);
      
      // Update prepopulated array to include new files so they display immediately
      this.prepopulatedNachherImages2 = normalized.map((img) => ({ ...img }));
    } else if (photoIndex === 2) {
      prepopulatedKey = 'prepopulatedNachherImages3';
      prepopulatedArray = this.prepopulatedNachherImages3;
      this.syncPrepopulatedOrder(normalized, prepopulatedKey);
      this.nachherImages3 = normalized.filter((img) => !!img.file).map((img) => ({ ...img }));
      this.checkForReplacedImages(normalized, this.prepopulatedNachherImages3);
      
      // Update prepopulated array to include new files so they display immediately
      this.prepopulatedNachherImages3 = normalized.map((img) => ({ ...img }));
    }
    
    console.log(`Nachher only images changed for photoIndex ${photoIndex}:`, images);
  }

  // Dynamic handler for deleting files from "Nachher only" photos at any index
  onNachherOnlyFileDeleted(event: { fileId: number; index: number }, photoIndex: number): void {
    console.log(`Nachher only file deleted for photoIndex ${photoIndex}:`, event);
    
    if (photoIndex === 0) {
      this.prepopulatedNachherImages1 = this.prepopulatedNachherImages1.filter((img) => img.fileId !== event.fileId);
      this.nachherImages1 = this.nachherImages1.filter((img) => img.fileId !== event.fileId);
    } else if (photoIndex === 1) {
      this.prepopulatedNachherImages2 = this.prepopulatedNachherImages2.filter((img) => img.fileId !== event.fileId);
      this.nachherImages2 = this.nachherImages2.filter((img) => img.fileId !== event.fileId);
    } else if (photoIndex === 2) {
      this.prepopulatedNachherImages3 = this.prepopulatedNachherImages3.filter((img) => img.fileId !== event.fileId);
      this.nachherImages3 = this.nachherImages3.filter((img) => img.fileId !== event.fileId);
    }
    
    this.filesToDelete.push(event.fileId);
    delete this.replacedImages[event.fileId];
  }

  onVorherImages3Changed(images: ImageItem[]): void {
    const normalized = this.normalizeImageList(images, 'before');
    this.syncPrepopulatedOrder(normalized, 'prepopulatedVorherImages3');
    this.vorherImages3 = normalized.filter((img) => !!img.file).map((img) => ({ ...img }));
    this.checkForReplacedImages(normalized, this.prepopulatedVorherImages3);
    
    // Update prepopulated array to include new files so they display immediately
    this.prepopulatedVorherImages3 = normalized.map((img) => ({ ...img }));
    
    console.log('Vorher images 3 changed:', images);
  }

  onNachherImages3Changed(images: ImageItem[]): void {
    const normalized = this.normalizeImageList(images, 'after');
    this.syncPrepopulatedOrder(normalized, 'prepopulatedNachherImages3');
    this.nachherImages3 = normalized.filter((img) => !!img.file).map((img) => ({ ...img }));
    this.checkForReplacedImages(normalized, this.prepopulatedNachherImages3);
    
    // Update prepopulated array to include new files so they display immediately
    this.prepopulatedNachherImages3 = normalized.map((img) => ({ ...img }));
    
    console.log('Nachher images 3 changed:', images);
  }

  onBeforeAfterCrossDrop(
    photoIndex: number,
    photo: any,
    payload: { event: CdkDragDrop<ImageItem[]>; listType: 'before' | 'after' | 'single'; dropListId: string },
  ): void {
    if (!photo?.isBeforeAfter) {
      return;
    }

    const { event } = payload;

    if (event.previousContainer === event.container && event.previousIndex === event.currentIndex) {
      return;
    }

    // Store the source item and its label before transfer
    const sourceItem = event.previousContainer.data[event.previousIndex];
    const sourceLabel = sourceItem?.label;
    
    console.log('🔄 Drag started - Source item:', { fileId: sourceItem?.fileId, label: sourceLabel, index: event.previousIndex });

    // Check if there's an item at the target position
    const hasTargetItem = event.container.data.length > event.currentIndex && event.container.data[event.currentIndex];
    const targetItem = hasTargetItem ? event.container.data[event.currentIndex] : null;
    const targetLabel = targetItem?.label;

    if (targetItem) {
      console.log('🎯 Target position has item:', { fileId: targetItem?.fileId, label: targetLabel, index: event.currentIndex });
    }

    // Transfer the image item (this moves the entire ImageItem including its label)
    transferArrayItem(event.previousContainer.data, event.container.data, event.previousIndex, event.currentIndex);

    const targetType: 'before' | 'after' = event.container.id.includes('vorher-list-') ? 'before' : 'after';
    const movedItem = event.container.data[event.currentIndex];
    if (movedItem) {
      // Always set the label, even if undefined (to preserve the original label)
      movedItem.label = sourceLabel;
      movedItem.beforeAfterType = targetType;
      console.log('✅ Moved item updated:', { fileId: movedItem.fileId, label: movedItem.label, newType: targetType, newIndex: event.currentIndex });
    }

    // If there was a target item at the drop position, it was moved to the source position
    // Swap its label with the source label if needed
    if (targetItem && event.previousContainer.data.length > event.previousIndex) {
      // Find the item that was moved to the source position (it's the targetItem that was shifted)
      // After transferArrayItem, the target item (if it existed) is now at previousIndex in previousContainer
      const swappedItem = event.previousContainer.data[event.previousIndex];
      if (swappedItem && swappedItem !== sourceItem) {
        // This is the item that was at the target position, give it the target label
        swappedItem.label = targetLabel;
        console.log('🔁 Swapped item updated:', { fileId: swappedItem.fileId, label: swappedItem.label, newIndex: event.previousIndex });
      }
    }

    const beforeData = event.container.id.includes('vorher-list-')
      ? event.container.data
      : event.previousContainer.id.includes('vorher-list-')
        ? event.previousContainer.data
        : undefined;

    const afterData = event.container.id.includes('nachher-list-')
      ? event.container.data
      : event.previousContainer.id.includes('nachher-list-')
        ? event.previousContainer.data
        : undefined;

    this.rebuildBeforeAfterCollections(photoIndex, beforeData, afterData);
  }

  private rebuildBeforeAfterCollections(
    photoIndex: number,
    beforeData?: ImageItem[],
    afterData?: ImageItem[],
  ): void {
    console.log('🔨 Rebuilding collections for photo index:', photoIndex);
    
    const beforeConfig = this.getBeforeCollections(photoIndex);
    if (beforeConfig && beforeData) {
      // Preserve existing labels from items - don't reassign based on position
      // Labels should move with images during drag and drop
      const normalizedBefore = beforeData.map((item, index) => ({
        ...item,
        beforeAfterType: 'before' as const,
        order: index,
        // Explicitly preserve the label - it should already be set from the drag operation
        label: item.label,
      }));

      console.log('📋 Normalized BEFORE items:', normalizedBefore.map(i => ({ fileId: i.fileId, label: i.label, order: i.order })));

      // Only update items that have fileId (existing uploaded images)
      this.syncPrepopulatedOrder(normalizedBefore, beforeConfig.preKey);
      
      console.log('📦 Prepopulated BEFORE after sync:', (this as any)[beforeConfig.preKey].map((i: ImageItem) => ({ fileId: i.fileId, label: i.label, order: i.order })));
      
      // Force Angular change detection by creating new array reference
      (this as any)[beforeConfig.preKey] = [...(this as any)[beforeConfig.preKey]];
      
      beforeConfig.setNew(normalizedBefore.filter((item) => !item.fileId).map((item) => ({ ...item })));
      this.checkForReplacedImages(normalizedBefore, (this as any)[beforeConfig.preKey]);
    }

    const afterConfig = this.getAfterCollections(photoIndex);
    if (afterConfig && afterData) {
      // Preserve existing labels from items - don't reassign based on position
      // Labels should move with images during drag and drop
      const normalizedAfter = afterData.map((item, index) => ({
        ...item,
        beforeAfterType: 'after' as const,
        order: index,
        // Explicitly preserve the label - it should already be set from the drag operation
        label: item.label,
      }));

      console.log('📋 Normalized AFTER items:', normalizedAfter.map(i => ({ fileId: i.fileId, label: i.label, order: i.order })));

      // Only update items that have fileId (existing uploaded images)
      this.syncPrepopulatedOrder(normalizedAfter, afterConfig.preKey);
      
      console.log('📦 Prepopulated AFTER after sync:', (this as any)[afterConfig.preKey].map((i: ImageItem) => ({ fileId: i.fileId, label: i.label, order: i.order })));
      
      // Force Angular change detection by creating new array reference
      (this as any)[afterConfig.preKey] = [...(this as any)[afterConfig.preKey]];
      
      afterConfig.setNew(normalizedAfter.filter((item) => !item.fileId).map((item) => ({ ...item })));
      this.checkForReplacedImages(normalizedAfter, (this as any)[afterConfig.preKey]);
    }
  }

  private getBeforeCollections(photoIndex: number): { preKey: PrepopulatedKey; setNew: (list: ImageItem[]) => void } | null {
    switch (photoIndex) {
      case 0:
        return {
          preKey: 'prepopulatedVorherImages1',
          setNew: (list: ImageItem[]) => {
            this.vorherImages1 = list;
          },
        };
      case 2:
        return {
          preKey: 'prepopulatedVorherImages3',
          setNew: (list: ImageItem[]) => {
            this.vorherImages3 = list;
          },
        };
      default:
        return null;
    }
  }

  private getAfterCollections(photoIndex: number): { preKey: PrepopulatedKey; setNew: (list: ImageItem[]) => void } | null {
    switch (photoIndex) {
      case 0:
        return {
          preKey: 'prepopulatedNachherImages1',
          setNew: (list: ImageItem[]) => {
            this.nachherImages1 = list;
          },
        };
      case 1:
        return {
          preKey: 'prepopulatedNachherImages2',
          setNew: (list: ImageItem[]) => {
            this.nachherImages2 = list;
          },
        };
      case 2:
        return {
          preKey: 'prepopulatedNachherImages3',
          setNew: (list: ImageItem[]) => {
            this.nachherImages3 = list;
          },
        };
      default:
        return null;
    }
  }

  private normalizeImageList(images: ImageItem[], type: 'before' | 'after'): ImageItem[] {
    return images.map((img, index) => ({
      ...img,
      beforeAfterType: type,
      order: index,
    }));
  }

  private syncPrepopulatedOrder(images: ImageItem[], key: PrepopulatedKey): void {
    const prepopulatedImages = (this as any)[key] as ImageItem[];

    console.log(`🔄 syncPrepopulatedOrder called for ${key}`);
    console.log('  Input images:', images.map(i => ({ fileId: i.fileId, label: i.label, order: i.order })));
    console.log('  Existing prepopulated:', prepopulatedImages?.map(i => ({ fileId: i.fileId, label: i.label, order: i.order })));

    if (!Array.isArray(prepopulatedImages)) {
      console.log('  ❌ prepopulatedImages is not an array, returning');
      return;
    }

    const reordered: ImageItem[] = [];
    const type: 'before' | 'after' = key.toLowerCase().includes('vorher') ? 'before' : 'after';

    images.forEach((img, index) => {
      if (img.fileId && !img.file) {
        const existing = prepopulatedImages.find((pre) => pre.fileId === img.fileId);
        if (existing) {
          // IMPORTANT: Use the label from img (the new position), NOT from existing (old position)
          const updated = { ...existing, label: img.label, beforeAfterType: type, order: index };
          console.log(`  ✏️ Updated existing image ${img.fileId}: label "${existing.label}" -> "${img.label}"`);
          reordered.push(updated);
        } else {
          reordered.push({ ...img, label: img.label, beforeAfterType: type, order: index });
          console.log(`  ➕ Added new image ${img.fileId} with label "${img.label}"`);
        }
      }
    });

    console.log('  📦 Final reordered:', reordered.map(i => ({ fileId: i.fileId, label: i.label, order: i.order })));
    (this as any)[key] = reordered.map((item) => ({ ...item }));
  }

  private buildPhotoOrderUpdates(): Array<{
    uploadedPhotoId: number;
    advancedPhotoId: number;
    beforeAfterType: 'before' | 'after';
    label?: string;
    order: number;
  }> {
    const updates: Array<{
      uploadedPhotoId: number;
      advancedPhotoId: number;
      beforeAfterType: 'before' | 'after';
      label?: string;
      order: number;
    }> = [];

    const pushUpdates = (images: ImageItem[] | undefined, advancedPhotoId: number, beforeAfterType: 'before' | 'after') => {
      if (!Array.isArray(images)) {
        return;
      }

      images.forEach((img, index) => {
        if (typeof img.fileId === 'number') {
          const update = {
            uploadedPhotoId: img.fileId,
            advancedPhotoId,
            beforeAfterType,
            label: img.label || null, // Explicitly set to null if undefined
            order: typeof img.order === 'number' ? img.order : index,
          };
          console.log(`Building photo order update for fileId ${img.fileId}:`, update);
          updates.push(update);
        }
      });
    };

    this.report?.project?.advancedPhotos?.forEach((advancedPhoto: any, photoIndex: number) => {
      if (!advancedPhoto) {
        return;
      }

      if (advancedPhoto.isBeforeAfter) {
        if (photoIndex === 0) {
          pushUpdates(this.prepopulatedVorherImages1, advancedPhoto.id, 'before');
          pushUpdates(this.prepopulatedNachherImages1, advancedPhoto.id, 'after');
        } else if (photoIndex === 2) {
          pushUpdates(this.prepopulatedVorherImages3, advancedPhoto.id, 'before');
          pushUpdates(this.prepopulatedNachherImages3, advancedPhoto.id, 'after');
        }
      } else {
        if (photoIndex === 1) {
          pushUpdates(this.prepopulatedNachherImages2, advancedPhoto.id, 'after');
        }
      }
    });

    return updates;
  }

  // Check if any prepopulated images have been replaced with new files
  checkForReplacedImages(newImages: ImageItem[], prepopulatedImages: ImageItem[]): void {
    // Clear previous replaced images for this section
    prepopulatedImages.forEach((prepopulatedImg) => {
      if (prepopulatedImg.fileId) {
        delete this.replacedImages[prepopulatedImg.fileId];
      }
    });

    // Check for replaced images
    newImages.forEach((newImg) => {
      // If this is a new file (has file property) and has the same label as a prepopulated image
      if (newImg.file && newImg.label) {
        const matchingPrepopulated = prepopulatedImages.find((prepopulatedImg) => prepopulatedImg.label === newImg.label && prepopulatedImg.fileId);

        if (matchingPrepopulated) {
          // This prepopulated image has been replaced
          this.replacedImages[matchingPrepopulated.fileId] = newImg;
          console.log(`Image replaced: ${matchingPrepopulated.fileId} with new file:`, newImg.fileName);
        }
      }
    });
  }

  // Find photo information for a given label
  findPhotoInfoForLabel(label: string): { advancedPhotoId: number; beforeAfterType: string } | null {
    if (!this.report?.project?.advancedPhotos) return null;

    for (const advancedPhoto of this.report.project.advancedPhotos) {
      // Check if the label matches any of the photo labels
      if (advancedPhoto.labels && advancedPhoto.labels.includes(label)) {
        // Determine if this is a before or after photo based on the label position
        const labelIndex = advancedPhoto.labels.indexOf(label);

        // For before/after photos, the first half are "before", second half are "after"
        if (advancedPhoto.isBeforeAfter) {
          const midPoint = Math.ceil(advancedPhoto.labels.length / 2);
          const beforeAfterType = labelIndex < midPoint ? 'before' : 'after';
          return {
            advancedPhotoId: advancedPhoto.id,
            beforeAfterType: beforeAfterType,
          };
        } else {
          // For photos without before/after, everything is "after"
          return {
            advancedPhotoId: advancedPhoto.id,
            beforeAfterType: 'after',
          };
        }
      }
    }

    return null;
  }

  // Handler methods for file deletion events
  onVorherImages1FileDeleted(event: { fileId: number; index: number }): void {
    console.log('Vorher images 1 file deleted:', event);
    // Remove the file from the prepopulated array
    this.prepopulatedVorherImages1 = this.prepopulatedVorherImages1.filter((img) => img.fileId !== event.fileId);
    // Add to files to delete array
    this.filesToDelete.push(event.fileId);
    // Clear any replaced image tracking for this file
    delete this.replacedImages[event.fileId];
    // Clear the corresponding row in the component
    // Note: The multi-image-upload component will handle the UI update
  }

  onNachherImages1FileDeleted(event: { fileId: number; index: number }): void {
    console.log('Nachher images 1 file deleted:', event);
    this.prepopulatedNachherImages1 = this.prepopulatedNachherImages1.filter((img) => img.fileId !== event.fileId);
    this.filesToDelete.push(event.fileId);
    delete this.replacedImages[event.fileId];
  }

  onNachherImages2FileDeleted(event: { fileId: number; index: number }): void {
    console.log('Nachher images 2 file deleted:', event);
    this.prepopulatedNachherImages2 = this.prepopulatedNachherImages2.filter((img) => img.fileId !== event.fileId);
    this.filesToDelete.push(event.fileId);
    delete this.replacedImages[event.fileId];
  }

  onVorherImages3FileDeleted(event: { fileId: number; index: number }): void {
    console.log('Vorher images 3 file deleted:', event);
    this.prepopulatedVorherImages3 = this.prepopulatedVorherImages3.filter((img) => img.fileId !== event.fileId);
    this.filesToDelete.push(event.fileId);
    delete this.replacedImages[event.fileId];
  }

  onNachherImages3FileDeleted(event: { fileId: number; index: number }): void {
    console.log('Nachher images 3 file deleted:', event);
    this.prepopulatedNachherImages3 = this.prepopulatedNachherImages3.filter((img) => img.fileId !== event.fileId);
    this.filesToDelete.push(event.fileId);
    delete this.replacedImages[event.fileId];
  }

  // Track files to be deleted
  filesToDelete: number[] = [];

  // Track prepopulated images that have been replaced with new files
  replacedImages: { [fileId: number]: ImageItem } = {};

  saveReportPhotos(): void {
    this.saving = true;

    // Collect all files from all image sections
    const allFiles: any[] = [];

    // Process advanced photos from the project
    if (this.report?.project?.advancedPhotos) {
      this.report.project.advancedPhotos.forEach((advancedPhoto: any, photoIndex: number) => {
        // Get the corresponding image arrays based on photo index
        let vorherImages: ImageItem[] = [];
        let nachherImages: ImageItem[] = [];

        // Map photo index to the correct image arrays
        let prepopulatedVorher: ImageItem[] = [];
        let prepopulatedNachher: ImageItem[] = [];
        
        if (photoIndex === 0) {
          vorherImages = this.vorherImages1;
          nachherImages = this.nachherImages1;
          prepopulatedVorher = this.prepopulatedVorherImages1;
          prepopulatedNachher = this.prepopulatedNachherImages1;
        } else if (photoIndex === 1) {
          nachherImages = this.nachherImages2;
          prepopulatedNachher = this.prepopulatedNachherImages2;
        } else if (photoIndex === 2) {
          vorherImages = this.vorherImages3;
          nachherImages = this.nachherImages3;
          prepopulatedVorher = this.prepopulatedVorherImages3;
          prepopulatedNachher = this.prepopulatedNachherImages3;
        }

        // For "Before/After" photos: use vorherImages and nachherImages arrays
        // For "Nachher only" photos: use nachherImages array directly (which contains only new uploads)
        if (advancedPhoto.isBeforeAfter) {
          // Before/After photos
          if (vorherImages.length > 0) {
          vorherImages.forEach((img, imgIndex) => {
            if (img.file) {
              allFiles.push({
                file: img.file,
                label: img.label || `Vorher ${photoIndex + 1}`,
                advancedPhotoId: advancedPhoto.id,
                fileName: img.fileName,
                beforeAfterType: 'before',
                order: typeof img.order === 'number' ? img.order : imgIndex,
              });
            }
          });
        }

        if (nachherImages.length > 0) {
          nachherImages.forEach((img, imgIndex) => {
            if (img.file) {
              allFiles.push({
                file: img.file,
                label: img.label || `Nachher ${photoIndex + 1}`,
                advancedPhotoId: advancedPhoto.id,
                fileName: img.fileName,
                beforeAfterType: 'after',
                order: typeof img.order === 'number' ? img.order : imgIndex,
              });
            }
          });
          }
        } else {
          // "Nachher only" photos: use nachherImages array directly
          // nachherImages2 already contains only new uploads (filtered in onNachherImages2Changed)
          if (nachherImages.length > 0) {
            nachherImages.forEach((img, imgIndex) => {
              if (img.file) {
                allFiles.push({
                  file: img.file,
                  label: img.label || `Nachher ${photoIndex + 1}`,
                  advancedPhotoId: advancedPhoto.id,
                  fileName: img.fileName,
                  beforeAfterType: 'after',
                  order: typeof img.order === 'number' ? img.order : imgIndex,
                });
              }
            });
          }
        }
      });
    }

    console.log('Collected files:', allFiles);
    console.log('Question answers:', this.questionAnswers);
    console.log('Files to delete:', this.filesToDelete);
    console.log('Replaced images:', this.replacedImages);

    const photoOrderUpdates = this.buildPhotoOrderUpdates();
    console.log('Photo order updates (total):', photoOrderUpdates.length);
    console.log('Photo order updates (details):', JSON.stringify(photoOrderUpdates, null, 2));

    // Add replaced images to files to delete
    Object.keys(this.replacedImages).forEach((fileIdStr) => {
      const fileId = parseInt(fileIdStr);
      if (!this.filesToDelete.includes(fileId)) {
        this.filesToDelete.push(fileId);
      }
    });

    // Add replaced images as new files to upload
    Object.values(this.replacedImages).forEach((replacedImg) => {
      if (replacedImg.file) {
        // Find the corresponding advanced photo and beforeAfterType
        const photoInfo = this.findPhotoInfoForLabel(replacedImg.label);
        if (photoInfo) {
          allFiles.push({
            file: replacedImg.file,
            label: replacedImg.label,
            advancedPhotoId: photoInfo.advancedPhotoId,
            fileName: replacedImg.fileName,
            beforeAfterType: photoInfo.beforeAfterType,
          });
        }
      }
    });

    console.log('Updated files to delete (including replaced):', this.filesToDelete);
    console.log('Updated files to upload (including replaced):', allFiles.length);

    // Prepare answers for saving
    const answers = this.prepareAnswersForSave();
    console.log('Prepared answers for save:', answers);

    // Prepare the complete payload for submission (without files)
    const payload = {
      visitDate: this.report.visitDate,
      answers: answers,
      status: this.report.status,
      filesToDelete: this.filesToDelete, // Add files to delete to the payload
    };

    if (photoOrderUpdates.length > 0) {
      (payload as any).photoOrderUpdates = photoOrderUpdates;
    }

    console.log('Submitting report update with payload:', payload);
    console.log('Files to upload:', allFiles.length);

    // Call the service to update the report with files
    this.reportService.updateReportWithFiles(this.reportId, payload, allFiles).subscribe({
      next: () => {
        this.saving = false;
        this.filesToDelete = [];
        this.replacedImages = {};

        this._toast.success('Report erfolgreich gespeichert!', {
          position: 'bottom-right',
          duration: 4000,
        });

        // Reload the report to get updated data
        this.loadReportDetails();
      },
      error: (error) => {
        console.error('Error updating report:', error);
        this.saving = false;
        // You can add error notification here
        this._toast.error('Fehler beim Speichern des Reports. Bitte versuchen Sie es erneut.', {
          position: 'bottom-right',
          duration: 4000,
        });
      },
    });
  }

  /**
   * Save report and approve it (change status to Freigegeben)
   */
  confirmSaveAndApprove(): void {
    this.showConfirmApproveDialog = false;
    this.saving = true;

    // Collect all files from all image sections
    const allFiles: any[] = [];

    // Process advanced photos from the project (same logic as saveReportPhotos)
    if (this.report?.project?.advancedPhotos) {
      this.report.project.advancedPhotos.forEach((advancedPhoto: any, photoIndex: number) => {
        let vorherImages: ImageItem[] = [];
        let nachherImages: ImageItem[] = [];

        if (photoIndex === 0) {
          vorherImages = this.vorherImages1;
          nachherImages = this.nachherImages1;
        } else if (photoIndex === 1) {
          nachherImages = this.nachherImages2;
        } else if (photoIndex === 2) {
          vorherImages = this.vorherImages3;
          nachherImages = this.nachherImages3;
        }

        // Map photo index to prepopulated arrays
        let prepopulatedVorher: ImageItem[] = [];
        let prepopulatedNachher: ImageItem[] = [];
        
        if (photoIndex === 0) {
          prepopulatedVorher = this.prepopulatedVorherImages1;
          prepopulatedNachher = this.prepopulatedNachherImages1;
        } else if (photoIndex === 1) {
          prepopulatedNachher = this.prepopulatedNachherImages2;
        } else if (photoIndex === 2) {
          prepopulatedVorher = this.prepopulatedVorherImages3;
          prepopulatedNachher = this.prepopulatedNachherImages3;
        }

        // For "Nachher only" photos, we need to check prepopulated images as they contain the current state
        // For "Before/After" photos, we use the separate vorher/nachher arrays
        // Only include images with a file property (new uploads) in allFiles
        if (advancedPhoto.isBeforeAfter) {
          // Before/After photos: use vorherImages and nachherImages arrays
          if (vorherImages.length > 0) {
            vorherImages.forEach((img, imgIndex) => {
              if (img.file) {
                allFiles.push({
                  file: img.file,
                  label: img.label || `Vorher ${photoIndex + 1}`,
                  advancedPhotoId: advancedPhoto.id,
                  fileName: img.fileName,
                  beforeAfterType: 'before',
                  order: typeof img.order === 'number' ? img.order : imgIndex,
                });
              }
            });
          }
          
          if (nachherImages.length > 0) {
            nachherImages.forEach((img, imgIndex) => {
              if (img.file) {
                allFiles.push({
                  file: img.file,
                  label: img.label || `Nachher ${photoIndex + 1}`,
                  advancedPhotoId: advancedPhoto.id,
                  fileName: img.fileName,
                  beforeAfterType: 'after',
                  order: typeof img.order === 'number' ? img.order : imgIndex,
                });
              }
            });
          }
        } else {
          // "Nachher only" photos: need to check both prepopulated and new images
          // Combine prepopulated images (which may have been reordered) with new uploads
          // Only prepopulated images that have been replaced or new uploads will have a file property
          const allNachherImages = [...prepopulatedNachher, ...nachherImages];
          
          // Remove duplicates (if a prepopulated image was replaced, it will be in both arrays)
          const uniqueNachherImages = allNachherImages.filter((img, index, self) => {
            if (img.fileId) {
              // For existing images, keep only the first occurrence
              return index === self.findIndex(i => i.fileId === img.fileId);
            }
            // For new images without fileId, check by file name or include all
            return true;
          });
          
          if (uniqueNachherImages.length > 0) {
            uniqueNachherImages.forEach((img, imgIndex) => {
              // Only add images with a file property (new uploads or replaced images)
              if (img.file) {
                allFiles.push({
                  file: img.file,
                  label: img.label || `Nachher ${photoIndex + 1}`,
                  advancedPhotoId: advancedPhoto.id,
                  fileName: img.fileName,
                  beforeAfterType: 'after',
                  order: typeof img.order === 'number' ? img.order : imgIndex,
                });
              }
            });
          }
        }
      });
    }

    // Add replaced images to files to delete
    Object.keys(this.replacedImages).forEach((fileIdStr) => {
      const fileId = parseInt(fileIdStr);
      if (!this.filesToDelete.includes(fileId)) {
        this.filesToDelete.push(fileId);
      }
    });

    // Add replaced images as new files to upload
    Object.values(this.replacedImages).forEach((replacedImg) => {
      if (replacedImg.file) {
        const photoInfo = this.findPhotoInfoForLabel(replacedImg.label);
        if (photoInfo) {
          allFiles.push({
            file: replacedImg.file,
            label: replacedImg.label,
            advancedPhotoId: photoInfo.advancedPhotoId,
            fileName: replacedImg.fileName,
            beforeAfterType: photoInfo.beforeAfterType,
          });
        }
      }
    });

    // Prepare answers for saving
    const answers = this.prepareAnswersForSave();

    // Prepare the complete payload
    const payload = {
      visitDate: this.report.visitDate,
      answers: answers,
      status: this.report.status,
      filesToDelete: this.filesToDelete,
    };

    const photoOrderUpdates = this.buildPhotoOrderUpdates();
    if (photoOrderUpdates.length > 0) {
      (payload as any).photoOrderUpdates = photoOrderUpdates;
    }

    // First save the report, then approve it
    this.reportService.updateReportWithFiles(this.reportId, payload, allFiles).subscribe({
      next: () => {
        // After saving, approve the report (change status to Freigegeben)
        this.reportService.closeReport(this.reportId).pipe(
          catchError((error) => {
            console.error('❌ Error approving report:', error);
            this.saving = false;
            this._toast.error('Fehler beim Freigeben des Reports.', {
              position: 'bottom-right',
              duration: 4000,
            });
            return of(null);
          })
        ).subscribe({
          next: () => {
            this.saving = false;
            this.filesToDelete = [];
            this.replacedImages = {};

            this._toast.success('Report erfolgreich gespeichert und freigegeben!', {
              position: 'bottom-right',
              duration: 4000,
            });

            // Reload the report to get updated status
            this.loadReportDetails();
          },
        });
      },
      error: (error) => {
        console.error('Error saving report:', error);
        this.saving = false;
        this._toast.error('Fehler beim Speichern des Reports. Bitte versuchen Sie es erneut.', {
          position: 'bottom-right',
          duration: 4000,
        });
      },
    });
  }

  cancelConfirmApprove(): void {
    this.showConfirmApproveDialog = false;
  }

  // Returns the answer object for a given questionId from report.answers
  getAnswerForQuestion(questionId: number) {
    if (!this.report || !this.report.answers) return null;
    return this.report.answers.find((a: any) => a.question && a.question.id === questionId) || null;
  }

  // Message input values
  clientMessageContent: string = '';
  merchandiserMessageContent: string = '';

  // Accordion active value - set all panels open by default
  activeAccordionValue: string[] = ['0', '1', '2', '3'];

  // Send message to client
  sendClientMessage() {
    const content = this.clientMessageContent.trim();
    if (!content) return;
    this.sendingClientMessage = true;
    this.reportService.sendMessage(this.reportId, { content, receiverType: 'client' }).subscribe({
      next: (response) => {
        this.clientMessageContent = '';
        if (response && response.conversation) {
          this.report.conversation = response.conversation;
          this.processConversationMessages();
          // Scroll to bottom after new message is added and DOM is updated
          setTimeout(() => this.scrollToBottom(), 300);
        }
        this.sendingClientMessage = false;
      },
      error: () => {
        this.sendingClientMessage = false;
      },
    });
  }

  // Send message to merchandiser
  sendMerchandiserMessage() {
    const content = this.merchandiserMessageContent.trim();
    if (!content) return;
    this.sendingMerchandiserMessage = true;
    this.reportService.sendMessage(this.reportId, { content, receiverType: 'merchandiser' }).subscribe({
      next: (response) => {
        this.merchandiserMessageContent = '';
        if (response && response.conversation) {
          this.report.conversation = response.conversation;
          this.processConversationMessages();
          // Scroll to bottom after new message is added and DOM is updated
          setTimeout(() => this.scrollToBottom(), 300);
        }
        this.sendingMerchandiserMessage = false;
      },
      error: () => {
        this.sendingMerchandiserMessage = false;
      },
    });
  }

  sendingClientMessage = false;
  sendingMerchandiserMessage = false;

  // Process conversation messages and separate them for display
  processConversationMessages(): void {
    if (!this.report?.conversation?.messages) {
      this.report.clientMessages = [];
      this.report.merchandiserMessages = [];
      return;
    }
    const messages = this.report.conversation.messages;
    const getTypeName = (typeObjOrName: any): string => {
      if (!typeObjOrName) return '';
      if (typeof typeObjOrName === 'string') return typeObjOrName;
      return typeObjOrName.name || '';
    };

    // Separate messages for client (akzente <-> client)
    this.report.clientMessages = messages
      .filter(
        (msg) =>
          // Akzente -> Client
          (getTypeName(msg.senderType) === 'akzente' && (getTypeName(msg.receiverType) === 'client' || msg.receiverTypeString === 'client')) ||
          // Client -> Akzente
          (getTypeName(msg.senderType) === 'client' && (getTypeName(msg.receiverType) === 'akzente' || msg.receiverTypeString === 'akzente')),
      )
      .map((msg) => {
        const createdAt = new Date(msg.createdAt);
        const senderFirstName = msg.senderFirstName || '';
        const senderLastName = msg.senderLastName || '';
        const fullName = `${senderFirstName} ${senderLastName}`.trim();
        const isAkzente = getTypeName(msg.senderType) === 'akzente';
        return {
          createdAtMs: createdAt.getTime(),
          dateLabel: createdAt.toLocaleDateString('de-DE'),
          timeLabel: createdAt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
          sender: isAkzente ? 'agent' : 'client',
          senderName: isAkzente ? 'Akzente' : fullName || 'Unbekannt',
          avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(isAkzente ? 'Akzente' : fullName || 'User')}`,
          text: msg.content,
        };
      })
      .sort((a, b) => a.createdAtMs - b.createdAtMs);

    // Separate messages for merchandiser (akzente <-> merchandiser)
    this.report.merchandiserMessages = messages
      .filter(
        (msg) =>
          // Akzente -> Merchandiser
          (getTypeName(msg.senderType) === 'akzente' && (getTypeName(msg.receiverType) === 'merchandiser' || msg.receiverTypeString === 'merchandiser')) ||
          // Merchandiser -> Akzente
          (getTypeName(msg.senderType) === 'merchandiser' && (getTypeName(msg.receiverType) === 'akzente' || msg.receiverTypeString === 'akzente')),
      )
      .map((msg) => {
        const createdAt = new Date(msg.createdAt);
        const senderFirstName = msg.senderFirstName || '';
        const senderLastName = msg.senderLastName || '';
        const fullName = `${senderFirstName} ${senderLastName}`.trim();
        const isAkzente = getTypeName(msg.senderType) === 'akzente';
        return {
          createdAtMs: createdAt.getTime(),
          dateLabel: createdAt.toLocaleDateString('de-DE'),
          timeLabel: createdAt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
          sender: isAkzente ? 'agent' : 'merchandiser',
          senderName: isAkzente ? 'Akzente' : fullName || 'Unbekannt',
          avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(isAkzente ? 'Akzente' : fullName || 'User')}`,
          text: msg.content,
        };
      })
      .sort((a, b) => a.createdAtMs - b.createdAtMs);
  }

  getMultiAnswersForQuestion(questionId: number): string {
    if (!this.report || !this.report.answers) return '';
    const answers = this.report.answers.filter((a: any) => a.question && a.question.id === questionId && a.selectedOption);
    return answers.map((a: any) => a.selectedOption.optionText).join(', ');
  }

  // Helper method to determine if status should show as "UngeprüfT"
  isStatusOpen(): boolean {
    if (!this.report?.status?.name) return true;
    const statusName = this.report.status.name;
    return !['Im Prüfen', 'Ok'].includes(statusName);
  }

  // Helper method to determine if report is closed (cannot be changed)
  isReportClosed(): boolean {
    if (!this.report?.status?.name) return false;
    const statusName = this.report.status.name;
    return ['Im Prüfen', 'Ok'].includes(statusName);
  }

  // Helper method to determine if current user can approve the report
  canUserApprove(): boolean {
    if (!this.report?.status?.name) return false;
    const statusName = this.report.status.name;

    // For Akzente UI, check if report is in a state where Akzente can approve
    // Akzente can approve reports that are DUE, FINISHED, or similar "ready for approval" statuses
    return ['Fällig', 'FINISHED', 'Prüfen', 'DUE'].includes(statusName);
  }

  showStatusConfirmation(status: string): void {
    // Prevent any status changes if report is already closed
    if (this.isReportClosed()) {
      this._toast.warning('Dieser Bericht ist bereits geschlossen und kann nicht mehr geändert werden', {
        position: 'bottom-right',
        duration: 3000,
      });
      return;
    }

    // Check if user can approve (sequential approval logic)
    if (status === 'Freigegeben' && !this.canUserApprove()) {
      this._toast.warning('Sie können diesen Bericht noch nicht genehmigen. Warten Sie auf die vorherige Genehmigung.', {
        position: 'bottom-right',
        duration: 4000,
      });
      return;
    }

    // Show confirmation dialog
    this.pendingStatusChange = status;
    this.showConfirmStatusDialog = true;
  }

  confirmStatusChange(): void {
    if (!this.pendingStatusChange) {
      this.showConfirmStatusDialog = false;
      return;
    }

    this.showConfirmStatusDialog = false;
    const status = this.pendingStatusChange;
    this.pendingStatusChange = null;

    // Only allow "Freigegeben" status changes, "UngeprüfT" is just for display
    if (status === 'Freigegeben') {
      this.closeReport();
    }
  }

  cancelStatusChange(): void {
    this.showConfirmStatusDialog = false;
    this.pendingStatusChange = null;
  }

  updateStatus(status: string): void {
    // Prevent any status changes if report is already closed
    if (this.isReportClosed()) {
      this._toast.warning('Dieser Bericht ist bereits geschlossen und kann nicht mehr geändert werden', {
        position: 'bottom-right',
        duration: 3000,
      });
      return;
    }

    // Check if user can approve (sequential approval logic)
    if (status === 'Freigegeben' && !this.canUserApprove()) {
      this._toast.warning('Sie können diesen Bericht noch nicht genehmigen. Warten Sie auf die vorherige Genehmigung.', {
        position: 'bottom-right',
        duration: 4000,
      });
      return;
    }

    // Only allow "Freigegeben" status changes, "UngeprüfT" is just for display
    if (status === 'Freigegeben') {
      this.closeReport();
    }
  }

  private closeReport(): void {
    if (!this.report || !this.reportId) return;

    this.reportService
      .closeReport(this.reportId)
      .pipe(
        catchError((error) => {
          console.error('❌ Error updating report status:', error);

          // Handle specific error cases
          if (error.error?.message?.includes('already closed')) {
            this._toast.warning('Dieser Bericht ist bereits geschlossen', {
              position: 'bottom-right',
              duration: 3000,
            });
          } else if (error.error?.message?.includes('can only close reports')) {
            this._toast.warning('Sie können diesen Bericht noch nicht genehmigen. Warten Sie auf die vorherige Genehmigung.', {
              position: 'bottom-right',
              duration: 4000,
            });
          } else {
            this._toast.error('Fehler beim Aktualisieren des Status', {
              position: 'bottom-right',
              duration: 4000,
            });
          }
          return of(null);
        }),
      )
      .subscribe({
        next: (response) => {
          if (response) {
            console.log('✅ Report closed successfully:', response);
            // Update the entire report object with the response
            this.report = response;
            this._toast.success('Bericht erfolgreich geschlossen', {
              position: 'bottom-right',
              duration: 2000,
            });
          }
        },
      });
  }
}
