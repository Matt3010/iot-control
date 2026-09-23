import type { CreateCategoryDto, UpdateCategoryDto } from '../dto/category.dto.js';
import { notFound } from '../errors/HttpError.js';
import { store } from '../persistence/db.js';
import { CategoryRepository } from '../repositories/CategoryRepository.js';
import { PlaceRepository } from '../repositories/PlaceRepository.js';
import type { Category, Scope } from '../types.js';

/**
 * Il segno di una categoria appena nata: la chiave di un disegno, non
 * un'emoji. Quelle di prima restano come sono — il campo è lo stesso, e chi
 * lo legge sa riconoscere le due cose.
 */
const DEFAULT_EMOJI = 'pin';
const DEFAULT_COLOR = '#2274a5';

/** Business rules for categories; every method is one transaction. */
export class CategoryManager {
  list(ownerId: string): Promise<Category[]> {
    return store.transaction((tx) => new CategoryRepository(tx).findAllOf(ownerId));
  }

  create(ownerId: string, dto: CreateCategoryDto): Promise<Category> {
    return store.transaction((tx) =>
      new CategoryRepository(tx).insert(ownerId, {
        name: dto.name,
        emoji: dto.emoji || DEFAULT_EMOJI,
        color: dto.color ?? DEFAULT_COLOR,
      }),
    );
  }

  update(ownerId: string, id: string, dto: UpdateCategoryDto): Promise<Category> {
    return store.transaction(async (tx) => {
      const categories = new CategoryRepository(tx);
      if (!(await categories.owns(ownerId, id))) throw notFound('categoria inesistente');
      return (await categories.update(id, dto)) as Category;
    });
  }

  /**
   * Una categoria si porta via i suoi luoghi, quindi vanno nella stessa
   * transazione: o se ne vanno la categoria e i suoi luoghi, o non se ne va
   * niente.
   *
   * E la fa solo chi l'indice ce l'ha, come per le mappe. Una categoria non
   * appartiene a una mappa: vale su tutte, e i suoi luoghi stanno sparsi
   * ovunque. Un ospite che ne cancellava una si portava via anche i luoghi
   * delle mappe che non gli erano mai state date, e che nel suo elenco non
   * comparivano nemmeno — passando accanto ai due limiti che la condivisione
   * mette apposta, quello sulle mappe e quello sui singoli luoghi.
   */
  remove(scope: Scope, id: string): Promise<{ removedPlaces: number }> {
    if (scope.maps !== null) throw notFound('categoria inesistente');

    return store.transaction(async (tx) => {
      const categories = new CategoryRepository(tx);
      if (!(await categories.owns(scope.ownerId, id))) throw notFound('categoria inesistente');
      const removedPlaces = await new PlaceRepository(tx).deleteByCategory(id);
      await categories.delete(id);
      return { removedPlaces };
    });
  }
}

export const categoryManager = new CategoryManager();
