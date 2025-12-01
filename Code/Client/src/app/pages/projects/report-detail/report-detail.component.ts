import { Component, OnInit, ViewEncapsulation, AfterViewInit, AfterViewChecked, ViewChild, ElementRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Location } from '@angular/common';
import { ReportService } from '@app/@core/services/report.service';
import { HotToastService } from '@ngneat/hot-toast';
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
  public reportId: string;
  public clientId: string;
  public projectId: string;
  public report: any = null;
  public loading: boolean = true;
  public error: boolean = false;
  public selectedPhotoIndex: number = 0;
  public galleryImages: GalleryItem[] = [];

  // Galleria configuration
  public position: string = 'bottom';
  public responsiveOptions: any[] = [
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

  public questionAnswers: { [questionId: number]: any } = {};
  public questionOptions: { [questionId: number]: string[] } = {};
  public filteredQuestionOptions: { [questionId: number]: string[] } = {};

  public clientMessageContent: string = '';
  public sendingClientMessage = false;

  // Scroll container
  @ViewChild('clientScrollContainer', { static: false }) clientScrollContainer!: ElementRef;
  private shouldScroll = false;

  // Dialog state for export feedback
  csvDialogVisible: boolean = false;
  csvDialogIsError: boolean = false;
  dialogMessage: string = '';

  // Accordion active value - set all panels open by default
  public activeAccordionValue: string[] = ['0', '1', '3'];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private location: Location,
    private reportService: ReportService,
    private toastService: HotToastService,
  ) {}

  goBack(): void {
    this.location.back();
  }

  public ngOnInit(): void {
    // For projects module routes, we don't have clientSlug, only projectId
    this.clientId = this.route.snapshot.paramMap.get('clientSlug'); // Will be null for projects routes
    this.projectId = this.route.snapshot.paramMap.get('projectSlug') || this.route.snapshot.paramMap.get('projectId');
    // Extract reportId and clean it (remove any query parameters that might be accidentally included)
    const rawReportId = this.route.snapshot.paramMap.get('reportID');
    this.reportId = rawReportId ? rawReportId.split('?')[0].split('/')[0] : null;

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
    setTimeout(() => this.scrollToBottom(), 300);
  }

  ngAfterViewChecked() {
    if (this.shouldScroll) {
      this.scrollToBottom();
      this.shouldScroll = false;
    }
  }

  private scrollToBottom() {
    // Try scrolling multiple times with increasing delays to ensure DOM is fully rendered
    const tryScroll = (delay: number) => {
      setTimeout(() => {
        if (this.clientScrollContainer?.nativeElement) {
          const element = this.clientScrollContainer.nativeElement;
          // Force scroll to bottom
          element.scrollTop = element.scrollHeight;
        }
      }, delay);
    };
    
    // Try multiple times with increasing delays to catch DOM updates
    tryScroll(0);
    tryScroll(100);
    tryScroll(200);
    tryScroll(300);
  }

  private triggerScrollToBottom() {
    this.shouldScroll = true;
  }

  public loadReportDetails(): void {
    this.loading = true;
    this.error = false;
    this.reportService.getReportById(this.reportId).subscribe({
      next: (data) => {
        this.report = data;
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

        // Sort: after images first (by label number, then order), then before images (by label number, then order)
        this.galleryImages = allGalleryItems.sort((a, b) => {
          // First, sort by beforeAfterType: 'after' comes before 'before'
          if (a.beforeAfterType !== b.beforeAfterType) {
            if (a.beforeAfterType === 'after') return -1;
            if (b.beforeAfterType === 'after') return 1;
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
        setTimeout(() => this.scrollToBottom(), 400);
      },
      error: (err) => {
        console.error('Error loading report details:', err);
        this.error = true;
        this.loading = false;
        
        // Check if it's a 403 Forbidden error (permission denied)
        if (err.status === 403) {
          this.toastService.error('Sie haben keine Berechtigung, diesen Bericht anzuzeigen.', {
            position: 'bottom-right',
            duration: 3000,
          });
          this.router.navigate(['/projects']);
        } else {
          this.toastService.error('Fehler beim Laden des Berichts.', {
            position: 'bottom-right',
            duration: 3000,
          });
        }
      },
    });
  }


  initializeQuestionData(): void {
    if (!this.report?.project?.questions) return;
    this.report.project.questions.forEach((question: any) => {
      const questionId = question.id;
      this.questionOptions[questionId] = question.options?.map((option: any) => option.optionText) || [];
      this.filteredQuestionOptions[questionId] = [...this.questionOptions[questionId]];
      this.questionAnswers[questionId] = '';
    });
  }

  processConversationMessages(): void {
    if (!this.report?.conversation?.messages) {
      this.report.clientMessages = [];
      return;
    }
    const messages = this.report.conversation.messages;
    this.report.clientMessages = messages
      .filter((msg: any) => {
        const sender = msg.senderType?.name;
        const receiverStr = msg.receiverTypeString;
        return (
          (sender === 'akzente' && (msg.receiverType?.name === 'client' || receiverStr === 'client')) || (sender === 'client' && (msg.receiverType?.name === 'akzente' || receiverStr === 'akzente'))
        );
      })
      .map((msg: any) => {
        const isClientOrigin = msg.senderType?.name === 'client' || msg.receiverTypeString === 'akzente';
        // Reverse placement: client-origin messages will be marked as 'agent', akzente-origin as 'client'
        const mappedSender = isClientOrigin ? 'agent' : 'client';
        const senderName = msg.senderType?.name === 'akzente' ? 'Akzente' : `${msg.senderFirstName} ${msg.senderLastName}`;
        return {
          date: new Date(msg.createdAt).toLocaleDateString('de-DE'),
          sender: mappedSender,
          senderName,
          avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(msg.senderFirstName + ' ' + msg.senderLastName)}`,
          time: new Date(msg.createdAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
          text: msg.content,
        };
      })
      .sort((a: any, b: any) => new Date(a.date + ' ' + a.time).getTime() - new Date(b.date + ' ' + b.time).getTime());
    
    // Trigger scroll after messages are processed
    this.triggerScrollToBottom();
  }

  public selectPhoto(index: number): void {
    this.selectedPhotoIndex = index;
  }

  public nextPhoto(): void {
    this.selectedPhotoIndex = (this.selectedPhotoIndex + 1) % this.report.photos.length;
  }

  public prevPhoto(): void {
    this.selectedPhotoIndex = (this.selectedPhotoIndex - 1 + this.report.photos.length) % this.report.photos.length;
  }

  public updateStatus(status: string): void {
    // Prevent any status changes if report is already closed
    if (this.isReportClosed()) {
      this.toastService.warning('Dieser Bericht ist bereits geschlossen und kann nicht mehr geändert werden', {
        position: 'bottom-right',
        duration: 3000,
      });
      return;
    }

    // If status is UngeprüfT and it's before Prüfen, show warning
    if (status === 'UngeprüfT' && !this.canUserApprove()) {
      console.log('UngeprüfT');
      console.log(status === 'UngeprüfT');
      console.log(this.canUserApprove());
      this.toastService.warning('Sie können diesen Bericht noch nicht genehmigen. Warten Sie auf die vorherige Genehmigung.', {
        position: 'bottom-right',
        duration: 4000,
      });
      return;
    }

    // Check if user can approve (sequential approval logic)
    if (status === 'Freigegeben' && !this.canUserApprove()) {
      console.log('Freigegeben');
      console.log(status === 'Freigegeben');
      console.log(this.canUserApprove());
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

    this.reportService.closeReport(this.reportId)
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
        })
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
    return statusName !== 'Ok';
  }

  // Helper method to determine if report is closed (cannot be changed)
  isReportClosed(): boolean {
    if (!this.report?.status?.name) return false;
    const statusName = this.report.status.name;
    return statusName === 'Ok';
  }

  // Helper method to determine if current user can approve the report
  canUserApprove(): boolean {
    if (!this.report?.status?.name) return false;
    const statusName = this.report.status.name;
    
    // User can only close report when status is exactly "Prüfen"
    return statusName === 'Prüfen';
  }

  public onFavoriteChanged(newStatus: boolean, report: any): void {
    const previousStatus = report.isFavorite;
    report.isFavorite = newStatus;
    this.reportService.toggleFavoriteStatus(report.id).subscribe({
      next: (result) => {
        if (result) {
          report.isFavorite = result.isFavorite;
        }
      },
      error: () => {
        report.isFavorite = previousStatus;
      },
    });
  }

  public sendClientMessage() {
    const content = this.clientMessageContent.trim();
    if (!content) return;
    this.sendingClientMessage = true;
    this.reportService.sendMessage(this.reportId, { content, receiverType: 'akzente' }).subscribe({
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

  public getAnswerForQuestion(questionId: number) {
    if (!this.report || !this.report.answers) return null;
    return this.report.answers.find((a: any) => a.question && a.question.id === questionId) || null;
  }

  public getMultiAnswersForQuestion(questionId: number): string {
    if (!this.report || !this.report.answers) return '';
    const answers = this.report.answers.filter((a: any) => a.question && a.question.id === questionId && a.selectedOption);
    return answers.map((a: any) => a.selectedOption.optionText).join(', ');
  }

  downloadSingleReportExcel(): void {
    this.reportService.exportSingleReportAsExcel(this.reportId).subscribe({
      next: (blob: Blob) => {
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Report_${this.reportId}_${new Date().toISOString().split('T')[0]}.xlsx`;
        link.click();
        window.URL.revokeObjectURL(url);
        
        this.dialogMessage = 'Excel-Export erfolgreich heruntergeladen';
        this.csvDialogIsError = false;
        this.csvDialogVisible = true;
      },
      error: (error) => {
        console.error('Error downloading Excel:', error);
        this.dialogMessage = 'Excel-Export fehlgeschlagen!';
        this.csvDialogIsError = true;
        this.csvDialogVisible = true;
      },
    });
  }
}
