import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { ApiService } from '@app/core/services/api.service';
import { MerchandiserFileType } from '@app/auth/enums';

export interface MerchandiserLanguage {
  id?: number;
  merchandiserId?: number;
  languageId: number;
  levelId: number;
  language?: {
    id: number;
    name: string;
    code: string;
  };
  level?: {
    id: number;
    name: string;
    code: string;
  };
}

export interface MerchandiserReference {
  id?: number;
  merchandiserId?: number;
  company: string;
  activity: string; // Now just a plain string instead of dropdown value
  industry: string; // Now just a plain string instead of dropdown value
  fromDate?: string;
  toDate?: string;
}

export interface MerchandiserEducation {
  id?: number;
  merchandiserId?: number;
  institution: string;
  qualification: string;
  graduationDate?: string;
}

export interface MerchandiserSpecialization {
  id?: number;
  merchandiserId?: number;
  specializationTypeId: number;
  specializationType?: {
    id: number;
    name: string;
    category: string;
  };
}

export interface MerchandiserFile {
  id?: number;
  merchandiserId?: number;
  fileName: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  fileType: MerchandiserFileType;
  filePath: string;
}

export interface ProfileInitialData {
  profile?: any;
  countries: any[];
  cities: any[];
  languages: any[];
  languageLevels: any[];
  jobTypes: any[];
  specializations: any[];
  industryTypes: any[];
  genderOptions: any[];
}

export interface ProfileUpdateRequest {
  // Personal Information
  gender?: string;
  firstName: string;
  lastName: string;
  birthDate?: string;
  email: string;
  phoneNumber?: string;
  website?: string;
  postalCode?: string;
  city?: string;
  countryId?: number; // For API compatibility
  cityId?: number; // Add cityId for backend
  nationality?: string;

  // Languages
  languages?: MerchandiserLanguage[];

  // Specializations (renamed from qualifications)
  specializations?: MerchandiserSpecialization[];

  // References
  references?: MerchandiserReference[];

  // Education
  education?: MerchandiserEducation[];

  // Job Types (renamed from customers)
  jobTypes?: number[];

  // Password (optional)
  password?: string;
  confirmPassword?: string;

  // Files
  files?: MerchandiserFile[];
}

export interface ProfileUpdateResponse {
  success: boolean;
  message: string;
  data?: any;
}

export interface FileUploadResponse {
  success: boolean;
  fileUrl: string;
  fileName: string;
  fileId: number;
}

@Injectable({
  providedIn: 'root',
})
export class ProfileService {
  private readonly profileEndpoint = 'merchandiser/me';
  private readonly fileUploadEndpoint = 'merchandiser-files/upload';
  private readonly profileInitialDataEndpoint = 'merchandiser/profile/me';

  constructor(private apiService: ApiService) {}

  /**
   * Get profile initial data (profile + all dropdown options)
   */
  getProfileWithInitialData(): Observable<ProfileInitialData> {
    return this.apiService.get<ProfileInitialData>(this.profileInitialDataEndpoint);
  }

  /**
   * Update user profile
   */
  updateProfile(profileData: ProfileUpdateRequest): Observable<ProfileUpdateResponse> {
    return this.apiService.put<ProfileUpdateResponse>(this.profileEndpoint, profileData);
  }

  /**
   * Upload profile files
   */
  uploadFile(file: File, fileType: MerchandiserFileType): Observable<FileUploadResponse> {
    console.log('=== Starting file upload ===');
    console.log('File details:', {
      name: file.name,
      size: file.size,
      type: file.type,
      lastModified: file.lastModified,
    });
    console.log('FileType:', fileType);
    console.log('Upload endpoint:', this.fileUploadEndpoint);

    const formData = new FormData();

    // Use field names that match the backend controller expectations
    switch (fileType) {
      case MerchandiserFileType.PORTRAIT:
        formData.append('portrait', file);
        break;
      case MerchandiserFileType.FULL_BODY_SHOT:
        formData.append('full_body_shot', file);
        break;
      case MerchandiserFileType.RESUME:
        formData.append('resume', file);
        break;
      case MerchandiserFileType.ADDITIONAL_ATTACHMENTS:
        formData.append('additional_attachments', file);
        break;
      default:
        formData.append('file', file);
        break;
    }

    // Log FormData contents for debugging
    console.log('FormData contents:');
    formData.forEach((value, key) => {
      if (value instanceof File) {
        console.log(`${key}: [File] ${value.name} (${value.size} bytes, ${value.type})`);
      } else {
        console.log(`${key}: ${value}`);
      }
    });

    console.log('Making API call...');

    return this.apiService
      .postFile<FileUploadResponse>(
        this.fileUploadEndpoint,
        formData,
        false, // Don't skip auth - our postFile method will handle Authorization
        false, // Don't skip API prefix - we need the full URL with environment.apiUrl
      )
      .pipe(
        tap((response) => {
          console.log('✅ File upload successful:', response);
        }),
        catchError((error) => {
          console.error('❌ File upload failed:', error);
          console.error('Error details:', {
            status: error.status,
            message: error.message,
            data: error.data,
            fullError: error,
          });
          throw error;
        }),
      );
  }

  /**
   * Upload profile files (fallback method with simple structure)
   */
  uploadFileSimple(file: File, fileType: MerchandiserFileType): Observable<FileUploadResponse> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('fileType', fileType);

    console.log('Uploading file (simple method):', {
      fileName: file.name,
      fileSize: file.size,
      fileType: fileType,
      mimeType: file.type,
    });

    return this.apiService.postFile<FileUploadResponse>(
      this.fileUploadEndpoint,
      formData,
      false, // Don't skip auth
      false, // Don't skip API prefix
    );
  }

  /**
   * Upload all profile files in a single request
   */
  uploadAllFiles(files: Array<{ file: File; fileType: MerchandiserFileType }>): Observable<FileUploadResponse> {
    console.log('=== Starting batch file upload ===');
    console.log(
      'Files to upload:',
      files.map((f) => ({
        name: f.file.name,
        type: f.fileType,
        size: f.file.size,
      })),
    );

    const formData = new FormData();

    // Use field names that match the backend controller expectations
    files.forEach((fileData) => {
      switch (fileData.fileType) {
        case MerchandiserFileType.PORTRAIT:
          formData.append('portrait', fileData.file);
          break;
        case MerchandiserFileType.FULL_BODY_SHOT:
          formData.append('full_body_shot', fileData.file);
          break;
        case MerchandiserFileType.RESUME:
          formData.append('resume', fileData.file);
          break;
        case MerchandiserFileType.ADDITIONAL_ATTACHMENTS:
          formData.append('additional_attachments', fileData.file);
          break;
        default:
          formData.append('files', fileData.file);
          break;
      }
    });

    // Log FormData contents for debugging
    console.log('FormData contents:');
    formData.forEach((value, key) => {
      if (value instanceof File) {
        console.log(`  ${key}: [File] ${value.name} (${value.size} bytes)`);
      } else {
        console.log(`  ${key}: ${value}`);
      }
    });

    console.log('Making batch API call...');

    return this.apiService
      .postFile<FileUploadResponse>(
        this.fileUploadEndpoint,
        formData,
        false, // Don't skip auth
        false, // Don't skip API prefix - we need the full URL with environment.apiUrl
      )
      .pipe(
        tap((response) => {
          console.log('✅ Batch file upload successful:', response);
        }),
        catchError((error) => {
          console.error('❌ Batch file upload failed:', error);
          throw error;
        }),
      );
  }

  /**
   * Upload multiple files (legacy method - use uploadAllFiles instead)
   */
  uploadMultipleFiles(files: Array<{ file: File; fileType: string }>): Observable<FileUploadResponse[]> {
    const formData = new FormData();

    files.forEach((fileData, index) => {
      formData.append(`files`, fileData.file);
      formData.append(`fileTypes`, fileData.fileType);
    });

    return this.apiService.post<FileUploadResponse[]>(`${this.fileUploadEndpoint}/multiple`, formData);
  }

  /**
   * Get current user profile (legacy method - use getProfileWithInitialData instead)
   */
  getProfile(): Observable<any> {
    return this.apiService.get(this.profileEndpoint);
  }

  /**
   * Get available languages (legacy method - use getProfileWithInitialData instead)
   */
  getLanguages(): Observable<any[]> {
    return this.apiService.get('languages');
  }

  /**
   * Get available countries (legacy method - use getProfileWithInitialData instead)
   */
  getCountries(): Observable<any[]> {
    return this.apiService.get('countries');
  }

  /**
   * Get available job types (legacy method - use getProfileWithInitialData instead)
   */
  getJobTypes(): Observable<any[]> {
    return this.apiService.get('job-types');
  }

  /**
   * Delete profile file for current user
   */
  deleteFile(fileId: number): Observable<any> {
    return this.apiService.delete(`merchandiser-files/me/${fileId}`);
  }
}
