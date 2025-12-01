import { Module, forwardRef } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { diskStorage } from 'multer';
import { ClientCompanyService } from './client-company.service';
import { ClientCompanyController } from './client-company.controller';
import { RelationalClientCompanyPersistenceModule } from './infrastructure/persistence/relational/relational-persistence.module';
import { FilesModule } from '../files/files.module';
import { UsersModule } from '../users/users.module';
import { ClientCompanyAssignedClientModule } from '../client-company-assigned-client/client-company-assigned-client.module';
import { AkzenteFavoriteClientCompaniesModule } from '../akzente-favorite-client-companies/akzente-favorite-client-companies.module';
import { ClientModule } from '../client/client.module';
import { AkzenteModule } from '../akzente/akzente.module';
import { AllConfigType } from '../config/config.type';
import { ProjectModule } from '../project/project.module';
import { ClientCompanyAssignedAkzenteModule } from '../client-company-assigned-akzente/client-company-assigned-akzente.module';
import { BranchModule } from '../branch/branch.module';
import { ReportModule } from '../report/report.module';
import { MerchandiserModule } from '../merchandiser/merchandiser.module';
import { MerchandiserFavoriteClientCompanyModule } from '../merchandiser-favorite-client-companies/merchandiser-favorite-client-companies.module';

@Module({
  imports: [
    RelationalClientCompanyPersistenceModule,
    FilesModule,
    MulterModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService<AllConfigType>) => {
        return {
          fileFilter: (request, file, callback) => {
            // Allow only image files for logos
            const allowedImageTypes = /\.(jpg|jpeg|png|gif|webp|svg)$/i;
            
            if (allowedImageTypes.test(file.originalname)) {
              callback(null, true);
            } else {
              callback(new Error('Only image files are allowed for company logos'), false);
            }
          },
          storage: diskStorage({
            destination: './uploads',
            filename: (request, file, callback) => {
              const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
              const extension = file.originalname.split('.').pop();
              callback(null, `client-logo-${uniqueSuffix}.${extension}`);
            },
          }),
          limits: {
            fileSize: configService.get('file.maxFileSize', { infer: true }) || 5 * 1024 * 1024, // 5MB default
          },
        };
      },
    }),
    forwardRef(() => UsersModule),
    forwardRef(() => ClientCompanyAssignedClientModule),
    forwardRef(() => AkzenteFavoriteClientCompaniesModule),
    forwardRef(() => ClientModule),
    forwardRef(() => AkzenteModule),
    forwardRef(() => ProjectModule),
    forwardRef(() => ClientCompanyAssignedAkzenteModule),
    forwardRef(() => BranchModule),
    forwardRef(() => ReportModule),
    forwardRef(() => MerchandiserModule),
    forwardRef(() => MerchandiserFavoriteClientCompanyModule),
  ],
  controllers: [ClientCompanyController],
  providers: [ClientCompanyService],
  exports: [ClientCompanyService, RelationalClientCompanyPersistenceModule],
})
export class ClientCompanyModule {}
