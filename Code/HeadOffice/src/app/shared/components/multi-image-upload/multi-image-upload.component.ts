import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CdkDragDrop, DragDropModule, moveItemInArray, transferArrayItem } from '@angular/cdk/drag-drop';

export interface ImageItem {
  id: number;
  file?: File;
  preview?: string;
  fileName: string;
  label?: string;
  isImage?: boolean; // New field to track if file is an image
  fileId?: number; // Add fileId for backend-stored files
  beforeAfterType?: 'before' | 'after';
  order?: number;
}

@Component({
  selector: 'app-multi-image-upload',
  templateUrl: './multi-image-upload.component.html',
  standalone: true,
  imports: [CommonModule, FormsModule, DragDropModule], // Drag & Drop support enabled
})
export class MultiImageUploadComponent implements OnInit, OnChanges {
  @Input() count: number = 1;
  @Input() label: string = '';
  @Input() containerWidth: string = 'w-[416px]';
  @Input() containerHeight: string = 'h-auto';
  @Input() imageLabels: string[] = [];
  @Input() acceptFileTypes: string = 'image/*'; // New input property with default value
  @Input() prePopulatedImages: ImageItem[] = []; // New input for pre-populated images
  @Input() dropListId: string = '';
  @Input() connectedDropLists: string[] = [];
  @Input() listType: 'before' | 'after' | 'single' = 'single';

  @Output() imagesChanged = new EventEmitter<ImageItem[]>();
  @Output() fileDeleted = new EventEmitter<{ fileId: number; index: number }>();
  @Output() crossListDropped = new EventEmitter<{
    event: CdkDragDrop<ImageItem[]>;
    listType: 'before' | 'after' | 'single';
    dropListId: string;
  }>();

  imageRows: ImageItem[] = [];
  private baseLabels: string[] = [];

  ngOnInit() {
    this.captureBaseLabels();
    this.initializeImageRows();
    this.applyLabelsToRows(false);
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['imageLabels']) {
      this.captureBaseLabels();
    }
    // Re-initialize when prePopulatedImages changes
    if (changes['prePopulatedImages'] && !changes['prePopulatedImages'].isFirstChange()) {
      this.initializeImageRows();
    }
  }

  private initializeImageRows() {
    // Initialize the requested number of image rows
    if (this.prePopulatedImages && this.prePopulatedImages.length > 0) {
      // Use pre-populated images if available
      this.imageRows = [];

      const sortedPrepopulated = [...this.prePopulatedImages].sort((a, b) => {
        const orderA = typeof a.order === 'number' ? a.order : 0;
        const orderB = typeof b.order === 'number' ? b.order : 0;
        return orderA - orderB;
      });

      // Add pre-populated images first
      sortedPrepopulated.forEach((image, i) => {
        if (i < this.count) {
          // ALWAYS use the label from the image if it exists (from database)
          // Only fall back to imageLabels[i] if the image has no label
          // This ensures labels persist with their images across reloads and drag operations
          const labelToUse = image.label 
            || (this.imageLabels && this.imageLabels.length > i ? this.imageLabels[i] : `Bezeichnung ${i + 1}`);
          
          this.imageRows.push({
            ...image,
            label: labelToUse,
            order: i,
          });
        }
      });

      // Fill remaining slots with empty rows
      while (this.imageRows.length < this.count) {
        const index = this.imageRows.length;
        this.imageRows.push({
          id: index,
          fileName: '',
          preview: null,
          label: this.imageLabels && this.imageLabels.length > index ? this.imageLabels[index] : `Bezeichnung ${index + 1}`,
          order: index,
        });
      }
    } else {
      // Initialize empty rows as before
      this.imageRows = Array(this.count)
        .fill(null)
        .map((_, i) => ({
          id: i,
          fileName: '',
          preview: null,
          label: this.imageLabels && this.imageLabels.length > i ? this.imageLabels[i] : `Bezeichnung ${i + 1}`,
          order: i,
        }));
    }
  }

  private captureBaseLabels(): void {
    this.baseLabels = Array.isArray(this.imageLabels) ? [...this.imageLabels] : [];
  }

  private applyLabelsToRows(emitChange: boolean): void {
    // This method is now only used for initial setup, not for drag and drop
    // During drag and drop, labels are preserved with their images
    if (!this.baseLabels.length && Array.isArray(this.imageLabels) && this.imageLabels.length) {
      this.baseLabels = [...this.imageLabels];
    }

    this.imageRows.forEach((row, index) => {
      // Only assign labels during initial setup or if the row has no label
      if (!row.label) {
        const newLabel = this.baseLabels[index] ?? `Bezeichnung ${index + 1}`;
      row.label = newLabel;
      }
      row.order = index;
    });

    if (emitChange) {
      this.emitChange();
    }
  }

  onFileChange(event: any, index: number): void {
    const file = event.target.files[0];
    if (file) {
      const isImage = file.type.startsWith('image/');

      // Update the specific row with the selected file
      const reader = new FileReader();
      reader.onload = () => {
        this.imageRows[index] = {
          ...this.imageRows[index],
          file: file,
          preview: isImage ? (reader.result as string) : null,
          fileName: file.name,
          isImage: isImage,
          order: index,
        };
        this.emitChange();
      };

      if (isImage) {
        reader.readAsDataURL(file);
      } else {
        // For non-image files, just emit the change without preview
        this.imageRows[index] = {
          ...this.imageRows[index],
          file: file,
          preview: null,
          fileName: file.name,
          isImage: false,
          order: index,
        };
        this.emitChange();
      }
    }
  }

  removeImage(index: number): void {
    const currentRow = this.imageRows[index];

    // If this is a pre-populated file with fileId, emit delete event
    if (currentRow.fileId) {
      this.fileDeleted.emit({ fileId: currentRow.fileId, index });
      return; // Don't clear the row immediately, let parent handle it
    }

    // For new files that haven't been uploaded, just clear them
    const currentLabel = this.imageRows[index].label;
    this.imageRows[index] = {
      ...this.imageRows[index],
      file: undefined,
      preview: null,
      fileName: '',
      label: currentLabel,
      isImage: undefined,
      fileId: undefined,
    };

    this.emitChange();
  }

  /**
   * Clear a specific image row (used after successful deletion)
   */
  clearImageRow(index: number): void {
    const currentLabel = this.imageRows[index].label;
    this.imageRows[index] = {
      ...this.imageRows[index],
      file: undefined,
      preview: null,
      fileName: '',
      label: currentLabel,
      isImage: undefined,
      fileId: undefined,
    };

    this.emitChange();
  }

  onDrop(event: CdkDragDrop<ImageItem[]>) {
    if (event.previousContainer === event.container) {
      // Store the labels before moving to preserve them with their images
      const labelsBeforeMove = this.imageRows.map(row => row.label);
      
      // Move the item
      moveItemInArray(this.imageRows, event.previousIndex, event.currentIndex);
      
      // Restore labels - the label should move WITH the image, not stay at the position
      const movedLabel = labelsBeforeMove[event.previousIndex];
      
      // If moving forward (to higher index), items between previousIndex and currentIndex shift down
      // If moving backward (to lower index), items between currentIndex and previousIndex shift up
      if (event.previousIndex < event.currentIndex) {
        // Moving forward: items shift down
        for (let i = event.previousIndex; i < event.currentIndex; i++) {
          this.imageRows[i].label = labelsBeforeMove[i + 1];
        }
        this.imageRows[event.currentIndex].label = movedLabel;
      } else if (event.previousIndex > event.currentIndex) {
        // Moving backward: items shift up
        for (let i = event.previousIndex; i > event.currentIndex; i--) {
          this.imageRows[i].label = labelsBeforeMove[i - 1];
        }
        this.imageRows[event.currentIndex].label = movedLabel;
      }
      
      // Update order property
      this.imageRows.forEach((row, index) => {
        row.order = index;
      });
      
      console.log('📦 After internal drag, labels:', this.imageRows.map(r => ({ label: r.label, fileId: r.fileId })));
      
      this.emitChange();
    } else {
      this.crossListDropped.emit({ event, listType: this.listType, dropListId: this.dropListId });
    }
  }

  private emitChange(): void {
    // Emit all non-empty image rows (either with actual files or pre-populated files)
    this.imagesChanged.emit(this.imageRows.filter((row) => row.file || row.fileName));
  }
}
