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
import {
  Request as ExpressServeStaticCoreRequest,
  Response as ExpressServeStaticCoreResponse,
} from 'express-serve-static-core';
import {Product} from '../models';
import {ProductRepository} from '../repositories';
import {FILE_UPLOAD_SERVICE, REQ_FILES_HANDLER_SERVICE} from '../keys';
import {FileUploadProvider} from '../services/file-upload.service';
import {ReqFilesHandler} from '../services/req-file-extractor.service';

const MAX_FILE_SIZE_MB = 1;
const MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024;
const THUMBNAIL_SIZE = 100;

const fileDirOnServer = 'uploads/product-thumbnails';
const publicDir = path.join(__dirname, '../../public');
const uploadThumbnailDirPath = path.join(publicDir, fileDirOnServer);

const makeThumbnailFilename = (id: string) => `${id}_thumbnail_${Date.now()}.jpg`

export class ProductController {
  constructor(
    @inject(REQ_FILES_HANDLER_SERVICE) private requestFileExtractor: ReqFilesHandler,
    @inject(FILE_UPLOAD_SERVICE) private fileUpload: FileUploadProvider,
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
    const product = await this.productRepository.findById(id);
    if (!product) {
      throw new HttpErrors.NotFound(`Product with id ${id} not found.`);
    }

    // Delete related product thumbnail file as well
    if (product.thumbnail) {
      const filePath = path.join(publicDir, product.thumbnail)
      try {
        await this.fileUpload.deleteFile(filePath)
      } catch (e) {
        console.log(`Error while deleting file ${filePath}`, e)
      }
    }

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


    // Extract the file from the request
    let file;
    try {
      const files = await this.requestFileExtractor(req as ExpressServeStaticCoreRequest, res as ExpressServeStaticCoreResponse)
      file = files[0]
    } catch (err) {
      throw new HttpErrors.InternalServerError(err.toString());
    }


    // File validation
    if (!file) {
      throw new HttpErrors.BadRequest('Invalid file data, or no file provided');
    }
    if (file.mimetype !== 'image/jpeg' && file.mimetype !== 'image/png') {
      throw new HttpErrors.BadRequest('Only JPG and PNG files are allowed');
    }
    if (file.size > MAX_FILE_SIZE) {
      throw new HttpErrors.BadRequest(`File size should not exceed ${MAX_FILE_SIZE_MB}MB`);
    }


    // Delete the previous thumbnail file if exists
    if (product.thumbnail) {
      const filePath = path.join(publicDir, product.thumbnail)
      try {
        await this.fileUpload.deleteFile(filePath)
      } catch (e) {
        console.log(`Error while deleting previous thumbnail file ${filePath}`, e)
      }
    }


    // Save the file to the local file system
    const fileName = makeThumbnailFilename(id)
    const filePath = path.join(uploadThumbnailDirPath, fileName)

    // Resize the image to 100x100
    const imageResizedBuffer = await sharp(file.buffer)
      .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE)
      .toBuffer();
    await this.fileUpload.uploadFile(filePath, imageResizedBuffer)


    // Update the product with the new thumbnail
    const fileUrl = path.join(fileDirOnServer, fileName)
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
      await this.fileUpload.deleteFile(filePath)
    } catch (e) {
      console.log(`Error while deleting file ${filePath}`, e)
    }

    // Clear the previewUrl property of the product
    product.thumbnail = '';

    // Update the product in the database
    await this.productRepository.update(product);
  }
}
