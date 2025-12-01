import { Component, OnInit, ViewEncapsulation, AfterViewInit, AfterViewChecked, ViewChild, ElementRef } from '@angular/core';
import { ActivatedRoute, Router, ParamMap } from '@angular/router';
import { ReportService } from '@app/core/services/report.service';
import { HotToastService } from '@ngxpert/hot-toast';
import { catchError, of } from 'rxjs';

interface GalleryItem {
  itemImageSrc: string;
  thumbnailImageSrc: string;
  title: string;
  alt: string;
  beforeAfterType?: string;
  date?: string;
  labelNumber?: number;
  order?: number;
}

@Component({
  selector: 'app-report-detail',
  standalone: false,
  templateUrl: './report-detail.component.html',
  styleUrls: ['./report-detail.component.scss'],
  encapsulation: ViewEncapsulation.None,
})
export class ReportDetailComponent implements OnInit, AfterViewInit, AfterViewChecked {
  reportId: string;
  clientId: string;
  projectId: string;
  reportStatus: string = '';
  report: any = null;
  loading: boolean = true;
  error: boolean = false;
  selectedPhotoIndex: number = 0;
  galleryImages: GalleryItem[] = [];
  showConfirmStatusDialog: boolean = false;
  pendingStatusChange: string | null = null;

  // Galleria configuration
  position: string = 'bottom';
  // responsiveOptions: any[] = [
  //   {
  //     breakpoint: '1024px',
  //     numVisible: 4,
  //   },
  //   {
  //     breakpoint: '768px',
  //     numVisible: 3,
  //   },
  //   {
  //     breakpoint: '560px',
  //     numVisible: 2,
  //   },
  // ];

  questionAnswers: { [questionId: number]: any } = {};
  questionOptions: { [questionId: number]: string[] } = {};
  filteredQuestionOptions: { [questionId: number]: string[] } = {};

  // Dialog state for export feedback
  csvDialogVisible: boolean = false;
  csvDialogIsError: boolean = false;
  dialogMessage: string = '';

  private returnToProjectQueryParams: Record<string, any> = {};
  private referrer: string = '';

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
        const filtered = value.map((entry) => (typeof entry === 'string' ? entry.trim() : entry)).filter((entry) => entry !== undefined && entry !== null && entry !== '' && entry !== 'null');

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

  buildEditQueryParams(): Record<string, any> {
    // Preserve the original referrer if it exists (e.g., 'favorites'), otherwise use 'report-detail'
    const originalReferrer = this.returnToProjectQueryParams['referrer'] || 'report-detail';
    return this.cleanNavigationQueryParams({
      ...this.returnToProjectQueryParams,
      reportStatus: this.report?.status?.name || this.reportStatus || this.returnToProjectQueryParams['reportStatus'],
      referrer: originalReferrer,
    });
  }

  openEditInNewTab(): void {
    if (!this.clientId || !this.projectId || !this.reportId) {
      return;
    }
    const urlTree = this.router.createUrlTree(['/clients', this.clientId, 'projects', this.projectId, 'edit-report', this.reportId], { queryParams: this.buildEditQueryParams() });
    const url = window.location.origin + urlTree.toString();
    window.open(url, '_blank');
  }

  onEditContextMenu(event: MouseEvent): boolean {
    event.preventDefault();
    this.openEditInNewTab();
    return false;
  }

  clientMessageContent: string = '';
  merchandiserMessageContent: string = '';
  sendingClientMessage = false;
  sendingMerchandiserMessage = false;

  // Scroll containers
  @ViewChild('clientScrollContainer', { static: false }) clientScrollContainer!: ElementRef;
  @ViewChild('merchandiserScrollContainer', { static: false }) merchandiserScrollContainer!: ElementRef;
  private shouldScrollClient = false;
  private shouldScrollMerchandiser = false;

  // Accordion active value - set all panels open by default
  activeAccordionValue: string[] = ['0', '1', '3'];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private reportService: ReportService,
    private toastService: HotToastService,
  ) {}

  ngOnInit(): void {
    this.clientId = this.route.snapshot.paramMap.get('clientId') || this.route.snapshot.paramMap.get('clientSlug');
    this.projectId = this.route.snapshot.paramMap.get('projectId') || this.route.snapshot.paramMap.get('projectSlug');
    // Extract reportId and sanitize it to remove any query parameters
    const rawReportId = this.route.snapshot.paramMap.get('reportID');
    this.reportId = rawReportId ? rawReportId.split('?')[0].split('/')[0].trim() : null;
    this.reportStatus = this.route.snapshot.queryParamMap.get('reportStatus') || '';

    // Get referrer from query params
    this.referrer = this.route.snapshot.queryParamMap.get('referrer') || '';

    // If no referrer in query params, default to project
    if (!this.referrer && window.history.length > 1) {
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

  ngAfterViewInit() {
    // Scroll after initial render - wait for accordion and DOM to be ready
    // Use longer delays to ensure accordion panels are fully rendered
    setTimeout(() => {
      this.scrollToBottom('client');
      this.scrollToBottom('merchandiser');
    }, 500);
    
    // Also try scrolling again after a longer delay in case accordion takes time to render
    setTimeout(() => {
      this.scrollToBottom('client');
      this.scrollToBottom('merchandiser');
    }, 1000);
  }

  onAccordionPanelOpen(event: any) {
    // When accordion panel opens, scroll to bottom after a delay to ensure DOM is ready
    // Check if the Dialog panel (value='3') is being opened
    if (event && Array.isArray(event) && event.includes('3')) {
      setTimeout(() => {
        this.scrollToBottom('client');
        this.scrollToBottom('merchandiser');
      }, 200);
    }
  }

  ngAfterViewChecked() {
    if (this.shouldScrollClient) {
      this.scrollToBottom('client');
      this.shouldScrollClient = false;
    }
    if (this.shouldScrollMerchandiser) {
      this.scrollToBottom('merchandiser');
      this.shouldScrollMerchandiser = false;
    }
  }

  private scrollToBottom(container: 'client' | 'merchandiser') {
    // Only scroll if the Dialog panel (value='3') is open
    if (!this.activeAccordionValue.includes('3')) {
      return;
    }
    
    const elementRef = container === 'client' ? this.clientScrollContainer : this.merchandiserScrollContainer;
    
    if (!elementRef || !elementRef.nativeElement) {
      // ViewChild not available yet, try again later
      setTimeout(() => this.scrollToBottom(container), 100);
      return;
    }
    
    // Try scrolling multiple times with increasing delays to ensure DOM is fully rendered
    // This handles cases where the element is conditionally rendered with *ngIf
    const tryScroll = (delay: number) => {
      setTimeout(() => {
        if (elementRef?.nativeElement) {
          const element = elementRef.nativeElement;
          // Force scroll to bottom
          const scrollHeight = element.scrollHeight;
          const clientHeight = element.clientHeight;
          
          if (scrollHeight > clientHeight) {
            element.scrollTop = scrollHeight;
          }
        }
      }, delay);
    };
    
    // Try multiple times with increasing delays to catch DOM updates
    tryScroll(0);
    tryScroll(100);
    tryScroll(200);
    tryScroll(300);
    tryScroll(500);
    tryScroll(700);
  }

  private triggerScrollToBottom(container: 'client' | 'merchandiser') {
    if (container === 'client') {
      this.shouldScrollClient = true;
    } else {
      this.shouldScrollMerchandiser = true;
    }
  }

  loadReportDetails(): void {
    this.loading = true;
    this.error = false;
    this.reportService.getReportById(this.reportId).subscribe({
      next: (data) => {
        this.report = data;
        // Defensive: ensure project/questions structure for dynamic logic
        if (!this.report.project) this.report.project = {};
        if (!this.report.project.questions) this.report.project.questions = [];
        if (!this.report.photos && this.report.project.photos) this.report.photos = this.report.project.photos;
        if (!this.report.conversation) this.report.conversation = { messages: [] };
        // Extract label number from label string (e.g., "Bezeichnung 1" -> 1)
        const extractLabelNumber = (label: string): number => {
          const match = label?.match(/\d+/);
          return match ? parseInt(match[0], 10) : 999;
        };

        // Map photos to gallery items
        const allGalleryItems = (this.report.uploadedAdvancedPhotos || []).map((photo: any) => ({
          itemImageSrc: photo.file.path,
          thumbnailImageSrc: photo.file.path,
          title: photo.label,
          beforeAfterType: photo.beforeAfterType,
          alt: photo.label,
          date: photo.createdAt,
          labelNumber: extractLabelNumber(photo.label),
          order: photo.order || 0,
        }));

        // Sort: before images first (by label number, then order), then after images (by label number, then order)
        this.galleryImages = allGalleryItems.sort((a, b) => {
          // First, sort by beforeAfterType: 'before' comes before 'after'
          if (a.beforeAfterType !== b.beforeAfterType) {
            if (a.beforeAfterType === 'before') return -1;
            if (b.beforeAfterType === 'before') return 1;
            return 0;
          }

          // If same type, sort by label number
          if (a.labelNumber !== b.labelNumber) {
            return a.labelNumber - b.labelNumber;
          }

          // If same label number, sort by order
          return (a.order || 0) - (b.order || 0);
        });

        this.processConversationMessages();
        this.initializeQuestionData();
        this.loading = false;
        
        // Scroll to bottom after messages are loaded and DOM is updated
        setTimeout(() => {
          this.scrollToBottom('client');
          this.scrollToBottom('merchandiser');
        }, 400);
      },
      error: (err) => {
        this.error = true;
        this.loading = false;
      },
    });
  }

  initializeQuestionData(): void {
    if (!this.report?.project?.questions) return;
    this.report.project.questions.forEach((question) => {
      const questionId = question.id;
      this.questionOptions[questionId] = question.options?.map((option) => option.optionText) || [];
      this.filteredQuestionOptions[questionId] = [...this.questionOptions[questionId]];
      this.questionAnswers[questionId] = '';
    });
  }

  filterQuestionOptions(event: any, questionId: number): void {
    const query = event.query?.toLowerCase() || '';
    this.filteredQuestionOptions[questionId] = this.questionOptions[questionId].filter((option) => option.toLowerCase().includes(query));
  }

  onQuestionAnswerChanged(questionId: number): void {
    const answer = this.questionAnswers[questionId];
    const question = this.report?.project?.questions?.find((q) => q.id === questionId);
    console.log(`Question ${questionId} answer changed:`, answer);
    // Add logic if needed
  }

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
    this.report.clientMessages = messages
      .filter(
        (msg) =>
          // Akzente -> Client
          (getTypeName(msg.senderType) === 'akzente' && (getTypeName(msg.receiverType) === 'client' || msg.receiverTypeString === 'client')) ||
          // Client -> Akzente (cover inconsistent payloads where receiverType may still be 'client' but string says 'akzente')
          (getTypeName(msg.senderType) === 'client' && (getTypeName(msg.receiverType) === 'akzente' || msg.receiverTypeString === 'akzente')),
      )
      .map((msg) => {
        const createdAt = new Date(msg.createdAt);
        const senderFirstName = msg.senderFirstName || '';
        const senderLastName = msg.senderLastName || '';
        const fullName = `${senderFirstName} ${senderLastName}`.trim();
        const isAkzente = msg.senderType?.name === 'akzente';
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
        const isAkzente = msg.senderType?.name === 'akzente';
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
    
    // Trigger scroll after messages are processed
    this.triggerScrollToBottom('client');
    this.triggerScrollToBottom('merchandiser');
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

  showStatusConfirmation(status: string): void {
    // Prevent any status changes if report is already closed
    if (this.isReportClosed()) {
      this.toastService.warning('Dieser Bericht ist bereits geschlossen und kann nicht mehr geändert werden', {
        position: 'bottom-right',
        duration: 3000,
      });
      return;
    }

    // Check if user can approve (sequential approval logic)
    if (status === 'Freigegeben' && !this.canUserApprove()) {
      this.toastService.warning('Sie können diesen Bericht noch nicht genehmigen. Warten Sie auf die vorherige Genehmigung.', {
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
      this.toastService.warning('Dieser Bericht ist bereits geschlossen und kann nicht mehr geändert werden', {
        position: 'bottom-right',
        duration: 3000,
      });
      return;
    }

    // Check if user can approve (sequential approval logic)
    if (status === 'UngeprüfT' && !this.canUserApprove()) {
      this.toastService.warning('Sie können diesen Bericht noch nicht genehmigen. Warten Sie auf die vorherige Genehmigung.', {
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
            this.toastService.warning('Dieser Bericht ist bereits geschlossen', {
              position: 'bottom-right',
              duration: 3000,
            });
          } else {
            this.toastService.error('Fehler beim Aktualisieren des Status', {
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
            this.toastService.success('Bericht erfolgreich geschlossen', {
              position: 'bottom-right',
              duration: 2000,
            });
          }
        },
      });
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

  onAppointmentDateSelected(date: Date): void {
    this.report.appointmentDate = date;
    // Optionally handle date selection logic
  }

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
          setTimeout(() => this.scrollToBottom('client'), 300);
        }
        this.sendingClientMessage = false;
      },
      error: () => {
        this.sendingClientMessage = false;
      },
    });
  }

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
          setTimeout(() => this.scrollToBottom('merchandiser'), 300);
        }
        this.sendingMerchandiserMessage = false;
      },
      error: () => {
        this.sendingMerchandiserMessage = false;
      },
    });
  }

  getAnswerForQuestion(questionId: number) {
    if (!this.report || !this.report.answers) return null;
    return this.report.answers.find((a: any) => a.question && a.question.id === questionId) || null;
  }

  getMultiAnswersForQuestion(questionId: number): string {
    if (!this.report || !this.report.answers) return '';
    const answers = this.report.answers.filter((a: any) => a.question && a.question.id === questionId && a.selectedOption);
    return answers.map((a: any) => a.selectedOption.optionText).join(', ');
  }

  
}
