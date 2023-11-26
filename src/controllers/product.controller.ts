import { exists, mkdir, writeFile, unlink } from 'fs';
import { promisify } from 'util';
import path from 'path';
import {
  Count,
  CountSchema,
  Filter,
  FilterExcludingWhere,
  repository,
  Where,
} from '@loopback/repository';
import {
  post,
  param,
  get,
  getModelSchemaRef,
  patch,
  put,
  del,
  requestBody,
  HttpErrors,
  Request, response, RestBindings, Response,
} from '@loopback/rest';
import {inject} from '@loopback/core';
import sharp from 'sharp';
import {Product} from '../models';
import {ProductRepository} from '../repositories';
import {FILE_UPLOAD_SERVICE} from '../keys';
import {FileUploadHandler} from '../types';

const writeFileAsync = promisify(writeFile);
const existsAsync = promisify(exists);
const mkDirAsync = promisify(mkdir);
const unlinkAsync = promisify(unlink);

const MAX_FILE_SIZE_MB = 1;
const MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024;

const fileDirOnServer = 'uploads/product-thumbnails';
const publicDir = path.join(__dirname, '../../public');
const uploadThumbnailDirPath = path.join(publicDir, fileDirOnServer);

const makeThumbnailFilename = (id: string) => `${id}_thumbnail_${Date.now()}.jpg`

export class ProductController {
  constructor(
    @inject(FILE_UPLOAD_SERVICE) private handler: FileUploadHandler,
    @repository(ProductRepository)
    public productRepository : ProductRepository,
  ) {}

  @post('/products')
  @response(200, {
    description: 'Product model instance',
    content: {'application/json': {schema: getModelSchemaRef(Product)}},
  })
  async create(
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(Product, {
            title: 'NewProduct',
            exclude: ['id'],
          }),
        },
      },
    })
    product: Omit<Product, 'id'>,
  ): Promise<Product> {
    return this.productRepository.create(product);
  }

  @get('/products/count')
  @response(200, {
    description: 'Product model count',
    content: {'application/json': {schema: CountSchema}},
  })
  async count(
    @param.where(Product) where?: Where<Product>,
  ): Promise<Count> {
    return this.productRepository.count(where);
  }

  @get('/products')
  @response(200, {
    description: 'Array of Product model instances',
    content: {
      'application/json': {
        schema: {
          type: 'array',
          items: getModelSchemaRef(Product, {includeRelations: true}),
        },
      },
    },
  })
  async find(
    @param.filter(Product) filter?: Filter<Product>,
  ): Promise<Product[]> {
    return this.productRepository.find(filter);
  }

  @patch('/products')
  @response(200, {
    description: 'Product PATCH success count',
    content: {'application/json': {schema: CountSchema}},
  })
  async updateAll(
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(Product, {partial: true}),
        },
      },
    })
    product: Product,
    @param.where(Product) where?: Where<Product>,
  ): Promise<Count> {
    return this.productRepository.updateAll(product, where);
  }

  @get('/products/{id}')
  @response(200, {
    description: 'Product model instance',
    content: {
      'application/json': {
        schema: getModelSchemaRef(Product, {includeRelations: true}),
      },
    },
  })
  async findById(
    @param.path.string('id') id: string,
    @param.filter(Product, {exclude: 'where'}) filter?: FilterExcludingWhere<Product>
  ): Promise<Product> {
    return this.productRepository.findById(id, filter);
  }

  @patch('/products/{id}')
  @response(204, {
    description: 'Product PATCH success',
  })
  async updateById(
    @param.path.string('id') id: string,
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(Product, {partial: true}),
        },
      },
    })
    product: Product,
  ): Promise<void> {
    await this.productRepository.updateById(id, product);
  }

  @put('/products/{id}')
  @response(204, {
    description: 'Product PUT success',
  })
  async replaceById(
    @param.path.string('id') id: string,
    @requestBody() product: Product,
  ): Promise<void> {
    await this.productRepository.replaceById(id, product);
  }

  @del('/products/{id}')
  @response(204, {
    description: 'Product DELETE success',
  })
  async deleteById(@param.path.string('id') id: string): Promise<void> {
    await this.productRepository.deleteById(id);
  }


  @post('/products/{id}/thumbnail')
  @response(200, {
    description: 'Product model instance',
  })
  async uploadThumbnail(
    @param.path.string('id') id: string,
    @requestBody.file() req: Request,
    @inject(RestBindings.Http.RESPONSE) res: Response,
  ): Promise<string> {
    // Ensure that the product with the given id exists
    const product = await this.productRepository.findById(id);
    if (!product) {
      throw new HttpErrors.NotFound(`Product with id ${id} not found.`);
    }


    // Enrich the request with the files body
    try {
      await new Promise<void>((resolve, reject) => {
        // @ts-ignore
        this.handler(req, res, (err: unknown) => {
          if (err) reject(err);
          resolve();
        })
      });
    } catch (err) {
      throw new HttpErrors.InternalServerError(err.toString());
    }


    // Define file from the request body
    // @ts-ignore
    const uploadedFiles = req.files;
    const files: Express.Multer.File[] = []
    if (Array.isArray(uploadedFiles)) {
      files.push(...uploadedFiles);
    } else {
      for (const filename in uploadedFiles) {
        files.push(uploadedFiles[filename]);
      }
    }
    if (!files.length) {
      throw new HttpErrors.BadRequest('Invalid file data');
    }
    const file = files[0];


    // File validation
    if (file.mimetype !== 'image/jpeg' && file.mimetype !== 'image/png') {
      throw new HttpErrors.BadRequest('Only JPG and PNG files are allowed');
    }
    if (file.size > MAX_FILE_SIZE) {
      throw new HttpErrors.BadRequest(`File size should not exceed ${MAX_FILE_SIZE_MB}MB`);
    }


    // Create the upload directory if not exists
    if (!(await existsAsync(uploadThumbnailDirPath))){
      await mkDirAsync(uploadThumbnailDirPath, { recursive: true });
    }


    // Delete the previous thumbnail file if exists
    if (product.thumbnail) {
      const filePath = path.join(publicDir, product.thumbnail)
      try {
        await unlinkAsync(filePath)
      } catch (e) {
        console.log(`Error while deleting previous thumbnail file ${filePath}`, e)
      }
    }


    // Save the file to the local file system
    const fileName = makeThumbnailFilename(id)
    const filePath = path.join(uploadThumbnailDirPath, fileName)
    const fileUrl = path.join(fileDirOnServer, fileName)

    const imageResizedBuffer = await sharp(files[0].buffer)
      .resize(100, 100)
      .toBuffer();
    await writeFileAsync(filePath, imageResizedBuffer);


    // Update the product with the new thumbnail
    product.thumbnail = fileUrl;
    await this.productRepository.update(product);


    return fileUrl;
  }

  @del('/products/{id}/thumbnail')
  @response(204, {
    description: 'Product thumbnail DELETE success',
  })
  async deleteThumbnail(
    @param.path.string('id') id: string,
  ): Promise<void> {
    // Ensure that the product with the given id exists
    const product = await this.productRepository.findById(id);
    if (!product) {
      throw new HttpErrors.NotFound(`Product with id ${id} not found.`);
    }


    // Check if the product has a thumbnail to delete
    if (!product.thumbnail) {
      return;
    }


    // Delete the file from the local file system
    const filePath = path.join(uploadThumbnailDirPath, product.thumbnail);
    try {
      await unlinkAsync(filePath);
    } catch (e) {
      console.log(`Error while deleting file ${filePath}`, e)
    }


    // Clear the previewUrl property of the product
    product.thumbnail = '';


    // Update the product in the database
    await this.productRepository.update(product);
  }
}
