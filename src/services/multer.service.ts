import {
  BindingScope,
  ContextTags,
  injectable,
  Provider,
} from '@loopback/core';
import multer from 'multer';
import {MULTER_REQUEST_HANDLER_SERVICE} from '../keys';
import {MulterRequestHandler} from '../types';

/**
 * A provider to return an `Express` request handler from `multer` middleware
 */
@injectable({
  scope: BindingScope.TRANSIENT,
  tags: {[ContextTags.KEY]: MULTER_REQUEST_HANDLER_SERVICE},
})
export class MulterProvider implements Provider<MulterRequestHandler> {
  value(): MulterRequestHandler {
    // @ts-ignore
    return multer().any();
  }
}