import {BindingKey} from '@loopback/core';
import {IFileUploadProvider} from './services/file-upload.service';
import {ReqFilesExtractor} from './services/req-file-extractor.service';

export const REQ_FILES_EXTRACTOR_SERVICE = BindingKey.create<ReqFilesExtractor>(
  'services.ReqFilesExtractor',
);

export const FILE_UPLOAD_SERVICE = BindingKey.create<IFileUploadProvider>(
  'services.FileUpload',
);