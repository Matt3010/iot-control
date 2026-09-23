import { Allow, IsBoolean, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import type { DeviceValue } from '../../../shared/protocol.js';

export class CommandDto {
  /** Quale delle cose che sa fare: `power`, `brightness`, `position`… */
  @IsString()
  @IsNotEmpty({ message: 'serve dire cosa fare' })
  @MaxLength(40)
  code!: string;

  /**
   * Acceso o spento, una percentuale, una parola. Che sia del tipo giusto per
   * quel comando lo sa solo il dispositivo, e glielo si chiede più avanti.
   */
  @Allow()
  value!: DeviceValue;
}

/** Accendere o spegnere l'avviso su un dispositivo. */
export class WatchDto {
  @IsBoolean({ message: 'acceso o spento, non altro' })
  watch!: boolean;
}
