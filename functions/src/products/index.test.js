import { logger, https } from "firebase-functions";
import admin from '../../adminConfig';
import {
  createProduct,
  updateProduct,
  deleteProduct,
  searchProducts,
} from './index';
import { connectToPostgres } from './connectToPostgres';

expect.extend({
  arrayContainingWithOrder(received, sample) {
    let index = 0;
    for (let i = 0; i < received.length; i++) {
      if (received[i] === sample[index]) {
        index++;
      }
    }

    const pass = index === sample.length;

    if (pass) {
      return {
        message: () =>
          `expected ${received} not to be contain ${sample} with order`,
        pass: true,
      };
    } else {
      return {
        message: () =>
          `expected ${received} to be contain ${sample} with order`,
        pass: false,
      };
    }
  },
});

const productData = {
  active: true,
  brand: 'MockBrand',
  colors: ['Red', 'Blue'],
  likes: 10,
  location: 'MockLocation',
  isNewWithTags: true,
  mainCategory: 'MockMainCategory',
  subCategory: 'MockSubCategory',
  mainImage: 'MockImage.jpg',
  price: 60,
  priceCurrency: 'USD',
  size: 'Medium',
  title: 'MockProduct',
  updated: 1708926137,
  user: 'mock-user-id',
  availableShipping: 'Swap Spot',
  latitude: 100,
  longitude: 50
};
jest.mock('../../adminConfig', () => ({
  firestore: () => ({
    collection: () => ({
      doc: jest.fn((userId) => ({
        get: jest.fn(() => ({
          data: () => productData,
        })),
      })),
    }),
  }),
}));

jest.mock('./connectToPostgres', () => {
  const pgMock = {
    none: jest.fn(),
    any: jest.fn().mockResolvedValue([]),
    $pool: { end: jest.fn() },
  };

  return {
    connectToPostgres: jest.fn(() => pgMock),
  };
});

jest.mock('firebase-functions', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
  },
  https: {
    onCall: jest.fn(),
    HttpsError: class MockHttpsError extends Error {
      constructor(code, message) {
        super(message);
        this.code = code;
      }
    },
  },
}));

jest.mock('./updateUsersListingCounts', () => ({
  updateUsersListingCounts: jest.fn()
}))

jest.mock('../utils/pushNotifications', () => ({
  sendNotificationToUser: jest.fn()
}))

describe('Products Functions', () => {
  it('should add a product to PostgreSQL', async () => {
    const db = connectToPostgres();
    const productId = 'default-product-id'
    await createProduct({ params: { productId: productId } });

    const expectedInsert = `INSERT INTO products( firestoreId, active, userId, title, mainImage, price, priceCurrency, location, latitude, longitude, mainCategory, subCategory, size, brand, colors, isNewWithTags, likes, updated, availableShipping, condition )`;
    const expectedValues = `VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`;

    const firstArg = connectToPostgres().none.mock.calls[0][0];
    expect(firstArg.replace(/\s\s+/g, ' ')).toMatch(expectedInsert);
    expect(firstArg).toMatch(expectedValues);
    expect(db.none).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContainingWithOrder([
        productId,
        productData.active,
        productData.user,
        productData.title,
        productData.mainImage,
        productData.price,
        productData.priceCurrency,
        productData.location,
        productData.latitude,
        productData.longitude,
        productData.mainCategory,
        productData.subCategory,
        productData.size,
        productData.brand,
        productData.colors,
        productData.isNewWithTags,
        productData.likes,
        new Date(productData.updated * 1000).toISOString(),
        productData.availableShipping,
      ]),
    )
  });

  it.only('should update a product to PostgreSQL', async () => {
    const db = connectToPostgres();
    const productId = 'default-product-id'
    await updateProduct({ 
      params: { productId: productId },
      data: {
        before: {
          data: jest.fn().mockResolvedValue({}),
        },
        after: {
          data: jest.fn().mockResolvedValue({}),
        },
      }
    });

    const expectedQuery = ` UPDATE products SET active = $1, userId = $2, title = $3, mainImage = $4, price = $5, priceCurrency = $6, location = $7, latitude = $8, longitude = $9, mainCategory = $10, subCategory = $11, size = $12, brand = $13, colors = $14, isNewWithTags = $15, likes = $16, updated = $17, availableShipping = $18, purchaseDate = $19, condition = $20 WHERE firestoreid = $21`;
    const firstArg = connectToPostgres().none.mock.calls[0][0];
    expect(firstArg.replace(/\s\s+/g, ' ')).toMatch(expectedQuery)
    expect(db.none).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContainingWithOrder([
        productData.active,
        productData.user,
        productData.title,
        productData.mainImage,
        productData.price,
        productData.priceCurrency,
        productData.location,
        productData.latitude,
        productData.longitude,
        productData.mainCategory,
        productData.subCategory,
        productData.size,
        productData.brand,
        productData.colors,
        productData.isNewWithTags,
        productData.likes,
        new Date(productData.updated * 1000).toISOString(),
        productData.availableShipping,
        null,
        productData.condition,
        'default-product-id'
      ]),
    );
  });

  it('should delete a product from PostgreSQL', async () => {
    const db = connectToPostgres();
    const productId = 'default-product-id'
    deleteProduct({ params: { productId: productId } })

    expect(db.none).toHaveBeenCalledWith(
      'DELETE FROM products WHERE firestoreid = $1',
      expect.arrayContaining([productId]),
    );
  });

  it('should search for products in PostgreSQL not from profile', async () => {
    const searchData = {
      textFilter: 'test textFilter',
      mainCategoryFilter: 'test mainCategoryFilter',
      subCategoryFilter: 'test subCategoryFilter',
      brandFilter: 'test brandFilter',
      colorFilter: 'test colorFilter',
      sizeFilter: 'test sizeFilter',
      priceFilterMin: 0,
      priceFilterMax: 100,
      userId: 'test userId',
      sortBy: 'price',
      sortDirection: 'ASC',
      offset: 100,
      longitude: 100,
      latitude: 100,
      radius: 10
    };

    admin.firestore = jest.fn(() => firestoreMock);
    const db = connectToPostgres();
    await searchProducts(searchData, { auth: {} });

    const expectedQuery = [
      'SELECT *, COUNT(*) OVER() AS total_count',
      'FROM products',
      'WHERE',
      '(false OR active = true)',
      'AND (',
      '$1 IS NULL OR',
      'title ILIKE $1 OR',
      'brand ILIKE $1 OR',
      'maincategory ILIKE $1 OR',
      'subcategory ILIKE $1',
      ')',
      'AND ($2 IS NULL OR maincategory = $2)',
      'AND ($3 IS NULL OR subcategory = $3)',
      'AND ($4 IS NULL OR brand = $4)',
      'AND ($5 IS NULL OR $5 = ANY(colors))',
      'AND ($6 IS NULL OR size = $6)',
      'AND (',
      '($7 IS NULL AND $8 IS NULL) OR',
      '(price BETWEEN $7 AND $8)',
      ')',
      'AND ($9 IS NULL OR availableShipping = $9)',
      'AND ($10 IS NULL OR condition = $10)',
      'AND ($11 IS NULL OR userid != $11)',
      'AND (',
      '$12 IS NULL OR',
      'ST_DWithin(',
      'ST_MakePoint(longitude, latitude)::geography,',
      'ST_MakePoint($12, $13)::geography,',
      '$14',
      ')',
      ')',
      'ORDER BY',
      'price ASC',
      'LIMIT 10 OFFSET 100',
    ];

    const firstArg = connectToPostgres().any.mock.calls[0][0];
    expectedQuery.forEach(line => expect(firstArg).toMatch(line))
    expect(db.any).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining([
        "%test textFilter%",
        'test mainCategoryFilter',
        'test subCategoryFilter',
        "test brandFilter",
        'test colorFilter',
        "test sizeFilter",
        0,
        100,
        'test userId',
        100,
        100,
        16093.4
      ]),
    )
  });

  it('should search for products in PostgreSQL from profile with no text filter', async () => {
    const searchData = {
      mainCategoryFilter: 'test mainCategoryFilter',
      subCategoryFilter: 'test subCategoryFilter',
      brandFilter: 'test brandFilter',
      colorFilter: 'test colorFilter',
      sizeFilter: 'test sizeFilter',
      priceFilter: 'test priceFilter',
      userId: 'test userId',
      isProfile: true,
    }

    admin.firestore = jest.fn(() => firestoreMock);
    const db = connectToPostgres();
    await searchProducts(searchData, { auth: {} });

    const expectedQuery = [
      'SELECT *, COUNT(*) OVER() AS total_count',
      'FROM products',
      'WHERE',
      '(false OR active = true)',
      'AND (',
      '$1 IS NULL OR',
      'title ILIKE $1 OR',
      'brand ILIKE $1 OR',
      'maincategory ILIKE $1 OR',
      'subcategory ILIKE $1',
      ')',
      'AND ($2 IS NULL OR maincategory = $2)',
      'AND ($3 IS NULL OR subcategory = $3)',
      'AND ($4 IS NULL OR brand = $4)',
      'AND ($5 IS NULL OR $5 = ANY(colors))',
      'AND ($6 IS NULL OR size = $6)',
      'AND (',
      '($7 IS NULL AND $8 IS NULL) OR',
      '(price BETWEEN $7 AND $8)',
      ')',
      'AND ($9 IS NULL OR availableShipping = $9)',
      'AND ($10 IS NULL OR condition = $10)',
      'AND ($11 IS NULL OR userid = $11)',
      'AND (',
      '$12 IS NULL OR',
      'ST_DWithin(',
      'ST_MakePoint(longitude, latitude)::geography,',
      'ST_MakePoint($12, $13)::geography,',
      '$14',
      ')',
      ')',
      'ORDER BY',
      'updated DESC',
      'LIMIT 10 OFFSET 0',
    ];

    const firstArg = connectToPostgres().any.mock.calls[0][0];
    const receivedLines = firstArg.trim().split(/\s\s+/g)
    expectedQuery.forEach((line, index) => expect(receivedLines[index]).toMatch(line))
    expect(db.any).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContainingWithOrder([
        null,
        "test mainCategoryFilter",
        'test subCategoryFilter',
        "test brandFilter",
        'test colorFilter',
        "test sizeFilter",
        null,
        null,
        'test userId',
        null,
        null,
        null
      ]),
    )
  });

  it('should search for products in PostgreSQL from profile with a text filter', async () => {
    const searchData = {
      mainCategoryFilter: 'test mainCategoryFilter',
      subCategoryFilter: 'test subCategoryFilter',
      brandFilter: 'test brandFilter',
      colorFilter: 'test colorFilter',
      sizeFilter: 'test sizeFilter',
      priceFilterMin: 0,
      priceFilterMax: 100,
      userId: 'test userId',
      isProfile: true,
      textFilter: 'test text'
    }

    admin.firestore = jest.fn(() => firestoreMock);
    const db = connectToPostgres();
    await searchProducts(searchData, { auth: {} });

    const expectedQuery = [
      'SELECT *, COUNT(*) OVER() AS total_count',
      'FROM products',
      'WHERE',
      '(false OR active = true)',
      'AND (',
      '$1 IS NULL OR',
      'title ILIKE $1 OR',
      'brand ILIKE $1 OR',
      'maincategory ILIKE $1 OR',
      'subcategory ILIKE $1',
      ')',
      'AND ($2 IS NULL OR maincategory = $2)',
      'AND ($3 IS NULL OR subcategory = $3)',
      'AND ($4 IS NULL OR brand = $4)',
      'AND ($5 IS NULL OR $5 = ANY(colors))',
      'AND ($6 IS NULL OR size = $6)',
      'AND (',
      '($7 IS NULL AND $8 IS NULL) OR',
      '(price BETWEEN $7 AND $8)',
      ')',
      'AND ($9 IS NULL OR availableShipping = $9)',
      'AND ($10 IS NULL OR condition = $10)',
      'AND ($11 IS NULL OR userid = $11)',
      'AND (',
      '$12 IS NULL OR',
      'ST_DWithin(',
      'ST_MakePoint(longitude, latitude)::geography,',
      'ST_MakePoint($12, $13)::geography,',
      '$14',
      ')',
      ')',
      'ORDER BY',
      'updated DESC',
      'LIMIT 10 OFFSET 0',
    ];

    const firstArg = connectToPostgres().any.mock.calls[0][0];
    const receivedLines = firstArg.trim().split(/\s\s+/g)
    expectedQuery.forEach((line, index) => expect(receivedLines[index]).toMatch(line))
    expect(db.any).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContainingWithOrder([
        '%test text%',
        "test mainCategoryFilter",
        'test subCategoryFilter',
        "test brandFilter",
        'test colorFilter',
        "test sizeFilter",
        0,
        100,
        'test userId',
        null,
        null,
        null
      ]),
    )
  });

  it('should search for products in PostgreSQL from profile with location filters', async () => {
    const searchData = {
      mainCategoryFilter: 'test mainCategoryFilter',
      subCategoryFilter: 'test subCategoryFilter',
      brandFilter: 'test brandFilter',
      colorFilter: 'test colorFilter',
      sizeFilter: 'test sizeFilter',
      priceFilterMin: 0,
      priceFilterMax: 100,
      userId: 'test userId',
      isProfile: true,
      textFilter: 'test text',
      longitude: 100,
      latitude: 50,
      radius: 10
    }

    admin.firestore = jest.fn(() => firestoreMock);
    const db = connectToPostgres();
    await searchProducts(searchData, { auth: {} });

    const expectedQuery = [
      'SELECT *, COUNT(*) OVER() AS total_count',
      'FROM products',
      'WHERE',
      '(false OR active = true)',
      'AND (',
      '$1 IS NULL OR',
      'title ILIKE $1 OR',
      'brand ILIKE $1 OR',
      'maincategory ILIKE $1 OR',
      'subcategory ILIKE $1',
      ')',
      'AND ($2 IS NULL OR maincategory = $2)',
      'AND ($3 IS NULL OR subcategory = $3)',
      'AND ($4 IS NULL OR brand = $4)',
      'AND ($5 IS NULL OR $5 = ANY(colors))',
      'AND ($6 IS NULL OR size = $6)',
      'AND (',
      '($7 IS NULL AND $8 IS NULL) OR',
      '(price BETWEEN $7 AND $8)',
      ')',
      'AND ($9 IS NULL OR availableShipping = $9)',
      'AND ($10 IS NULL OR condition = $10)',
      'AND ($11 IS NULL OR userid = $11)',
      'AND (',
      '$12 IS NULL OR',
      'ST_DWithin(',
      'ST_MakePoint(longitude, latitude)::geography,',
      'ST_MakePoint($12, $13)::geography,',
      '$14',
      ')',
      ')',
      'ORDER BY',
      'updated DESC',
      'LIMIT 10 OFFSET 0',
    ];

    const firstArg = connectToPostgres().any.mock.calls[0][0];
    const receivedLines = firstArg.trim().split(/\s\s+/g)
    expectedQuery.forEach((line, index) => expect(receivedLines[index]).toMatch(line));
    expect(db.any).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContainingWithOrder([
        '%test text%',
        "test mainCategoryFilter",
        'test subCategoryFilter',
        "test brandFilter",
        'test colorFilter',
        "test sizeFilter",
        0,
        100,
        'test userId',
        100,
        50,
        16093.4
      ]),
    )
  });
});