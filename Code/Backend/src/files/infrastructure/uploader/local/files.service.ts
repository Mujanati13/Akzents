import {
  HttpStatus,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { FileRepository } from '../../persistence/file.repository';
import { AllConfigType } from '../../../../config/config.type';
import { FileType } from '../../../domain/file';
import { promises as fs } from 'fs';
import path, { basename, join } from 'path';
import sharp from 'sharp';

@Injectable()
export class FilesLocalService {
  constructor(
    private readonly configService: ConfigService<AllConfigType>,
    private readonly fileRepository: FileRepository,
  ) {}

  async create(file: Express.Multer.File): Promise<{ file: FileType }> {
    try {
      if (!file) {
        throw new UnprocessableEntityException({
          status: HttpStatus.UNPROCESSABLE_ENTITY,
          errors: {
            file: 'selectFile',
          },
        });
      }

      // Check if the file is an image
      const isImage = file.mimetype.startsWith('image/');

      let finalFilePath = file.path;

      if (isImage) {
        // Only process images with Sharp
        const isWebP = file.mimetype === 'image/webp';

        if (!isWebP) {
          // Define a temporary path for the compressed file
          const tempFilePath = path.join(
            path.dirname(file.path),
            `temp_${file.filename.split('.')[0]}.webp`,
          );

          try {
            // Compress and save to the temporary path as WebP
            await sharp(file.path)
              .resize(1024, 1024, {
                fit: sharp.fit.inside,
                withoutEnlargement: true,
              })
              .toFormat('webp', { quality: 50 })
              .toFile(tempFilePath);

            // Define the new WebP file path
            const newWebPFilePath = file.path.replace(/\.[^/.]+$/, '.webp');

            // Replace the original file with the compressed WebP file
            await fs.rename(tempFilePath, newWebPFilePath);
            finalFilePath = newWebPFilePath;

            // Delete the original file with retry mechanism (Windows file locking issue)
            await this.deleteFileWithRetry(file.path, 3, 500).catch((err) => {
              // Silently ignore - file deletion failure is not critical
              // The original file has already been replaced by the WebP version
            });
          } catch (sharpError) {
            console.error('Sharp processing error:', sharpError);
            // If Sharp processing fails, keep the original file
            finalFilePath = file.path;
          }
        }
      }
      // For non-image files (PDF, DOC, DOCX), keep the original file without processing

      // Normalize the file path for the database
      const uploadsBasePath = path.join(process.cwd(), 'uploads');
      const relativePath = path.relative(uploadsBasePath, finalFilePath);
      const normalizedPath = path
        .join('uploads', relativePath)
        .replace(/\\/g, '/');

      // Introduce a small delay to ensure the file is no longer in use
      await new Promise<void>((resolve) => setTimeout(resolve, 100));

      // Save the file path in the database
      return {
        file: await this.fileRepository.create({
          path: `/${this.configService.get('app.apiPrefix', {
            infer: true,
          })}/v1/${normalizedPath}`,
        }),
      };
    } catch (error) {
      console.error('File upload error:', error);
      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: {
          file: error.message?.includes('Sharp')
            ? 'Image processing failed'
            : 'uploadFailed',
        },
      });
    }
  }

  async delete(fileId: string): Promise<void> {
    const file = await this.fileRepository.findById(fileId);

    if (!file) {
      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: {
          file: 'fileNotFound',
        },
      });
    }

    // Extract the relative file path from the stored file path
    const relativeFilePath = file.path.split('/v1/')[1];

    try {
      // Delete the file from the file system
      await fs.unlink(relativeFilePath);

      // Delete the file record from the repository
      await this.fileRepository.delete(fileId);
    } catch (error) {
      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: {
          file: 'deletionFailed',
        },
      });
    }
  }

  async deleteByPath(filePath: string): Promise<void> {
    try {
      // Extract the base name of the file from the filePath
      const fileName = basename(filePath);

      // Resolve the file path to the correct location
      const resolvedPath = join(process.cwd(), 'uploads', fileName);

      // Delete the file from the file system with retry
      await this.deleteFileWithRetry(resolvedPath, 3, 500);

      // Delete the file record from the repository
      await this.fileRepository.deleteByPath(filePath);
    } catch (error) {
      throw new UnprocessableEntityException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errors: {
          file: 'deletionFailed',
        },
      });
    }
  }

  /**
   * Delete a file with retry mechanism to handle Windows file locking issues
   * @param filePath - Path to the file to delete
   * @param maxRetries - Maximum number of retry attempts
   * @param retryDelay - Delay in milliseconds between retries
   */
  private async deleteFileWithRetry(
    filePath: string,
    maxRetries: number = 3,
    retryDelay: number = 500,
  ): Promise<void> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Wait a bit before attempting deletion (helps with Windows file locking)
        if (attempt > 1) {
          await new Promise((resolve) => setTimeout(resolve, retryDelay * attempt));
        }

        await fs.unlink(filePath);
        return; // Success, exit the function
      } catch (error: any) {
        lastError = error;
        
        // If it's not a permission error or file not found, throw immediately
        if (error.code !== 'EPERM' && error.code !== 'EBUSY' && error.code !== 'ENOENT') {
          throw error;
        }

        // If it's the last attempt, throw the error
        if (attempt === maxRetries) {
          break;
        }
      }
    }

    // If we get here, all retries failed
    if (lastError) {
      throw lastError;
    }
  }
}
