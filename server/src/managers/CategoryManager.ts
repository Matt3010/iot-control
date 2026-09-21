import type { CreateCategoryDto, UpdateCategoryDto } from '../dto/category.dto.js';
import { notFound } from '../errors/HttpError.js';
import { store } from '../persistence/JsonStore.js';
import { CategoryRepository } from '../repositories/CategoryRepository.js';
import { PlaceRepository } from '../repositories/PlaceRepository.js';
import type { Category } from '../types.js';

const DEFAULT_EMOJI = '📍';
const DEFAULT_COLOR = '#2274a5';

/** Business rules for categories; every method is one transaction. */
export class CategoryManager {
  list(): Promise<Category[]> {
    return store.transaction((tx) => new CategoryRepository(tx).findAll());
  }

  create(dto: CreateCategoryDto): Promise<Category> {
    return store.transaction((tx) =>
      new CategoryRepository(tx).insert({
        name: dto.name,
        emoji: dto.emoji || DEFAULT_EMOJI,
        color: dto.color ?? DEFAULT_COLOR,
      }),
    );
  }

  update(id: string, dto: UpdateCategoryDto): Promise<Category> {
    return store.transaction((tx) => {
      const updated = new CategoryRepository(tx).update(id, dto);
      if (!updated) throw notFound('categoria inesistente');
      return updated;
    });
  }

  /**
   * A category owns its places, so both go in the same transaction: either the
   * category and its places are gone, or nothing is.
   */
  remove(id: string): Promise<{ removedPlaces: number }> {
    return store.transaction((tx) => {
      const categories = new CategoryRepository(tx);
      const places = new PlaceRepository(tx);
      if (!categories.exists(id)) throw notFound('categoria inesistente');
      const removedPlaces = places.deleteByCategory(id);
      categories.delete(id);
      return { removedPlaces };
    });
  }
}

export const categoryManager = new CategoryManager();
