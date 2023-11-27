import {BindingKey} from '@loopback/core';
import {IFileUploadProvider} from './services/file-upload.service';
import {ReqFilesHandler} from './services/req-file-extractor.service';

export const REQ_FILES_HANDLER_SERVICE = BindingKey.create<ReqFilesHandler>(
  'services.ReqFilesHandler',
);

export const FILE_UPLOAD_SERVICE = BindingKey.create<IFileUploadProvider>(
  'services.FileUpload',
);