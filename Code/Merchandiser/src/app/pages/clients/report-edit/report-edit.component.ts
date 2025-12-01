import { Component, OnInit, ViewEncapsulation, ElementRef, ViewChild, AfterViewInit, AfterViewChecked } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Location } from '@angular/common';
import { ImageItem } from '../../../shared/components/multi-image-upload/multi-image-upload.component';
import { ReportService } from '@app/@core/services/report.service';
import { HotToastService } from '@ngneat/hot-toast';
import { catchError, of } from 'rxjs';
import { CdkDragDrop, transferArrayItem } from '@angular/cdk/drag-drop';

interface GalleryItem {
  itemImageSrc: string;
  thumbnailImageSrc: string;
  title: string;
  alt: string;
}

type PrepopulatedKey = 'prepopulatedVorherImages1' | 'prepopulatedNachherImages1' | 'prepopulatedNachherImages2' | 'prepopulatedVorherImages3' | 'prepopulatedNachherImages3';

@Component({
  selector: 'app-report-edit',
  standalone: false,
  templateUrl: './report-edit.component.html',
  styleUrls: ['./report-edit.component.scss'],
  encapsulation: ViewEncapsulation.None,
})
export class ReportEditComponent implements OnInit, AfterViewInit, AfterViewChecked {
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

  // Files to delete and replaced images tracking
  filesToDelete: number[] = [];
  replacedImages: { [fileId: number]: ImageItem } = {};

  // Conversation and messaging properties (from report-detail)
  public clientMessageContent: string = '';
  public sendingClientMessage = false;
  @ViewChild('clientScrollContainer', { static: false }) clientScrollContainer!: ElementRef;
  private shouldScroll = false;

  // Accordion active value - set all panels open by default
  activeAccordionValue: string[] = ['0', '1', '2', '3'];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private location: Location,
    private reportService: ReportService,
    private toast: HotToastService,
  ) {}

  goBack(): void {
    this.location.back();
  }

  ngOnInit(): void {
    // Extract route parameters - using clientId instead of clientSlug for ID-based routing
    this.clientId = this.route.snapshot.paramMap.get('clientId');
    this.projectId = this.route.snapshot.paramMap.get('projectId');
    // Extract reportId and clean it (remove any query parameters that might be accidentally included)
    const rawReportId = this.route.snapshot.paramMap.get('reportID');
    this.reportId = rawReportId ? rawReportId.split('?')[0].split('/')[0] : null;

    // Initialize arrays to prevent template errors
    this.galleryImages = [];
    this.report = null;

    this.loadReportDetails();
  }

  ngAfterViewInit() {
    // Scroll after initial render
    setTimeout(() => this.scrollToBottom(), 100);
  }

  ngAfterViewChecked() {
    if (this.shouldScroll) {
      this.scrollToBottom();
      this.shouldScroll = false;
    }
  }

  private scrollToBottom() {
    // Try scrolling multiple times with increasing delays to ensure DOM is fully rendered
    // This handles cases where the element is conditionally rendered with *ngIf
    const tryScroll = (delay: number) => {
      setTimeout(() => {
        if (this.clientScrollContainer?.nativeElement) {
          const element = this.clientScrollContainer.nativeElement;
          // Force scroll to bottom
          element.scrollTop = element.scrollHeight;
          // Also try using scrollIntoView as a fallback
          if (element.lastElementChild) {
            element.lastElementChild.scrollIntoView({ behavior: 'smooth', block: 'end' });
          }
        }
      }, delay);
    };
    
    // Try immediately
    tryScroll(0);
    // Try after a short delay
    tryScroll(100);
    // Try after a longer delay (for slower DOM updates)
    tryScroll(300);
  }

  private triggerScrollToBottom() {
    this.shouldScroll = true;
  }

  loadReportDetails(): void {
    this.loading = true;
    this.error = false;
    this.reportService.getReportById(this.reportId).subscribe({
      next: (data) => {
        this.report = data;

        // Ensure proper data structure initialization
        if (!this.report) {
          this.report = {};
        }
        if (!this.report.project) this.report.project = {};
        if (!this.report.project.questions) this.report.project.questions = [];
        if (!this.report.answers) this.report.answers = [];
        if (!this.report.photos && this.report.project.photos) this.report.photos = this.report.project.photos;
        if (!this.report.conversation) this.report.conversation = { messages: [] };
        if (!this.report.merchandiserMessages) this.report.merchandiserMessages = [];
        
        console.log('📋 Report loaded, answers:', this.report.answers);

        // Initialize gallery images safely
        this.galleryImages = (this.report.uploadedAdvancedPhotos || []).map((photo: any) => ({
          itemImageSrc: photo.file?.path || '',
          thumbnailImageSrc: photo.file?.path || '',
          title: photo.label || '',
          // @ts-ignore - extend locally to carry these fields to template
          beforeAfterType: photo.beforeAfterType || 'before',
          alt: photo.label || '',
          // @ts-ignore
          date: photo.createdAt || new Date(),
        }));

        this.processConversationMessages();
        this.initializeQuestionData();
        
        // Process uploaded advanced photos
        this.processUploadedAdvancedPhotos();

        this.loading = false;
        // Scroll to bottom after messages are loaded and DOM is updated
        setTimeout(() => this.scrollToBottom(), 200);
      },
      error: (error) => {
        console.error('Error loading report details:', error);
        this.error = true;
        this.loading = false;
        
        // Check if it's a 403 Forbidden error (permission denied)
        if (error.status === 403) {
          this.toast.error('Sie haben keine Berechtigung, diesen Bericht zu bearbeiten.', {
            position: 'bottom-right',
            duration: 3000,
          });
          this.router.navigate(['/dashboard']);
        } else {
          this.toast.error('Fehler beim Laden des Berichts.', {
            position: 'bottom-right',
            duration: 3000,
          });
        }
        
        // Initialize empty report structure for graceful degradation
        this.report = {
          project: { questions: [] },
          merchandiserMessages: [],
          conversation: { messages: [] },
        };
        this.galleryImages = [];
      },
    });
  }

  // Initialize question data when report is loaded
  initializeQuestionData(): void {
    if (!this.report?.project?.questions) return;

    this.report.project.questions.forEach((question) => {
      const questionId = question.id;

      // Initialize options for this question
      this.questionOptions[questionId] = question.options?.map((option) => option.optionText) || [];
      this.filteredQuestionOptions[questionId] = [...this.questionOptions[questionId]];

      const answerType = question.answerType.name;

      // Handle multiselect separately since it has multiple answer entries
      if (answerType === 'multiselect') {
        // For multiselect, find all answers for this question
        // Each multiselect option is stored as a separate answer entry
        const multiselectAnswers = this.report.answers?.filter((answer) => {
          // Handle both cases: answer.question.id or answer.questionId
          const qId = answer.question?.id || answer.questionId;
          return qId === questionId && answer.selectedOption;
        }) || [];
        console.log('🔍 Loading multiselect answers for question', questionId, ':', multiselectAnswers);
        if (multiselectAnswers.length > 0) {
          const selectedOptions = multiselectAnswers
            .map((answer) => answer.selectedOption?.optionText)
            .filter((text) => text !== null && text !== undefined);
          console.log('✅ Selected options loaded:', selectedOptions);
          this.questionAnswers[questionId] = selectedOptions;
        } else {
          console.log('⚠️ No multiselect answers found, initializing empty array');
          this.questionAnswers[questionId] = [];
        }
      } else {
        // For other answer types, find the single answer entry
        const existingAnswer = this.report.answers?.find((answer) => {
          const qId = answer.question?.id || answer.questionId;
          return qId === questionId;
        });

        if (existingAnswer) {
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
          }
        } else {
          // Set default values for non-multiselect questions
          switch (answerType) {
            case 'text':
              this.questionAnswers[questionId] = '';
              break;
            case 'boolean':
              this.questionAnswers[questionId] = null;
              break;
            case 'select':
              this.questionAnswers[questionId] = null;
              break;
          }
        }
      }
    });
  }

  // Conversation processing method (exact same as report-detail)
  processConversationMessages(): void {
    if (!this.report?.conversation?.messages) {
      this.report.merchandiserMessages = [];
      this.triggerScrollToBottom();
      return;
    }
    const messages = this.report.conversation.messages;
    console.log('🔄 Processing conversation messages:', messages);

    this.report.merchandiserMessages = messages
      .filter((msg: any) => {
        const sender = msg.senderType?.name;
        const receiverStr = msg.receiverTypeString;
        const isValidMessage =
          (sender === 'akzente' && (msg.receiverType?.name === 'merchandiser' || receiverStr === 'merchandiser')) ||
          (sender === 'merchandiser' && (msg.receiverType?.name === 'akzente' || receiverStr === 'akzente'));
        console.log('📝 Message filter:', { sender, receiverStr, isValidMessage, msg });
        return isValidMessage;
      })
      .map((msg: any) => {
        const isMerchandiserOrigin = msg.senderType?.name === 'merchandiser' || msg.receiverTypeString === 'akzente';
        // Reverse placement: merchandiser-origin messages will be marked as 'agent', akzente-origin as 'client'
        const mappedSender = isMerchandiserOrigin ? 'agent' : 'client';
        const senderName = msg.senderType?.name === 'akzente' ? 'Akzente' : `${msg.senderFirstName} ${msg.senderLastName}`;
        const processedMessage = {
          date: new Date(msg.createdAt).toLocaleDateString('de-DE'),
          sender: mappedSender,
          senderName,
          avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(msg.senderFirstName + ' ' + msg.senderLastName)}`,
          time: new Date(msg.createdAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
          text: msg.content,
        };
        console.log('✅ Processed message:', processedMessage);
        return processedMessage;
      })
      .sort((a: any, b: any) => new Date(a.date + ' ' + a.time).getTime() - new Date(b.date + ' ' + b.time).getTime());

    console.log('📤 Final merchandiser messages:', this.report.merchandiserMessages);
    this.triggerScrollToBottom();
  }

  // Message sending method (exact same as report-detail)
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
          setTimeout(() => this.scrollToBottom(), 200);
        }
        this.sendingClientMessage = false;
      },
      error: () => {
        this.sendingClientMessage = false;
      },
    });
  }

  public getAnswerForQuestion(questionId: number): any {
    if (!this.report?.answers) return null;
    const answer = this.report.answers.find((ans: any) => ans.question?.id === questionId);
    return answer?.textAnswer || answer?.selectedOption?.optionText || null;
  }

  public getMultiAnswersForQuestion(questionId: number): string[] {
    if (!this.report?.answers) return [];
    // For multiselect, there are multiple answer entries, each with one selectedOption
    const answers = this.report.answers.filter((ans: any) => ans.question?.id === questionId && ans.selectedOption);
    return answers.map((ans: any) => ans.selectedOption.optionText) || [];
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


  onFavoriteChanged(newStatus: boolean, report: any): void {
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

  prepareAnswersForSave(): any[] {
    const answers: any[] = [];

    if (!this.report?.project?.questions) {
      return answers;
    }

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

  saveReportPhotos(): void {
    if (!this.report || this.saving) {
      return;
    }

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
        if (photoIndex === 0) {
          vorherImages = this.vorherImages1;
          nachherImages = this.nachherImages1;
        } else if (photoIndex === 1) {
          nachherImages = this.nachherImages2;
        } else if (photoIndex === 2) {
          vorherImages = this.vorherImages3;
          nachherImages = this.nachherImages3;
        }

        // Add vorher images if this photo has before/after
        if (advancedPhoto.isBeforeAfter && vorherImages.length > 0) {
          vorherImages.forEach((img, imgIndex) => {
            if (img.file) {
              allFiles.push({
                file: img.file,
                label: img.label || `Vorher ${photoIndex + 1}`,
                advancedPhotoId: advancedPhoto.id,
                fileName: img.fileName,
                beforeAfterType: 'before',
                order: imgIndex,
              });
            }
          });
        }

        // Add nachher images
        if (nachherImages.length > 0) {
          nachherImages.forEach((img, imgIndex) => {
            if (img.file) {
              allFiles.push({
                file: img.file,
                label: img.label || `Nachher ${photoIndex + 1}`,
                advancedPhotoId: advancedPhoto.id,
                fileName: img.fileName,
                beforeAfterType: 'after',
                order: imgIndex,
              });
            }
          });
        }
      });
    }

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

    // Prepare answers for saving
    const answers = this.prepareAnswersForSave();

    const photoOrderUpdates = this.buildPhotoOrderUpdates();

    // Prepare the complete payload for submission (without files)
    const payload = {
      visitDate: this.report.visitDate,
      answers: answers,
      status: this.report.status,
      filesToDelete: this.filesToDelete,
    };

    if (photoOrderUpdates.length > 0) {
      (payload as any).photoOrderUpdates = photoOrderUpdates;
    }

    console.log('Submitting report update with payload:', payload);
    console.log('Files to upload:', allFiles.length);

    // Call the service to update the report with files
    this.reportService.updateReportWithFiles(this.reportId, payload, allFiles).subscribe({
      next: (response) => {
        this.saving = false;
        this.filesToDelete = [];
        this.replacedImages = {};

        this.toast.success('Report erfolgreich gespeichert!', {
          position: 'bottom-right',
          duration: 4000,
        });

        // Reload the report to get updated data
        this.loadReportDetails();
      },
      error: (error) => {
        console.error('Error updating report:', error);
        this.saving = false;
        this.toast.error('Fehler beim Speichern des Reports. Bitte versuchen Sie es erneut.', {
          position: 'bottom-right',
          duration: 4000,
        });
      },
    });
  }

  findPhotoInfoForLabel(label: string): { advancedPhotoId: number; beforeAfterType: string } | null {
    // This method should find the advancedPhotoId and beforeAfterType based on the label
    // For now, return null - you may need to implement this based on your label structure
    if (!this.report?.project?.advancedPhotos) {
      return null;
    }

    for (const photo of this.report.project.advancedPhotos) {
      if (photo.labels && photo.labels.includes(label)) {
        return {
          advancedPhotoId: photo.id,
          beforeAfterType: photo.isBeforeAfter ? 'after' : 'after',
        };
      }
    }

    return null;
  }

  public saveReport(): void {
    if (!this.report || this.saving) {
      return;
    }

    this.saving = true;

    // Prepare the report data for saving
    const reportData = {
      // Add all the form data here
      note: this.report.note || '',
      feedback: this.report.feedback || '',
      isSpecCompliant: this.report.isSpecCompliant || false,
      // Add other fields as needed
    };

    // Prepare files for upload
    const filesToUpload: any[] = [];

    // Collect files from all image collections
    const allImageCollections = [...this.vorherImages1, ...this.nachherImages1, ...this.nachherImages2, ...this.vorherImages3, ...this.nachherImages3];

    allImageCollections.forEach((imageItem) => {
      if (imageItem.file) {
        filesToUpload.push({
          file: imageItem.file,
          label: imageItem.label || '',
          advancedPhotoId: imageItem.advancedPhotoId,
          beforeAfterType: imageItem.beforeAfterType || 'before',
        });
      }
    });

    this.reportService.updateReportWithFiles(this.reportId, reportData, filesToUpload).subscribe({
      next: (response) => {
        console.log('✅ Report saved successfully:', response);
        this.toast.success('Bericht erfolgreich gespeichert', {
          position: 'bottom-right',
          duration: 3000,
        });
      },
      error: (error) => {
        console.error('❌ Error saving report:', error);
        this.toast.error('Fehler beim Speichern des Berichts', {
          position: 'bottom-right',
          duration: 4000,
        });
      },
      complete: () => {
        this.saving = false;
      },
    });
  }

  // Additional methods needed for HeadOffice template compatibility
  onAppointmentDateSelected(date: Date): void {
    this.report.visitDate = date;
  }

  onQuestionAnswerChanged(questionId: number): void {
    // Handle question answer changes
    console.log('Question answer changed for question:', questionId, this.questionAnswers[questionId]);
  }

  filterQuestionOptions(event: any, questionId: number): void {
    const query = event.query.toLowerCase();
    this.filteredQuestionOptions[questionId] = this.questionOptions[questionId].filter((option) => option.toLowerCase().includes(query));
  }

  // Multi-select methods
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

    this.report.uploadedAdvancedPhotos.forEach((uploadedPhoto: any) => {
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

        const beforeImages: ImageItem[] = sortedBefore.map(
          (uploadedPhoto, idx): ImageItem => ({
            id: uploadedPhoto.id,
            file: undefined, // No file since it's already uploaded
            preview: uploadedPhoto.file.path, // Use the file path as preview
            fileName: uploadedPhoto.file.path.split('/').pop() || 'image.jpg',
            label: uploadedPhoto.label,
            isImage: true,
            fileId: uploadedPhoto.id, // Use the uploaded photo ID
            beforeAfterType: 'before',
            order: typeof uploadedPhoto.order === 'number' ? uploadedPhoto.order : idx,
          } as ImageItem & { order?: number }),
        );

        console.log(`Before images for photo ${photoIndex}:`, beforeImages);

        // Assign to the correct array based on photo index
        if (photoIndex === 0) {
          this.prepopulatedVorherImages1 = beforeImages;
        } else if (photoIndex === 2) {
          this.prepopulatedVorherImages3 = beforeImages;
        }
      }

      // Process after photos (nachher)
      const afterImages: ImageItem[] = groupedPhotos[afterKey]
        ? [...groupedPhotos[afterKey]]
            .sort((a, b) => {
              const orderA = typeof a.order === 'number' ? a.order : 0;
              const orderB = typeof b.order === 'number' ? b.order : 0;
              return orderA - orderB;
            })
            .map(
              (uploadedPhoto, idx): ImageItem => ({
                id: uploadedPhoto.id,
                file: undefined, // No file since it's already uploaded
                preview: uploadedPhoto.file.path, // Use the file path as preview
                fileName: uploadedPhoto.file.path.split('/').pop() || 'image.jpg',
                label: uploadedPhoto.label,
                isImage: true,
                fileId: uploadedPhoto.id, // Use the uploaded photo ID
                beforeAfterType: 'after',
                order: typeof uploadedPhoto.order === 'number' ? uploadedPhoto.order : idx,
              } as ImageItem & { order?: number }),
            )
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

  private normalizeImageList(images: ImageItem[], type: 'before' | 'after'): ImageItem[] {
    return images.map((img, index) => ({
      ...img,
      beforeAfterType: type,
      order: index,
    } as ImageItem & { order?: number }));
  }

  private syncPrepopulatedOrder(images: ImageItem[], key: PrepopulatedKey): void {
    const prepopulatedImages = (this as any)[key] as ImageItem[];

    if (!Array.isArray(prepopulatedImages)) {
      return;
    }

    const reordered: ImageItem[] = [];
    const type: 'before' | 'after' = key.toLowerCase().includes('vorher') ? 'before' : 'after';

    images.forEach((img, index) => {
      if (img.fileId && !img.file) {
        const existing = prepopulatedImages.find((pre) => pre.fileId === img.fileId);
        if (existing) {
          reordered.push({ ...existing, label: img.label, beforeAfterType: type, order: index } as ImageItem & { order?: number });
        } else {
          reordered.push({ ...img, label: img.label, beforeAfterType: type, order: index } as ImageItem & { order?: number });
        }
      }
    });

    (this as any)[key] = reordered.map((item) => ({ ...item }));
  }

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

  // Image handling methods
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
    
    if (photoIndex === 0) {
      prepopulatedKey = 'prepopulatedNachherImages1';
      this.syncPrepopulatedOrder(normalized, prepopulatedKey);
      this.nachherImages1 = normalized.filter((img) => !!img.file).map((img) => ({ ...img }));
      this.checkForReplacedImages(normalized, this.prepopulatedNachherImages1);
      
      // Update prepopulated array to include new files so they display immediately
      this.prepopulatedNachherImages1 = normalized.map((img) => ({ ...img }));
    } else if (photoIndex === 1) {
      prepopulatedKey = 'prepopulatedNachherImages2';
      this.syncPrepopulatedOrder(normalized, prepopulatedKey);
      this.nachherImages2 = normalized.filter((img) => !!img.file).map((img) => ({ ...img }));
      this.checkForReplacedImages(normalized, this.prepopulatedNachherImages2);
      
      // Update prepopulated array to include new files so they display immediately
      this.prepopulatedNachherImages2 = normalized.map((img) => ({ ...img }));
    } else if (photoIndex === 2) {
      prepopulatedKey = 'prepopulatedNachherImages3';
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
    
    if (event.fileId) {
      this.filesToDelete.push(event.fileId);
      
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
      
      delete this.replacedImages[event.fileId];
    }
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

  onVorherImages1FileDeleted(event: { fileId: number; index: number }): void {
    if (event.fileId) {
      this.filesToDelete.push(event.fileId);
      // Remove from prepopulated images
      this.prepopulatedVorherImages1 = this.prepopulatedVorherImages1.filter((img) => img.fileId !== event.fileId);
    }
    console.log('File deleted from vorher images 1:', event);
  }

  onNachherImages1FileDeleted(event: { fileId: number; index: number }): void {
    if (event.fileId) {
      this.filesToDelete.push(event.fileId);
      this.prepopulatedNachherImages1 = this.prepopulatedNachherImages1.filter((img) => img.fileId !== event.fileId);
    }
    console.log('File deleted from nachher images 1:', event);
  }

  onNachherImages2FileDeleted(event: { fileId: number; index: number }): void {
    if (event.fileId) {
      this.filesToDelete.push(event.fileId);
      this.prepopulatedNachherImages2 = this.prepopulatedNachherImages2.filter((img) => img.fileId !== event.fileId);
    }
    console.log('File deleted from nachher images 2:', event);
  }

  onVorherImages3FileDeleted(event: { fileId: number; index: number }): void {
    if (event.fileId) {
      this.filesToDelete.push(event.fileId);
      this.prepopulatedVorherImages3 = this.prepopulatedVorherImages3.filter((img) => img.fileId !== event.fileId);
    }
    console.log('File deleted from vorher images 3:', event);
  }

  onNachherImages3FileDeleted(event: { fileId: number; index: number }): void {
    if (event.fileId) {
      this.filesToDelete.push(event.fileId);
      this.prepopulatedNachherImages3 = this.prepopulatedNachherImages3.filter((img) => img.fileId !== event.fileId);
    }
    console.log('File deleted from nachher images 3:', event);
  }

  onBeforeAfterCrossDrop(photoIndex: number, photo: any, payload: { event: CdkDragDrop<ImageItem[]>; listType: 'before' | 'after' | 'single'; dropListId: string }): void {
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

    // Check if there's an item at the target position
    const hasTargetItem = event.container.data.length > event.currentIndex && event.container.data[event.currentIndex];
    const targetItem = hasTargetItem ? event.container.data[event.currentIndex] : null;
    const targetLabel = targetItem?.label;

    // Transfer the image item (this moves the entire ImageItem including its label)
    transferArrayItem(event.previousContainer.data, event.container.data, event.previousIndex, event.currentIndex);

    const targetType: 'before' | 'after' = event.container.id.includes('vorher-list-') ? 'before' : 'after';
    const movedItem = event.container.data[event.currentIndex];
    if (movedItem) {
      // Always set the label, even if undefined (to preserve the original label)
      movedItem.label = sourceLabel;
      movedItem.beforeAfterType = targetType;
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
      }
    }

    const beforeData = event.container.id.includes('vorher-list-') ? event.container.data : event.previousContainer.id.includes('vorher-list-') ? event.previousContainer.data : undefined;

    const afterData = event.container.id.includes('nachher-list-') ? event.container.data : event.previousContainer.id.includes('nachher-list-') ? event.previousContainer.data : undefined;

    this.rebuildBeforeAfterCollections(photoIndex, beforeData, afterData);
  }

  private rebuildBeforeAfterCollections(photoIndex: number, beforeData?: ImageItem[], afterData?: ImageItem[]): void {
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

      // Only update items that have fileId (existing uploaded images)
      this.syncPrepopulatedOrder(normalizedBefore, beforeConfig.preKey);
      
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

      // Only update items that have fileId (existing uploaded images)
      this.syncPrepopulatedOrder(normalizedAfter, afterConfig.preKey);
      
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
          updates.push({
            uploadedPhotoId: img.fileId,
            advancedPhotoId,
            beforeAfterType,
            label: img.label,
            order: typeof (img as any).order === 'number' ? (img as any).order : index,
          });
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

  // Helper method to determine if status should show as "UngeprüfT"
  isStatusOpen(): boolean {
    if (!this.report?.status?.name) return true;
    const statusName = this.report.status.name;
    return !['Prüfen', 'Im Prüfen', 'Ok'].includes(statusName);
  }

  // Helper method to determine if report is closed (cannot be changed)
  isReportClosed(): boolean {
    if (!this.report?.status?.name) return false;
    const statusName = this.report.status.name;
    return ['Prüfen', 'Im Prüfen', 'Ok'].includes(statusName);
  }

  // Helper method to determine if current user can approve the report
  canUserApprove(): boolean {
    if (!this.report?.status?.name) return false;
    const statusName = this.report.status.name;

    // For Merchandiser UI, check if report is in a state where Merchandiser can approve
    // Merchandiser can approve reports that are DUE, FINISHED, or similar "ready for approval" statuses
    return ['Fällig', 'FINISHED', 'Prüfen', 'DUE'].includes(statusName);
  }

  showStatusConfirmation(status: string): void {
    // Prevent any status changes if report is already closed
    if (this.isReportClosed()) {
      this.toast.warning('Dieser Bericht ist bereits geschlossen und kann nicht mehr geändert werden', {
        position: 'bottom-right',
        duration: 3000,
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
      this.toast.warning('Dieser Bericht ist bereits geschlossen und kann nicht mehr geändert werden', {
        position: 'bottom-right',
        duration: 3000,
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
            this.toast.warning('Dieser Bericht ist bereits geschlossen', {
              position: 'bottom-right',
              duration: 3000,
            });
          } else if (error.error?.message?.includes('can only close reports')) {
            this.toast.warning('Sie können diesen Bericht noch nicht genehmigen. Warten Sie auf die vorherige Genehmigung.', {
              position: 'bottom-right',
              duration: 4000,
            });
          } else {
            this.toast.error('Fehler beim Aktualisieren des Status', {
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
            this.toast.success('Bericht erfolgreich geschlossen', {
              position: 'bottom-right',
              duration: 2000,
            });
          }
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
        // Get the corresponding image arrays based on photo index
        let vorherImages: ImageItem[] = [];
        let nachherImages: ImageItem[] = [];

        // Map photo index to the correct image arrays
        if (photoIndex === 0) {
          vorherImages = this.vorherImages1;
          nachherImages = this.nachherImages1;
        } else if (photoIndex === 1) {
          nachherImages = this.nachherImages2;
        } else if (photoIndex === 2) {
          vorherImages = this.vorherImages3;
          nachherImages = this.nachherImages3;
        }

        // Add vorher images if this photo has before/after
        if (advancedPhoto.isBeforeAfter && vorherImages.length > 0) {
          vorherImages.forEach((img, imgIndex) => {
            if (img.file) {
              allFiles.push({
                file: img.file,
                label: img.label || `Vorher ${photoIndex + 1}`,
                advancedPhotoId: advancedPhoto.id,
                fileName: img.fileName,
                beforeAfterType: 'before',
                order: imgIndex,
              });
            }
          });
        }

        // Add nachher images
        if (nachherImages.length > 0) {
          nachherImages.forEach((img, imgIndex) => {
            if (img.file) {
              allFiles.push({
                file: img.file,
                label: img.label || `Nachher ${photoIndex + 1}`,
                advancedPhotoId: advancedPhoto.id,
                fileName: img.fileName,
                beforeAfterType: 'after',
                order: imgIndex,
              });
            }
          });
        }
      });
    }

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

    // Prepare answers for saving
    const answers = this.prepareAnswersForSave();

    const photoOrderUpdates = this.buildPhotoOrderUpdates();

    // Prepare the complete payload for submission (without files)
    const payload = {
      visitDate: this.report.visitDate,
      answers: answers,
      status: this.report.status,
      filesToDelete: this.filesToDelete,
    };

    if (photoOrderUpdates.length > 0) {
      (payload as any).photoOrderUpdates = photoOrderUpdates;
    }

    // First save the report, then approve it
    this.reportService.updateReportWithFiles(this.reportId, payload, allFiles).subscribe({
      next: () => {
        // After saving, approve the report (change status to Freigegeben)
        this.reportService.closeReport(this.reportId)
          .pipe(
            catchError((error) => {
              console.error('❌ Error approving report:', error);
              this.saving = false;
              this.toast.error('Fehler beim Freigeben des Reports.', {
                position: 'bottom-right',
                duration: 4000,
              });
              return of(null);
            })
          )
          .subscribe({
            next: () => {
              this.saving = false;
              this.filesToDelete = [];
              this.replacedImages = {};

              this.toast.success('Report erfolgreich gespeichert und freigegeben!', {
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
        this.toast.error('Fehler beim Speichern des Reports. Bitte versuchen Sie es erneut.', {
          position: 'bottom-right',
          duration: 4000,
        });
      },
    });
  }

  cancelConfirmApprove(): void {
    this.showConfirmApproveDialog = false;
  }
}
