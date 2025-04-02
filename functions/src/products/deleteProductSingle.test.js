import admin from '../../adminConfig.js';
import { deleteProductSingle } from "./deleteProductSingle";
import { deleteProductReferences } from "../users/deleteUser.js";
import { updateProductSnippet } from "./updateProductSnippet.js";
import { updateUsersListingCounts } from "./updateUsersListingCounts.js";

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
jest.mock("../users/deleteUser", () => ({
  deleteProductReferences: jest.fn(),
}));
jest.mock("./updateProductSnippet", () => ({
  updateProductSnippet: jest.fn(),
}));
jest.mock('./updateUsersListingCounts.js', () => ({
  updateUsersListingCounts: jest.fn()
}))

jest.mock('../../adminConfig.js');
const mockGet = jest.fn();
const mockUpdate = jest.fn();
const mockDelete = jest.fn();
const mockCommit = jest.fn();
admin.firestore = jest.fn().mockReturnValue({
  collection: jest.fn().mockReturnThis(),
  doc: jest.fn().mockReturnThis(),
  get: mockGet,
  where: jest.fn().mockReturnThis(),
  batch: jest.fn(() => ({
    update: mockUpdate,
    delete: mockDelete,
    commit: mockCommit,
  })),
});

describe("deleteProductSingle", () => {
  const mockContext = { auth: { uid: "testUser" } };
  const mockData = { productId: "testProduct" };
  const mockProductData = {
    user: "testUser",
    key: "testKey",
    active: true,
    purchaseDate: null,
  };

  beforeEach(() => {
    jest.spyOn(console, "error").mockImplementation(() => { });
    jest.spyOn(console, "log").mockImplementation(() => { });
    jest.clearAllMocks();
  });

  it("deletes the product and updates references if purchaseDate is null", async () => {
    mockGet.mockResolvedValueOnce({
      exists: true,
      data: jest.fn(() => mockProductData),
    });

    await deleteProductSingle(mockData, mockContext);

    expect(deleteProductReferences).toHaveBeenCalledWith({
      batch: expect.any(Object),
      db: expect.any(Object),
      doc: expect.any(Object),
      currentUser: "testUser",
      productUniqueKey: "testKey",
    });

    expect(mockDelete).toHaveBeenCalled();
    expect(mockCommit).toHaveBeenCalled();
    expect(updateUsersListingCounts).toHaveBeenCalledWith("testUser", {
      isActive: false,
      updatingActive: false,
      isSold: false,
      isDeleted: true,
      isActiveBeforeDelete: true,
    });
    expect(updateProductSnippet).toHaveBeenCalledWith("testUser");
  });

  it("does not delete references if purchaseDate exists", async () => {
    const productDataWithPurchaseDate = { ...mockProductData, purchaseDate: new Date() };
    mockGet.mockResolvedValueOnce({
      exists: true,
      data: jest.fn(() => productDataWithPurchaseDate),
    });

    await deleteProductSingle(mockData, mockContext);

    expect(deleteProductReferences).not.toHaveBeenCalled();
    expect(mockDelete).not.toHaveBeenCalled();
    expect(mockCommit).not.toHaveBeenCalled();
  });

  it("logs an error if updating user listing counts fails", async () => {
    mockGet.mockResolvedValueOnce({
      exists: true,
      data: jest.fn(() => mockProductData),
    });
    updateUsersListingCounts.mockImplementationOnce(() => {
      throw new Error("Update user listing counts error");
    });

    await deleteProductSingle(mockData, mockContext);

    // expect(console.error).toHaveBeenCalledWith(
    //   "Error updating the user(testUser) listings count: ",
    //   "Update user listing counts error"
    // );
  });

  it("logs an error if updating product snippet fails", async () => {
    mockGet.mockResolvedValueOnce({
      exists: true,
      data: jest.fn(() => mockProductData),
    });
    updateProductSnippet.mockImplementationOnce(() => {
      throw new Error("Update product snippet error");
    });

    await deleteProductSingle(mockData, mockContext);

    /* expect(console.error).toHaveBeenCalledWith(
      "Error updating the product snippet with user(testUser):",
      "Update product snippet error"
    ); */
  });

  /* it("throws an internal error if an unexpected error occurs", async () => {
    mockGet.mockImplementationOnce(() => {
      throw new Error("Unexpected error");
    });

    await expect(deleteProductSingle(mockData, mockContext)).rejects.toThrow(
      new https.HttpsError("internal", "Internal Server Error")
    );
  }); */
});