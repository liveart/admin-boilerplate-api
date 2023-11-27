import {
  BindingScope,
  ContextTags,
  injectable,
  Provider,
} from '@loopback/core';
import multer from 'multer';
import {REQ_FILES_HANDLER_SERVICE} from '../keys';
import {Request, Response} from 'express-serve-static-core';
import {HttpErrors} from '@loopback/rest';

export type ReqFilesHandler = (req: Request, res: Response) => Promise<Express.Multer.File[]>;

@injectable({
  scope: BindingScope.TRANSIENT,
  tags: {[ContextTags.KEY]: REQ_FILES_HANDLER_SERVICE},
})
export class ReqFilesHandlerProvider implements Provider<ReqFilesHandler> {
  async #defineFiles(req: Request, res: Response): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      // @ts-ignore
      multer().any()(req, res, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      })
    });
  }

  async getReqFiles(req: Request, res: Response): Promise<Express.Multer.File[]> {
    await this.#defineFiles(req, res);

    const uploadedFiles = req.files;
    const files: Express.Multer.File[] = []

    if (Array.isArray(uploadedFiles)) {
      files.push(...uploadedFiles);
    } else {
      for (const filename in uploadedFiles) {
        console.log(filename, Array.isArray(uploadedFiles[filename]));
        files.push(...uploadedFiles[filename]);
      }
    }

    if (!files.length) {
      throw new HttpErrors.BadRequest('Invalid file data');
    }

    return files;
  }

  value(): ReqFilesHandler {
    return this.getReqFiles.bind(this)
  }
}