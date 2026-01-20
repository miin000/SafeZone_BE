import { IsString, IsOptional, IsArray, MaxLength } from 'class-validator';

export class CreatePostDto {
  @IsString()
  @MaxLength(2000, { message: 'Nội dung không được vượt quá 2000 ký tự' })
  content: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  imageUrls?: string[];

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  diseaseType?: string;
}
