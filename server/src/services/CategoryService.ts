import type { CreateCategoryDto, UpdateCategoryDto } from '../dto/category.dto.js';
import type { CategoryView } from '../dto/views.js';
import { toCategoryView } from '../dto/views.js';
import { hub } from '../iot/hub.js';
import { categoryManager } from '../managers/CategoryManager.js';
import { mapService } from './MapService.js';
import type { Scope } from '../types.js';

/**
 * Use cases for categories. The manager owns the rules and the transaction;
 * this layer decides what a caller gets back, in view shape.
 */
export class CategoryService {
  async list(ownerId: string): Promise<CategoryView[]> {
    return (await categoryManager.list(ownerId)).map(toCategoryView);
  }

  async create(scope: Scope, dto: CreateCategoryDto): Promise<CategoryView> {
    const category = toCategoryView(await categoryManager.create(scope, dto));
    hub.changed(scope.ownerId, { kind: 'category', id: category.id, value: category });
    return category;
  }

  async update(scope: Scope, id: string, dto: UpdateCategoryDto): Promise<CategoryView> {
    const category = toCategoryView(await categoryManager.update(scope, id, dto));
    hub.changed(scope.ownerId, { kind: 'category', id: category.id, value: category });
    return category;
  }

  /** Come per le mappe: chi guarda sa che una categoria si porta via i suoi luoghi. */
  async remove(scope: Scope, id: string): Promise<{ removedPlaces: number }> {
    const { removedPlaces, ristretti } = await categoryManager.remove(scope, id);
    hub.changed(scope.ownerId, { kind: 'category', id, value: null });
    await mapService.ristretti(scope.ownerId, ristretti);
    return { removedPlaces };
  }
}

export const categoryService = new CategoryService();
