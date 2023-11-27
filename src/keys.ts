import {BindingKey} from '@loopback/core';
import {MulterRequestHandler} from './types';

export const MULTER_REQUEST_HANDLER_SERVICE = BindingKey.create<MulterRequestHandler>(
  'services.FileUpload',
);