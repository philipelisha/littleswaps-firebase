import { syncProducts } from "./syncProducts";
import admin from '../../adminConfig.js';
import { updateUsersListingCounts } from "./updateUsersListingCounts.js";
import { updateProductSnippet } from "./updateProductSnippet.js";
import { logger } from "firebase-functions";

jest.mock('../../adminConfig.js');
jest.mock("./updateUsersListingCounts.js");
jest.mock("./updateProductSnippet.js");
jest.mock('firebase-functions', () => {
  class MockHttpsError extends Error {
    constructor(code, message) {
      super(message);
      this.code = code;
    }
  }
  return {
    https: {
      onCall: jest.fn(),
      HttpsError: MockHttpsError,
    },
    logger: {
      info: jest.fn(),
      error: jest.fn(),
    },
  }
});
const mockBatchSet = jest.fn();
const mockBatchUpdate = jest.fn();
const mockBatchCommit = jest.fn();
const mockBatch = {
  set: mockBatchSet,
  update: mockBatchUpdate,
  commit: mockBatchCommit,
};
const mockGet = jest.fn();
const mockDocData = jest.fn();
const mockDocRef = { ref: { id: "mockDocId" }, data: mockDocData };

admin.firestore = jest.fn().mockReturnValue({
  collection: jest.fn().mockReturnThis(),
  doc: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  get: mockGet,
  batch: jest.fn().mockReturnValue(mockBatch),
});
admin.firestore.FieldValue = {
  increment: jest.fn(),
};
admin.firestore.Timestamp = {
  now: jest.fn(),
};

describe("syncProducts", () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => { });
    jest.spyOn(console, 'info').mockImplementation(() => { });
    jest.clearAllMocks();
  });

  it("should update likes, notifications, and carts when product data changes", async () => {
    mockGet.mockResolvedValueOnce({
      forEach: (callback) => callback(mockDocRef),
    });
    mockGet.mockResolvedValueOnce({
      forEach: (callback) => callback(mockDocRef),
    });
    mockGet.mockResolvedValueOnce({
      forEach: (callback) => callback({
        ref: { id: "cartDocId" },
        data: () => ({
          sellers: [
            {
              products: [{ productId: "mockProductId" }],
            },
          ],
        }),
      }),
    });

    const beforeData = {
      title: "Old Title",
      mainImage: "oldImage.jpg",
      price: 100,
      size: "M",
      priceCurrency: "USD",
    };
    const data = {
      title: "New Title",
      mainImage: "newImage.jpg",
      price: 120,
      size: "L",
      priceCurrency: "EUR",
      user: "mockUserId",
      active: true,
    };

    await syncProducts({ productId: "mockProductId", beforeData, data });

    expect(mockBatchUpdate).toHaveBeenCalledTimes(3);
    expect(mockBatchCommit).toHaveBeenCalled();
  });

  it("should handle price drop notifications", async () => {
    mockGet.mockResolvedValueOnce({
      forEach: (callback) => callback(mockDocRef),
    });
    mockGet.mockResolvedValueOnce({
      forEach: (callback) => callback(mockDocRef),
    });
    mockGet.mockResolvedValueOnce({
      empty: false,
      forEach: (callback) => callback({
        ref: { id: "likeDocId" },
        data: () => ({
          user:'user'
        }),
      }),
    });

    const beforeData = {
      price: 150,
      title: "Product Title",
      mainImage: "image.jpg",
      user: "mockUserId",
    };
    const data = {
      price: 100,
      title: "Product Title",
      mainImage: "image.jpg",
      user: "mockUserId",
    };

    await syncProducts({ productId: "mockProductId", beforeData, data });

    expect(mockBatchSet).toHaveBeenCalled();
    expect(mockBatchUpdate).toHaveBeenCalled();
    expect(mockBatchCommit).toHaveBeenCalled();
  });

  it("should call updateUsersListingCounts and updateProductSnippet", async () => {
    const beforeData = {
      active: false,
      purchaseDate: null,
    };
    const data = {
      active: true,
      purchaseDate: new Date(),
      user: "mockUserId",
    };

    await syncProducts({ productId: "mockProductId", beforeData, data });

    expect(updateUsersListingCounts).toHaveBeenCalledWith(data.user, {
      isActive: data.active,
      updatingActive: true,
      isSold: true,
    });
    expect(updateProductSnippet).toHaveBeenCalledWith(data.user);
  });

  it("should log errors when exceptions occur", async () => {
    mockGet.mockRejectedValueOnce(new Error("Firestore error"));

    const beforeData = {
      title: "Old Title",
    };
    const data = {
      title: "New Title",
    };

    await syncProducts({ productId: "mockProductId", beforeData, data });

    expect(logger.error).toHaveBeenCalledWith(
      "Error updating the PostgreSQL record :",
      expect.any(Error)
    );
  });
});
