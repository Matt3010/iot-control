import type { NextFunction, Request, Response } from 'express';
import { ownerOf } from '../auth/owner.js';
import type { CreateCategoryDto, UpdateCategoryDto } from '../dto/category.dto.js';
import { dtoOf } from '../middleware/validateBody.js';
import { categoryService } from '../services/CategoryService.js';

/** HTTP in, HTTP out. Anything else belongs a layer down. */
export class CategoryController {
  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json(await categoryService.list(ownerOf(req)));
    } catch (error) {
      next(error);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.status(201).json(await categoryService.create(ownerOf(req), dtoOf<CreateCategoryDto>(req)));
    } catch (error) {
      next(error);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json(await categoryService.update(ownerOf(req), req.params.id as string, dtoOf<UpdateCategoryDto>(req)));
    } catch (error) {
      next(error);
    }
  };

  remove = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await categoryService.remove(ownerOf(req), req.params.id as string);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  };
}

export const categoryController = new CategoryController();
