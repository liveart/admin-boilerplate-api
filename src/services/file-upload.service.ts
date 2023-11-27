import { exists, mkdir, writeFile, unlink } from 'fs';
import {promisify} from 'util';
import {
  BindingScope,
  config,
  ContextTags,
  injectable,
  Provider,
} from '@loopback/core';
import {FILE_UPLOAD_SERVICE} from '../keys';

const writeFileAsync = promisify(writeFile);
const unlinkAsync = promisify(unlink);
const existsAsync = promisify(exists);
const mkDirAsync = promisify(mkdir);

type IFileUploadProviderOptions = {
  uploadDir: string
}

export interface IFileUploadProvider {
  uploadFile(filePath: string, buffer: Buffer): Promise<void>;
  deleteFile(filePath: string): Promise<void>;
}

@injectable({
  scope: BindingScope.TRANSIENT,
  tags: {[ContextTags.KEY]: FILE_UPLOAD_SERVICE},
})
export class FileUploadProvider implements Provider<IFileUploadProvider> {
  constructor(@config() private options: IFileUploadProviderOptions) {
    this.options = options;
  }

  async uploadFile(filePath: string, buffer: Buffer): Promise<void> {
    const dir = filePath.split('/').slice(0, -1).join('/');

    // Create the upload directory if not exists
    if (!(await existsAsync(dir))){
      await mkDirAsync(dir, { recursive: true });
    }

    await writeFileAsync(filePath, buffer);
  }

  async deleteFile(filePath: string): Promise<void> {
    await unlinkAsync(filePath);
  }

  value(): IFileUploadProvider {
    return {
      uploadFile: this.uploadFile.bind(this),
      deleteFile: this.deleteFile.bind(this),
    }
  }
}