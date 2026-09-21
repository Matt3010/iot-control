import { Router } from 'express';
import { categoryController } from '../controllers/CategoryController.js';
import { groupController } from '../controllers/GroupController.js';
import { placeController } from '../controllers/PlaceController.js';
import { stateController } from '../controllers/StateController.js';
import { CreateCategoryDto, UpdateCategoryDto } from '../dto/category.dto.js';
import { CreateGroupDto, UpdateGroupDto } from '../dto/group.dto.js';
import { CreatePlaceDto, UpdatePlaceDto } from '../dto/place.dto.js';
import { validateBody } from '../middleware/validateBody.js';

export const apiRouter = Router();

apiRouter.get('/state', stateController.snapshot);

apiRouter
  .route('/categories')
  .get(categoryController.list)
  .post(validateBody(CreateCategoryDto), categoryController.create);

apiRouter
  .route('/categories/:id')
  .put(validateBody(UpdateCategoryDto), categoryController.update)
  .delete(categoryController.remove);

apiRouter
  .route('/groups')
  .get(groupController.list)
  .post(validateBody(CreateGroupDto), groupController.create);

apiRouter
  .route('/groups/:id')
  .put(validateBody(UpdateGroupDto), groupController.update)
  .delete(groupController.remove);

apiRouter
  .route('/places')
  .get(placeController.list)
  .post(validateBody(CreatePlaceDto), placeController.create);

apiRouter
  .route('/places/:id')
  .put(validateBody(UpdatePlaceDto), placeController.update)
  .delete(placeController.remove);
