import { Transform } from 'class-transformer';
import { IsHexColor, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

const trim = () => Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value));

export class CreateCategoryDto {
  @trim()
  @IsString()
  @IsNotEmpty({ message: 'il nome è obbligatorio' })
  @MaxLength(40)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  emoji?: string;

  @IsOptional()
  @IsHexColor({ message: 'il colore deve essere esadecimale, tipo #e4572e' })
  color?: string;
}

export class UpdateCategoryDto {
  @IsOptional()
  @trim()
  @IsString()
  @IsNotEmpty({ message: 'il nome non può essere vuoto' })
  @MaxLength(40)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  emoji?: string;

  @IsOptional()
  @IsHexColor()
  color?: string;
}
