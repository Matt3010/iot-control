import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

const trim = () => Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value));

export class CreatePlaceDto {
  @IsString()
  @IsNotEmpty({ message: 'serve la mappa a cui appartiene' })
  @MaxLength(80)
  mapId!: string;

  @trim()
  @IsString()
  @IsNotEmpty({ message: 'il nome è obbligatorio' })
  @MaxLength(80)
  name!: string;

  @IsString()
  @IsNotEmpty({ message: 'la categoria è obbligatoria' })
  @MaxLength(80)
  categoryId!: string;

  /** None, one, or several: a place can be in "Padova" and in "Da rifare". */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(24)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  groupIds?: string[];

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

  /** Un posto privato resta fuori da quello che si pubblica. */
  @IsOptional()
  @IsBoolean()
  private?: boolean;


  /** Gli agenti che stanno a questo indirizzo: reti separate, agenti separati. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(24)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  agentIds?: string[];

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
  @IsArray()
  @ArrayMaxSize(24)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  groupIds?: string[];

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

  @IsOptional()
  @IsBoolean()
  private?: boolean;


  /** Un elenco vuoto li stacca tutti: il luogo resta, i fili si tagliano. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(24)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  agentIds?: string[];

}
