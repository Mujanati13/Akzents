import { Component, OnInit, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormArray, FormControl, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterModule, ActivatedRoute } from '@angular/router';

// Import PrimeNG components
import { AccordionModule } from 'primeng/accordion';
import { ButtonModule } from 'primeng/button';
import { CalendarModule } from 'primeng/calendar';
import { DialogModule } from 'primeng/dialog';
import { DropdownModule } from 'primeng/dropdown';
import { InputSwitchModule } from 'primeng/inputswitch';
import { InputTextModule } from 'primeng/inputtext';
import { RadioButtonModule } from 'primeng/radiobutton';
import { FloatLabelModule } from 'primeng/floatlabel';
import { Location } from '@angular/common';

// Import shared components
import { AppIconComponent } from '@app/shared/app-icon.component';
import { ImportsModule } from '@app/shared/imports';
import { DateRangePickerComponent } from '../../../shared/components/date-range-picker/date-range-picker.component';

// Import services
import { ClientCompanyService } from '@app/core/services/client-company.service';
import { User } from '@app/pages/users/services/users.service';
import { finalize } from 'rxjs';
import { ProjectService } from '@app/core/services/project.service';
// Add Excel generation capability with styling support
import * as XLSX from 'xlsx-js-style';

export enum AnswerTypeEnum {
  TEXT = 1,
  SELECT = 2,
  MULTISELECT = 3,
  BOOLEAN = 4,
}

@Component({
  selector: 'app-project-create',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    AccordionModule,
    ButtonModule,
    CalendarModule,
    DropdownModule,
    RouterModule,
    InputSwitchModule,
    InputTextModule,
    RadioButtonModule,
    FloatLabelModule,
    AppIconComponent,
    ImportsModule,
    DateRangePickerComponent,
  ],
  templateUrl: './project-create.component.html',
  styleUrl: './project-create.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export class ProjectCreateComponent implements OnInit {
  projectForm: FormGroup;
  newContactForm: FormGroup;
  contactDialogVisible = false;
  isSubmitting = false;
  isLoading = true;
  dateRange2 = { start: null, end: null };

  // User data from API
  clientUsers: User[] = [];
  akzenteUsers: User[] = [];

  // For autocomplete
  filteredClientContacts: string[] = [];
  filteredSalesContacts: string[] = [];
  allClientContacts: string[] = [];
  allSalesContacts: string[] = [];

  // Selected values
  clientContactValue: string[] = [];
  salesContactValue: string[] = [];

  // Store user IDs for relationships
  selectedClientUserIds: number[] = [];
  selectedSalesUserIds: number[] = [];

  answerTypes = [
    { label: 'Text', value: AnswerTypeEnum.TEXT },
    { label: 'Mehrfachauswahl', value: AnswerTypeEnum.MULTISELECT },
    { label: 'Einzelauswahl', value: AnswerTypeEnum.SELECT },
    { label: 'Ja/Nein', value: AnswerTypeEnum.BOOLEAN },
  ];

  selectedClient: string;
  clientId: number | null = null;
  clientCompanyName: string = '';

  successModalVisible: boolean = false;
  projectName: string = '';

  // Accordion active value - set all panels open by default (PrimeNG v19 uses value instead of activeIndex)
  activeAccordionValue: string[] = ['0', '1', '2', '3'];

  AnswerTypeEnum = AnswerTypeEnum;

  constructor(
    private fb: FormBuilder,
    private _location: Location,
    private route: ActivatedRoute,
    private router: Router,
    private clientCompanyService: ClientCompanyService,
    private projectService: ProjectService,
  ) {}

  ngOnInit(): void {
    this.initForms();
    this.loadData();
  }

  private loadData(): void {
    // Get client ID from route parameters
    this.route.params.subscribe((params) => {
      // Convert slug to ID if needed, or get ID from another parameter
      this.clientId = Number(params['clientId']) || Number(this.selectedClient);
      if (this.clientId) {
        this.loadUsersForClient();
      }
    });
  }

  private loadUsersForClient(): void {
    this.isLoading = true;

    // Use the same endpoint as client-edit to get users
    this.clientCompanyService
      .getClientCompanyWithRelationships(this.clientId!)
      .pipe(
        finalize(() => {
          this.isLoading = false;
        }),
      )
      .subscribe({
        next: (result) => {
          console.log('✅ Users loaded for project:', result);

          // Store client company name
          this.clientCompanyName = result.clientCompany?.name || '';

          // Extract the actual arrays from the data property
          const rawClientUsers: User[] = (result.allUsers?.clientUsers?.data || []) as User[];
          const rawAkzenteUsers: any[] = (result.allUsers?.akzenteUsers?.data || []) as any[];

          // Keep only users assigned to this client
          this.clientUsers = rawClientUsers.filter((u) => Array.isArray(u.clientCompanies) && u.clientCompanies.some((c) => c.id === this.clientId));

          // Keep only Akzente users who are sales AND assigned to this client
          this.akzenteUsers = rawAkzenteUsers.filter((u) => {
            const assignedToClient = Array.isArray(u.clientCompanies) && u.clientCompanies.some((c: any) => c.id === this.clientId);
            const isSales = u.isSales === true || u.akzenteProfile?.isSales === true;
            return assignedToClient && isSales;
          });

          // Create contact options
          this.allClientContacts = this.clientUsers.map((user) => `${user.firstName} ${user.lastName}`.trim());
          this.allSalesContacts = this.akzenteUsers.map((user: any) => `${user.firstName} ${user.lastName}`.trim());

          console.log('✅ Users processed:', {
            clientCompanyName: this.clientCompanyName,
            clientUsers: this.clientUsers.length,
            akzenteUsers: this.akzenteUsers.length,
            allClientContacts: this.allClientContacts,
            allSalesContacts: this.allSalesContacts,
          });
        },
        error: (error) => {
          console.error('❌ Error loading users:', error);
        },
      });
  }

  initForms(): void {
    this.projectForm = this.fb.group({
      projectName: ['', Validators.required],
      startDate: [null, Validators.required],
      endDate: [null, Validators.required],
      questions: this.fb.array([this.createQuestionGroup()]),
      photosVisibleInReport: [true],
      photoStyle: ['after'],
      extendedPhotosVisibleInReport: [true],
      extendedPhotoStyle: ['after'],
      photoSections: this.fb.array([this.createPhotoSectionGroup()]),
    });

    this.newContactForm = this.fb.group({
      newContactName: ['', Validators.required],
      newContactEmail: ['', [Validators.email]],
      newContactPhone: [''],
      newContactType: [null, Validators.required],
    });
  }

  createQuestionGroup(): FormGroup {
    return this.fb.group({
      text: [''],
      answerType: [null],
      required: [true],
      visibleToClient: [true],
      options: this.fb.array([]), // Add options FormArray
    });
  }

  createPhotoSectionGroup(): FormGroup {
    return this.fb.group({
      photoType: ['after'],
      descriptions: this.fb.array([this.fb.control('')]),
    });
  }

  onRangeSelected(range: { start: Date | null; end: Date | null }) {
    this.projectForm.patchValue({
      startDate: range.start,
      endDate: range.end,
    });
    console.log('Selected range:', range);
  }

  get questions(): FormArray {
    return this.projectForm.get('questions') as FormArray;
  }

  get photoSections(): FormArray {
    return this.projectForm.get('photoSections') as FormArray;
  }

  getPhotoTypeControl(index: number): FormControl {
    return (this.photoSections.at(index) as FormGroup).get('photoType') as FormControl;
  }

  getDescriptionControls(sectionIndex: number): FormControl[] {
    const descriptionsArray = (this.photoSections.at(sectionIndex) as FormGroup).get('descriptions') as FormArray;
    return descriptionsArray.controls as FormControl[];
  }

  addQuestion(): void {
    this.questions.push(this.createQuestionGroup());
  }

  removeQuestion(index: number): void {
    this.questions.removeAt(index);
  }

  addPhotoSection(): void {
    this.photoSections.push(this.createPhotoSectionGroup());
  }

  addDescription(sectionIndex: number): void {
    const descriptionsArray = (this.photoSections.at(sectionIndex) as FormGroup).get('descriptions') as FormArray;
    descriptionsArray.push(this.fb.control(''));
  }

  /**
   * Removes a photo section at the specified index
   */
  removePhotoSection(index: number): void {
    this.photoSections.removeAt(index);
  }

  /**
   * Removes a description at the specified index within a photo section
   * @param sectionIndex Index of the photo section
   * @param descriptionIndex Index of the description to remove
   */
  removeDescription(sectionIndex: number, descriptionIndex: number): void {
    // Get the photo section
    const section = this.photoSections.at(sectionIndex) as FormGroup;

    // Get descriptions FormArray
    const descriptions = section.get('descriptions') as FormArray;

    // Remove the description at the specified index
    descriptions.removeAt(descriptionIndex);
  }

  showNewContactDialog(type: 'client' | 'sales'): void {
    this.newContactForm.get('newContactType')?.setValue(type);
    this.contactDialogVisible = true;
  }

  addNewContact(): void {
    if (this.newContactForm.valid) {
      const newContactName = this.newContactForm.value.newContactName;

      if (this.newContactForm.value.newContactType === 'client') {
        // Add to client contacts
        this.allClientContacts.push(newContactName);
        this.clientContactValue = [...this.clientContactValue, newContactName];
      } else {
        // Add to sales contacts
        this.allSalesContacts.push(newContactName);
        this.salesContactValue = [...this.salesContactValue, newContactName];
      }

      this.contactDialogVisible = false;
      this.newContactForm.reset();
    }
  }

  searchClientContacts(event: any): void {
    const query = event.query.toLowerCase();
    this.filteredClientContacts = this.allClientContacts.filter((contact) => contact.toLowerCase().includes(query));
  }

  searchSalesContacts(event: any): void {
    const query = event.query.toLowerCase();
    this.filteredSalesContacts = this.allSalesContacts.filter((contact) => contact.toLowerCase().includes(query));
  }

  onClientContactsChanged(): void {
    // Update the selected user IDs based on contact names
    this.selectedClientUserIds = this.clientContactValue
      .map((contactName) => {
        const user = this.clientUsers.find((user) => `${user.firstName} ${user.lastName}`.trim() === contactName);
        return user ? user.id : null;
      })
      .filter((id) => id !== null);

    console.log('📝 Client contacts changed:', {
      contactNames: this.clientContactValue,
      contactIds: this.selectedClientUserIds,
    });
  }

  onSalesContactsChanged(): void {
    // Update the selected user IDs based on contact names
    this.selectedSalesUserIds = this.salesContactValue
      .map((contactName) => {
        const user = this.akzenteUsers.find((user) => `${user.firstName} ${user.lastName}`.trim() === contactName);
        return user ? user.id : null;
      })
      .filter((id) => id !== null);

    console.log('📝 Sales contacts changed:', {
      contactNames: this.salesContactValue,
      contactIds: this.selectedSalesUserIds,
    });
  }

  onSubmit(): void {
    console.log('Form submitted!');
    console.log('Form value:', this.projectForm.value);
    console.log('Form valid:', this.projectForm.valid);
    if (this.projectForm.valid) {
      this.isSubmitting = true;

      // Save project name for Excel download
      this.projectName = this.projectForm.get('projectName')?.value || 'Project';

      const payload = {
        name: this.projectForm.value.projectName,
        startDate: this.projectForm.value.startDate,
        endDate: this.projectForm.value.endDate,
        clientCompany: { id: this.clientId! },
        clientContactIds: this.selectedClientUserIds,
        salesContactIds: this.selectedSalesUserIds,
        questions: Array.from(this.questions.controls).map((q) => ({
          questionText: q.get('text')?.value,
          answerType: { id: q.get('answerType')?.value },
          isRequired: q.get('required')?.value,
          isVisibleToClient: q.get('visibleToClient')?.value,
          options: (q.get('options')?.value || []).map((o: any, index: number) => ({
            optionText: o.text || o,
            order: index,
          })),
        })),
        photos: Array.from(this.photoSections.controls).map((p, index) => ({
          isVisibleInReport: true, // or your logic
          order: index,
          isBeforeAfter: p.get('photoType')?.value === 'before-after',
        })),
        advancedPhotos: Array.from(this.photoSections.controls).map((p, index) => ({
          labels: (p.get('descriptions')?.value || []).filter((label: string) => label && label.trim() !== ''),
          isVisibleInReport: true, // or your logic
          isBeforeAfter: p.get('photoType')?.value === 'before-after',
        })),
      };

      // Now send `payload` to your ProjectService
      this.projectService.createProject(payload).subscribe({
        next: (response) => {
          console.log('✅ Project created successfully:', response);
          this.projectResponse = response; // Store the response for Excel generation
          this.isSubmitting = false;
          this.successModalVisible = true;
          this.downloadExcel(response); // Pass the response to downloadExcel
        },
        error: (error) => {
          console.error('❌ Error creating project:', error);
          this.isSubmitting = false;
          // Optionally, display an error message to the user
        },
      });
    } else {
      // Mark all fields as touched to display validation errors
      this.markFormGroupTouched(this.projectForm);
    }
  }

  // Helper function to mark all form controls as touched
  markFormGroupTouched(formGroup: FormGroup): void {
    Object.values(formGroup.controls).forEach((control) => {
      control.markAsTouched();

      if (control instanceof FormGroup) {
        this.markFormGroupTouched(control);
      } else if (control instanceof FormArray) {
        control.controls.forEach((c) => {
          if (c instanceof FormGroup) {
            this.markFormGroupTouched(c);
          } else {
            c.markAsTouched();
          }
        });
      }
    });
  }

  // Remove CSV download method and related logic

  // Generate styled Excel file instead of CSV
  downloadExcel(projectResponse?: any): void {
    const response = projectResponse || this.projectResponse;

    // Create workbook and worksheet
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([]);

    // Generate headers exactly like the image with proper line breaks
    const headers = [
      'FILIALNUMMER',
      'FILIALE\n(Text)',
      'STRABE +\nHAUSNUM\nMER',
      'PLZ',
      'ORT',
      'LAND',
      'TELEFON\nFILIALE\n(Text)',
      'NOTIZ\n(Text)',
      'MERCHANDISER\n(Text)',
      'BESUCHSDATUM', // plannedOn
      'Report bis', // reportTo
      'Alles nach Vorgabe?\n1. JA\n2. NEIN', // isSpecCompliant
      'Feedback\n1. JA\n2. NEIN', // feedback
    ];

    // Add question headers based on the backend response format
    if (response && response.questions) {
      response.questions.forEach((question: any, index: number) => {
        const questionNumber = index + 1;
        let questionText = question.questionText || `Frage ${questionNumber}`;
        let optionsText = '';
        const answerType = (question.answerType?.name || '').toLowerCase();

        if (answerType === 'boolean') {
          optionsText = '\n1. JA\n2. NEIN';
        } else if (answerType === 'select' || answerType === 'multiple choice' || answerType === 'multiselect') {
          if (question.options && question.options.length > 0) {
            optionsText = '\n' + question.options.map((option: any, optionIndex: number) => `${optionIndex + 1}. ${option.optionText || option.text || ''}`).join('\n');
          }
        }
        // For text, optionsText remains empty

        headers.push(`FRAGE ${questionNumber}:\n"${questionText}${optionsText}"`);
      });
    }

    // Create header row with styling - no borders, flat design
    const headerRow = headers.map((header) => ({
      v: header,
      s: {
        fill: {
          fgColor: { rgb: 'CCCCCC' },
        },
        font: {
          bold: true,
          color: { rgb: '000000' },
          sz: 10,
        },
        alignment: {
          horizontal: 'center',
          vertical: 'top',
          wrapText: true,
        },
        // No borders - flat design like the image
      },
    }));

    // Add header row to worksheet
    XLSX.utils.sheet_add_aoa(ws, [headerRow], { origin: 'A1' });

    // Set column widths based on content type
    const columnWidths = [
      12, // FILIALNUMMER
      12, // FILIALE
      15, // STRABE + HAUSNUMMER
      8, // PLZ
      12, // ORT
      12, // LAND
      15, // TELEFON
      12, // NOTIZ
      15, // MERCHANDISER
      15, // BESUCHSDATUM
      15, // Report bis
      18, // Alles nach Vorgabe?
      15, // Feedback
    ];

    // Add question column widths (wider for better readability)
    if (response && response.questions) {
      response.questions.forEach(() => {
        columnWidths.push(40); // Set width to 40 for each FRAGE column
      });
    }

    ws['!cols'] = columnWidths.map((width) => ({ width }));
    ws['!rows'] = [{ hpt: 50 }]; // Header row height for wrapped text

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(wb, ws, 'Project Template');

    // Generate filename
    const clientName = this.clientCompanyName.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '');
    const projectName = this.projectName.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '');
    const filename = `${clientName}_${projectName}.xlsx`;

    // Download the file
    XLSX.writeFile(wb, filename);

    // Close modal and navigate back
    this.successModalVisible = false;
    setTimeout(() => {
      if (this.clientId) {
        // Preserve query parameters when navigating back
        const queryParams = { ...this.route.snapshot.queryParams };
        this.router.navigate(['/clients', this.clientId], { queryParams });
      } else {
        this._location.back();
      }
    }, 500);
  }

  // Store the project response for CSV generation
  projectResponse: any = null;

  getOptionsArray(questionIndex: number): FormArray {
    return (this.questions.at(questionIndex) as FormGroup).get('options') as FormArray;
  }

  addOption(questionIndex: number): void {
    this.getOptionsArray(questionIndex).push(this.fb.control(''));
  }

  removeOption(questionIndex: number, optionIndex: number): void {
    this.getOptionsArray(questionIndex).removeAt(optionIndex);
  }

  onAnswerTypeChanged(questionIndex: number): void {
    const question = this.questions.at(questionIndex) as FormGroup;
    const answerType = question.get('answerType')?.value;
    const optionsArray = question.get('options') as FormArray;

    if ((answerType === AnswerTypeEnum.SELECT || answerType === AnswerTypeEnum.MULTISELECT) && optionsArray.length === 0) {
      optionsArray.push(this.fb.control(''));
    } else if (answerType !== AnswerTypeEnum.SELECT && answerType !== AnswerTypeEnum.MULTISELECT) {
      // Clear options if switching to a type that doesn't use them
      while (optionsArray.length) {
        optionsArray.removeAt(0);
      }
    }
  }

  // Debug method for button click
  debugButtonClick(): void {
    console.log('Button clicked!');
  }

  navigateBack(): void {
    if (this.clientId) {
      // Preserve query parameters when navigating back
      const queryParams = { ...this.route.snapshot.queryParams };
      this.router.navigate(['/clients', this.clientId], { queryParams });
    } else {
      // Fallback to browser history
      this._location.back();
    }
  }
}
