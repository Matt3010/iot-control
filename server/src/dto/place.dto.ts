import { Transform, Type } from 'class-transformer';
import { IsLatitude, IsLongitude, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

const trim = () => Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value));

export class CreatePlaceDto {
  @trim()
  @IsString()
  @IsNotEmpty({ message: 'il nome è obbligatorio' })
  @MaxLength(80)
  name!: string;

  @IsString()
  @IsNotEmpty({ message: 'la categoria è obbligatoria' })
  @MaxLength(80)
  categoryId!: string;

  /** Empty string means "no group", which is why it is not simply optional. */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  groupId?: string;

  @Type(() => Number)
  @IsLatitude({ message: 'latitudine non valida' })
  lat!: number;

  @Type(() => Number)
  @IsLongitude({ message: 'longitudine non valida' })
  lng!: number;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class UpdatePlaceDto {
  @IsOptional()
  @trim()
  @IsString()
  @IsNotEmpty({ message: 'il nome non può essere vuoto' })
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  categoryId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  groupId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsLatitude({ message: 'latitudine non valida' })
  lat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsLongitude({ message: 'longitudine non valida' })
  lng?: number;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(500)
  note?: string;
}
