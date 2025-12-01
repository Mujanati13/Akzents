import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  IsEnum,
  IsArray,
  ValidateNested,
  MinLength,
  IsOptional,
} from 'class-validator';
import { lowerCaseTransformer } from '../../utils/transformers/lower-case.transformer';
import { GenderEnum } from '../../users/enums/gender.enum';
import { ClientCompanyDto } from '../../client-company/dto/client-company.dto';

export class AuthRegisterClientDto {
  @ApiProperty({ example: 'client@example.com' })
  @Transform(lowerCaseTransformer)
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ required: false, description: 'Optional - will be auto-generated if not provided' })
  @IsOptional()
  @IsString()
  @MinLength(6, { message: 'Password must be at least 6 characters' })
  password?: string; // Optional - will be auto-generated if not provided

  @ApiProperty({ example: 'John' })
  @IsNotEmpty()
  @IsString()
  firstName: string;

  @ApiProperty({ example: 'Doe' })
  @IsNotEmpty()
  @IsString()
  lastName: string;

  @ApiProperty({ enum: GenderEnum, example: GenderEnum.MALE })
  @IsNotEmpty()
  @IsEnum(GenderEnum)
  gender: GenderEnum;

  @ApiProperty({ example: '+1234567890', required: false })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ type: [ClientCompanyDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ClientCompanyDto)
  clientCompanies: ClientCompanyDto[];
}