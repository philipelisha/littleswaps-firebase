import { logger, https } from "firebase-functions";
import {
  createProduct,
  updateProduct,
  deleteProduct,
  searchProducts,
  onShare
} from './index';
import admin from '../../adminConfig.js';
import { connectToPostgres } from './connectToPostgres';
import { sendNotificationToUser } from "../utils/index.js";
import { updateUsersListingCounts } from "./updateUsersListingCounts.js";
import { statusTypes } from "../../order.config.js";

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
    HttpsError: jest.fn(),
  },
}));

jest.mock('./updateUsersListingCounts.js', () => ({
  updateUsersListingCounts: jest.fn()
}))

jest.mock('../utils/index.js', () => ({
  sendNotificationToUser: jest.fn()
}))

jest.mock('../../adminConfig.js');
const mockGet = jest.fn();
admin.firestore = jest.fn().mockReturnValue({
  collection: jest.fn().mockReturnThis(),
  doc: jest.fn().mockReturnThis(),
  get: mockGet,
  where: jest.fn().mockReturnThis(),
});

describe('Products Functions', () => {
  let productData;
  describe('when status is pending shipping', () => {
    beforeEach(async () => {
      productData = {
        active: true,
        brand: 'MockBrand',
        colors: ['Red', 'Blue'],
        likes: 10,
        location: 'MockLocation',
        isNewWithTags: true,
        mainCategory: 'MockMainCategory',
        subCategory: 'MockSubCategory',
        mainImage: 'MockImage.jpg',
        originalPrice: 80,
        price: 60,
        priceCurrency: 'USD',
        size: 'Medium',
        title: 'MockProduct',
        updated: 1708926137,
        user: 'mock-user-id',
        username: 'mock-username',
        buyer: 'mock-buyer-id',
        availableShipping: 'Swap Spot',
        shippingIncluded: true,
        latitude: 100,
        longitude: 50,
        status: 'PENDING_SHIPPING'
      };
      mockGet.mockResolvedValueOnce({
        data: () => productData
      })
    });

    it('should add a product to PostgreSQL', async () => {
      const db = connectToPostgres();
      const productId = 'default-product-id'
      await createProduct({ params: { productId: productId } });

      expect(updateUsersListingCounts).toHaveBeenCalledWith(productData.user, {
        isNew: true,
        updatingActive: true,
        isActive: productData.active,
        isSold: false,
      })

      const expectedInsert = `INSERT INTO products( firestoreId, active, userId, title, mainImage, price, priceCurrency, location, latitude, longitude, mainCategory, subCategory, size, brand, colors, isNewWithTags, likes, updated, availableShipping, shippingIncluded, condition, username, originalPrice )`;
      const expectedValues = `VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)`;

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

    it('should update a product to PostgreSQL', async () => {
      const db = connectToPostgres();
      const productId = 'default-product-id'
      await updateProduct({
        params: { productId: productId },
        data: {
          before: {
            data: () => ({ active: false, title: productData.title }),
          },
          after: {
            data: () => productData,
          },
        }
      });

      expect(updateUsersListingCounts).toHaveBeenCalledWith(productData.user, {
        isActive: productData.active,
        updatingActive: true,
        isSold: false,
      })

      expect(sendNotificationToUser).toHaveBeenCalledWith(
        expect.objectContaining({
          args: expect.objectContaining({
            title: "MockProduct",
          }),
          type: "buyer_PENDING_SHIPPING",
          userId: "mock-buyer-id",
        })
      );

      expect(sendNotificationToUser).toHaveBeenCalledWith(
        expect.objectContaining({
          args: expect.objectContaining({
            title: "MockProduct",
          }),
          type: "seller_PENDING_SHIPPING",
          userId: "mock-user-id",
        })
      );

      const expectedQuery = ` UPDATE products SET active = $1, userId = $2, title = $3, mainImage = $4, price = $5, priceCurrency = $6, location = $7, latitude = $8, longitude = $9, mainCategory = $10, subCategory = $11, size = $12, brand = $13, colors = $14, isNewWithTags = $15, likes = $16, updated = $17, availableShipping = $18, purchaseDate = $19, condition = $20, shippingIncluded = $21, username = $22, originalPrice = $23 WHERE firestoreid = $24`;
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
          productData.username,
          productData.originalPrice,
          'default-product-id'
        ]),
      );
    });
  });

  describe('when status is pending swap spot arrival', () => {
    beforeEach(async () => {
      productData = {
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
        buyer: 'mock-buyer-id',
        availableShipping: 'Swap Spot',
        latitude: 100,
        longitude: 50,
        status: 'PENDING_SWAPSPOT_ARRIVAL'
      };
    });

    it('should update a product to PostgreSQL', async () => {
      const db = connectToPostgres();
      const productId = 'default-product-id'
      await updateProduct({
        params: { productId: productId },
        data: {
          before: {
            data: () => ({ active: false }),
          },
          after: {
            data: () => productData,
          },
        }
      });

      expect(updateUsersListingCounts).toHaveBeenCalledWith(productData.user, {
        isActive: productData.active,
        updatingActive: true,
        isSold: false,
      })

      expect(sendNotificationToUser).toHaveBeenCalledWith(
        expect.objectContaining({
          args: expect.objectContaining({
            title: "MockProduct",
          }),
          type: "buyer_PENDING_SWAPSPOT_ARRIVAL",
          userId: "mock-buyer-id",
        })
      );

      expect(sendNotificationToUser).toHaveBeenCalledWith(
        expect.objectContaining({
          args: expect.objectContaining({
            title: "MockProduct",
          }),
          type: "seller_PENDING_SWAPSPOT_ARRIVAL",
          userId: "mock-user-id",
        })
      );

      const expectedQuery = ` UPDATE products SET active = $1, userId = $2, title = $3, mainImage = $4, price = $5, priceCurrency = $6, location = $7, latitude = $8, longitude = $9, mainCategory = $10, subCategory = $11, size = $12, brand = $13, colors = $14, isNewWithTags = $15, likes = $16, updated = $17, availableShipping = $18, purchaseDate = $19, condition = $20, shippingIncluded = $21, username = $22, originalPrice = $23 WHERE firestoreid = $24`;
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
          productData.shippingIncluded,
          productData.username,
          productData.originalPrice,
          'default-product-id'
        ]),
      );
    });
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

    admin.firestore = jest.fn();
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

    admin.firestore = jest.fn();
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
      'AND ($2 IS NULL OR maincategory = $2)',
      'AND ($3 IS NULL OR subcategory = $3)',
      'AND ($4 IS NULL OR brand = $4)',
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

    admin.firestore = jest.fn();
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
      'AND ($2 IS NULL OR maincategory = $2)',
      'AND ($3 IS NULL OR subcategory = $3)',
      'AND ($4 IS NULL OR brand = $4)',
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

    admin.firestore = jest.fn();
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
      'AND ($2 IS NULL OR maincategory = $2)',
      'AND ($3 IS NULL OR subcategory = $3)',
      'AND ($4 IS NULL OR brand = $4)',
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

  describe('onShare Function', () => {
    const mockContext = { auth: { uid: 'mock-user-id' } };
    const mockData = { productId: 'mock-product-id', userId: 'mock-user-id' };

    beforeEach(() => {
      admin.firestore = jest.fn().mockReturnValue({
        collection: jest.fn().mockReturnThis(),
        doc: jest.fn().mockReturnThis(),
        update: jest.fn().mockResolvedValue(),
      });
      admin.firestore.FieldValue = {
        increment: (val) => val
      }
    });

    it('should increment shares for the product and user', async () => {
      await onShare(mockData, mockContext);

      expect(admin.firestore().collection).toHaveBeenCalledWith('products');
      expect(admin.firestore().doc).toHaveBeenCalledWith('mock-product-id');
      expect(admin.firestore().update).toHaveBeenCalledWith({
        shares: admin.firestore.FieldValue.increment(1),
      });

      expect(admin.firestore().collection).toHaveBeenCalledWith('users');
      expect(admin.firestore().doc).toHaveBeenCalledWith('mock-user-id');
      expect(admin.firestore().update).toHaveBeenCalledWith({
        totalShares: admin.firestore.FieldValue.increment(1),
      });
    });

    // it('should throw an error if unauthenticated', async () => {
    //   const unauthenticatedContext = { auth: null };
    //   await expect(onShare(mockData, unauthenticatedContext)).rejects.toThrowError(
    //     new https.HttpsError('unauthenticated', 'Authentication required.')
    //   );
    // });

    it('should log an error if the update fails', async () => {
      admin.firestore().update.mockRejectedValue(new Error('Update failed'));

      await onShare(mockData, mockContext);

      expect(logger.error).toHaveBeenCalledWith(
        'on share error',
        'Update failed'
      );
    });
  });

  describe('deleteProduct', () => {
    it('should delete a product from PostgreSQL', async () => {
      const db = connectToPostgres();
      const productId = 'default-product-id'
      deleteProduct({ params: { productId: productId } })

      expect(db.none).toHaveBeenCalledWith(
        'DELETE FROM products WHERE firestoreid = $1',
        expect.arrayContaining([productId]),
      );
    });
  });
});