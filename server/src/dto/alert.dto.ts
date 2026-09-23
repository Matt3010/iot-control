import { IsBoolean, IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * Una regola: quale cosa, di quale dispositivo, e con quale valore.
 *
 * Che quel valore sia possibile per quel dispositivo non si decide qui —
 * dipende da cosa sa fare lui, e quello lo sa il manager.
 */
export class AlertDto {
  @IsString()
  @IsNotEmpty({ message: 'serve il dispositivo' })
  @MaxLength(80)
  deviceId!: string;

  @IsString()
  @IsNotEmpty({ message: "serve l'azione" })
  @MaxLength(80)
  code!: string;

  @IsString()
  @IsNotEmpty({ message: 'serve il valore che fa scattare la regola' })
  @MaxLength(80)
  becomes!: string;
}

/** Spegnere o riaccendere una regola. */
export class AlertOffDto {
  @IsBoolean({ message: 'accesa o spenta, non altro' })
  off!: boolean;
}
