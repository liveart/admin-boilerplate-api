import {
  BindingScope,
  ContextTags,
  injectable,
  Provider,
} from '@loopback/core';
import multer from 'multer';
import {REQ_FILES_HANDLER_SERVICE} from '../keys';
import {Request, Response} from 'express-serve-static-core';

export type ReqFilesHandler = (req: Request, res: Response) => Promise<Express.Multer.File[]>;

@injectable({
  scope: BindingScope.TRANSIENT,
  tags: {[ContextTags.KEY]: REQ_FILES_HANDLER_SERVICE},
})
export class ReqFilesHandlerProvider implements Provider<ReqFilesHandler> {
  async #extractFormDataFilesToFilesProperty(req: Request, res: Response): Promise<void> {
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
    await this.#extractFormDataFilesToFilesProperty(req, res);

    const files: Express.Multer.File[] = []

    const uploadedFiles = req.files;
    if (Array.isArray(uploadedFiles)) {
      files.push(...uploadedFiles);
    } else {
      for (const filename in uploadedFiles) {
        files.push(...uploadedFiles[filename]);
      }
    }

    return files;
  }

  value(): ReqFilesHandler {
    return this.getReqFiles.bind(this)
  }
}